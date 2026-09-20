'use client';
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, Upload, X } from 'lucide-react';
import { importFile } from '@/lib/client-storage';
import { errorText, type Item, type Manifest } from '@/lib/model';
export function LibraryEditor({ manifest, onChange, onClose }: { manifest: Manifest; onChange: (m: Manifest) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const patch = (id: string, value: Partial<Item>) => onChange({ ...manifest, items: manifest.items.map(i => i.id === id ? { ...i, ...value } : i) });
  const move = (index: number, delta: number) => { const items = [...manifest.items]; [items[index], items[index + delta]] = [items[index + delta], items[index]]; onChange({ ...manifest, items }); };
  return <div className="modal-backdrop"><section className="library-dialog" role="dialog" aria-modal="true" aria-label="예배 자료 편집">
    <header><div><span className="eyebrow">SERVICE LIBRARY</span><h2>예배 자료 편집</h2></div><button aria-label="편집 닫기" onClick={onClose}><X size={20} /></button></header>
    <label className="field-label">예배 이름<input value={manifest.title} maxLength={100} onChange={e => onChange({ ...manifest, title: e.target.value || '예배' })} /></label>
    <label className={`upload-area ${busy ? 'disabled' : ''}`}><Upload size={24} /><strong>{busy ? '파일을 확인하고 있습니다…' : 'PPTX · PDF · MP3 불러오기'}</strong><span>PPTX/PDF 20MB · MP3 15MB / 파일은 먼저 이 PC에 저장됩니다</span><input aria-label="예배 파일 불러오기" type="file" accept=".pptx,.pdf,.mp3" multiple disabled={busy} onChange={async e => {
      const files = [...(e.target.files ?? [])]; setBusy(true); setMessage('');
      const assets = [...manifest.assets]; const items = [...manifest.items]; const errors: string[] = [];
      for (const file of files) { try { const asset = await importFile(file); if (!assets.some(a => a.id === asset.id)) { assets.push(asset); items.push({ id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, '').slice(0, 100), ...(asset.kind === 'mp3' ? { audioId: asset.id } : { presentationId: asset.id }) }); } } catch (err) { errors.push(`${file.name}: ${errorText(err)}`); } }
      onChange({ ...manifest, assets, items }); setMessage(errors.length ? errors.join(' / ') : `${files.length}개 파일을 확인했습니다. 아래 항목에서 음원과 슬라이드를 연결하세요.`); setBusy(false); e.target.value = '';
    }} /></label>
    {message && <p role="status" className="notice">{message}</p>}
    <div className="editor-items">{manifest.items.map((item, index) => <div className="editor-item" key={item.id}>
      <div className="editor-item-title"><span>{String(index + 1).padStart(2, '0')}</span><input aria-label={`항목 ${index + 1} 제목`} value={item.title} maxLength={100} onChange={e => patch(item.id, { title: e.target.value || '새 항목' })} /><button aria-label={`${item.title} 위로`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button aria-label={`${item.title} 아래로`} disabled={index === manifest.items.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button aria-label={`${item.title} 순서에서 제거`} onClick={() => onChange({ ...manifest, items: manifest.items.filter(i => i.id !== item.id) })}><Trash2 size={16} /></button></div>
      <div className="asset-selects">{([
        ['audioId', '찬양 MP3', ['mp3']], ['presentationId', '프레젠테이션', ['pptx', 'pdf']], ['fallbackPdfId', '대체 PDF', ['pdf']],
      ] as const).map(([field, label, kinds]) => <label key={field}>{label}<select aria-label={`${item.title} ${label}`} value={item[field] ?? ''} onChange={e => patch(item.id, { [field]: e.target.value || undefined })}><option value="">연결하지 않음</option>{manifest.assets.filter(a => (kinds as readonly string[]).includes(a.kind)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>)}</div>
    </div>)}</div>
    <button onClick={() => onChange({ ...manifest, items: [...manifest.items, { id: crypto.randomUUID(), title: '새 예배 순서' }] })}><Plus size={16} />빈 순서 추가</button>
    <p className="muted">PPTX 표현이 다르면 PowerPoint에서 PDF로 내보낸 파일을 ‘대체 PDF’에 연결하세요. 자동 변환 서버는 사용하지 않습니다.</p>
    <footer><span>변경 사항은 이 PC에 자동 저장됩니다.</span><button className="primary" onClick={onClose}>편집 완료</button></footer>
  </section></div>;
}
