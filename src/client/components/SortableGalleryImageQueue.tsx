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
  initialOrder: string[];
};

function moveId(ids: string[], id: string, destinationIndex: number) {
  const sourceIndex = ids.indexOf(id);
  if (sourceIndex < 0 || sourceIndex === destinationIndex || destinationIndex < 0 || destinationIndex >= ids.length) return ids;
  const next = [...ids];
  next.splice(sourceIndex, 1);
  next.splice(destinationIndex, 0, id);
  return next;
}

export function SortableGalleryImageQueue({ items, onReorder, onRemove, disabled = false, ariaLabel = '画廊图片上传队列' }: SortableGalleryImageQueueProps) {
  const instructionsId = useId();
  const orderRef = useRef(items.map((item) => item.id));
  const pointerDragRef = useRef<PointerDrag | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState('');

  useEffect(() => {
    orderRef.current = items.map((item) => item.id);
  }, [items]);

  useEffect(() => () => {
    const drag = pointerDragRef.current;
    if (drag?.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
  }, []);

  const updateOrder = (next: string[]) => {
    if (next === orderRef.current) return;
    orderRef.current = next;
    onReorder(next);
  };

  const moveTo = (id: string, destinationIndex: number) => {
    const next = moveId(orderRef.current, id, destinationIndex);
    updateOrder(next);
    return next;
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointerDragRef.current = null;
    setDraggingId(null);
    if (cancelled) {
      updateOrder(drag.initialOrder);
      setLiveMessage('已取消图片排序。');
      return;
    }
    const index = orderRef.current.indexOf(drag.id);
    setLiveMessage(index >= 0 ? `已将 ${items.find((item) => item.id === drag.id)?.name ?? '图片'} 移到第 ${index + 1} 位。` : '图片顺序已更新。');
  };

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
    const next = moveTo(id, destinationIndex);
    const nextIndex = next.indexOf(id);
    setLiveMessage(`已将 ${items.find((item) => item.id === id)?.name ?? '图片'} 移到第 ${nextIndex + 1} 位。`);
  };

  return <>
    <p className="visually-hidden" id={instructionsId}>拖动手柄调整顺序；也可聚焦手柄后使用方向键移动，Home 或 End 移到首尾。</p>
    <div className="visually-hidden" aria-live="polite">{liveMessage}</div>
    <div className="advanced-upload-preview-grid" aria-label={ariaLabel}>
      {items.map((item, index) => {
        const isFirst = index === 0;
        const isDragging = item.id === draggingId;
        return <article className={`advanced-upload-preview-item${isFirst ? ' is-first' : ''}${isDragging ? ' is-dragging' : ''}`} data-sortable-gallery-id={item.id} key={item.id}>
          <div className="advanced-upload-preview-image">
            <img src={item.imageUrl} alt="" />
            <span>{index + 1}</span>
            {isFirst && <strong>第一张</strong>}
            {onRemove && <button className="icon-button danger advanced-upload-preview-remove" type="button" disabled={disabled} onClick={() => onRemove(item.id)} aria-label={`从队列移除 ${item.name}`}><TrashIcon /></button>}
            <button
              className="icon-button advanced-upload-preview-drag-handle"
              type="button"
              disabled={disabled || items.length < 2}
              aria-label={`拖动排序 ${item.name}，当前位置 ${index + 1}`}
              aria-describedby={instructionsId}
              onKeyDown={(event) => moveWithKeyboard(event, item.id)}
              onPointerDown={(event) => {
                if (disabled || items.length < 2 || event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                pointerDragRef.current = { id: item.id, pointerId: event.pointerId, handle: event.currentTarget, initialOrder: [...orderRef.current] };
                setDraggingId(item.id);
              }}
              onPointerMove={(event) => {
                const drag = pointerDragRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-sortable-gallery-id]');
                const targetId = target?.dataset.sortableGalleryId;
                if (!targetId || targetId === drag.id) return;
                const destinationIndex = orderRef.current.indexOf(targetId);
                if (destinationIndex >= 0) moveTo(drag.id, destinationIndex);
              }}
              onPointerUp={(event) => finishPointerDrag(event)}
              onPointerCancel={(event) => finishPointerDrag(event, true)}
            ><DragHandleIcon /></button>
          </div>
          <div className="advanced-upload-preview-copy">
            <strong title={item.name}>{item.name}</strong>
            {item.detail && <small>{item.detail}</small>}
            <button className={`button ${isFirst ? 'primary-button' : 'secondary-button'}`} type="button" disabled={disabled || isFirst} onClick={() => {
              moveTo(item.id, 0);
              setLiveMessage(`已将 ${item.name} 设为第一张。`);
            }}>{isFirst ? '当前第一张' : '设为第一张'}</button>
          </div>
        </article>;
      })}
    </div>
  </>;
}
