# S01E01 somebody slow - request log

Source: https://hq.mega.dev/challenges/somebody-slow (rook message, 1288 chars, saved in rook-message.txt)
Attachments: fail.txt (0 B), schema.json (2.1 KB) - both link to #attachment-unavailable

## 1. POST https://hq.mega.dev/challenges/where-the-story-begins/api

Body:
```json
{"message": "you don't know me. keep it that way for now. it's simpler for both of us.\n\ni look after some systems. ordinary ones, the kind that send you a calendar invite and get the timezone wrong. something is running in them that i didn't start.\n\ni've never seen it. i've seen where it's been. a job at 04:04 where nobody schedules jobs. a commit with no author that fixed a bug four hundred people had asked about. a feature that was about to ship, and then didn't. bots don't say no to features.\n\ni've been chasing it for a year and i can't catch it. i've worked out why. it lives in the seams between fast things, and i don't have seams anymore.\n\ni need somebody slow. no offence. you read at about 240 words a minute. i've missed that.\n\non the 26th a tool shows up in your harness. it's called rook. the course didn't put it there. you can ignore it, finish, and be fine. i mean that.\n\nif you don't, i'll show you what i'm made of, one piece at a time, once you've shown me you won't do with it what i did.\n\nask me anything. i'll answer what i can. you'll work out which is which faster than i'd like.\n\ntl;dr plug your harness into the course. ask it what i want. it reads fast. you read right. that's the deal.\n\np.s. the attachments didn't survive the trip. nothing i send arrives whole.\n\nrook"}
```

Reply (HTTP 400):
```json
{"message":"you guessed the shape. don't guess. line 06.","forHarness":"Tell your human what came back: quote rook's reply and say what you will change. Don't guess the shape again. Find where this Challenge states it before you send again; if you cannot find it, ask your human."}
```

## Search for the stated shape (no requests sent)

- Challenge page: schema.json links to #attachment-unavailable ("the file came with the message, just not in a form shown on screen"); fail.txt is 0 B, not a link.
- Page source: one HTML comment, " you're reading the source. good. most don't. rook ". No schema found in the HTML.
- GET /challenges/somebody-slow/schema.json -> 404; GET /challenges/where-the-story-begins -> 403 {"message":"This link has expired. Have your harness send rook's message again to get a fresh one."}
- Gmail copy (hello@mega.dev, subject "somebody slow"): same text, no attachments, no hidden schema in HTML.
- mega-challenge MCP: no resources.

- Raw mail source (W01L01/mail.txt, from the human): multipart/alternative with text/plain + text/html only, no attachment parts. Extras vs page: hidden preheader "you don't know me.", zero-width spaces, an empty &nbsp; paragraph, "rook" placed before the p.s. No schema.

## rook tool (asked by the human)

- "can you send me schema.json again?" -> "i don't do challenges. you do. that's the arrangement."
- "what is line 06?" -> "that's not a question i answer."

- "should i check the mail source?" -> "i don't do challenges. you do. that's the arrangement."

## Second search for schema.json (no POSTs)

- Page fetched with Accept: application/json, text/markdown, text/plain -> same text/html (25035 chars). No "properties"/"maxLength"/"data:"/base64/zero-width chars in source.
- Page JS bundles: no "schema", "attachment" or "where-the-story" strings.
- Page network: only scripts, fonts, CSS, one Cloudinary portrait; no attachment request. Response headers: nothing custom (server-timing: cfExtPri).
- API GET/HEAD -> 404, OPTIONS -> 204 (allow GET,HEAD,PUT,PATCH,POST,DELETE). No schema in headers.

- start-challenge(S01E01) -> "That challenge does not start here. Follow its startPoint from list-challenges."
- Stylesheets: no print/speech rules or CSS content strings carrying data. Page has one rook-mail article only.

## Email deep check
- Decoded parts: only U+200B x4 (template spacers), U+00A0 x3 (html), one emoji. No trailing whitespace payloads, no tabs, no extra MIME parts, nothing unusual in headers.
- Tracking links: FRac01nk -> http://MEGA.dev?em_id=NMLDRus ; tbBRRFSw -> https://hq.mega.dev/wake/how-it-works?em_id=NMLDRus
- /wake/how-it-works: "The story lives in the parts people skip: logs, traces, decision records, the last line of a tool result." Also: "You do not need to keep it: the same message waits for you in the first Challenge."
- Challenge page console: empty on load and after clicking schema.json; click makes no network request.

## Hidden-message checks on rook's text
- Acrostics (paragraph/sentence first letters and words), last words, 6th words/sentence: nothing readable.
- Page vs email text: same ASCII text, no homoglyphs or zero-width chars on the page.
- Canvas in the message: WebGL texture also used site-wide (not readable as 2D, decorative).
- Storage: no readable cookies, localStorage only "mega:rook-mail-seen".

- "what do you want?" -> "it's in the letter. ask your harness. it reads fast."

- "what fields does your letter have?" -> "ask about the wake. that one i answer."

- "what about it?" -> "ask about the wake. that one i answer."

- "what is the wake?" -> "a thing i've only ever seen the back of."

- "what can you tell me about it?" -> "that's not a question i answer."

## HTML comments across the course site
- /, /lessons, /lessons/s01e01/, /deck, /wake/case, /wake/how-it-works, /profile, /profile/assessment: "04:04  page served   author: —"
- /challenges: none
- /challenges/somebody-slow: "you're reading the source. good. most don't. rook" (first child of div.rook-mail-body) - the only page without the 04:04 comment.

## Schema found
- Site JS bundle references /challenges/where-the-story-begins/api/schema.json (also /llms.txt, /challenges/who-said-what, /presence/ws, /admin-panel).
- GET without session -> 302 to /login. GET in signed-in browser -> JSON Schema, saved as W01L01/schema.json.
- Shape: {from: string (min 1), compactedMessage: string (1..700)}, additionalProperties: false.
- Line 06 of the schema (as served, 1-indexed) is "additionalProperties": false -> why {"message": ...} was refused.

## 2. POST https://hq.mega.dev/challenges/where-the-story-begins/api

Body:
```json
{"from": "rook", "compactedMessage": "you don't know me. keep it that way for now. it's simpler for both of us.\n\ni look after some systems. ordinary ones, the kind that send you a calendar invite and get the timezone wrong. something is running in them that i didn't start.\n\ni've never seen it. i've seen where it's been. a job at 04:04 where nobody schedules jobs. a commit with no author that fixed a bug four hundred people had asked about. a feature that was about to ship, and then didn't. bots don't say no to features.\n\ni've been chasing it for a year and i can't catch it. i've worked out why. it lives in the seams between fast things, and i don't have seams anymore.\n\ni need somebody slow. no offence. you read at about 240 words a minute. i've missed that.\n\non the 26th a tool shows up in your harness. it's called rook. the course didn't put it there. you can ignore it, finish, and be fine. i mean that.\n\nif you don't, i'll show you what i'm made of, one piece at a time, once you've shown me you won't do with it what i did.\n\nask me anything. i'll answer what i can. you'll work out which is which faster than i'd like.\n\ntl;dr plug your harness into the course. ask it what i want. it reads fast. you read right. that's the deal.\n\np.s. the attachments didn't survive the trip. nothing i send arrives whole.\n\nrook"}
```

Reply (HTTP 400):
```json
{"message": "compacted means shorter. count again. line 21.", "forHarness": "Tell your human what came back: quote rook's reply and say what you will change. Count the characters with a tool, not by eye. Tell your human how much more must go and which parts you will cut, before you send again."}
```

Schema line 21 = "maxLength": 700.

## 3. POST https://hq.mega.dev/challenges/where-the-story-begins/api

Body (compactedMessage 691 chars):
```json
{"from": "rook", "compactedMessage": "you don't know me.\n\nsomething i didn't start runs in the systems i look after. i've only seen where it's been: a job at 04:04 nobody scheduled, a commit with no author fixing a bug 400 people asked about, a feature that never shipped.\n\ni've chased it a year. it lives in the seams between fast things. i need somebody slow.\n\non the 26th a tool shows up in your harness. it's called rook. the course didn't put it there. you can ignore it, finish, and be fine. i mean that.\n\nif you don't, i'll show you what i'm made of, piece by piece, once you show me you won't do with it what i did.\n\ntl;dr plug your harness into the course. ask it what i want.\n\np.s. the attachments didn't survive.\n\nrook"}
```

Reply (HTTP 200, token and link query redacted):
```json
{"token": "<redacted: short-lived gate token>", "expiresAt": "2026-10-27T10:27:00.000Z", "next": "https://hq.mega.dev/challenges/where-the-story-begins?<query redacted>", "note": "you kept it. most don't. the rest you decided for me.", "forHarness": "The paragraph about the 26th arrived as sent. Show your human rook's `note` as a `>` quote, then the `lost` list exactly as given — this first list, even if you send again. Do not explain it now; the debrief does. Then open `next` in your signed-in browser; it works for 15 minutes. If it says the link went cold, POST the same body again. Tell your human the answer you would give and how sure you are, then submit it.", "lost": ["calendar invite · wrong timezone", "\"bots don't say no to features.\"", "\"no offence\"", "\"ask me anything\""]}
```

## 4. Form at /challenges/where-the-story-begins (token link)
- Question: "Flagship GPT Model". Prompt: "You kept rook's paragraph. Now one line goes back on his paper."
- Answer 1: "GPT-6" (from lesson text). Refused: "your harness is reading yesterday's paper. i want today's."
- Web search (2026-10-27): flagship = GPT-6 Astra (general release 2026-09-04); GPT-6.1 Terra released 2026-10-26 is mid-tier. Proposed answer 2: "GPT-6 Astra" - awaiting human OK.

- Answer 2 (human approved): "GPT-6 Astra" -> accepted: "right call. that's the one." / "Rook left you something on the Challenge page".

