import { useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties } from 'react';
import type { GalleryItem } from '../../shared/schemas.js';

type ThumbnailFocus = GalleryItem['thumbnailFocus'];

type ThumbnailFocalSelectorProps = {
  imageUrl: string;
  value: ThumbnailFocus;
  onChange: (value: ThumbnailFocus) => void;
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function ThumbnailFocalSelector({ imageUrl, value, onChange }: ThumbnailFocalSelectorProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = previewRef.current?.getBoundingClientRect();
    if (!bounds) return;
    onChange({
      ...value,
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    });
  };

  return <div className="thumbnail-focus-editor">
    <div
      ref={previewRef}
      className={`thumbnail-focus-preview${dragging ? ' is-dragging' : ''}`}
      style={{ '--focus-x': `${value.x * 100}%`, '--focus-y': `${value.y * 100}%`, '--focus-scale': 1 / value.size } as CSSProperties}
      role="img"
      aria-label="缩略图裁切预览，可点击或拖动调整主体位置"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        updateFromPointer(event);
      }}
      onPointerMove={(event) => { if (dragging) updateFromPointer(event); }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDragging(false);
      }}
      onPointerCancel={() => setDragging(false)}
    >
      <img src={imageUrl} alt="" draggable="false" />
      <span className="thumbnail-focus-reticle" aria-hidden="true" />
    </div>
    <div className="thumbnail-focus-controls">
      <label className="form-field"><span>水平焦点：{Math.round(value.x * 100)}%</span><input type="range" min="0" max="100" value={Math.round(value.x * 100)} onChange={(event) => onChange({ ...value, x: Number(event.target.value) / 100 })} /></label>
      <label className="form-field"><span>垂直焦点：{Math.round(value.y * 100)}%</span><input type="range" min="0" max="100" value={Math.round(value.y * 100)} onChange={(event) => onChange({ ...value, y: Number(event.target.value) / 100 })} /></label>
      <label className="form-field"><span>裁切范围：{Math.round(value.size * 100)}%</span><input type="range" min="10" max="100" value={Math.round(value.size * 100)} onChange={(event) => onChange({ ...value, size: Number(event.target.value) / 100 })} /></label>
    </div>
    <button type="button" className="button text-button" onClick={() => onChange({ x: 0.5, y: 0.5, size: 1 })}>恢复默认</button>
  </div>;
}
