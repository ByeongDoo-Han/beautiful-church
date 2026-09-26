import { readdir, writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
async function files(dir, base) { const entries = await readdir(dir, { withFileTypes: true }); return (await Promise.all(entries.map(e => e.isDirectory() ? files(`${dir}/${e.name}`, `${base}/${e.name}`) : `${base}/${e.name}`))).flat(); }
export async function precache({ distDir, projectDir }) {
  const assets = [...await files(path.join(distDir, 'static'), '/_next/static'), ...await files(path.join(projectDir, 'public/vendor'), '/vendor')].filter(p => !p.endsWith('.map'));
  await writeFile(path.join(projectDir, 'public/precache.json'), JSON.stringify(['/login', '/manifest.webmanifest', '/favicon.ico', '/icons/favicon-32-1928cf3c2d.png', '/icons/favicon-64-1928cf3c2d.png', '/icons/apple-touch-icon.png', '/icons/church-192.png', '/icons/church-512.png', ...assets]));
  const worker = await readFile(path.join(projectDir, 'scripts/sw-template.js'), 'utf8');
  await writeFile(path.join(projectDir, 'public/sw.js'), worker.replace(/const CACHE = '[^']+';/, `const CACHE = 'worship-shell-${randomUUID()}';`));
  console.log(`Offline shell: ${assets.length} assets`);
}
