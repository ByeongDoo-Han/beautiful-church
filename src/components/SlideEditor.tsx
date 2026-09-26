'use client';
import { ChoiceButtons } from './ChoiceButtons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Trash2, X } from 'lucide-react';
import { acquireDeck, type Deck } from '@/lib/decks';
import { createPresentationEdit, textFields } from '@/lib/slide-edit';
import { errorText, slideIndex, type Asset, type PresentationEdit } from '@/lib/model';
import { SlideView } from './SlideView';

export function SlideEditor({ asset, initialEdit, initialIndex, scopeLabel, onApply, onClose }: {
  asset: Asset; initialEdit?: PresentationEdit; initialIndex: number;
  scopeLabel?: string;
  onApply: (edit: PresentationEdit, index: number) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [deck, setDeck] = useState<Extract<Deck, { kind: 'pptx' }> | null>(null);
  const [draft, setDraft] = useState<PresentationEdit | null>(null);
  const [preview, setPreview] = useState<PresentationEdit>();
  const [index, setIndex] = useState(initialIndex);
  const [error, setError] = useState('');
  const dirty = useRef(false);
  const cancel = () => { if (!dirty.current || confirm('아직 적용하지 않은 슬라이드 편집을 취소할까요?')) onClose(); };
  useEffect(() => {
    const element = dialog.current!; const focus = document.activeElement;
    element.showModal();
    const resource = acquireDeck(asset); let cancelled = false;
    void resource.promise.then(value => {
      if (cancelled) return;
      if (value.kind !== 'pptx') throw new Error('PPTX 파일에서 슬라이드를 편집할 수 있습니다.');
      if (value.slideXml.some(xml => !xml)) throw new Error('이 PPTX의 편집용 문구를 읽지 못했습니다.');
      const edit = initialEdit?.assetId === asset.id ? structuredClone(initialEdit) : createPresentationEdit(asset.id, value.count);
      if (edit.slides.some(s => s.source >= value.count)) throw new Error('편집한 슬라이드의 원본을 찾을 수 없습니다.');
      setDeck(value); setDraft(edit); setPreview(edit); setIndex(slideIndex(initialIndex, edit.slides.length));
    }).catch(e => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; resource.release(); element.close(); if (focus instanceof HTMLElement && focus.isConnected) focus.focus(); };
  }, [asset.id]);
  useEffect(() => { const timer = setTimeout(() => setPreview(draft ?? undefined), 200); return () => clearTimeout(timer); }, [draft]);
  const entry = draft?.slides[index];
  const fields = useMemo(() => deck && entry ? textFields(deck.slideXml[entry.source]) : [], [deck, entry?.source]);
  const update = (slides: PresentationEdit['slides']) => {
    if (!draft) return;
    dirty.current = true; setError(''); setDraft({ ...draft, version: crypto.randomUUID(), slides });
  };
  return <dialog ref={dialog} className="library-dialog slide-editor-dialog" aria-labelledby="slide-editor-title" onCancel={e => { e.preventDefault(); cancel(); }}>
    <header><div><span className="eyebrow">SLIDE EDITOR</span><h2 id="slide-editor-title">슬라이드 편집</h2></div><button aria-label="슬라이드 편집 닫기" onClick={cancel}><X size={20} /></button></header>
    <p className="muted">문구를 바꾸거나 현재 장을 복사해 새 슬라이드를 추가하세요. ‘화면에 적용’을 누르기 전까지 화면 2는 유지됩니다.</p>
    {error && <p className="notice warning" role="alert">{error}</p>}
    {!draft && !error && <p role="status">슬라이드를 불러오고 있습니다…</p>}
    {draft && entry && <>
      <div className="slide-editor-toolbar"><ChoiceButtons label="편집할 슬라이드" value={String(index)} onChange={value => setIndex(Number(value))} options={draft.slides.map((s, i) => ({ value: String(i), label: `${i + 1} / ${draft.slides.length} · 원본 ${s.source + 1}장` }))} />
        <button disabled={draft.slides.length >= 1000} onClick={() => { const slides = [...draft.slides]; slides.splice(index + 1, 0, { ...entry, id: crypto.randomUUID(), texts: { ...entry.texts } }); update(slides); setIndex(index + 1); }}><Copy size={16} />슬라이드 복사·추가</button>
        <button disabled={draft.slides.length <= 1} title="최소 한 장은 유지합니다" onClick={() => { update(draft.slides.filter((_, i) => i !== index)); setIndex(slideIndex(index, draft.slides.length - 1)); }}><Trash2 size={16} />슬라이드 삭제</button>
      </div>
      <div className="slide-editor-grid"><div className="slide-text-fields">
        {fields.map((field, i) => <label className="field-label" key={`${entry.id}:${field.key}`}>문구 {i + 1}<textarea aria-label={`문구 ${i + 1}`} rows={3} maxLength={10000} value={entry.texts[field.key] ?? field.text} onChange={event => {
          const texts = { ...entry.texts }; const value = event.target.value;
          if (value === field.text) delete texts[field.key]; else texts[field.key] = value;
          update(draft.slides.map((s, j) => j === index ? { ...s, texts } : s));
        }} /></label>)}
        {!fields.length && <p className="muted">이 장에는 수정 가능한 문구가 없습니다. 이미지 속 글자나 마스터·차트의 글자는 원본 PPT에서 수정해 주세요.</p>}
      </div><div><SlideView asset={asset} index={index} edit={preview} label="편집 슬라이드 미리보기" onError={setError} /><p className="muted">문구가 영역을 벗어나지 않는지 확인해 주세요. 수정한 문단은 첫 글자의 서식을 사용합니다. 원본 PPTX와 대체 PDF는 그대로 유지됩니다.</p></div></div>
    </>}
    <footer><span>{scopeLabel ?? '이 카드에만 적용'} · 이 PC에 자동 저장<br />다른 PC에서도 쓰려면 관리자 로그인 후 ‘서버 저장’</span><div className="slide-editor-actions"><button onClick={cancel}>취소</button><button className="primary" disabled={!draft} onClick={() => { if (!draft) return; try { onApply({ ...draft, version: crypto.randomUUID() }, index); onClose(); } catch (e) { setError(errorText(e)); } }}>화면에 적용</button></div></footer>
  </dialog>;
}
