import { useEffect, useState, type FormEvent } from 'react';
import type { GalleryItem, ThumbnailAspectRatio } from '../../../shared/schemas.js';
import { galleryCropAspectRatio, GalleryCropImage } from '../../components/GalleryCropImage.js';
import { api } from '../../api.js';
import { AdminNav } from '../../components/AdminNav.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { EditIcon, ImageIcon, TrashIcon } from '../../components/Icons.js';
import { ImageDropField } from '../../components/ImageDropField.js';
import { ThumbnailFocalSelector } from '../../components/ThumbnailFocalSelector.js';
import { useAuth } from '../../hooks/useAuth.js';

function galleryCardAspectRatio(item: GalleryItem) {
  return galleryCropAspectRatio(item.cardAspectRatio, item.width, item.height);
}

export function GalleryPage() {
  const { csrfToken } = useAuth();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [cardFocus, setCardFocus] = useState({ x: 0.5, y: 0.5, size: 1 });
  const [cardAspectRatio, setCardAspectRatio] = useState<ThumbnailAspectRatio>('original');
  const [thumbnailFocus, setThumbnailFocus] = useState({ x: 0.5, y: 0.5, size: 1 });
  const [thumbnailAspectRatio, setThumbnailAspectRatio] = useState<ThumbnailAspectRatio>('1:1');
  const [cropPositioning, setCropPositioning] = useState<'center'>('center');
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<GalleryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<GalleryItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCardFocus, setEditCardFocus] = useState({ x: 0.5, y: 0.5, size: 1 });
  const [editCardAspectRatio, setEditCardAspectRatio] = useState<ThumbnailAspectRatio>('4:3');
  const [editThumbnailFocus, setEditThumbnailFocus] = useState({ x: 0.5, y: 0.5, size: 1 });
  const [editThumbnailAspectRatio, setEditThumbnailAspectRatio] = useState<ThumbnailAspectRatio>('1:1');
  const [editCropPositioning, setEditCropPositioning] = useState<'legacy' | 'center'>('legacy');
  const [cropEdited, setCropEdited] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = () => api.gallery().then(setItems).catch((cause: Error) => setError(cause.message));
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const selectFile = (selected: File) => {
    setError('');
    setMessage('');
    setFile(selected);
    setCardFocus({ x: 0.5, y: 0.5, size: 1 });
    setCardAspectRatio('original');
    setThumbnailFocus({ x: 0.5, y: 0.5, size: 1 });
    setThumbnailAspectRatio('1:1');
    setCropPositioning('center');
  };

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) { setError('请选择要上传的图片'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const item = await api.uploadGalleryItem({ title, description, cardFocus, cardAspectRatio, thumbnailFocus, thumbnailAspectRatio, cropPositioning }, file, csrfToken);
      setItems((current) => [item, ...current]);
      setTitle(''); setDescription(''); setFile(null); setCardFocus({ x: 0.5, y: 0.5, size: 1 }); setCardAspectRatio('original'); setThumbnailFocus({ x: 0.5, y: 0.5, size: 1 }); setThumbnailAspectRatio('1:1'); setCropPositioning('center');
      setMessage('图片已上传并发布到首页画廊。');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setDeleting(true); setError(''); setMessage('');
    try {
      await api.deleteGalleryItem(pendingDelete.id, csrfToken);
      setItems((current) => current.filter((candidate) => candidate.id !== pendingDelete.id));
      setPendingDelete(null);
      setMessage('图片已删除。');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const beginEdit = (item: GalleryItem) => {
    setEditTitle(item.title);
    setEditDescription(item.description);
    setEditCardFocus(item.cardFocus);
    setEditCardAspectRatio(item.cardAspectRatio);
    setEditThumbnailFocus(item.thumbnailFocus);
    setEditThumbnailAspectRatio(item.thumbnailAspectRatio);
    setEditCropPositioning(item.cropPositioning);
    setCropEdited(false);
    setEditing(item);
  };

  const saveEdit = async () => {
    if (!editing || !editTitle.trim()) return;
    setSavingEdit(true); setError(''); setMessage('');
    try {
      const item = await api.updateGalleryItem(editing.id, {
        title: editTitle,
        description: editDescription,
        cardFocus: editCardFocus,
        cardAspectRatio: editCardAspectRatio,
        thumbnailFocus: editThumbnailFocus,
        thumbnailAspectRatio: editThumbnailAspectRatio,
        cropPositioning: cropEdited ? 'center' : editCropPositioning,
      }, csrfToken);
      setItems((current) => current.map((candidate) => candidate.id === item.id ? item : candidate));
      setEditing(null);
      setMessage('图片信息已更新。');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSavingEdit(false);
    }
  };

  return <main id="main" className="page-shell admin-shell gallery-admin-shell">
    <AdminNav />
    <div className="admin-heading"><div><p className="eyebrow">媒体管理</p><h1>画廊</h1><p>上传图片后会立即显示在首页画廊。</p></div></div>
    {error && <div className="message error-message" role="alert">{error}</div>}
    {message && <div className="message success-message" role="status">{message}</div>}

    <form className="gallery-upload-panel" onSubmit={upload}>
      <ImageDropField
        className={`gallery-dropzone${file ? ' has-preview' : ''}`}
        disabled={busy}
        maximumBytes={25 * 1024 * 1024}
        onFile={selectFile}
        onError={setError}
      >
        <span className="media-preview gallery-upload-preview">{previewUrl ? <img src={previewUrl} alt="待上传图片预览" /> : <ImageIcon />}</span>
        <span>
          <strong>{file ? file.name : '选择或拖入画廊图片'}</strong>
          {!file && <small>PNG、JPEG 或 WebP，最大 25 MB；保留原文件名与格式</small>}
        </span>
      </ImageDropField>
      <div className="gallery-upload-fields">
        <label className="form-field"><span>标题</span><input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label className="form-field"><span>说明</span><textarea rows={2} value={description} maxLength={240} onChange={(event) => setDescription(event.target.value)} /></label>
        <button className="button primary-button" disabled={busy}>{busy ? '正在上传…' : '上传到画廊'}</button>
      </div>
      {previewUrl && <ThumbnailFocalSelector imageUrl={previewUrl} cardFocus={cardFocus} onCardFocusChange={setCardFocus} cardAspectRatio={cardAspectRatio} onCardAspectRatioChange={setCardAspectRatio} thumbnailFocus={thumbnailFocus} onThumbnailFocusChange={setThumbnailFocus} thumbnailAspectRatio={thumbnailAspectRatio} onThumbnailAspectRatioChange={setThumbnailAspectRatio} cropPositioning={cropPositioning} onCropChange={() => setCropPositioning('center')} />}
    </form>

    <section className="gallery-admin-list" aria-labelledby="gallery-list-heading">
      <div className="section-heading"><div><p className="eyebrow">已发布</p><h2 id="gallery-list-heading">图片</h2></div><p className="section-description">共 {items.length} 张</p></div>
      {items.length === 0
        ? <div className="gallery-empty">还没有图片，使用上方入口上传第一张。</div>
        : <div className="gallery-grid">{items.map((item) => <article className="gallery-admin-card" key={item.id}>
          <div className="gallery-admin-visual" style={{ aspectRatio: String(galleryCardAspectRatio(item)) }}><GalleryCropImage src={item.url} alt={item.title} focus={item.cardFocus} aspectRatio={item.cardAspectRatio} cropPositioning={item.cropPositioning} width={item.width} height={item.height} /></div>
          <div className="gallery-admin-copy"><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}</div>
          <div className="gallery-card-actions">
            <button className="icon-button" type="button" onClick={() => beginEdit(item)} aria-label={`编辑${item.title}`}><EditIcon /></button>
            <button className="icon-button danger" type="button" onClick={() => setPendingDelete(item)} aria-label={`删除${item.title}`}><TrashIcon /></button>
          </div>
        </article>)}</div>}
    </section>

    <ConfirmDialog
      open={Boolean(pendingDelete)}
      title="删除画廊图片？"
      description={pendingDelete ? `“${pendingDelete.title}”及其图片文件会被永久删除。` : ''}
      confirmLabel="删除"
      destructive
      busy={deleting}
      onCancel={() => setPendingDelete(null)}
      onConfirm={() => void remove()}
    />

    <ConfirmDialog
      open={Boolean(editing)}
      title="编辑图片信息"
      description="更新公开画廊和图片详情页中显示的标题与说明。"
      confirmLabel="保存"
      busy={savingEdit}
      wide
      onCancel={() => setEditing(null)}
      onConfirm={() => void saveEdit()}
    >
      <div className="dialog-form">
        <label className="form-field"><span>标题</span><input value={editTitle} maxLength={120} onChange={(event) => setEditTitle(event.target.value)} required /></label>
        <label className="form-field"><span>说明</span><textarea rows={3} value={editDescription} maxLength={240} onChange={(event) => setEditDescription(event.target.value)} /></label>
        {editing?.cropPositioning === 'legacy' && !cropEdited && <p className="form-help">此图片沿用旧版裁剪定位；调整裁剪中心、比例或缩放后会切换为新的中心点裁剪。</p>}
        {editing && <ThumbnailFocalSelector imageUrl={editing.url} cardFocus={editCardFocus} onCardFocusChange={setEditCardFocus} cardAspectRatio={editCardAspectRatio} onCardAspectRatioChange={setEditCardAspectRatio} thumbnailFocus={editThumbnailFocus} onThumbnailFocusChange={setEditThumbnailFocus} thumbnailAspectRatio={editThumbnailAspectRatio} onThumbnailAspectRatioChange={setEditThumbnailAspectRatio} cropPositioning={cropEdited ? 'center' : editCropPositioning} onCropChange={() => setCropEdited(true)} />}
      </div>
    </ConfirmDialog>
  </main>;
}
