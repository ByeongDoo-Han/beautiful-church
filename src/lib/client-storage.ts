import { openDB, type DBSchema } from 'idb';
import { upload } from '@vercel/blob/client';
import { assetSchema, kindSchema, LIMITS, MIME, type Asset, type ManifestEnvelope } from './model';
interface WorshipDB extends DBSchema {
  files: { key: string; value: Blob };
  metadata: { key: string; value: ManifestEnvelope };
}
const database = () => openDB<WorshipDB>('beautiful-church-v1', 1, { upgrade(db) { db.createObjectStore('files'); db.createObjectStore('metadata'); } });
export async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `요청 실패 (${response.status})`);
  return body as T;
}
export async function localManifest(mode: string) { const db = await database(); try { return await db.get('metadata', mode); } finally { db.close(); } }
export async function saveLocalManifest(mode: string, value: ManifestEnvelope) { const db = await database(); try { await db.put('metadata', value, mode); } finally { db.close(); } }
export async function hasFile(id: string) { const db = await database(); try { return (await db.getKey('files', id)) !== undefined; } finally { db.close(); } }
export async function storeFile(id: string, blob: Blob) { const db = await database(); try { await db.put('files', blob, id); window.dispatchEvent(new Event('worship-file-cached')); } finally { db.close(); } }
export async function clearLocalFiles() { const db = await database(); try { const tx = db.transaction(['files', 'metadata'], 'readwrite'); await tx.objectStore('files').clear(); await tx.objectStore('metadata').clear(); await tx.done; } finally { db.close(); } }
const downloading = new Map<string, Promise<Blob>>();
export async function fileFor(asset: Asset): Promise<Blob> {
  const db = await database();
  let cached: Blob | undefined;
  try { cached = await db.get('files', asset.id); } finally { db.close(); }
  if (cached) return cached;
  const pending = downloading.get(asset.id); if (pending) return pending;
  const work = (async () => {
    let url = asset.demoPath as string | undefined;
    if (!url && asset.pathname) url = (await jsonRequest<{ url: string }>(`/api/signed-url?id=${encodeURIComponent(asset.id)}`)).url;
    if (!url) throw new Error('이 PC에 자료가 없습니다. 운영자 콘솔에서 파일을 다시 불러와 주세요.');
    let response = await fetch(url, { cache: 'no-store', credentials: asset.demoPath ? 'same-origin' : 'omit' });
    if (asset.pathname && [401, 403].includes(response.status)) {
      const fresh = await jsonRequest<{ url: string }>(`/api/signed-url?id=${encodeURIComponent(asset.id)}`);
      response = await fetch(fresh.url, { cache: 'no-store', credentials: 'omit' });
    }
    if (!response.ok) throw new Error('자료 다운로드 실패. 로그인과 네트워크를 확인해 주세요.');
    const blob = await response.blob();
    if (blob.size > LIMITS[asset.kind]) throw new Error('자료 크기 제한을 초과했습니다.');
    if (!asset.demoPath && (blob.size !== asset.size || await digest(blob) !== asset.id)) throw new Error('자료 무결성 검사에 실패했습니다. 다시 업로드해 주세요.');
    await storeFile(asset.id, blob); return blob;
  })().finally(() => downloading.delete(asset.id));
  downloading.set(asset.id, work); return work;
}
async function digest(blob: Blob) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function importFile(file: File): Promise<Asset> {
  const kind = kindSchema.safeParse(file.name.split('.').pop()?.toLowerCase());
  if (!kind.success) throw new Error('MP3, PPTX, PDF 파일을 선택해 주세요.');
  if (!file.size || file.size > LIMITS[kind.data]) throw new Error(`${kind.data.toUpperCase()} 파일 제한: ${LIMITS[kind.data] / 1024 ** 2}MB`);
  const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const prefix = new TextDecoder().decode(bytes);
  const valid = kind.data === 'pdf' ? prefix === '%PDF-' : kind.data === 'pptx' ? bytes[0] === 80 && bytes[1] === 75 : prefix.startsWith('ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224);
  if (!valid) throw new Error('확장자와 파일 내용이 일치하지 않습니다.');
  const id = await digest(file);
  const asset = assetSchema.parse({ id, name: file.name, kind: kind.data, size: file.size });
  await storeFile(id, file); return asset;
}
export async function uploadAsset(asset: Asset, onProgress: (percent: number) => void): Promise<Asset> {
  if (asset.pathname) return asset;
  if (asset.demoPath) throw new Error('샘플 자료 대신 실제 파일을 불러와 주세요.');
  const pathname = `media/${asset.id}.${asset.kind}`;
  await upload(pathname, await fileFor(asset), { access: 'private', handleUploadUrl: '/api/upload', contentType: MIME[asset.kind], multipart: true, onUploadProgress: p => onProgress(p.percentage) });
  return { ...asset, pathname };
}
export async function prepareOffline() {
  if (!('serviceWorker' in navigator)) throw new Error('이 브라우저는 오프라인 앱 저장을 지원하지 않습니다.');
  if (process.env.NODE_ENV !== 'production') throw new Error('오프라인 재실행은 npm run build 후 npm start에서 준비해 주세요. 파일은 이미 이 PC에 저장됩니다.');
  await navigator.serviceWorker.register('/sw.js');
  const registration = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('오프라인 앱 준비가 지연됩니다. 인터넷 연결 후 다시 시도해 주세요.')), 30000))]);
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel(); const timer = setTimeout(() => reject(new Error('오프라인 준비 확인 시간 초과')), 30000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); event.data.ok ? resolve() : reject(new Error('앱 파일 저장에 실패했습니다. 다시 시도해 주세요.')); };
    registration.active?.postMessage({ type: 'PREPARE' }, [channel.port2]);
  });
  await navigator.storage?.persist?.();
}
