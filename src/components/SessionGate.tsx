'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { jsonRequest, removeLegacyPageCaches } from '@/lib/client-storage';

export function SessionGate({ children }: { children: ReactNode }) {
  const [verified, setVerified] = useState(false);
  const verifiedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void removeLegacyPageCaches().catch(() => { /* Server session checks still apply when cache storage is unavailable. */ });
    const leave = () => { if (!cancelled) { setVerified(false); location.replace('/login'); } };
    const check = async () => {
      try {
        const config = await jsonRequest<{ authenticated: boolean }>('/api/config');
        if (cancelled) return;
        if (!config.authenticated) { leave(); return; }
        verifiedRef.current = true; setVerified(true);
      } catch {
        // An already authenticated, open presentation can continue offline.
        // A new document must verify its session before reading local materials.
        if (!verifiedRef.current) leave();
      }
    };
    const storage = (event: StorageEvent) => { if (event.key === 'worship-logout') leave(); };
    void check();
    const timer = setInterval(check, 60000);
    window.addEventListener('focus', check); window.addEventListener('online', check); window.addEventListener('storage', storage);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', check); window.removeEventListener('online', check); window.removeEventListener('storage', storage); };
  }, []);
  return verified ? children : <main className="login-page"><p role="status">로그인 확인 중…</p></main>;
}
