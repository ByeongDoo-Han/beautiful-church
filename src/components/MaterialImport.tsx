'use client';
import { Upload } from 'lucide-react';

export function MaterialImport({ label, disabled, presentationOnly = false, onImport }: {
  label: string; disabled: boolean; presentationOnly?: boolean; onImport: (files: File[]) => Promise<void>;
}) {
  return <label className={`queue-file-import ${disabled ? 'disabled' : ''}`}><Upload size={14} /><span>{presentationOnly ? 'PPT · PDF 불러오기' : 'PPT · PDF · MP3 불러오기'}</span>
    <input aria-label={label} type="file" accept={presentationOnly ? '.pptx,.pdf' : '.pptx,.pdf,.mp3'} multiple={!presentationOnly} disabled={disabled} onChange={async e => {
      const input = e.currentTarget; const files = [...(input.files ?? [])];
      if (files.length) await onImport(files);
      input.value = '';
    }} />
  </label>;
}
