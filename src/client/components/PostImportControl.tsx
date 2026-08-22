import { useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { UploadIcon } from './Icons.js';
import { useAuth } from '../hooks/useAuth.js';
import type { UploadProgress } from '../../shared/types.js';
import { UploadProgress as UploadProgressView } from './UploadProgress.js';

const acceptedImports = new Set(['.md', '.markdown', '.zip']);
const importLimit = 128 * 1024 * 1024;

type PostImportControlProps = {
  className?: string;
  label?: string;
  onError: (message: string) => void;
};

export function PostImportControl({ className = '', label = '导入文章', onError }: PostImportControlProps) {
  const navigate = useNavigate();
  const { csrfToken } = useAuth();
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const dragDepth = useRef(0);

  const importFile = async (file?: File) => {
    if (!file) return;
    const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!acceptedImports.has(extension)) { onError('仅支持 .md、.markdown 或 .zip 文件'); return; }
    const limit = extension === '.zip' ? importLimit : 1024 * 1024;
    if (file.size > limit) { onError(extension === '.zip' ? 'ZIP 文件不能超过 128 MB' : 'Markdown 文件不能超过 1 MB'); return; }
    setImporting(true);
    setProgress({ loaded: 0, total: file.size, percent: 0 });
    onError('');
    try {
      const post = await api.importPost(file, csrfToken, setProgress);
      navigate(`/admin/posts/${post.id}`);
    } catch (cause) {
      onError((cause as Error).message);
      setProgress(null);
    } finally {
      setImporting(false);
    }
  };

  const dragEnter = (event: DragEvent) => {
    event.preventDefault();
    if (!event.dataTransfer.types.includes('Files')) return;
    dragDepth.current += 1;
    setDragging(true);
  };

  return <span className="upload-control-with-progress"><label
    className={`button secondary-button import-control${dragging ? ' drag-active' : ''}${className ? ` ${className}` : ''}`}
    onDragEnter={dragEnter}
    onDragOver={(event) => event.preventDefault()}
    onDragLeave={(event) => {
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    }}
    onDrop={(event) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (event.dataTransfer.files.length !== 1) onError('每次只能导入一个文章文件');
      else void importFile(event.dataTransfer.files[0]);
    }}
  >
    <UploadIcon />{importing ? '正在导入…' : label}
    <input type="file" accept=".md,.markdown,.zip" disabled={importing} onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} />
  </label><UploadProgressView progress={progress} label="文章导入进度" /></span>;
}
