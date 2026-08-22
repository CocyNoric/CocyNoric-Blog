import type { UploadProgress as UploadProgressValue } from '../../shared/types.js';

export function UploadProgress({ progress, label = '上传进度' }: { progress: UploadProgressValue | null; label?: string }) {
  if (!progress) return null;
  return <div className="upload-progress" role="status" aria-live="polite">
    <div className="upload-progress-heading"><span>{label}</span><strong>{progress.percent}%</strong></div>
    <div className="upload-progress-track"><span style={{ width: `${progress.percent}%` }} /></div>
    <small>{formatBytes(progress.loaded)} / {formatBytes(progress.total)}</small>
  </div>;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 1024) return `${Math.max(0, Math.round(value))} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}
