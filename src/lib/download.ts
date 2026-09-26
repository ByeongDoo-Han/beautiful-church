import type { Asset, Manifest } from './model';

type SaveHandle = { name: string; createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> };
type SavePicker = (options: { id: string; suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<SaveHandle>;

export function safeFileName(name: string) {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/^\.+|[. ]+$/g, '');
  let result = '';
  for (const character of cleaned) {
    if (new TextEncoder().encode(result + character).length > 180) break;
    result += character;
  }
  return result || '예배자료';
}

// Invoke directly from the click handler, before fetching files, to retain user activation.
export async function chooseDownload(title: string) {
  const name = `${safeFileName(title)}-예배자료.zip`;
  const picker = (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  const handle = picker ? await picker.call(window, {
    id: 'worship-materials', suggestedName: name,
    types: [{ description: '예배 자료 ZIP', accept: { 'application/zip': ['.zip'] } }],
  }) : null;
  return { name: handle?.name ?? name, handle };
}

export async function createMaterialArchive(manifest: Manifest, assets: Asset[], load: (asset: Asset) => Promise<Blob>, progress: (message: string) => void) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const files: { assetId: string; path: string }[] = [];
  for (const [index, asset] of assets.entries()) {
    progress(`자료 준비 ${index + 1}/${assets.length}`);
    const path = `자료/${String(index + 1).padStart(3, '0')}-${safeFileName(asset.name.replace(/\.[^.]*$/, ''))}.${asset.kind}`;
    zip.file(path, await (await load(asset)).arrayBuffer());
    files.push({ assetId: asset.id, path });
  }
  zip.file('예배정보.json', JSON.stringify({ manifest: { ...manifest, assets }, files }, null, 2));
  const youtube = manifest.items.filter(item => item.youtube && item.audioSource === 'youtube');
  zip.file('안내.txt', [
    '아름다운교회 영아부 · 예배 자료',
    '자료 폴더에는 업로드한 원본 MP3/PPTX/PDF가 들어 있습니다.',
    '앱에서 수정한 슬라이드 문구와 순서는 예배정보.json에 별도로 보관됩니다. 원본 PPTX 파일에는 반영되지 않습니다.',
    '이 ZIP 파일은 자료 보관용이며, 앱으로 전체 편집본을 다시 불러오는 기능은 제공하지 않습니다.',
    '유튜브 영상과 음원은 포함되지 않습니다. 아래 링크는 인터넷 연결이 필요합니다.',
    ...youtube.map(item => `${item.title}: https://www.youtube.com/watch?v=${item.youtube!.videoId}&t=${item.youtube!.startSeconds}s`),
  ].join('\r\n'));
  progress('ZIP 파일 준비');
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export async function saveDownload(target: Awaited<ReturnType<typeof chooseDownload>>, blob: Blob) {
  if (target.handle) {
    const stream = await target.handle.createWritable();
    try { await stream.write(blob); await stream.close(); }
    catch (error) { await stream.abort().catch(() => {}); throw error; }
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = target.name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
