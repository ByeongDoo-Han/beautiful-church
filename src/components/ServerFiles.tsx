'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Cloud, File, Music2, Presentation, RefreshCw, X } from 'lucide-react';
import { jsonRequest } from '@/lib/client-storage';
import { errorText } from '@/lib/model';
import { formatFileSize, type ServerFile, type ServerFilePage } from '@/lib/server-files';

export function ServerFiles({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [files, setFiles] = useState<ServerFile[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const load = useCallback(async (cursor?: string) => {
    const id = ++requestId.current;
    setBusy(true); setError('');
    try {
      const result = await jsonRequest<ServerFilePage>(`/api/files${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (id !== requestId.current) return;
      setFiles(previous => cursor ? [...new Map([...previous, ...result.files].map(file => [file.pathname, file])).values()] : result.files);
      setNextCursor(result.nextCursor); setLoaded(true);
    } catch (err) { if (id === requestId.current) setError(errorText(err)); }
    finally { if (id === requestId.current) setBusy(false); }
  }, []);
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    element.showModal(); void load();
    return () => { requestId.current++; element.close(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, [load]);
  return <dialog ref={dialog} className="library-dialog server-files-dialog" aria-labelledby="server-files-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><span className="eyebrow">CLOUD LIBRARY</span><h2 id="server-files-title">서버 파일 목록</h2></div><button aria-label="서버 파일 목록 닫기" onClick={onClose}><X size={20} /></button></header>
    <p className="muted server-files-description">서버에 업로드된 예배 자료입니다. 이 PC에 저장된 자료와 별도로 보관됩니다.</p>
    <div className="server-files-toolbar"><span>{loaded ? `${files.length}개${nextCursor ? ' 불러옴' : ' 파일'} · ${formatFileSize(files.reduce((sum, file) => sum + file.size, 0))}` : '파일 목록 확인'}</span><button disabled={busy} onClick={() => void load()}><RefreshCw size={15} />새로고침</button></div>
    {error && <p className="notice warning" role="alert">{error} 다시 연결한 후 새로고침해 주세요.</p>}
    {busy && <p className="muted" role="status">서버 파일을 불러오고 있습니다…</p>}
    {loaded && !busy && !error && files.length === 0 && <div className="server-files-empty"><Cloud size={30} /><strong>서버에 저장된 파일이 없습니다.</strong><p>‘예배 순서 · 자료 편집’에서 파일을 불러온 뒤 ‘서버 저장’을 눌러 주세요.</p></div>}
    {files.length > 0 && <div className="server-files-table-wrap"><table className="server-files-table"><caption className="sr-only">서버에 저장된 예배 파일</caption><thead><tr><th scope="col">파일명</th><th scope="col">용량</th><th scope="col">업로드 일시</th></tr></thead><tbody>{files.map(file => <tr key={file.pathname}>
      <th scope="row"><div className="server-file-name">{file.kind === 'mp3' ? <Music2 size={18} /> : ['pptx', 'pdf'].includes(file.kind) ? <Presentation size={18} /> : <File size={18} />}<div><span>{file.name}</span><small>{file.kind.toUpperCase()} · {file.registered ? '예배 목록에 등록' : '파일만 저장됨'}</small></div></div></th>
      <td>{formatFileSize(file.size)}</td><td><time dateTime={file.uploadedAt}>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(file.uploadedAt))}</time></td>
    </tr>)}</tbody></table></div>}
    {nextCursor && <button className="server-files-more" disabled={busy} onClick={() => void load(nextCursor)}>파일 더 불러오기</button>}
    {files.some(file => !file.registered) && <p className="muted">‘파일만 저장됨’은 서버에는 있지만 예배 목록에 등록되지 않은 자료입니다. 원래 파일명을 확인할 수 없으면 저장된 이름을 표시합니다.</p>}
    <footer><span>목록은 온라인에서 관리자 로그인 후 확인할 수 있습니다.</span><button onClick={onClose}>닫기</button></footer>
  </dialog>;
}
