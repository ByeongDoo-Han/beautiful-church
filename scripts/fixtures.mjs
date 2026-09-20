import pptxgen from 'pptxgenjs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import vm from 'node:vm';
await mkdir('public/demo', { recursive: true });
const slides = [
  ['WELCOME TO WORSHIP', '우리 함께 예배합니다', 'With one heart, in one place.'],
  ['A MOMENT OF PRAISE', '찬양으로 마음을 모읍니다', 'Let everything that has breath praise the Lord.'],
  ['A MOMENT OF PRAYER', '함께 기도합니다', 'Be still, and know that I am God.'],
];
const pptx = new pptxgen(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'Beautiful Church'; pptx.subject = 'Original rehearsal fixture'; pptx.title = 'Welcome to worship';
for (const [i, [title, korean, subtitle]] of slides.entries()) {
  const slide = pptx.addSlide(); slide.background = { color: i === 1 ? '24382B' : '243027' };
  slide.addShape(pptx.ShapeType.ellipse, { x: 7.5, y: -3.8, w: 8.2, h: 9.5, fill: { color: '81916A', transparency: 90 }, line: { transparency: 100 }, rotate: 30 });
  slide.addShape(pptx.ShapeType.ellipse, { x: -5, y: 4.6, w: 9.3, h: 4.5, fill: { color: '81916A', transparency: 91 }, line: { transparency: 100 }, rotate: -15 });
  slide.addText('BEAUTIFUL CHURCH', { x: 4, y: 1.35, w: 5.33, h: .4, fontFace: 'Arial', fontSize: 10, charSpacing: 5, color: 'AAB99C', align: 'center', margin: 0 });
  slide.addText(korean, { x: 1, y: 2.65, w: 11.33, h: .9, fontFace: 'Apple SD Gothic Neo', fontSize: 34, color: 'F3F2DC', bold: false, align: 'center', margin: 0 });
  slide.addText(title, { x: 1, y: 3.7, w: 11.33, h: .45, fontFace: 'Arial', fontSize: 12, charSpacing: 3, color: 'AAB99C', align: 'center', margin: 0 });
  slide.addText(subtitle, { x: 1, y: 4.75, w: 11.33, h: .45, fontFace: 'Arial', fontSize: 11, color: 'CAD1BB', align: 'center', margin: 0 });
  slide.addShape(pptx.ShapeType.line, { x: 6.33, y: 5.7, w: .66, h: 0, line: { color: 'A6B085', width: 1 } });
  slide.addText(`${String(i + 1).padStart(2, '0')}  /  03`, { x: 5.5, y: 6.6, w: 2.33, h: .3, fontFace: 'Arial', fontSize: 9, color: '8C9F80', align: 'center', margin: 0 });
}
await pptx.writeFile({ fileName: 'public/demo/welcome.pptx' });
// Independent, portable PDF fixture; the UI never pretends to convert PPTX to PDF.
const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
for (const [i, [title, , subtitle]] of slides.entries()) {
  const page = pdf.addPage([1280, 720]); page.drawRectangle({ x: 0, y: 0, width: 1280, height: 720, color: rgb(.14, .19, .15) });
  const center = (text, size, y, color) => page.drawText(text, { x: (1280 - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
  center('BEAUTIFUL CHURCH', 14, 560, rgb(.65, .72, .58)); center(title, 40, 370, rgb(.95, .95, .86));
  center(subtitle, 20, 280, rgb(.77, .82, .70)); center(`PDF REHEARSAL  |  ${i + 1} / 3`, 13, 70, rgb(.60, .69, .52));
}
await writeFile('public/demo/welcome.pdf', await pdf.save());
const context = {}; vm.runInNewContext(await readFile('node_modules/lamejs/lame.all.js', 'utf8'), context);
const encoder = new context.lamejs.Mp3Encoder(1, 44100, 96); const chunks = []; const duration = 18;
for (let start = 0; start < 44100 * duration; start += 1152) {
  const pcm = new Int16Array(Math.min(1152, 44100 * duration - start));
  for (let j = 0; j < pcm.length; j++) { const t = (start + j) / 44100; const envelope = Math.min(1, t / 2, (duration - t) / 2); pcm[j] = Math.round(1800 * envelope * (Math.sin(2 * Math.PI * 261.63 * t) + .5 * Math.sin(2 * Math.PI * 329.63 * t) + .3 * Math.sin(2 * Math.PI * 392 * t))); }
  const out = encoder.encodeBuffer(pcm); if (out.length) chunks.push(Buffer.from(out));
}
chunks.push(Buffer.from(encoder.flush())); await writeFile('public/demo/tone.mp3', Buffer.concat(chunks));
console.log('Created 3-slide PPTX, 3-page PDF and original 18-second MP3 rehearsal tone.');
