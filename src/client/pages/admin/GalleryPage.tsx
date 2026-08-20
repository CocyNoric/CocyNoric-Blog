import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import type { GalleryItem, GalleryMedia, ThumbnailAspectRatio } from '../../../shared/schemas.js';
import { galleryCategoryFromTags, galleryTagsForItem, summarizeGalleryTags } from '../../../shared/galleryTags.js';
import { galleryCropAspectRatio, GalleryCropImage } from '../../components/GalleryCropImage.js';
import { api } from '../../api.js';
import { AdminNav } from '../../components/AdminNav.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { DragHandleIcon, EditIcon, ImageIcon, TrashIcon, UploadIcon } from '../../components/Icons.js';
import { ImageDropField } from '../../components/ImageDropField.js';
import { SortableGalleryImageQueue } from '../../components/SortableGalleryImageQueue.js';
import { TagInput } from '../../components/TagInput.js';
import { ThumbnailFocalSelector } from '../../components/ThumbnailFocalSelector.js';
import { useAuth } from '../../hooks/useAuth.js';

import { buildGridSlotLayout, moveIntoVisualSlot, slotIndexForPoint, type GridSlotLayout } from './galleryDragSlots.js';

function galleryCardAspectRatio(item: GalleryItem) {
  return galleryCropAspectRatio(item.cardAspectRatio, item.width, item.height);
}

function moveItem<T>(items: T[], sourceIndex: number, destinationIndex: number) {
  if (sourceIndex === destinationIndex || sourceIndex < 0 || destinationIndex < 0) return items;
  const next = [...items];
  const [item] = next.splice(sourceIndex, 1);
  next.splice(destinationIndex, 0, item);
  return next;
}

type SortLayout = {
  source: DOMRect;
  slots: GridSlotLayout;
};

type PointerDrag = {
  id: string;
  pointerId: number;
  handle: HTMLButtonElement;
  startX: number;
  startY: number;
  initial: GalleryItem[];
  slotIndex: number;
  layout: SortLayout | null;
  layoutPending: boolean;
  active: boolean;
  frame: number | null;
  point: { x: number; y: number } | null;
  resolvedPoint: { x: number; y: number } | null;
};

export function GalleryPage() {
  const { csrfToken } = useAuth();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const itemsRef = useRef(items);
  const gridRef = useRef<HTMLDivElement>(null);
  const pointerDragRef = useRef<PointerDrag | null>(null);
  const keyboardInitialRef = useRef<GalleryItem[] | null>(null);
  const previousRectsRef = useRef(new Map<string, DOMRect>());
  const [pointerPreview, setPointerPreview] = useState<{ id: string; slotIndex: number; source: DOMRect; grab: { x: number; y: number } } | null>(null);
  const overlayRef = useRef<HTMLElement>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [keyboardDragId, setKeyboardDragId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
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
  const [editImages, setEditImages] = useState<GalleryMedia[]>([]);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editCardFocus, setEditCardFocus] = useState({ x: 0.5, y: 0.5, size: 1 });
  const [editCardAspectRatio, setEditCardAspectRatio] = useState<ThumbnailAspectRatio>('4:3');
  const [editThumbnailFocus, setEditThumbnailFocus] = useState({ x: 0.5, y: 0.5, size: 1 });
  const [editThumbnailAspectRatio, setEditThumbnailAspectRatio] = useState<ThumbnailAspectRatio>('1:1');
  const [editCropPositioning, setEditCropPositioning] = useState<'legacy' | 'center'>('legacy');
  const [cropEdited, setCropEdited] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => {
    const drag = pointerDragRef.current;
    if (drag && drag.frame !== null) cancelAnimationFrame(drag.frame);
  }, []);
  useEffect(() => {
    const cancel = () => clearPointerDrag();
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    window.addEventListener('scroll', cancel, true);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      window.removeEventListener('scroll', cancel, true);
    };
  }, []);

  const positionOverlay = (drag: PointerDrag) => {
    if (!drag.point || !drag.layout) return;
    const x = drag.point.x - (drag.startX - drag.layout.source.left);
    const y = drag.point.y - (drag.startY - drag.layout.source.top);
    overlayRef.current?.style.setProperty('transform', `translate3d(${x}px, ${y}px, 0)`);
  };

  useLayoutEffect(() => {
    if (pointerPreview) {
      const drag = pointerDragRef.current;
      if (drag) positionOverlay(drag);
    }
    const cards = gridRef.current?.querySelectorAll<HTMLElement>('[data-gallery-id]') ?? [];
    const nextRects = new Map([...cards].flatMap((card) => {
      const id = card.dataset.galleryId;
      return id ? [[id, card.getBoundingClientRect()] as const] : [];
    }));
    const drag = pointerDragRef.current;
    if (drag?.active && drag.layoutPending && pointerPreview?.id === drag.id && drag.layout) {
      const bounds = gridRef.current?.getBoundingClientRect();
      if (bounds) drag.layout = { source: drag.layout.source, slots: buildGridSlotLayout(bounds, [...nextRects].map(([id, rect]) => ({ id, rect }))) };
      drag.layoutPending = false;
      if (drag.point && drag.resolvedPoint !== drag.point && drag.frame === null) drag.frame = requestAnimationFrame(flushPointerDrag);
    }
    if (pointerPreview || activeDragId || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      previousRectsRef.current = nextRects;
      return;
    }
    for (const [id, rect] of nextRects) {
      const previous = previousRectsRef.current.get(id);
      if (!previous) continue;
      const x = previous.left - rect.left;
      const y = previous.top - rect.top;
      if (!x && !y) continue;
      const card = gridRef.current?.querySelector<HTMLElement>(`[data-gallery-id="${id}"]`);
      if (!card) continue;
      card.style.transition = 'none';
      card.style.transform = `translate(${x}px, ${y}px)`;
      requestAnimationFrame(() => {
        card.style.transition = '';
        card.style.transform = '';
      });
    }
    previousRectsRef.current = nextRects;
  }, [pointerPreview, activeDragId]);

  const load = async () => {
    try {
      const next = await api.gallery();
      setItems(next);
    } catch (cause) {
      setError((cause as Error).message);
    }
  };
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

  const focusHandle = (id: string) => requestAnimationFrame(() => {
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-gallery-order-handle="${id}"]`)?.focus();
  });

  const saveOrder = async (next: GalleryItem[], fallback: GalleryItem[]) => {
    setSavingOrder(true);
    setError('');
    setMessage('');
    try {
      const saved = await api.reorderGallery(next.map((item) => item.id), csrfToken);
      setItems(saved);
      setMessage('图片展示顺序已保存。');
      setLiveMessage('图片展示顺序已保存。');
    } catch (cause) {
      const message = (cause as Error).message;
      try {
        const latest = await api.gallery();
        setItems(latest);
      } catch {
        setItems(fallback);
      }
      setError(message);
      setLiveMessage(`排序未保存：${message}`);
    } finally {
      setSavingOrder(false);
    }
  };

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
      const item = await api.uploadGalleryItem({ title, description, category: galleryCategoryFromTags(tags), tags, cardFocus, cardAspectRatio, thumbnailFocus, thumbnailAspectRatio, cropPositioning }, file, csrfToken);
      setItems((current) => [item, ...current]);
      setTitle(''); setDescription(''); setTags([]); setFile(null); setCardFocus({ x: 0.5, y: 0.5, size: 1 }); setCardAspectRatio('original'); setThumbnailFocus({ x: 0.5, y: 0.5, size: 1 }); setThumbnailAspectRatio('1:1'); setCropPositioning('center');
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
    setEditTags(galleryTagsForItem(item));
    setEditImages(item.images);
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
        category: galleryCategoryFromTags(editTags),
        tags: editTags,
        coverImageId: editImages[0]?.mediaId,
        imageOrder: editImages.map((image) => image.mediaId),
        cardFocus: editCardFocus,
        cardAspectRatio: editCardAspectRatio,
        thumbnailFocus: editThumbnailFocus,
        thumbnailAspectRatio: editThumbnailAspectRatio,
        cropPositioning: cropEdited ? 'center' : editCropPositioning,
      }, csrfToken);
      setItems((current) => current.map((candidate) => candidate.id === item.id ? item : candidate));
      setEditing(null);
      setMessage('图片信息与顺序已更新。');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSavingEdit(false);
    }
  };

  const captureLayout = (sourceId: string) => {
    const grid = gridRef.current;
    if (!grid) return null;
    const source = grid.querySelector<HTMLElement>(`[data-gallery-id="${sourceId}"]`)?.getBoundingClientRect();
    const bounds = grid.getBoundingClientRect();
    if (!source) return null;
    const cards = [...grid.querySelectorAll<HTMLElement>('[data-gallery-id]')].flatMap((card) => {
      const id = card.dataset.galleryId;
      return id ? [{ id, rect: card.getBoundingClientRect() }] : [];
    });
    return { source, slots: buildGridSlotLayout(bounds, cards) };
  };

  const slotForPoint = (drag: PointerDrag, point: { x: number; y: number }) => {
    if (!drag.layout) return drag.slotIndex;
    return slotIndexForPoint(drag.layout.slots, drag.id, drag.slotIndex, point);
  };

  const clearPointerDrag = (restore = false) => {
    const drag = pointerDragRef.current;
    if (!drag) return;
    pointerDragRef.current = null;
    if (drag.frame !== null) cancelAnimationFrame(drag.frame);
    if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
    if (restore) setItems(drag.initial);
    setPointerPreview(null);
    setActiveDragId(null);
  };

  const beginPointerDrag = (event: PointerEvent<HTMLButtonElement>, item: GalleryItem) => {
    if (savingOrder || keyboardDragId || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const sourceIndex = itemsRef.current.findIndex((candidate) => candidate.id === item.id);
    pointerDragRef.current = { id: item.id, pointerId: event.pointerId, handle: event.currentTarget, startX: event.clientX, startY: event.clientY, initial: itemsRef.current, slotIndex: sourceIndex, layout: null, layoutPending: false, active: false, frame: null, point: null, resolvedPoint: null };
  };

  const flushPointerDrag = () => {
    const drag = pointerDragRef.current;
    if (!drag || !drag.point || !drag.layout) return;
    drag.frame = null;
    positionOverlay(drag);
    if (drag.layoutPending) return;
    drag.resolvedPoint = drag.point;
    const slotIndex = slotForPoint(drag, drag.point);
    if (slotIndex === drag.slotIndex) return;
    drag.slotIndex = slotIndex;
    drag.layoutPending = true;
    setPointerPreview({ id: drag.id, slotIndex, source: drag.layout.source, grab: { x: drag.startX - drag.layout.source.left, y: drag.startY - drag.layout.source.top } });
  };

  const movePointerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.handle !== event.currentTarget) return;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    if (!drag.active) {
      const layout = captureLayout(drag.id);
      if (!layout) return;
      drag.active = true;
      drag.layout = layout;
      drag.point = { x: event.clientX, y: event.clientY };
      setActiveDragId(drag.id);
      setPointerPreview({ id: drag.id, slotIndex: drag.slotIndex, source: layout.source, grab: { x: drag.startX - layout.source.left, y: drag.startY - layout.source.top } });
      setLiveMessage(`正在移动图片，共 ${drag.initial.length} 张。`);
    }
    drag.point = { x: event.clientX, y: event.clientY };
    if (drag.frame === null) drag.frame = requestAnimationFrame(flushPointerDrag);
  };

  const finishPointerDrag = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.handle !== event.currentTarget) return;
    pointerDragRef.current = null;
    if (drag.frame !== null) {
      cancelAnimationFrame(drag.frame);
      if (drag.point && drag.layout && !drag.layoutPending) {
        drag.frame = null;
        drag.slotIndex = slotForPoint(drag, drag.point);
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setPointerPreview(null);
    setActiveDragId(null);
    if (cancelled || !drag.active) {
      if (cancelled) setItems(drag.initial);
      return;
    }
    const next = moveIntoVisualSlot(drag.initial, drag.id, drag.slotIndex);
    if (next.map((item) => item.id).join() === drag.initial.map((item) => item.id).join()) return;
    setItems(next);
    void saveOrder(next, drag.initial);
  };

  const handleKeyboardOrder = (event: KeyboardEvent<HTMLButtonElement>, item: GalleryItem) => {
    if (savingOrder) return;
    const current = itemsRef.current;
    const index = current.findIndex((candidate) => candidate.id === item.id);
    if (index < 0) return;
    if (!keyboardDragId && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      keyboardInitialRef.current = current;
      setKeyboardDragId(item.id);
      setLiveMessage(`已抓取${item.title}。使用方向键移动，按 Enter 保存或 Escape 取消。`);
      return;
    }
    if (keyboardDragId !== item.id) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setItems(keyboardInitialRef.current ?? current);
      setKeyboardDragId(null);
      setLiveMessage(`已取消${item.title}的排序。`);
      focusHandle(item.id);
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      const initial = keyboardInitialRef.current ?? current;
      setKeyboardDragId(null);
      if (current.map((candidate) => candidate.id).join() !== initial.map((candidate) => candidate.id).join()) void saveOrder(current, initial);
      else setLiveMessage(`${item.title}位置未改变。`);
      focusHandle(item.id);
      return;
    }
    const destination = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? index - 1
      : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? index + 1
        : event.key === 'Home' ? 0
          : event.key === 'End' ? current.length - 1
            : null;
    if (destination === null) return;
    event.preventDefault();
    const next = moveItem(current, index, Math.max(0, Math.min(current.length - 1, destination)));
    setItems(next);
    const position = next.findIndex((candidate) => candidate.id === item.id) + 1;
    setLiveMessage(`${item.title}已移动到第 ${position} 位，共 ${next.length} 张。`);
    focusHandle(item.id);
  };

  const pointerOrder = useMemo(() => pointerPreview
    ? moveIntoVisualSlot(items, pointerPreview.id, pointerPreview.slotIndex)
    : items, [items, pointerPreview]);
  const pointerOrderIndexes = useMemo(() => new Map(pointerOrder.map((item, index) => [item.id, index])), [pointerOrder]);
  const tagsByItem = useMemo(() => new Map(items.map((item) => [item.id, galleryTagsForItem(item)])), [items]);
  const galleryImageCount = useMemo(() => items.reduce((total, item) => total + item.images.length, 0), [items]);
  const tagSuggestions = useMemo(() => summarizeGalleryTags(items).map((summary) => summary.tag), [items]);

  return <main id="main" className="page-shell admin-shell gallery-admin-shell">
    <AdminNav />
    <div className="admin-heading"><div><p className="eyebrow">媒体管理</p><h1>画廊</h1><p>上传图片后会立即显示在首页画廊。</p></div></div>
    {error && <div className="message error-message" role="alert">{error}</div>}
    {message && <div className="message success-message" role="status">{message}</div>}

    <form className="gallery-upload-panel" onSubmit={upload}>
      <ImageDropField
        className={`gallery-dropzone${file ? ' has-preview' : ''}`}
        disabled={busy || savingOrder}
        maximumBytes={25 * 1024 * 1024}
        onFile={selectFile}
        onError={setError}
      >
        <span className="media-preview gallery-upload-preview">{previewUrl ? <img src={previewUrl} alt="待上传图片预览" /> : <ImageIcon />}</span>
        <span>
          <strong>{file ? file.name : '选择或拖入画廊图片'}</strong>
          {!file && <small>PNG、JPEG 或 WebP，最大 25 MB；保留原图，并生成 WebP 展示图</small>}
        </span>
      </ImageDropField>
      <div className="gallery-upload-fields">
        <label className="form-field"><span>标题</span><input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label className="form-field"><span>说明</span><textarea rows={2} value={description} maxLength={240} onChange={(event) => setDescription(event.target.value)} /></label>
        <div className="form-field"><span>标签</span><TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} /><small>选择已有标签，或输入后按回车新建；最多 12 个</small></div>
        <div className="gallery-upload-submit-row">
          <button className="button primary-button" disabled={busy || savingOrder}>{busy ? '正在上传…' : '上传到画廊'}</button>
          <Link className="button secondary-button" to="/admin/gallery/upload"><UploadIcon />高级上传</Link>
        </div>
      </div>
      {previewUrl && <ThumbnailFocalSelector imageUrl={previewUrl} cardFocus={cardFocus} onCardFocusChange={setCardFocus} cardAspectRatio={cardAspectRatio} onCardAspectRatioChange={setCardAspectRatio} thumbnailFocus={thumbnailFocus} onThumbnailFocusChange={setThumbnailFocus} thumbnailAspectRatio={thumbnailAspectRatio} onThumbnailAspectRatioChange={setThumbnailAspectRatio} cropPositioning={cropPositioning} onCropChange={() => setCropPositioning('center')} />}
    </form>

    <section className="gallery-admin-list" aria-labelledby="gallery-list-heading">
      <div className="section-heading"><div><p className="eyebrow">已发布</p><h2 id="gallery-list-heading">展示单位</h2><p className="gallery-order-help">拖动左上角手柄调整展示顺序。{savingOrder && ' 正在保存排序…'}</p></div><p className="section-description">共 {items.length} 个展示单位 · {galleryImageCount} 张图片</p></div>
      <p className="visually-hidden" id="gallery-order-instructions">按空格或回车抓取图片，方向键移动，Home 或 End 移到首尾，Escape 取消。</p>
      <div className="visually-hidden" aria-live="polite">{liveMessage}</div>
      {items.length === 0
        ? <div className="gallery-empty">还没有图片，使用上方入口上传第一张。</div>
        : <div className={`gallery-grid gallery-order-grid${pointerPreview ? ' is-sorting' : ''}`} ref={gridRef} aria-busy={savingOrder}>{items.map((entry) => {
          const index = pointerOrderIndexes.get(entry.id) ?? 0;
          const entryTags = tagsByItem.get(entry.id) ?? [];
          return <article className={`gallery-admin-card${activeDragId === entry.id ? ' is-pointer-placeholder' : ''}${keyboardDragId === entry.id ? ' is-keyboard-dragging' : ''}`} data-gallery-id={entry.id} key={entry.id} style={{ order: index }}>
          <button
            className="gallery-order-handle"
            data-gallery-order-handle={entry.id}
            type="button"
            disabled={savingOrder}
            aria-label={`调整${entry.title}的顺序，当前位置第 ${index + 1} 位，共 ${items.length} 张`}
            aria-describedby="gallery-order-instructions"
            onPointerDown={(event) => beginPointerDrag(event, entry)}
            onPointerMove={movePointerDrag}
            onPointerUp={finishPointerDrag}
            onPointerCancel={(event) => finishPointerDrag(event, true)}
            onLostPointerCapture={(event) => finishPointerDrag(event, true)}
            onKeyDown={(event) => handleKeyboardOrder(event, entry)}
          ><DragHandleIcon /></button>
          <div className="gallery-admin-visual" style={{ aspectRatio: String(galleryCardAspectRatio(entry)) }}><GalleryCropImage src={entry.url} alt={entry.title} loading="lazy" focus={entry.cardFocus} aspectRatio={entry.cardAspectRatio} cropPositioning={entry.cropPositioning} width={entry.width} height={entry.height} />{entry.images.length > 1 && <span className="gallery-image-count">{entry.images.length} 张</span>}</div>
          <div className="gallery-admin-copy">{entryTags.length > 0 && <div className="gallery-admin-tags" aria-label="标签">{entryTags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>}<h3>{entry.title}</h3></div>
          <div className="gallery-card-actions">
            <button className="icon-button" type="button" disabled={savingOrder} onClick={() => beginEdit(entry)} aria-label={`编辑${entry.title}`}><EditIcon /></button>
            <button className="icon-button danger" type="button" disabled={savingOrder} onClick={() => setPendingDelete(entry)} aria-label={`删除${entry.title}`}><TrashIcon /></button>
          </div>
        </article>;
        })}</div>}
      {pointerPreview && (() => {
        const item = items.find((candidate) => candidate.id === pointerPreview.id);
        const itemTags = item ? tagsByItem.get(item.id) ?? [] : [];
        return item ? <article ref={overlayRef} aria-hidden="true" className="gallery-sort-overlay" style={{ width: pointerPreview.source.width }}>
          <div className="gallery-admin-visual" style={{ aspectRatio: String(galleryCardAspectRatio(item)) }}><GalleryCropImage src={item.url} alt="" focus={item.cardFocus} aspectRatio={item.cardAspectRatio} cropPositioning={item.cropPositioning} width={item.width} height={item.height} /></div>
          <div className="gallery-admin-copy">{itemTags.length > 0 && <div className="gallery-admin-tags" aria-label="标签">{itemTags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>}<h3>{item.title}</h3></div>
        </article> : null;
      })()}
    </section>

    <ConfirmDialog
      open={Boolean(pendingDelete)}
      title="删除画廊展示单位？"
      description={pendingDelete ? `“${pendingDelete.title}”及其 ${pendingDelete.images.length} 张图片文件会被永久删除。` : ''}
      confirmLabel="删除"
      destructive
      busy={deleting}
      onCancel={() => setPendingDelete(null)}
      onConfirm={() => void remove()}
    />

    <ConfirmDialog
      open={Boolean(editing)}
      title="编辑画廊展示"
      description="更新整个展示单位的信息、图片顺序和缩略图裁切方式。"
      confirmLabel="保存"
      busy={savingEdit}
      wide
      onCancel={() => setEditing(null)}
      onConfirm={() => void saveEdit()}
    >
      <div className="dialog-form">
        <label className="form-field"><span>标题</span><input value={editTitle} maxLength={120} onChange={(event) => setEditTitle(event.target.value)} required /></label>
        <label className="form-field"><span>说明</span><textarea rows={3} value={editDescription} maxLength={240} onChange={(event) => setEditDescription(event.target.value)} /></label>
        <div className="form-field"><span>标签</span><TagInput value={editTags} onChange={setEditTags} disabled={savingEdit} suggestions={tagSuggestions} /><small>选择已有标签，或输入后按回车新建；最多 12 个</small></div>
        {editing && editImages.length > 1 && <fieldset className="gallery-cover-fieldset"><legend>图片顺序</legend><p>拖动图片右下角的手柄调整顺序；第一张同时作为卡片和侧栏缩略图。</p><SortableGalleryImageQueue items={editImages.map((image) => ({ id: image.mediaId, imageUrl: image.url, name: image.originalFilename }))} onReorder={(ids) => setEditImages((current) => {
          const byId = new Map(current.map((image) => [image.mediaId, image]));
          const next = ids.flatMap((id) => {
            const image = byId.get(id);
            return image ? [image] : [];
          });
          return next.length === current.length ? next : current;
        })} disabled={savingEdit} ariaLabel="编辑画廊图片顺序" /></fieldset>}
        {editing?.cropPositioning === 'legacy' && !cropEdited && <p className="form-help">此图片沿用旧版裁剪定位；调整裁剪中心、比例或缩放后会切换为新的中心点裁剪。</p>}
        {editing && <ThumbnailFocalSelector imageUrl={editImages[0]?.url ?? editing.url} cardFocus={editCardFocus} onCardFocusChange={setEditCardFocus} cardAspectRatio={editCardAspectRatio} onCardAspectRatioChange={setEditCardAspectRatio} thumbnailFocus={editThumbnailFocus} onThumbnailFocusChange={setEditThumbnailFocus} thumbnailAspectRatio={editThumbnailAspectRatio} onThumbnailAspectRatioChange={setEditThumbnailAspectRatio} cropPositioning={cropEdited ? 'center' : editCropPositioning} onCropChange={() => setCropEdited(true)} />}
      </div>
    </ConfirmDialog>
  </main>;
}
