'use client';
import { useState } from 'react';
import { Church, ArrowRight } from 'lucide-react';
import { jsonRequest } from '@/lib/client-storage';
import { errorText } from '@/lib/model';
export default function LoginPage() {
  const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <main className="login-page"><form className="login-card" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await jsonRequest('/api/login', { method: 'POST', body: JSON.stringify({ password }) }); location.assign('/admin'); } catch (err) { setError(errorText(err)); setBusy(false); } }}><div className="brand-mark"><Church /></div><span className="eyebrow">BEAUTIFUL CHURCH</span><h1>예배를 준비하는 자리</h1><p>관리자 계정으로 교회의 예배 자료를 불러오세요.</p><label>관리자 비밀번호<input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? '확인 중…' : '로그인'}<ArrowRight size={17} /></button><a href="/admin">로컬 자료로 콘솔 열기</a></form></main>;
}
