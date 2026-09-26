import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createMaterialArchive } from '../../src/lib/download';
import { emptyManifest, type Manifest } from '../../src/lib/model';

describe('download archive', () => {
  it('preserves separate files with duplicate and unsafe names, plus YouTube links', async () => {
    const assets = ['one', 'two'].map(id => ({ id, name: '../같은:이름.mp3', kind: 'mp3' as const, size: 3 }));
    const manifest: Manifest = { ...emptyManifest, assets, items: [{ id: 'song', title: '찬양', audioSource: 'youtube', youtube: { videoId: 'abcdefghijk', startSeconds: 12 } }] };
    const archive = await createMaterialArchive(manifest, assets, async asset => new Blob([asset.id]), () => {});
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    const { files } = JSON.parse(await zip.file('예배정보.json')!.async('string'));
    expect(files).toHaveLength(2);
    expect(files[0].path).not.toEqual(files[1].path);
    for (const [index, file] of files.entries()) {
      expect(file.path).not.toMatch(/\.\.|:/);
      expect(await zip.file(file.path)!.async('string')).toBe(assets[index].id);
    }
    expect(await zip.file('안내.txt')!.async('string')).toContain('https://www.youtube.com/watch?v=abcdefghijk&t=12s');
  });
});
