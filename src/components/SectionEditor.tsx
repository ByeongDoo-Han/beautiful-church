'use client';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { ChoiceButtons } from './ChoiceButtons';
import { MaterialImport } from './MaterialImport';
import type { Manifest, PresentationSection } from '@/lib/model';
import { moveSection, patchSection, sectionName, withSections } from '@/lib/sections';

export function SectionEditor({ manifest, section, index, disabled, onChange, onImport }: {
  manifest: Manifest; section: PresentationSection; index: number; disabled: boolean;
  onChange: (value: Manifest) => void; onImport: (files: File[], sectionId?: string) => Promise<void>;
}) {
  const value = withSections(manifest);
  return <div className="queue-section-editor" role="region" aria-label={`PPT 섹션 ${index + 1} 편집`}>
    <label className="field-label">섹션 이름<input aria-label={`PPT 섹션 ${index + 1} 이름`} value={section.title ?? ''} placeholder={sectionName(value, section)} maxLength={100} disabled={disabled} onChange={e => onChange(patchSection(value, section.id, { title: e.target.value || undefined }))} /></label>
    <ChoiceButtons label="지정 자료" ariaLabel={`PPT 섹션 ${index + 1} 파일`} value={section.presentationId ?? ''} disabled={disabled} onChange={id => onChange(patchSection(value, section.id, { presentationId: id || undefined }))} options={[{ value: '', label: '자료 미지정' }, ...value.assets.filter(a => a.kind !== 'mp3').map(a => ({ value: a.id, label: a.name }))]} />
    <MaterialImport label={`PPT 섹션 ${index + 1} 자료 불러오기`} disabled={disabled} presentationOnly onImport={files => onImport(files, section.id)} />
    <ChoiceButtons label="대체 PDF" ariaLabel={`PPT 섹션 ${index + 1} 대체 PDF`} value={section.fallbackPdfId ?? ''} disabled={disabled} onChange={id => onChange(patchSection(value, section.id, { fallbackPdfId: id || undefined }))} options={[{ value: '', label: '연결하지 않음' }, ...value.assets.filter(a => a.kind === 'pdf').map(a => ({ value: a.id, label: a.name }))]} />
    {section.presentationEdit && <p className="queue-edit-help">지정 자료를 바꾸면 이 섹션의 슬라이드 문구 편집이 초기화됩니다.</p>}
    <div className="queue-section-order"><button aria-label={`PPT 섹션 ${index + 1} 위로`} disabled={disabled || index === 0} onClick={() => onChange(moveSection(value, section.id, -1))}><ArrowUp size={14} />위로</button><button aria-label={`PPT 섹션 ${index + 1} 아래로`} disabled={disabled || index === value.sections.length - 1} onClick={() => onChange(moveSection(value, section.id, 1))}><ArrowDown size={14} />아래로</button></div>
  </div>;
}
