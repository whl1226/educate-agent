import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'F:/代码文件/vibe coder/无界应用-教育智能体/初赛提交材料/assets';
mkdirSync(OUT_DIR, { recursive: true });

// Extract unique ph:* icons from the 4 prototypes, strict pattern
import { execSync } from 'node:child_process';
const grep = execSync(
  'grep -ohE "data-icon=\\"ph:[a-z0-9-]+\\"" "F:/代码文件/vibe coder/无界应用-教育智能体/原型"/*.html',
  { encoding: 'utf-8' }
);
const icons = [...new Set(grep.split('\n').map(s => s.match(/ph:[a-z0-9-]+/)?.[0]).filter(Boolean))];
console.log('Unique icons to fetch:', icons.length);

const map = {};
const CONCURRENCY = 8;
async function fetchOne(icon) {
  const url = `https://api.iconify.design/${icon}.svg?height=28&width=28`;
  try {
    const res = await fetch(url);
    if (!res.ok) { console.warn('FAIL', icon, res.status); return; }
    let svg = await res.text();
    // Normalize: ensure currentColor fill + inline-block friendliness
    svg = svg.replace(/width="[^"]*"/, 'width="1em"').replace(/height="[^"]*"/, 'height="1em"');
    if (!svg.includes('fill=')) svg = svg.replace('<svg', '<svg fill="currentColor"');
    map[icon] = svg;
  } catch (e) {
    console.warn('ERR', icon, e.message);
  }
}

for (let i = 0; i < icons.length; i += CONCURRENCY) {
  const batch = icons.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map(fetchOne));
  process.stdout.write(`\r${Math.min(i + CONCURRENCY, icons.length)}/${icons.length}`);
}
console.log('\nFetched:', Object.keys(map).length);

// Write JSON map (escaped for inline embedding)
writeFileSync(join(OUT_DIR, 'icons.json'), JSON.stringify(map));
console.log('Saved icons.json');
