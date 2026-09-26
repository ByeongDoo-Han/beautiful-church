'use client';
import { useEffect, useState } from 'react';
import { Church, ArrowRight } from 'lucide-react';
import { jsonRequest, removeLegacyPageCaches } from '@/lib/client-storage';
import { errorText } from '@/lib/model';
export default function LoginPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); void removeLegacyPageCaches().catch(() => { /* Cache cleanup must not prevent login. */ }); }, []);
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <main className="login-page"><form className="login-card" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await jsonRequest('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }); location.assign('/admin'); } catch (err) { setError(errorText(err)); setBusy(false); } }}><div className="brand-mark"><Church /></div><span className="eyebrow">BEAUTIFUL CHURCH · INFANT MINISTRY</span><h1>아름다운교회 영아부</h1><p>로그인하고 영아부 예배를 준비해 주세요.</p><label>관리자 아이디<input disabled={!ready || busy} name="username" autoComplete="username" required maxLength={64} value={username} onChange={e => setUsername(e.target.value)} /></label><label>관리자 비밀번호<input disabled={!ready || busy} name="password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={!ready || busy}>{busy ? '확인 중…' : '로그인'}<ArrowRight size={17} /></button></form></main>;
}
