'use client';
import { ChoiceButtons } from './ChoiceButtons';
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, Upload, X } from 'lucide-react';
import { importFile } from '@/lib/client-storage';
import { errorText, type Item, type Manifest } from '@/lib/model';
import { appendCard, moveCard, moveSection, patchSection, removeCard, sectionName, withSections } from '@/lib/sections';
import { YouTubeLinkField } from './YouTubeLinkField';
export function LibraryEditor({ manifest, onChange, onClose }: { manifest: Manifest; onChange: (m: Manifest) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [sectionPicker, setSectionPicker] = useState<string | null>(null);
  const value = withSections(manifest);
  const patch = (id: string, patch: Partial<Item>) => onChange({ ...value, items: value.items.map(i => i.id === id ? { ...i, ...patch } : i) });
  return <div className="modal-backdrop"><section className="library-dialog library-editor-dialog" role="dialog" aria-modal="true" aria-label="예배 자료 편집">
    <header><div><span className="eyebrow">SERVICE LIBRARY</span><h2>예배 자료 편집</h2></div><button aria-label="편집 닫기" onClick={onClose}><X size={20} /></button></header>
    <div className="library-editor-body">
    <label className="field-label">예배 이름<input value={value.title} maxLength={100} onChange={e => onChange({ ...value, title: e.target.value || '예배' })} /></label>
    <label className={`upload-area ${busy ? 'disabled' : ''}`}><Upload size={24} /><strong>{busy ? '파일을 확인하고 있습니다…' : 'PPTX · PDF · MP3 불러오기'}</strong><span>PPTX/PDF 20MB · MP3 15MB / PPT·PDF를 불러오면 새 섹션이 만들어집니다</span><input aria-label="예배 파일 불러오기" type="file" accept=".pptx,.pdf,.mp3" multiple disabled={busy} onChange={async e => {
      const files = [...(e.target.files ?? [])]; setBusy(true); setMessage('');
      let next: Manifest = value; const errors: string[] = [];
      for (const file of files) { try {
        const asset = await importFile(file);
        if (!next.assets.some(a => a.id === asset.id)) {
          const item = { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, '').slice(0, 100), ...(asset.kind === 'mp3' ? { audioId: asset.id } : { presentationId: asset.id }) };
          next = appendCard({ ...next, assets: [...next.assets, asset] }, item);
        }
      } catch (err) { errors.push(`${file.name}: ${errorText(err)}`); } }
      onChange(next); setMessage(errors.length ? errors.join(' / ') : `${files.length}개 파일을 확인했습니다. PPT 섹션과 카드별 음원을 연결하세요.`); setBusy(false); e.target.value = '';
    }} /></label>
    {message && <p role="status" className="notice">{message}</p>}
    <h3 className="editor-section-title">PPT 섹션</h3><p className="muted">같은 섹션의 순서 카드는 같은 PPT와 현재 페이지를 사용합니다. 왼쪽 목록에서 카드를 드래그해 배치할 수 있습니다.</p>
    <div className="editor-sections">{value.sections.map((section, index) => <div className="editor-section" key={section.id}>
      <div className="editor-section-heading"><strong>{index + 1}. {sectionName(value, section)}</strong><span>{section.itemIds.length}개 순서</span><button aria-label={`PPT 섹션 ${index + 1} 위로`} disabled={index === 0} onClick={() => onChange(moveSection(value, section.id, -1))}><ArrowUp size={15} /></button><button aria-label={`PPT 섹션 ${index + 1} 아래로`} disabled={index === value.sections.length - 1} onClick={() => onChange(moveSection(value, section.id, 1))}><ArrowDown size={15} /></button><button aria-label={`PPT 섹션 ${index + 1} 삭제`} disabled={section.itemIds.length > 0} title="카드를 옮긴 후 빈 섹션을 삭제할 수 있습니다" onClick={() => { if (section.presentationEdit && !confirm('빈 섹션과 이 섹션의 웹 편집 내용을 삭제할까요?')) return; onChange({ ...value, sections: value.sections.filter(s => s.id !== section.id) }); }}><Trash2 size={15} /></button></div>
      <div className="section-asset-selects"><ChoiceButtons label="프레젠테이션" ariaLabel={`PPT 섹션 ${index + 1} 파일`} value={section.presentationId ?? ''} disabled={busy} onChange={id => onChange(patchSection(value, section.id, { presentationId: id || undefined }))} options={[{ value: '', label: '자료 미지정' }, ...value.assets.filter(a => a.kind !== 'mp3').map(a => ({ value: a.id, label: a.name }))]} />
        <ChoiceButtons label="대체 PDF" ariaLabel={`PPT 섹션 ${index + 1} 대체 PDF`} value={section.fallbackPdfId ?? ''} disabled={busy} onChange={id => onChange(patchSection(value, section.id, { fallbackPdfId: id || undefined }))} options={[{ value: '', label: '연결하지 않음' }, ...value.assets.filter(a => a.kind === 'pdf').map(a => ({ value: a.id, label: a.name }))]} /></div>
    </div>)}</div>
    <h3 className="editor-section-title">예배 순서 카드</h3><p className="muted">순서 이름은 파일 이름과 별도로 수정할 수 있습니다.</p>
    <div className="editor-items">{value.items.map((item, index) => {
      const section = value.sections.find(s => s.itemIds.includes(item.id))!; const position = section.itemIds.indexOf(item.id);
      return <div className="editor-item" key={item.id}>
      <div className="editor-item-title"><span>{String(index + 1).padStart(2, '0')}</span><input aria-label={`항목 ${index + 1} 제목`} value={item.title} maxLength={100} onChange={e => patch(item.id, { title: e.target.value || '새 항목' })} /><button aria-label={`${item.title} 위로`} disabled={position === 0} onClick={() => onChange(moveCard(value, item.id, section.id, section.itemIds[position - 1]))}><ArrowUp size={16} /></button><button aria-label={`${item.title} 아래로`} disabled={position === section.itemIds.length - 1} onClick={() => onChange(moveCard(value, item.id, section.id, section.itemIds[position + 2]))}><ArrowDown size={16} /></button><button aria-label={`${item.title} 순서에서 제거`} onClick={() => onChange(removeCard(value, item.id))}><Trash2 size={16} /></button></div>
      <div className="card-section-summary"><div><span>PPT 섹션</span><strong>{value.sections.indexOf(section) + 1}. {sectionName(value, section)}</strong></div><button aria-label={`${item.title} PPT 섹션 변경`} aria-expanded={sectionPicker === item.id} aria-controls={`section-picker-${item.id}`} disabled={busy} onClick={() => setSectionPicker(sectionPicker === item.id ? null : item.id)}>{sectionPicker === item.id ? '접기' : '변경'}</button></div>
      <div id={`section-picker-${item.id}`} className="card-section-picker">{sectionPicker === item.id && <ChoiceButtons className="card-section-field" label="이동할 PPT 섹션" ariaLabel={`${item.title} PPT 섹션`} value={section.id} disabled={busy} onChange={id => onChange(moveCard(value, item.id, id))} options={value.sections.map((s, i) => ({ value: s.id, label: `${i + 1}. ${sectionName(value, s)}` }))} />}</div>
      <ChoiceButtons className="audio-source-field" label="찬양 재생 방식" ariaLabel={`${item.title} 재생 방식`} value={item.audioSource ?? 'mp3'} disabled={busy} onChange={source => patch(item.id, { audioSource: source as 'mp3' | 'youtube' })} options={[{ value: 'mp3', label: 'MP3 음원 파일' }, { value: 'youtube', label: '유튜브 링크 · 화면 1' }]} />
      {item.audioSource === 'youtube' && <YouTubeLinkField title={item.title} track={item.youtube} disabled={busy} onChange={youtube => patch(item.id, { youtube })} />}
      <ChoiceButtons className="card-section-field" label="찬양 MP3" ariaLabel={`${item.title} 찬양 MP3`} value={item.audioId ?? ''} disabled={busy} onChange={id => patch(item.id, { audioId: id || undefined })} options={[{ value: '', label: '연결하지 않음' }, ...value.assets.filter(a => a.kind === 'mp3').map(a => ({ value: a.id, label: a.name }))]} />
      {item.audioSource === 'youtube' && <p className="muted">화면 2에는 PPT 섹션의 슬라이드를 표시합니다. 유튜브 음원은 인터넷 연결이 필요합니다.</p>}
    </div>; })}</div>
    <button disabled={value.items.length >= 100 || busy} onClick={() => onChange(appendCard(value, { id: crypto.randomUUID(), title: '새 예배 순서' }, value.sections.at(-1)?.id))}><Plus size={16} />빈 순서 추가</button>
    <p className="muted">새 순서는 마지막 PPT 섹션에 추가됩니다. PPT 섹션 파일을 교체하면 해당 섹션의 웹 문구 편집은 초기화됩니다.</p>
    <footer><span>변경 사항은 이 PC에 자동 저장됩니다.</span><button className="primary" onClick={onClose}>편집 완료</button></footer>
    </div>
  </section></div>;
}
