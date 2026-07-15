// Generates supabase/seed.sql from panini-wc-2026-catalog.json
// Run with: npm run seed:generate

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const catalog = JSON.parse(readFileSync(join(root, 'panini-wc-2026-catalog.json'), 'utf-8'));

function sqlString(value) {
	return `'${String(value).replace(/'/g, "''")}'`;
}

const rows = catalog.stickers
	.map((s) => `(${sqlString(s.code)}, ${sqlString(s.name)}, ${sqlString(s.team)})`)
	.join(',\n');

const sql = `-- Auto-generated from panini-wc-2026-catalog.json by scripts/generate-seed.mjs
-- Source: ${catalog.source}
-- Scraped at: ${catalog.scrapedAt}
-- Total stickers: ${catalog.stickers.length}

insert into public.stickers (code, name, team)
values
${rows}
on conflict (code) do update
	set name = excluded.name,
	    team = excluded.team;
`;

writeFileSync(join(root, 'supabase', 'seed.sql'), sql, 'utf-8');
console.log(`Wrote supabase/seed.sql with ${catalog.stickers.length} stickers.`);
