export interface DetailedScreen extends Screen { availLeft: number; availTop: number; left: number; top: number; isPrimary: boolean; isInternal: boolean; label: string }
export interface ScreenDetails extends EventTarget { screens: DetailedScreen[]; currentScreen: DetailedScreen }
export type ManagedWindow = Window & { getScreenDetails?: () => Promise<ScreenDetails> };
export function chooseOutputScreen(details: ScreenDetails) {
  const other = details.screens.filter(s => s !== details.currentScreen && (s.left !== details.currentScreen.left || s.top !== details.currentScreen.top));
  return other.find(s => !s.isInternal) ?? other[0] ?? null;
}
export function openOutput(session: string, screen: DetailedScreen | null): Window | null {
  const position = screen ? `,left=${screen.availLeft},top=${screen.availTop},width=${screen.availWidth},height=${screen.availHeight}` : ',width=1280,height=720';
  // Called synchronously in a click handler. Do not await permission before window.open.
  return window.open(`/output#${session}`, `worship-output-${session}`, `popup=yes${position}`);
}
export function requestOutputFullscreen(target: Window, screen?: DetailedScreen | null) {
  // Call directly from the operator's click when possible. A message cannot manufacture activation.
  const options: FullscreenOptions & { screen?: DetailedScreen } = { navigationUI: 'hide', ...(screen ? { screen } : {}) };
  return target.document.documentElement.requestFullscreen(options);
}
