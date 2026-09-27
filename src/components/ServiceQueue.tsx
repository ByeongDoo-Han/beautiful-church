'use client';
import { ChoiceButtons } from './ChoiceButtons';
import { MaterialImport } from './MaterialImport';
import { SectionEditor } from './SectionEditor';
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Music2, Plus, Trash2, Edit3, X } from 'lucide-react';
import type { Manifest } from '@/lib/model';
import { appendCard, moveCard, removeCard, sectionFileName, sectionName, withSections } from '@/lib/sections';

export function ServiceQueue({ manifest, selected, disabled, canEdit, editing, onEditingChange, onImport, onSelect, onChange }: {
  manifest: Manifest; selected?: string; disabled: boolean; canEdit: boolean; onSelect: (id: string) => void; onChange: (value: Manifest) => void;
  editing: boolean; onEditingChange: (value: boolean) => void; onImport: (files: File[], sectionId?: string) => Promise<void>;
}) {
  const value = withSections(manifest);
  const locked = disabled || !canEdit;
  const [sectionEditing, setSectionEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [menu, setMenu] = useState<string | null>(null); const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState(''); const [announcement, setAnnouncement] = useState('');
  const drag = useRef<string | null>(null);
  // Focusing a card button can scroll this list between pointerdown and native
  // dragstart. Keep the card the user actually grabbed, not the element now under
  // the pointer after that scroll.
  const pressed = useRef<string | null>(null);
  const selectAdjacent = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault(); event.stopPropagation();
    const next = value.items[index + (event.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    onSelect(next.id);
    const button = event.currentTarget.closest('nav')?.querySelector<HTMLButtonElement>(`[data-card-id="${next.id}"] .queue-item`);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const drop = (event: React.DragEvent, sectionId: string, before?: string) => {
    if (locked || !drag.current) return;
    event.preventDefault(); event.stopPropagation();
    const next = moveCard(value, drag.current, sectionId, before);
    onChange(next); setAnnouncement('예배 순서 카드 위치를 변경했습니다.'); drag.current = null; pressed.current = null; setDragging(null); setOver('');
  };
  return <>
    {canEdit && <button data-guide="edit" className="queue-edit-toggle" disabled={disabled} aria-pressed={editing} onClick={() => { onEditingChange(!editing); setSectionEditing(null); setMenu(null); setRenaming(null); }}>{editing ? <X size={14} /> : <Edit3 size={14} />}{editing ? '편집 모드 종료' : '편집 모드'}</button>}
    <nav className="service-queue grouped-queue" aria-label="곡 선택" onDragLeave={e => { if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setOver(''); }}>
      {canEdit && editing && <div className="queue-library-tools"><label className="field-label">예배 이름<input aria-label="예배 이름" value={value.title} maxLength={100} disabled={locked} onChange={e => onChange({ ...value, title: e.target.value || '예배' })} /></label><MaterialImport label="예배 파일 불러오기" disabled={locked} onImport={files => onImport(files)} /><p className="queue-edit-help">섹션의 연필 버튼에서 이름과 자료를 변경하세요.</p></div>}
      {value.sections.map((section, sectionIndex) => <section key={section.id} data-section-id={section.id} className={`ppt-section ${over === section.id ? 'drop-section' : ''}`} aria-label={`PPT 섹션 ${sectionIndex + 1}: ${sectionName(value, section)}`}
        onDragOver={e => { if (drag.current && !locked) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(section.id); } }} onDrop={e => drop(e, section.id)}>
        <header className="ppt-section-heading"><div className="ppt-section-identity"><strong title={sectionName(value, section)}>{sectionName(value, section)}</strong><small>{section.itemIds.length}개 예배 순서</small></div>
          <span className="ppt-section-file" title={sectionFileName(value, section)}>{sectionFileName(value, section)}</span>
          <div className="ppt-section-actions">
          {canEdit && <button disabled={locked || value.items.length >= 100} aria-label={`PPT 섹션 ${sectionIndex + 1}에 순서 추가`} onClick={() => onChange(appendCard(value, { id: crypto.randomUUID(), title: '새 예배 순서' }, section.id))}><Plus size={15} /></button>}
          {canEdit && editing && <button disabled={locked} aria-label={`PPT 섹션 ${sectionIndex + 1} 편집`} aria-expanded={sectionEditing === section.id} onClick={() => setSectionEditing(sectionEditing === section.id ? null : section.id)}><Edit3 size={14} /></button>}
          {canEdit && editing && section.itemIds.length === 0 && <button className="queue-delete" disabled={locked} aria-label={`PPT 섹션 ${sectionIndex + 1} 삭제`} onClick={() => { if (!locked && confirm(`‘${sectionName(value, section)}’ 빈 섹션을 삭제할까요? 섹션의 문구 편집은 사라지고 원본 파일은 유지됩니다.`)) { onChange({ ...value, sections: value.sections.filter(s => s.id !== section.id) }); setAnnouncement('빈 PPT 섹션을 삭제했습니다.'); } }}><Trash2 size={15} /></button>}
          </div></header>
        {canEdit && editing && sectionEditing === section.id && <SectionEditor manifest={value} section={section} index={sectionIndex} disabled={locked} onChange={onChange} onImport={onImport} />}
        <div role="list" className="section-cards">{section.itemIds.map((id, index) => {
          const item = value.items.find(i => i.id === id)!; const number = value.items.indexOf(item) + 1;
          const fileIds = [section.presentationId, item.audioSource === 'youtube' ? undefined : item.audioId];
          const files = [...new Set(fileIds)].flatMap(fileId => value.assets.filter(asset => asset.id === fileId));
          return <div role="listitem" key={id} data-card-id={id} className={`queue-card ${dragging === id ? 'dragging' : ''} ${over === `before:${id}` ? 'drop-before' : ''}`} draggable={!locked && renaming?.id !== id}
            onPointerDown={e => { if (e.button === 0) { pressed.current = id; (e.target as HTMLElement).closest('button')?.focus({ preventScroll: true }); } }}
            onDragStart={e => { if (locked) { e.preventDefault(); return; } const source = pressed.current ?? id; drag.current = source; setDragging(source); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-worship-card', source); const element = e.currentTarget.closest('nav')?.querySelector<HTMLElement>(`[data-card-id="${source}"]`); if (element) e.dataTransfer.setDragImage(element, 24, 24); setMenu(null); }}
            onDragEnd={() => { drag.current = null; pressed.current = null; setDragging(null); setOver(''); }}
            onDragOver={e => { if (drag.current && !locked) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setOver(`before:${id}`); } }} onDrop={e => drop(e, section.id, id)}>
            <div className="queue-card-row"><button data-guide={selected === id ? 'order' : undefined} className={`queue-item ${selected === id ? 'active' : ''}`} aria-current={selected === id ? 'step' : undefined} aria-keyshortcuts="ArrowDown ArrowUp" onClick={() => onSelect(id)} onKeyDown={event => selectAdjacent(event, number - 1)}><span className="queue-number">{String(number).padStart(2, '0')}</span><span className="queue-copy"><strong>{item.title}</strong>{files.map(file => <small className="queue-file-name" key={file.id} title={file.name}>{file.name}</small>)}{item.audioSource === 'youtube' && <small className="queue-file-name">찬양 YouTube</small>}</span>{(item.audioSource === 'youtube' || item.audioId) && <Music2 size={13} />}</button>
              {canEdit && <button className="card-grip" disabled={locked} aria-label={`예배 순서 ${number} 이동 메뉴`} title="드래그로 이동 · 클릭하면 이동 메뉴" aria-expanded={menu === id} onClick={() => setMenu(menu === id ? null : id)}><GripVertical size={15} /></button>}
              {canEdit && editing && <button className="queue-rename" disabled={locked} aria-label={`${item.title} 순서 이름 수정`} title="순서 이름 수정" onClick={() => { setRenaming({ id, title: item.title }); setMenu(null); }}><Edit3 size={14} /></button>}
              {canEdit && editing && <button className="queue-delete" disabled={locked} aria-label={`${item.title} 카드 삭제`} onClick={() => { if (!locked && confirm(`‘${item.title}’ 예배 순서를 삭제할까요? PPT 섹션과 원본 파일은 유지됩니다.`)) { onChange(removeCard(value, id)); setMenu(null); setAnnouncement(`${item.title} 카드를 삭제했습니다.`); } }}><Trash2 size={14} /></button>}</div>
            {canEdit && editing && renaming?.id === id && <form className="card-name-form" onSubmit={e => {
              e.preventDefault(); const title = renaming.title.trim(); if (locked || !title) return;
              onChange({ ...value, items: value.items.map(card => card.id === id ? { ...card, title } : card) });
              setRenaming(null); setAnnouncement(`예배 순서 이름을 ${title}(으)로 변경했습니다.`);
            }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }}>
              <label>예배 순서 이름<input autoFocus aria-label="예배 순서 이름" value={renaming.title} maxLength={100} required disabled={locked} onChange={e => setRenaming({ id, title: e.target.value })} /></label>
              <div><button type="submit" disabled={locked || !renaming.title.trim()}>이름 적용</button><button type="button" onClick={() => setRenaming(null)}>취소</button></div>
            </form>}
            {canEdit && menu === id && <div className="card-move-menu"><ChoiceButtons label="이동할 PPT 섹션" ariaLabel={`${item.title} 이동할 PPT 섹션`} value={section.id} disabled={locked} onChange={target => { onChange(moveCard(value, id, target)); setMenu(null); setAnnouncement(`${item.title} 카드를 다른 섹션으로 옮겼습니다.`); }} options={value.sections.map((s, i) => ({ value: s.id, label: `${i + 1}. ${sectionName(value, s)}` }))} /><div>
              <button aria-label={`${item.title} 카드 위로`} disabled={locked || index === 0} onClick={() => onChange(moveCard(value, id, section.id, section.itemIds[index - 1]))}><ArrowUp size={14} /></button>
              <button aria-label={`${item.title} 카드 아래로`} disabled={locked || index === section.itemIds.length - 1} onClick={() => onChange(moveCard(value, id, section.id, section.itemIds[index + 2]))}><ArrowDown size={14} /></button>
              <button aria-label="카드 이동 메뉴 닫기" onClick={() => setMenu(null)}><X size={14} /></button>
            </div></div>}
          </div>;
        })}</div>
        {canEdit && <div className={`section-drop-end ${section.itemIds.length ? '' : 'empty'}`}>{!section.itemIds.length && '예배 순서 카드를 여기로 끌어오세요'}</div>}
      </section>)}
    </nav>
    {canEdit && <button className="add-ppt-section" disabled={disabled || value.sections.length >= 100} onClick={() => { if (locked || value.sections.length >= 100) return; onChange({ ...value, sections: [...value.sections, { id: crypto.randomUUID(), itemIds: [] }] }); setAnnouncement('자료 미지정 PPT 섹션을 추가했습니다.'); }}><Plus size={14} />PPT 섹션 추가</button>}
    <span className="sr-only" aria-live="polite">{announcement}</span>
  </>;
}
