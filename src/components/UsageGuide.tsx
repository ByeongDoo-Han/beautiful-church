'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, CircleHelp, X } from 'lucide-react';

const seenKey = 'worship-usage-guide-v1';
const steps = [
  { target: '[data-guide="edit"]', title: '먼저 예배 자료를 준비하세요', text: '편집 모드에서 PPT·PDF·MP3를 불러올 수 있어요. 섹션 옆 연필 버튼으로 섹션 이름과 사용할 자료를 바꿔 주세요.', tip: '같은 PPT를 쓰는 예배 순서는 한 섹션에 모아 두세요.' },
  { target: '.queue-library-tools .queue-file-import', title: '이 PC의 자료를 불러오세요', text: '이 버튼에서 PPT·PDF·MP3 파일을 선택하세요. PPT와 PDF는 새 섹션으로, MP3는 음원 카드로 추가됩니다.', tip: '섹션 안의 자료 불러오기는 그 섹션의 파일을 교체해요.' },
  { target: '[data-guide="add-order"]', title: '필요한 예배 순서를 추가하세요', text: '이 + 버튼은 마지막 섹션에 새 예배 순서를 추가해요. 특정 섹션에 넣으려면 그 섹션 제목 옆 + 버튼을 사용하세요.', tip: '편집 모드에서 카드의 연필 버튼으로 순서 이름을 바꿀 수 있어요.' },
  { target: '[data-guide="order"]', title: '진행할 예배 순서를 선택하세요', text: '카드를 누르면 해당 순서의 자료와 저장한 슬라이드 번호가 표시됩니다. 카드를 다른 위치로 끌어 순서를 바꿀 수도 있어요.', tip: '카드를 클릭한 뒤 ↓ 다음 순서 · ↑ 이전 순서' },
  { target: '[data-guide="slides"]', title: '순서마다 보여 줄 장을 정하세요', text: '이전·다음 버튼으로 슬라이드를 넘겨 보세요. 다른 예배 순서로 이동했다 돌아와도 각 순서에서 지정한 번호를 기억합니다.', tip: '← 이전 장 · → 또는 Space 다음 장' },
  { target: '[data-guide="slide-edit"]', title: 'PPT 문구를 바로 수정하세요', text: '슬라이드 편집에서 문구를 수정하거나 장을 복사·삭제할 수 있어요. 화면에 적용을 누르면 운영 화면과 출력창에 반영됩니다.', tip: '문구·복사·삭제는 같은 PPT 섹션에 함께 적용돼요.' },
  { target: '.audio-source-field .choice-buttons-options', title: '찬양 재생 방식을 선택하세요', text: 'MP3 음원 파일 또는 유튜브 링크를 선택한 뒤 아래 플레이어에서 재생하세요. 유튜브 링크는 인터넷 연결이 필요합니다.', tip: '음원과 유튜브는 이 운영 화면에서만 재생돼요.' },
  { target: '[data-guide="save"]', title: '준비가 끝나면 서버에 저장하세요', text: '변경한 내용이 있으면 서버 저장 버튼이 활성화됩니다. 저장완료 표시를 확인하면 다른 PC에서도 같은 자료와 순서별 슬라이드 번호를 사용할 수 있어요.', tip: '다시 수정하면 서버 저장 버튼이 활성화돼요.' },
  { target: '[data-guide="download"]', title: '예배 자료를 파일로 보관하세요', text: '원본 자료와 예배 설정을 ZIP 파일로 내려받습니다. 지원 브라우저에서는 저장 위치와 파일 이름을 선택할 수 있어요.', tip: '다운로드와 서버 저장은 각각 따로 눌러 주세요.' },
  { target: '[data-guide="output"]', title: '예배 화면을 띄우면 준비 완료!', text: '출력창 열기를 누른 뒤 새 창을 두 번째 모니터로 옮기고 전체화면 시작을 누르세요. 카드와 슬라이드를 바꾸면 출력창도 함께 바뀝니다.', tip: '상단 사용 안내에서 언제든 다시 볼 수 있어요.' },
];
type Step = typeof steps[number];

function GuideTour({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [available] = useState(() => steps.filter(step => document.querySelector<HTMLElement>(step.target)?.getClientRects().length));
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState<{ spotlight: CSSProperties; panel: CSSProperties; scrollable: boolean }>();
  const step: Step | undefined = available[index];
  useLayoutEffect(() => {
    const element = dialog.current!;
    const focus = document.activeElement;
    const scroll = [document.scrollingElement, ...document.querySelectorAll('.service-queue')].filter((el): el is Element => !!el).map(el => ({ el, top: el.scrollTop, left: el.scrollLeft }));
    element.showModal();
    return () => {
      element.close();
      for (const { el, top, left } of scroll) el.scrollTo({ top, left, behavior: 'instant' });
      const restoreFocus = focus instanceof HTMLElement && focus !== document.body && focus.isConnected ? focus : document.querySelector<HTMLElement>('.usage-guide-trigger');
      restoreFocus?.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    if (!step) return;
    const target = document.querySelector<HTMLElement>(step.target);
    if (!target) return;
    target.setAttribute('data-guide-active', 'true');
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    panel.current!.querySelector<HTMLElement>('.guide-copy')!.scrollTop = 0;
    let frame = 0;
    const measure = () => {
      const box = target.getBoundingClientRect();
      const width = document.documentElement.clientWidth, height = window.innerHeight;
      const copy = panel.current!.querySelector<HTMLElement>('.guide-copy')!;
      const panelWidth = panel.current!.offsetWidth;
      const naturalHeight = panel.current!.offsetHeight + Math.max(0, copy.scrollHeight - copy.clientHeight);
      let maxHeight = height - 24;
      let panelHeight = Math.min(naturalHeight, maxHeight);
      const gap = 18, edge = 12;
      let left: number, top: number;
      if (box.right + gap + panelWidth <= width - edge) { left = box.right + gap; top = box.top; }
      else if (box.left - gap - panelWidth >= edge) { left = box.left - gap - panelWidth; top = box.top; }
      else {
        left = (width - panelWidth) / 2;
        const below = height - edge - box.bottom - gap, above = box.top - gap - edge;
        const useBelow = below >= panelHeight || (above < panelHeight && below >= above);
        maxHeight = Math.max(180, useBelow ? below : above);
        panelHeight = Math.min(naturalHeight, maxHeight);
        top = useBelow ? box.bottom + gap : box.top - gap - panelHeight;
      }
      setLayout({
        scrollable: naturalHeight > panelHeight + 1,
        spotlight: { left: Math.max(2, box.left - 5), top: Math.max(2, box.top - 5), width: Math.min(width - 4, box.width + 10), height: box.height + 10 },
        panel: { maxHeight, left: Math.max(edge, Math.min(left, width - panelWidth - edge)), top: Math.max(edge, Math.min(top, height - panelHeight - edge)) },
      });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    const observer = new ResizeObserver(schedule); observer.observe(target); observer.observe(panel.current!);
    window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); target.removeAttribute('data-guide-active');
      window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true);
    };
  }, [step]);
  return createPortal(<dialog ref={dialog} className="usage-guide-dialog" aria-label="버튼 사용 안내" aria-describedby="usage-guide-description" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    {layout && <div className="guide-spotlight" aria-hidden="true" style={layout.spotlight} />}
    <div ref={panel} className="guide-panel" style={layout?.panel}>
      <header><span><CircleHelp size={16} />사용 안내 · {index + 1} / {available.length || 1}</span><button aria-label="사용 안내 닫기" onClick={onClose}><X size={18} /></button></header>
      <div className="guide-progress" aria-hidden="true">{available.map((item, n) => <span key={item.target} className={n <= index ? 'done' : ''} />)}</div>
      <div className="guide-copy" role="region" aria-label="사용 설명" tabIndex={0} aria-live="polite" aria-atomic="true"><h2>{step?.title ?? '예배 운영을 시작해 보세요'}</h2><p id="usage-guide-description">{step?.text ?? '자료를 불러온 뒤 사용 안내를 다시 열어 주세요.'}</p>{step && <p className="guide-tip">{step.tip}</p>}</div>
      <p className="guide-caption">{layout?.scrollable ? '설명을 위아래로 스크롤하면 더 볼 수 있어요.' : '강조된 버튼은 안내를 닫은 뒤 사용할 수 있어요.'}</p>
      <footer><button disabled={index === 0} onClick={() => setIndex(value => value - 1)}><ArrowLeft size={15} />이전</button>{index < available.length - 1 ? <button className="primary" onClick={() => setIndex(value => value + 1)}>다음<ArrowRight size={15} /></button> : <button className="primary" onClick={onClose}><Check size={15} />안내 마치기</button>}</footer>
    </div>
  </dialog>, document.body);
}

export function UsageGuide({ ready, open, onOpen, onClose }: { ready: boolean; open: boolean; onOpen: () => void; onClose: () => void }) {
  const [showWelcome, setShowWelcome] = useState(false);
  const dismiss = () => { setShowWelcome(false); try { localStorage.setItem(seenKey, '1'); } catch { /* The guide remains usable without storage. */ } };
  useEffect(() => { if (ready) { try { setShowWelcome(localStorage.getItem(seenKey) !== '1'); } catch { setShowWelcome(true); } } }, [ready]);
  useEffect(() => { if (open) dismiss(); }, [open]);
  return <>
    {ready && showWelcome && !open && <aside className="guide-welcome" aria-label="처음 사용 안내"><CircleHelp size={24} /><div><strong>처음 사용하시나요?</strong><p>버튼을 하나씩 짚어 드릴게요. 예배 준비부터 화면 출력까지 함께 살펴보세요.</p></div><button className="primary" onClick={onOpen}>사용 안내 시작<ArrowRight size={15} /></button><button className="guide-welcome-close" aria-label="처음 사용 안내 닫기" onClick={dismiss}><X size={17} /></button></aside>}
    {open && <GuideTour onClose={onClose} />}
  </>;
}
