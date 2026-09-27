import { z } from 'zod';

export const LIMITS = { mp3: 15 * 1024 ** 2, pptx: 20 * 1024 ** 2, pdf: 20 * 1024 ** 2 };
export const MIME = { mp3: 'audio/mpeg', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', pdf: 'application/pdf' };
export const kindSchema = z.enum(['mp3', 'pptx', 'pdf']);
const id = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);
export const mediaPath = z.string().regex(/^media\/[a-f0-9]{64}\.(mp3|pptx|pdf)$/);
export const assetSchema = z.object({
  id, name: z.string().min(1).max(160), kind: kindSchema,
  size: z.number().int().positive().max(LIMITS.pptx),
  pathname: mediaPath.optional(),
  demoPath: z.enum(['/demo/welcome.pptx', '/demo/welcome.pdf', '/demo/tone.mp3']).optional(),
}).superRefine((a, ctx) => {
  if (a.size > LIMITS[a.kind]) ctx.addIssue({ code: 'custom', message: '파일 크기 제한 초과' });
  if (a.pathname && a.pathname !== `media/${a.id}.${a.kind}`) ctx.addIssue({ code: 'custom', message: '파일 경로 불일치' });
});
export const editedSlideSchema = z.object({
  id, source: z.number().int().min(0).max(999),
  texts: z.record(z.string().regex(/^text-\d{1,5}$/), z.string().max(10000)).refine(v => Object.keys(v).length <= 500),
});
export const presentationEditSchema = z.object({
  assetId: id, version: z.string().uuid(), slides: z.array(editedSlideSchema).min(1).max(1000),
}).refine(v => new Set(v.slides.map(s => s.id)).size === v.slides.length, '슬라이드 ID 중복');
export type EditedSlide = z.infer<typeof editedSlideSchema>;
export type PresentationEdit = z.infer<typeof presentationEditSchema>;
export const itemSchema = z.object({
  id, title: z.string().min(1).max(100), audioId: id.optional(), presentationId: id.optional(), fallbackPdfId: id.optional(),
  audioSource: z.enum(['mp3', 'youtube']).optional(),
  youtube: z.object({ videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/), startSeconds: z.number().int().min(0).max(86400) }).optional(),
  presentationEdit: presentationEditSchema.optional(),
  slidePositions: z.record(id, z.number().int().min(0).max(999)).refine(v => Object.keys(v).length <= 200).optional(),
  slideHoldCount: z.number().int().min(1).max(100).optional(),
});
export const sectionSchema = z.object({
  id, title: z.string().min(1).max(100).optional(), presentationId: id.optional(), fallbackPdfId: id.optional(),
  presentationEdit: presentationEditSchema.optional(), itemIds: z.array(id).max(100),
});
export type PresentationSection = z.infer<typeof sectionSchema>;
export const manifestSchema = z.object({
  version: z.literal(1), title: z.string().min(1).max(100),
  assets: z.array(assetSchema).max(200), items: z.array(itemSchema).max(100),
  sections: z.array(sectionSchema).max(100).optional(),
}).superRefine((m, ctx) => {
  const assets = new Map(m.assets.map(a => [a.id, a]));
  if (assets.size !== m.assets.length || new Set(m.items.map(i => i.id)).size !== m.items.length) ctx.addIssue({ code: 'custom', message: '중복 ID' });
  for (const item of m.items) {
    for (const assetId of Object.keys(item.slidePositions ?? {})) {
      if (!['pptx', 'pdf'].includes(assets.get(assetId)?.kind ?? '')) ctx.addIssue({ code: 'custom', message: '슬라이드 위치 자료 참조 오류' });
    }
    if (item.presentationEdit && (item.presentationEdit.assetId !== item.presentationId || assets.get(item.presentationId!)?.kind !== 'pptx')) ctx.addIssue({ code: 'custom', message: '편집한 PPTX 참조 오류' });
    for (const [key, kinds] of [['audioId', ['mp3']], ['presentationId', ['pptx', 'pdf']], ['fallbackPdfId', ['pdf']]] as const) {
      const ref = item[key];
      if (ref && !(kinds as readonly string[]).includes(assets.get(ref)?.kind ?? '')) ctx.addIssue({ code: 'custom', message: '자료 참조 오류' });
    }
  }
  if (m.sections) {
    const ordered = m.sections.flatMap(s => s.itemIds);
    if (new Set(m.sections.map(s => s.id)).size !== m.sections.length || ordered.length !== m.items.length || ordered.some((id, i) => id !== m.items[i]?.id)) ctx.addIssue({ code: 'custom', message: 'PPT 섹션의 순서 또는 카드 배치 오류' });
    for (const section of m.sections) {
      if (section.presentationId && !['pptx', 'pdf'].includes(assets.get(section.presentationId)?.kind ?? '')) ctx.addIssue({ code: 'custom', message: '섹션 자료 참조 오류' });
      if (section.fallbackPdfId && assets.get(section.fallbackPdfId)?.kind !== 'pdf') ctx.addIssue({ code: 'custom', message: '섹션 PDF 참조 오류' });
      if (section.presentationEdit && (section.presentationEdit.assetId !== section.presentationId || assets.get(section.presentationId!)?.kind !== 'pptx')) ctx.addIssue({ code: 'custom', message: '섹션 편집 참조 오류' });
    }
  }
  if (new TextEncoder().encode(JSON.stringify(m)).length > 1500 * 1024) ctx.addIssue({ code: 'custom', message: '편집 내용이 너무 큽니다. 예배 자료를 나누어 주세요.' });
});
export type Asset = z.infer<typeof assetSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestEnvelope = { manifest: Manifest; etag: string | null };
export const emptyManifest: Manifest = { version: 1, title: '주일예배', assets: [], items: [] };
export const demoManifest: Manifest = {
  version: 1, title: '주일예배 · 리허설',
  assets: [
    { id: 'demo-pptx', name: '예배 안내.pptx', kind: 'pptx', size: 1, demoPath: '/demo/welcome.pptx' },
    { id: 'demo-pdf', name: '예배 안내.pdf', kind: 'pdf', size: 1, demoPath: '/demo/welcome.pdf' },
    { id: 'demo-mp3', name: '재생 테스트 음원.mp3', kind: 'mp3', size: 1, demoPath: '/demo/tone.mp3' },
  ],
  items: [
    { id: 'welcome', title: '예배로의 초대', presentationId: 'demo-pptx', fallbackPdfId: 'demo-pdf' },
    { id: 'praise', title: '찬양 · 음향 리허설', audioId: 'demo-mp3', presentationId: 'demo-pptx', fallbackPdfId: 'demo-pdf' },
    { id: 'prayer', title: '함께 드리는 기도', presentationId: 'demo-pdf' },
  ],
};
export const snapshotSchema = z.object({
  revision: z.number().int().nonnegative(), asset: assetSchema.nullable(),
  slide: z.number().int().min(0).max(999), count: z.number().int().min(0).max(1000),
  blackout: z.boolean(), title: z.string().max(100),
  presentationOwnerId: id.optional(), itemId: id.optional(),
  presentationEdit: presentationEditSchema.optional(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const initialSnapshot: Snapshot = { revision: 0, asset: null, slide: 0, count: 0, blackout: false, title: '' };
export function slideIndex(index: number, count: number) { return Math.max(0, Math.min(Math.floor(index), Math.max(0, count - 1))); }
export function slideKey(s: Snapshot) { return `${s.asset?.id ?? 'empty'}:${s.slide}${s.presentationEdit ? `:${s.presentationEdit.version}` : ''}`; }
export function errorText(e: unknown) { return e instanceof Error ? e.message : '처리 중 문제가 발생했습니다.'; }
