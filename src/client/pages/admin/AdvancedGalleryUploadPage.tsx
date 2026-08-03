import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { GalleryInput, GalleryItem, ThumbnailAspectRatio } from '../../../shared/schemas.js';
import { uncategorizedCategory } from '../../../shared/categories.js';
import { api } from '../../api.js';
import { AdminNav } from '../../components/AdminNav.js';
import { ImageIcon, UploadIcon } from '../../components/Icons.js';
import { validateImageFile } from '../../components/ImageDropField.js';
import { SortableGalleryImageQueue } from '../../components/SortableGalleryImageQueue.js';
import { ThumbnailFocalSelector } from '../../components/ThumbnailFocalSelector.js';
import { useAuth } from '../../hooks/useAuth.js';

const maximumFileCount = 30;
const maximumFileBytes = 25 * 1024 * 1024;

type UploadEntry = {
  id: string;
  file: File;
  previewUrl: string;
};

function titleFromFilename(filename: string) {
  return filename.replace(/\.[^.]+$/, '').trim() || '未命名画廊';
}

function fileIdentity(file: File) {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

export function AdvancedGalleryUploadPage() {
  const { csrfToken } = useAuth();
  const previewUrlsRef = useRef(new Set<string>());
  const idSequenceRef = useRef(0);
  const dragDepthRef = useRef(0);
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(uncategorizedCategory);
  const [cardFocus, setCardFocus] = useState({ x: 0.5, y: 0.5, size: 1 });
  const [cardAspectRatio, setCardAspectRatio] = useState<ThumbnailAspectRatio>('original');
  const [thumbnailFocus, setThumbnailFocus] = useState({ x: 0.5, y: 0.5, size: 1 });
  const [thumbnailAspectRatio, setThumbnailAspectRatio] = useState<ThumbnailAspectRatio>('1:1');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [uploadedItem, setUploadedItem] = useState<GalleryItem | null>(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current.clear();
  }, []);

  const addFiles = (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (!selected.length) return;
    setError('');
    setMessage('');
    setUploadedItem(null);

    const existing = new Set(entries.map((entry) => fileIdentity(entry.file)));
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of selected) {
      try {
        validateImageFile(file, maximumFileBytes);
        const identity = fileIdentity(file);
        if (existing.has(identity)) {
          rejected.push(`${file.name} 已在队列中`);
          continue;
        }
        existing.add(identity);
        accepted.push(file);
      } catch (cause) {
        rejected.push(`${file.name}：${(cause as Error).message}`);
      }
    }

    const capacity = Math.max(0, maximumFileCount - entries.length);
    const nextFiles = accepted.slice(0, capacity);
    if (accepted.length > capacity) rejected.push(`一个展示单位最多包含 ${maximumFileCount} 张图片`);

    const nextEntries = nextFiles.map((file): UploadEntry => {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      return { id: `gallery-upload-${++idSequenceRef.current}`, file, previewUrl };
    });
    if (nextEntries.length) {
      setEntries((current) => [...current, ...nextEntries]);
      if (!title.trim() && entries.length === 0) setTitle(titleFromFilename(nextEntries[0].file.name));
    }
    if (rejected.length) setError(rejected.slice(0, 4).join('；'));
  };

  const removeEntry = (id: string) => {
    const entry = entries.find((candidate) => candidate.id === id);
    if (entry) {
      URL.revokeObjectURL(entry.previewUrl);
      previewUrlsRef.current.delete(entry.previewUrl);
    }
    const next = entries.filter((candidate) => candidate.id !== id);
    setEntries(next);
    setMessage('');
    setUploadedItem(null);
  };

  const reorderEntries = (ids: string[]) => {
    setEntries((current) => {
      if (ids.length !== current.length) return current;
      const byId = new Map(current.map((entry) => [entry.id, entry]));
      const next = ids.flatMap((id) => {
        const entry = byId.get(id);
        return entry ? [entry] : [];
      });
      return next.length === current.length ? next : current;
    });
    setMessage('');
    setUploadedItem(null);
  };

  const clearEntries = () => {
    entries.forEach((entry) => {
      URL.revokeObjectURL(entry.previewUrl);
      previewUrlsRef.current.delete(entry.previewUrl);
    });
    setEntries([]);
    setError('');
    setMessage('');
    setUploadedItem(null);
  };

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!entries.length) {
      setError('请先加入要上传的图片。');
      return;
    }
    if (!title.trim()) {
      setError('请填写这个画廊展示单位的标题。');
      return;
    }
    const input: GalleryInput = {
      title,
      description,
      category,
      cardFocus,
      cardAspectRatio,
      thumbnailFocus,
      thumbnailAspectRatio,
      cropPositioning: 'center',
    };
    setUploading(true);
    setError('');
    setMessage('');
    setUploadedItem(null);
    try {
      const item = await api.uploadGalleryGroup(input, entries.map((entry) => entry.file), 0, csrfToken);
      entries.forEach((entry) => {
        URL.revokeObjectURL(entry.previewUrl);
        previewUrlsRef.current.delete(entry.previewUrl);
      });
      setEntries([]);
      setCardFocus({ x: 0.5, y: 0.5, size: 1 });
      setCardAspectRatio('original');
      setThumbnailFocus({ x: 0.5, y: 0.5, size: 1 });
      setThumbnailAspectRatio('1:1');
      setUploadedItem(item);
      setMessage(`已创建包含 ${item.images.length} 张图片的画廊展示单位。`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return <main id="main" className="page-shell admin-shell advanced-gallery-upload-shell">
    <AdminNav />
    <div className="admin-heading advanced-upload-heading">
      <div><p className="eyebrow">组合上传</p><h1>高级上传</h1><p>一次上传多张图片，组成一个画廊展示单位；第一张图片同时作为卡片和侧栏缩略图。</p></div>
      <Link className="button secondary-button" to="/admin/gallery">返回画廊管理</Link>
    </div>

    {error && <div className="message error-message" role="alert">{error}</div>}
    {message && <div className="message success-message" role="status">{message}{uploadedItem && <> <Link to={`/gallery/${uploadedItem.id}`}>查看展示</Link></>}</div>}

    <form className="advanced-upload-workspace" onSubmit={(event) => void upload(event)}>
      <section className="advanced-upload-batch" aria-labelledby="group-settings-heading">
        <div className="advanced-upload-section-heading">
          <div><p className="eyebrow">展示信息</p><h2 id="group-settings-heading">一个条目，共用一组信息</h2><p>标题、说明和分类会应用到整个多图展示单位。</p></div>
        </div>
        <div className="advanced-upload-batch-grid">
          <label className="form-field"><span>标题</span><input value={title} maxLength={120} disabled={uploading} onChange={(event) => setTitle(event.target.value)} placeholder="画廊展示标题" required /></label>
          <label className="form-field"><span>多级分类</span><input value={category} maxLength={131} disabled={uploading} onChange={(event) => setCategory(event.target.value)} placeholder="例如：作品 / 插画 / 人物" /><small>使用 / 分隔层级，最多 4 级</small></label>
          <label className="form-field advanced-upload-description"><span>说明</span><textarea rows={2} value={description} maxLength={240} disabled={uploading} onChange={(event) => setDescription(event.target.value)} placeholder="对这一组图片的统一说明" /></label>
        </div>
      </section>

      <label
        className={`advanced-upload-dropzone${dragActive ? ' drag-active' : ''}`}
        onDragEnter={(event: DragEvent) => {
          event.preventDefault();
          if (uploading || !event.dataTransfer.types.includes('Files')) return;
          dragDepthRef.current += 1;
          setDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (!dragDepthRef.current) setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepthRef.current = 0;
          setDragActive(false);
          if (!uploading) addFiles(event.dataTransfer.files);
        }}
      >
        <span className="advanced-upload-dropzone-icon"><UploadIcon /></span>
        <span><strong>点击选择或拖入多张图片</strong><small>PNG、JPEG 或 WebP；每张最大 25 MB，一个展示单位最多 {maximumFileCount} 张</small></span>
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={uploading || entries.length >= maximumFileCount} onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = '';
        }} />
      </label>

      <section className="advanced-upload-queue" aria-labelledby="upload-queue-heading">
        <div className="advanced-upload-section-heading advanced-upload-queue-heading">
          <div><p className="eyebrow">上传队列</p><h2 id="upload-queue-heading">{entries.length ? `${entries.length} 张图片 · 1 个展示单位` : '尚未选择图片'}</h2><p>拖动图片右下角的手柄调整顺序；第一张图片会用作缩略图。</p></div>
          {entries.length > 0 && <div className="advanced-upload-queue-actions"><button className="button text-button" type="button" disabled={uploading} onClick={clearEntries}>清空队列</button></div>}
        </div>

        {entries.length === 0 ? <div className="advanced-upload-empty"><ImageIcon /><p>加入多张图片后，它们会一起出现在同一个画廊详情中。</p></div> : <>
          <SortableGalleryImageQueue items={entries.map((entry) => ({ id: entry.id, imageUrl: entry.previewUrl, name: entry.file.name, detail: `${(entry.file.size / 1024 / 1024).toFixed(2)} MB` }))} onReorder={reorderEntries} onRemove={removeEntry} disabled={uploading} />

          <ThumbnailFocalSelector imageUrl={entries[0].previewUrl} cardFocus={cardFocus} onCardFocusChange={setCardFocus} cardAspectRatio={cardAspectRatio} onCardAspectRatioChange={setCardAspectRatio} thumbnailFocus={thumbnailFocus} onThumbnailFocusChange={setThumbnailFocus} thumbnailAspectRatio={thumbnailAspectRatio} onThumbnailAspectRatioChange={setThumbnailAspectRatio} cropPositioning="center" />
        </>}

        <div className="advanced-upload-footer">
          <p>创建后可在画廊管理中继续调整封面、裁切焦点和展示顺序。</p>
          <button className="button primary-button" disabled={uploading || !entries.length}>{uploading ? `正在上传 ${entries.length} 张图片…` : `创建多图展示（${entries.length} 张）`}</button>
        </div>
      </section>
    </form>
  </main>;
}
