// The four tools: memo_write, memo_search, upload, transcribe.
// Each declares an outputSchema; a successful call returns structuredContent that matches it.
import type { Store } from './worker';
import type { Caller } from './oauth';
import { MAX_FILE, loadFile, ownFileId, reserveUpload, saveFile } from './files';
import { fetchCapped, fromBase64, randomId, toBase64 } from './util';

const MAX_MEMO = 20_000;

const note = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    text: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    author: { type: 'string', description: 'The client that wrote the note.' },
  },
  required: ['id', 'text', 'created_at'],
};

export const TOOLS = [
  {
    name: 'memo_write',
    title: 'Write a memo',
    description: 'Saves a note on this server and returns its id. Notes are shared by every client the owner has let in.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', minLength: 1, maxLength: MAX_MEMO, description: 'The note to save.' } },
      required: ['text'],
    },
    outputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Id of the saved note.' }, created_at: { type: 'string', format: 'date-time' } },
      required: ['id'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'memo_search',
    title: 'Search memos',
    description:
      'Finds saved notes whose text contains the query (case-insensitive; every word must match, else notes matching most words come first). Newest first. An empty query returns the newest notes.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', maxLength: 500, description: 'Words to look for in the note text.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Most notes to return.' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: { notes: { type: 'array', items: note } },
      required: ['notes'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'upload',
    title: 'Upload a file',
    description:
      'Stores a file on this server and returns a public link to it, served by this server; anyone with the link can open it. Give the file as content_base64 (bytes), text (UTF-8 text) or url (this server fetches it). For a big file, give only filename (and mime_type): the result adds upload_url; send the bytes there with one HTTP PUT within 30 minutes (e.g. curl -T file "<upload_url>"), and url serves the file from then on. Up to 25 MB.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', maxLength: 200, description: 'File name, e.g. clip.mp3. Used in the link.' },
        content_base64: { type: 'string', description: 'File bytes, base64 encoded (a data: URL prefix is accepted).' },
        text: { type: 'string', description: 'File content as UTF-8 text, instead of content_base64.' },
        url: { type: 'string', format: 'uri', description: 'An http(s) URL to fetch the file from, instead of content_base64.' },
        mime_type: { type: 'string', description: 'Media type, e.g. audio/mpeg. Guessed from the file name if missing.' },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', format: 'uri', description: 'Public link to the file on this server.' },
        id: { type: 'string' },
        filename: { type: 'string' },
        mime_type: { type: 'string' },
        size: { type: 'integer', description: 'Size in bytes; 0 until the bytes arrive at upload_url.' },
        upload_url: { type: 'string', format: 'uri', description: 'Only when no content was given: PUT the file bytes here, once, within 30 minutes.' },
        upload_expires_at: { type: 'string', format: 'date-time' },
      },
      required: ['url', 'id', 'filename', 'mime_type', 'size'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'transcribe',
    title: 'Transcribe audio',
    description:
      'Turns speech in an audio file at a URL into timestamped text (Whisper on Cloudflare Workers AI). Works with links from upload. Returns segments with start and end in seconds from the start of the audio; the transcript is the segment texts in order. Up to 25 MB.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', format: 'uri', description: 'http(s) URL of the audio (mp3, wav, m4a, ogg, webm, flac).' },
        language: { type: 'string', description: 'Optional ISO 639-1 language code, e.g. en. Detected if missing.' },
      },
      required: ['url'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        segments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              start: { type: 'number', description: 'Segment start, seconds.' },
              end: { type: 'number', description: 'Segment end, seconds.' },
              text: { type: 'string' },
            },
            required: ['start', 'end', 'text'],
          },
        },
        language: { type: 'string' },
        duration: { type: 'number', description: 'Audio length, seconds.' },
      },
      required: ['segments'],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

export class ToolError extends Error {}

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac',
  mp4: 'video/mp4', txt: 'text/plain; charset=utf-8', log: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8', json: 'application/json', csv: 'text/csv; charset=utf-8',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', html: 'text/html; charset=utf-8', svg: 'image/svg+xml',
};

function guessMime(name: string): string | undefined {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return MIME[ext];
}

function str(v: unknown, field: string, max = Infinity): string {
  if (typeof v !== 'string') throw new ToolError(`${field} must be a string`);
  if (v.length > max) throw new ToolError(`${field} is longer than ${max} characters`);
  return v;
}

function httpUrl(v: unknown, field: string): string {
  const s = str(v, field, 4000);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new ToolError(`${field} is not a valid URL`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ToolError(`${field} must be an http(s) URL`);
  return u.toString();
}

function noteRow(r: Record<string, SqlStorageValue>) {
  return { id: r.id as string, text: r.text as string, created_at: new Date(r.created_at as number).toISOString(), author: (r.client_name as string) || 'unknown' };
}

export async function callTool(store: Store, caller: Caller, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'memo_write': {
      const text = str(args.text, 'text', MAX_MEMO);
      if (!text.trim()) throw new ToolError('text is empty');
      const id = `m_${randomId(9)}`;
      const now = Date.now();
      store.sql.exec('INSERT INTO memos (id, text, created_at, client_id, client_name) VALUES (?, ?, ?, ?, ?)', id, text, now, caller.clientId, caller.clientName);
      console.log(`memo_write ${id} by ${caller.clientName} (${text.length} chars)`);
      return { id, created_at: new Date(now).toISOString() };
    }
    case 'memo_search': {
      const query = args.query === undefined || args.query === null ? '' : str(args.query, 'query', 500);
      const limit = Math.max(1, Math.min(100, Number.isInteger(args.limit) ? (args.limit as number) : 20));
      const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 20);
      const rows = store.sql.exec('SELECT id, text, created_at, client_name FROM memos ORDER BY created_at DESC, rowid DESC').toArray();
      if (!words.length) return { notes: rows.slice(0, limit).map(noteRow) };
      const scored = rows
        .map((r, i) => {
          const t = (r.text as string).toLowerCase();
          return { r, i, hits: words.filter((w) => t.includes(w)).length };
        })
        .filter((x) => x.hits > 0);
      const all = scored.filter((x) => x.hits === words.length);
      const pick = all.length ? all : scored.sort((a, b) => b.hits - a.hits || a.i - b.i);
      return { notes: pick.slice(0, limit).map((x) => noteRow(x.r)) };
    }
    case 'upload': {
      const given = ['content_base64', 'text', 'url'].filter((k) => args[k] !== undefined && args[k] !== null);
      let filename = args.filename === undefined ? '' : str(args.filename, 'filename', 200);
      let mime = args.mime_type === undefined ? '' : str(args.mime_type, 'mime_type', 200);
      if (given.length === 0 && filename) {
        mime ||= guessMime(filename) || 'application/octet-stream';
        const p = await reserveUpload(store, filename, mime, caller.clientId);
        console.log(`upload reserved ${p.id} ${p.name} by ${caller.clientName}`);
        return { url: p.url, id: p.id, filename: p.name, mime_type: mime, size: 0, upload_url: p.uploadUrl, upload_expires_at: p.expiresAt };
      }
      if (given.length !== 1) throw new ToolError('give exactly one of content_base64, text or url, or only filename to get an upload_url');
      let bytes: Uint8Array;
      if (given[0] === 'content_base64') {
        try {
          bytes = fromBase64(str(args.content_base64, 'content_base64'));
        } catch {
          throw new ToolError('content_base64 is not valid base64');
        }
      } else if (given[0] === 'text') {
        bytes = new TextEncoder().encode(str(args.text, 'text'));
        mime ||= 'text/plain; charset=utf-8';
      } else {
        const url = httpUrl(args.url, 'url');
        const own = ownFileId(store, url);
        if (own) {
          const f = loadFile(store, own);
          if (!f) throw new ToolError(`${url} is not a file on this server (no file with that id)`);
          bytes = f.bytes;
          mime ||= f.mime;
          filename ||= f.name;
        } else {
          try {
            const got = await fetchCapped(url, MAX_FILE);
            bytes = got.bytes;
            mime ||= got.type.split(';')[0].trim();
          } catch (e) {
            throw new ToolError(`could not fetch ${url}: ${(e as Error).message}`);
          }
          filename ||= decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
        }
      }
      if (bytes.length > MAX_FILE) throw new ToolError(`file is ${bytes.length} bytes; the limit is ${MAX_FILE}`);
      filename ||= 'file';
      mime ||= guessMime(filename) || 'application/octet-stream';
      const saved = saveFile(store, bytes, filename, mime, caller.clientId);
      console.log(`upload ${saved.id} ${saved.name} ${mime} ${bytes.length}B by ${caller.clientName}`);
      return { url: saved.url, id: saved.id, filename: saved.name, mime_type: mime, size: bytes.length };
    }
    case 'transcribe': {
      const url = httpUrl(args.url, 'url');
      const language = args.language === undefined || args.language === null ? undefined : str(args.language, 'language', 10);
      let bytes: Uint8Array;
      let type: string;
      const own = ownFileId(store, url);
      if (own) {
        const f = loadFile(store, own);
        if (!f) throw new ToolError(`${url} is not a file on this server (no file with that id)`);
        ({ bytes, mime: type } = f);
      } else {
        try {
          ({ bytes, type } = await fetchCapped(url, MAX_FILE));
        } catch (e) {
          throw new ToolError(`could not fetch ${url}: ${(e as Error).message}`);
        }
      }
      if (!bytes.length) throw new ToolError(`${url} is empty (0 bytes), not audio`);
      const notAudio = audioProblem(type, bytes);
      if (notAudio) throw new ToolError(`${url} is not audio: ${notAudio}. Give a link to an audio file (mp3, wav, m4a, ogg, webm or flac).`);
      let out: any;
      try {
        out = await store.env.AI.run(store.env.WHISPER_MODEL as any, { audio: toBase64(bytes), ...(language ? { language } : {}) } as any);
      } catch (e) {
        console.log(`transcribe: model error ${(e as Error).message}`);
        throw new ToolError(`could not decode the audio at ${url} (${type}, ${bytes.length} bytes): ${(e as Error).message}`);
      }
      const segs: { start: number; end: number; text: string }[] = (out?.segments ?? [])
        .map((s: any) => ({ start: round(Number(s.start)), end: round(Number(s.end)), text: String(s.text ?? '').trim() }))
        .filter((s: any) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.text);
      const duration = Number(out?.transcription_info?.duration);
      const whole = String(out?.text ?? '').trim();
      if (!segs.length && whole) segs.push({ start: 0, end: Number.isFinite(duration) ? round(duration) : 0, text: whole });
      console.log(`transcribe ${url} -> ${segs.length} segments by ${caller.clientName}`);
      const res: Record<string, unknown> = { segments: segs };
      if (out?.transcription_info?.language) res.language = String(out.transcription_info.language);
      if (Number.isFinite(duration)) res.duration = round(duration);
      return res;
    }
  }
  throw new ToolError(`unknown tool ${name}`);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// Why these bytes are not audio, or null when they may be.
function audioProblem(type: string, bytes: Uint8Array): string | null {
  const t = type.split(';')[0].trim().toLowerCase();
  const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart().toLowerCase();
  if (t === 'text/html' || t === 'application/xhtml+xml' || head.startsWith('<!doctype html') || head.startsWith('<html')) return `it is a web page (${t || 'html'})`;
  if (t.startsWith('audio/') || t.startsWith('video/') || t === 'application/ogg' || t === 'application/octet-stream' || t === 'binary/octet-stream' || !t) return null;
  return `its content type is ${t}`;
}

// Short text twin of a result, for clients that read only content.
export function resultText(name: string, out: any): string {
  if (name === 'transcribe') return out.segments.map((s: any) => `[${s.start}] ${s.text}`).join('\n') || '(no speech found)';
  return JSON.stringify(out);
}
