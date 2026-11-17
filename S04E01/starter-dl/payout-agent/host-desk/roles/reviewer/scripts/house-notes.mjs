// house-notes: prints every house decision note in host-desk/why/ (why the app does things its way), so the
// reviewer judges a change against the decisions the house already made. Read-only.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WHY = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'why');
for (const f of readdirSync(WHY).filter((n) => n.endsWith('.md')).sort()) {
  console.log(`===== why/${f}\n${readFileSync(join(WHY, f), 'utf8').trim()}\n`);
}
