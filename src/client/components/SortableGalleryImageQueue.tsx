import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { DragHandleIcon, TrashIcon } from './Icons.js';

export type SortableGalleryImageQueueItem = {
  id: string;
  imageUrl: string;
  name: string;
  detail?: string;
};

type SortableGalleryImageQueueProps = {
  items: SortableGalleryImageQueueItem[];
  onReorder: (ids: string[]) => void;
  onRemove?: (id: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
};

type PointerDrag = {
  id: string;
  pointerId: number;
  handle: HTMLButtonElement;
  startX: number;
  startY: number;
  initialOrder: string[];
  active: boolean;
  frame: number | null;
  point: { x: number; y: number } | null;
  sourceRect: DOMRect | null;
};

type DragOverlay = {
  id: string;
  width: number;
};

function moveId(ids: string[], id: string, destinationIndex: number) {
  const sourceIndex = ids.indexOf(id);
  if (sourceIndex < 0 || sourceIndex === destinationIndex || destinationIndex < 0 || destinationIndex >= ids.length) return ids;
  const next = [...ids];
  next.splice(sourceIndex, 1);
  next.splice(destinationIndex, 0, id);
  return next;
}

function sameOrder(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function SortableGalleryImageQueue({ items, onReorder, onRemove, disabled = false, ariaLabel = '画廊图片上传队列' }: SortableGalleryImageQueueProps) {
  const instructionsId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLElement>(null);
  const itemsRef = useRef(items);
  const onReorderRef = useRef(onReorder);
  const orderRef = useRef(items.map((item) => item.id));
  const pointerDragRef = useRef<PointerDrag | null>(null);
  const [previewOrder, setPreviewOrder] = useState(orderRef.current);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverlay, setDragOverlay] = useState<DragOverlay | null>(null);
  const [liveMessage, setLiveMessage] = useState('');

  useEffect(() => {
    itemsRef.current = items;
    onReorderRef.current = onReorder;
    if (!pointerDragRef.current) {
      const next = items.map((item) => item.id);
      orderRef.current = next;
      setPreviewOrder(next);
    }
  }, [items, onReorder]);

  const itemName = (id: string) => itemsRef.current.find((item) => item.id === id)?.name ?? '图片';

  const updatePreviewOrder = (next: string[]) => {
    if (sameOrder(next, orderRef.current)) return;
    orderRef.current = next;
    setPreviewOrder(next);
  };

  const commitOrder = (next: string[]) => {
    updatePreviewOrder(next);
    onReorderRef.current(next);
  };

  const positionOverlay = (drag: PointerDrag) => {
    if (!drag.active || !drag.point || !drag.sourceRect) return;
    const x = drag.point.x - (drag.startX - drag.sourceRect.left);
    const y = drag.point.y - (drag.startY - drag.sourceRect.top);
    overlayRef.current?.style.setProperty('transform', `translate3d(${x}px, ${y}px, 0)`);
  };

  const flushPointerMove = () => {
    const drag = pointerDragRef.current;
    if (!drag || !drag.active || !drag.point) return;
    drag.frame = null;
    positionOverlay(drag);
    const target = document.elementFromPoint(drag.point.x, drag.point.y)?.closest<HTMLElement>('[data-sortable-gallery-id]');
    const targetId = target?.dataset.sortableGalleryId;
    if (!targetId || targetId === drag.id) return;
    const destinationIndex = orderRef.current.indexOf(targetId);
    if (destinationIndex >= 0) updatePreviewOrder(moveId(orderRef.current, drag.id, destinationIndex));
  };

  const clearPointerDrag = (cancelled: boolean) => {
    const drag = pointerDragRef.current;
    if (!drag) return;
    if (drag.frame !== null) {
      cancelAnimationFrame(drag.frame);
      drag.frame = null;
      if (!cancelled) flushPointerMove();
    }
    pointerDragRef.current = null;
    if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
    setDraggingId(null);
    setDragOverlay(null);
    if (cancelled || !drag.active) {
      updatePreviewOrder(drag.initialOrder);
      if (cancelled && drag.active) setLiveMessage('已取消图片排序。');
      return;
    }
    const next = orderRef.current;
    if (sameOrder(next, drag.initialOrder)) {
      setLiveMessage(`${itemName(drag.id)}的位置未改变。`);
      return;
    }
    onReorderRef.current(next);
    setLiveMessage(`已将 ${itemName(drag.id)} 移到第 ${next.indexOf(drag.id) + 1} 位。`);
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      event.preventDefault();
      if (!drag.active) {
        const source = [...(gridRef.current?.querySelectorAll<HTMLElement>('[data-sortable-gallery-id]') ?? [])]
          .find((candidate) => candidate.dataset.sortableGalleryId === drag.id);
        const sourceRect = source?.getBoundingClientRect();
        if (!sourceRect) return;
        drag.active = true;
        drag.sourceRect = sourceRect;
        setDraggingId(drag.id);
        setDragOverlay({ id: drag.id, width: sourceRect.width });
        setLiveMessage(`正在移动 ${itemName(drag.id)}。`);
      }
      drag.point = { x: event.clientX, y: event.clientY };
      if (drag.frame === null) drag.frame = requestAnimationFrame(flushPointerMove);
    };
    const finish = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (drag?.pointerId === event.pointerId) clearPointerDrag(false);
    };
    const cancel = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (drag?.pointerId === event.pointerId) clearPointerDrag(true);
    };
    const cancelOnBlur = () => clearPointerDrag(true);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('blur', cancelOnBlur);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('blur', cancelOnBlur);
      const drag = pointerDragRef.current;
      if (drag && drag.frame !== null) cancelAnimationFrame(drag.frame);
      pointerDragRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (disabled) clearPointerDrag(true);
  }, [disabled]);

  const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (disabled) return;
    const currentIndex = orderRef.current.indexOf(id);
    let destinationIndex = currentIndex;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') destinationIndex = Math.max(0, currentIndex - 1);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') destinationIndex = Math.min(orderRef.current.length - 1, currentIndex + 1);
    else if (event.key === 'Home') destinationIndex = 0;
    else if (event.key === 'End') destinationIndex = orderRef.current.length - 1;
    else return;
    event.preventDefault();
    const next = moveId(orderRef.current, id, destinationIndex);
    if (sameOrder(next, orderRef.current)) return;
    commitOrder(next);
    setLiveMessage(`已将 ${itemName(id)} 移到第 ${next.indexOf(id) + 1} 位。`);
  };

  const itemById = new Map(items.map((item) => [item.id, item]));
  const orderedItems = previewOrder.flatMap((id) => {
    const item = itemById.get(id);
    return item ? [item] : [];
  });
  const overlayItem = dragOverlay ? itemById.get(dragOverlay.id) : undefined;

  return <>
    <p className="visually-hidden" id={instructionsId}>拖动手柄调整顺序；也可聚焦手柄后使用方向键移动，Home 或 End 移到首尾。</p>
    <div className="visually-hidden" aria-live="polite">{liveMessage}</div>
    <div className={`advanced-upload-preview-grid${draggingId ? ' is-sorting' : ''}`} ref={gridRef} aria-label={ariaLabel}>
      {orderedItems.map((item, index) => {
        const isFirst = index === 0;
        const isDragging = item.id === draggingId;
        return <article className={`advanced-upload-preview-item${isFirst ? ' is-first' : ''}${isDragging ? ' is-dragging' : ''}`} data-sortable-gallery-id={item.id} key={item.id}>
          <div className="advanced-upload-preview-image">
            <img src={item.imageUrl} alt="" />
            <span>{index + 1}</span>
            {isFirst && <strong>第一张</strong>}
            {onRemove && <button className="icon-button danger advanced-upload-preview-remove" type="button" disabled={disabled || Boolean(draggingId)} onClick={() => onRemove(item.id)} aria-label={`从队列移除 ${item.name}`}><TrashIcon /></button>}
            <button
              className="icon-button advanced-upload-preview-drag-handle"
              type="button"
              disabled={disabled || items.length < 2}
              aria-label={`拖动排序 ${item.name}，当前位置 ${index + 1}`}
              aria-describedby={instructionsId}
              onKeyDown={(event) => moveWithKeyboard(event, item.id)}
              onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
                if (disabled || items.length < 2 || event.button !== 0 || pointerDragRef.current) return;
                event.preventDefault();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                pointerDragRef.current = { id: item.id, pointerId: event.pointerId, handle: event.currentTarget, startX: event.clientX, startY: event.clientY, initialOrder: [...orderRef.current], active: false, frame: null, point: null, sourceRect: null };
              }}
            ><DragHandleIcon /></button>
          </div>
          <div className="advanced-upload-preview-copy">
            <strong title={item.name}>{item.name}</strong>
            {item.detail && <small>{item.detail}</small>}
            <button className={`button ${isFirst ? 'primary-button' : 'secondary-button'}`} type="button" disabled={disabled || Boolean(draggingId) || isFirst} onClick={() => {
              const next = moveId(orderRef.current, item.id, 0);
              commitOrder(next);
              setLiveMessage(`已将 ${item.name} 设为第一张。`);
            }}>{isFirst ? '当前第一张' : '设为第一张'}</button>
          </div>
        </article>;
      })}
    </div>
    {dragOverlay && overlayItem && <article ref={overlayRef} className="advanced-upload-sort-overlay" aria-hidden="true" style={{ width: dragOverlay.width }}>
      <div className="advanced-upload-preview-image"><img src={overlayItem.imageUrl} alt="" /></div>
      <div className="advanced-upload-preview-copy"><strong>{overlayItem.name}</strong>{overlayItem.detail && <small>{overlayItem.detail}</small>}</div>
    </article>}
  </>;
}
