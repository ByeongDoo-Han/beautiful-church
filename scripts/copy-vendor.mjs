import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('public/vendor/pdfjs', { recursive: true });
for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  await copyFile(`node_modules/pdfjs-dist/build/${file}`, `public/vendor/pdfjs/${file}`);
}
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(`node_modules/pdfjs-dist/${dir}`, `public/vendor/pdfjs/${dir}`, { recursive: true });
}
