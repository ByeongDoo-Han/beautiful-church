import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '아름다운교회 영아부 | 예배 운영', description: '아름다운교회 영아부 예배 운영 콘솔', manifest: '/manifest.webmanifest', icons: { icon: [{ url: '/icons/favicon-32-1928cf3c2d.png', sizes: '32x32', type: 'image/png' }, { url: '/icons/favicon-64-1928cf3c2d.png', sizes: '64x64', type: 'image/png' }], shortcut: '/icons/favicon-32-1928cf3c2d.png', apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }] } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html>; }
