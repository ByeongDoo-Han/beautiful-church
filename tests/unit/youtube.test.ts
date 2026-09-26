import { expect, it } from 'vitest';
import { parseYouTubeLink } from '../../src/lib/youtube';
import { demoManifest, itemSchema, manifestSchema, snapshotSchema, initialSnapshot } from '../../src/lib/model';

it.each([
  ['https://www.youtube.com/watch?v=M7lc1UVf-VE', 0],
  ['https://youtu.be/M7lc1UVf-VE?t=90', 90],
  ['https://m.youtube.com/watch?v=M7lc1UVf-VE&t=1m30s', 90],
  ['https://www.youtube.com/shorts/M7lc1UVf-VE', 0],
  ['https://www.youtube.com/live/M7lc1UVf-VE?start=12', 12],
])('normalizes video links: %s', (url, startSeconds) => {
  expect(parseYouTubeLink(url)).toEqual({ videoId: 'M7lc1UVf-VE', startSeconds });
});
it.each(['javascript:alert(1)', 'https://youtube.com.evil.example/watch?v=M7lc1UVf-VE', 'https://evil.example/watch?v=M7lc1UVf-VE', 'https://youtube.com@evil.example/watch?v=M7lc1UVf-VE', 'https://youtube.com/playlist?list=abc', 'https://youtu.be/invalid', 'https://youtu.be/M7lc1UVf-VE?t=-5', 'https://youtu.be/M7lc1UVf-VE?t=999999999'])('rejects unsafe or unsupported links: %s', url => {
  expect(parseYouTubeLink(url)).toBeNull();
});
it('persists YouTube settings alongside slides without adding playback information to output snapshots', () => {
  const youtube = { videoId: 'M7lc1UVf-VE', startSeconds: 12 };
  const item = { ...demoManifest.items[1], audioSource: 'youtube', youtube };
  expect(manifestSchema.parse({ ...demoManifest, items: [item] }).items[0]).toMatchObject({ audioSource: 'youtube', youtube, presentationId: 'demo-pptx', audioId: 'demo-mp3' });
  expect(snapshotSchema.parse({ ...initialSnapshot, youtube, audioSource: 'youtube' })).not.toHaveProperty('youtube');
  expect(itemSchema.safeParse({ ...item, youtube: { videoId: 'bad', startSeconds: 0 } }).success).toBe(false);
  expect(manifestSchema.safeParse(demoManifest).success).toBe(true);
});
