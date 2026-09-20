import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '아름다운 교회 | 예배 운영', description: '찬양과 프레젠테이션을 함께 운영하는 예배 콘솔', manifest: '/manifest.webmanifest' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html>; }
