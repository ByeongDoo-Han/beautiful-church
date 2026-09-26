export type ServerFile = {
  pathname: string;
  name: string;
  kind: string;
  size: number;
  uploadedAt: string;
  registered: boolean;
};
export type ServerFilePage = { files: ServerFile[]; nextCursor: string | null };

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
