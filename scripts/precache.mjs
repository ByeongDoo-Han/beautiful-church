import { readdir, writeFile, readFile } from 'node:fs/promises';
async function files(dir, base) { const entries = await readdir(dir, { withFileTypes: true }); return (await Promise.all(entries.map(e => e.isDirectory() ? files(`${dir}/${e.name}`, `${base}/${e.name}`) : `${base}/${e.name}`))).flat(); }
const assets = [...await files('.next/static', '/_next/static'), ...await files('public/vendor', '/vendor')].filter(p => !p.endsWith('.map'));
await writeFile('public/precache.json', JSON.stringify(['/admin', '/worship', '/output', '/login', '/manifest.webmanifest', '/favicon.ico', '/icons/apple-touch-icon.png', '/icons/church-192.png', '/icons/church-512.png', ...assets]));
const buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim();
const worker = await readFile('scripts/sw-template.js', 'utf8');
await writeFile('public/sw.js', worker.replace(/const CACHE = '[^']+';/, `const CACHE = 'worship-shell-${buildId}';`));
console.log(`Offline shell: ${assets.length} assets`);
