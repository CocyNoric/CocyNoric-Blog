import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { GalleryItem, ThumbnailAspectRatio } from '../../shared/schemas.js';

type ThumbnailFocus = GalleryItem['cardFocus'];
type Target = 'card' | 'thumbnail';

type ThumbnailFocalSelectorProps = {
  imageUrl: string;
  cardFocus: ThumbnailFocus;
  onCardFocusChange: (value: ThumbnailFocus) => void;
  cardAspectRatio: ThumbnailAspectRatio;
  onCardAspectRatioChange: (value: ThumbnailAspectRatio) => void;
  thumbnailFocus: ThumbnailFocus;
  onThumbnailFocusChange: (value: ThumbnailFocus) => void;
  thumbnailAspectRatio: ThumbnailAspectRatio;
  onThumbnailAspectRatioChange: (value: ThumbnailAspectRatio) => void;
};

const aspectRatioOptions: Array<{ value: ThumbnailAspectRatio; label: string }> = [
  { value: 'original', label: '原始' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '1:1', label: '1:1' },
  { value: '1:2', label: '1:2' },
  { value: '2:1', label: '2:1' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
];

function cssAspectRatio(value: ThumbnailAspectRatio, fallback = '4 / 3') {
  return value === 'original' ? fallback : value.replace(':', ' / ');
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function focusStyle(value: ThumbnailFocus) {
  return {
    '--focus-x': `${value.x * 100}%`,
    '--focus-y': `${value.y * 100}%`,
    '--focus-scale': 1 / value.size,
  } as CSSProperties;
}

export function ThumbnailFocalSelector({
  imageUrl,
  cardFocus,
  onCardFocusChange,
  cardAspectRatio,
  onCardAspectRatioChange,
  thumbnailFocus,
  onThumbnailFocusChange,
  thumbnailAspectRatio,
  onThumbnailAspectRatioChange,
}: ThumbnailFocalSelectorProps) {
  const headingId = useId();
  const targetRadioName = useId();
  const aspectRadioName = useId();
  const sourceRef = useRef<HTMLDivElement>(null);
  const [activeTarget, setActiveTarget] = useState<Target>('card');
  const [dragging, setDragging] = useState(false);
  const [naturalAspectRatio, setNaturalAspectRatio] = useState('4 / 3');
  const activeFocus = activeTarget === 'card' ? cardFocus : thumbnailFocus;
  const activeAspectRatio = activeTarget === 'card' ? cardAspectRatio : thumbnailAspectRatio;
  const onActiveFocusChange = activeTarget === 'card' ? onCardFocusChange : onThumbnailFocusChange;
  const onActiveAspectRatioChange = activeTarget === 'card' ? onCardAspectRatioChange : onThumbnailAspectRatioChange;
  const zoom = Math.round(100 / activeFocus.size);
  const isDefault = activeFocus.x === 0.5 && activeFocus.y === 0.5 && activeFocus.size === 1;
  const targetLabel = activeTarget === 'card' ? '卡片' : '缩略图';

  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = sourceRef.current?.getBoundingClientRect();
    if (!bounds) return;
    onActiveFocusChange({
      ...activeFocus,
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    });
  };

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    if (event.key === 'ArrowLeft') onActiveFocusChange({ ...activeFocus, x: clamp(activeFocus.x - step) });
    else if (event.key === 'ArrowRight') onActiveFocusChange({ ...activeFocus, x: clamp(activeFocus.x + step) });
    else if (event.key === 'ArrowUp') onActiveFocusChange({ ...activeFocus, y: clamp(activeFocus.y - step) });
    else if (event.key === 'ArrowDown') onActiveFocusChange({ ...activeFocus, y: clamp(activeFocus.y + step) });
    else return;
    event.preventDefault();
  };

  return <section className="thumbnail-focus-editor" aria-labelledby={headingId}>
    <div className="thumbnail-focus-heading">
      <div><h3 id={headingId}>缩略图设置</h3><p>选择一个显示目标，再在原图上调整主体位置和显示比例。</p></div>
      <button type="button" className="button text-button reset-default-button" disabled={isDefault} onClick={() => onActiveFocusChange({ x: 0.5, y: 0.5, size: 1 })}>恢复默认</button>
    </div>
    <div className="thumbnail-focus-workspace">
      <div className="thumbnail-focus-source-panel">
        <span className="thumbnail-focus-label">选择主体位置 · {targetLabel}</span>
        <div className="thumbnail-focus-source-canvas">
          <div
            ref={sourceRef}
            className={`thumbnail-focus-source${dragging ? ' is-dragging' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${targetLabel}主体位置：水平 ${Math.round(activeFocus.x * 100)}%，垂直 ${Math.round(activeFocus.y * 100)}%。可点击、拖动或使用方向键调整。`}
            onKeyDown={moveFocus}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(true);
              updateFromPointer(event);
            }}
            onPointerMove={(event) => { if (dragging) updateFromPointer(event); }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
              setDragging(false);
            }}
            onPointerCancel={() => setDragging(false)}
          >
            <img src={imageUrl} alt="" draggable="false" onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth && image.naturalHeight) setNaturalAspectRatio(`${image.naturalWidth} / ${image.naturalHeight}`);
            }} />
            <span className="thumbnail-focus-marker" style={{ left: `${activeFocus.x * 100}%`, top: `${activeFocus.y * 100}%` }} aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="thumbnail-focus-results">
        <div className="thumbnail-focus-target-switch" role="radiogroup" aria-label="缩略图显示目标">
          <span className="thumbnail-focus-label">调整目标</span>
          <div className="thumbnail-target-options">
            <label className={`thumbnail-target-option${activeTarget === 'card' ? ' is-selected' : ''}`}>
              <input type="radio" name={targetRadioName} value="card" checked={activeTarget === 'card'} onChange={() => setActiveTarget('card')} />
              <span>卡片</span>
            </label>
            <label className={`thumbnail-target-option${activeTarget === 'thumbnail' ? ' is-selected' : ''}`}>
              <input type="radio" name={targetRadioName} value="thumbnail" checked={activeTarget === 'thumbnail'} onChange={() => setActiveTarget('thumbnail')} />
              <span>缩略图</span>
            </label>
          </div>
        </div>
        <div className="thumbnail-aspect-settings">
          <span className="thumbnail-focus-label">{targetLabel}比例</span>
          <div className="thumbnail-aspect-options" role="radiogroup" aria-label={`${targetLabel}比例`}>
            {aspectRatioOptions.map((option) => <label className={`thumbnail-aspect-option${activeAspectRatio === option.value ? ' is-selected' : ''}`} key={option.value}>
              <input type="radio" name={aspectRadioName} value={option.value} checked={activeAspectRatio === option.value} onChange={() => onActiveAspectRatioChange(option.value)} />
              <span className="thumbnail-aspect-shape" style={{ aspectRatio: cssAspectRatio(option.value, naturalAspectRatio) }} aria-hidden="true" />
              <span>{option.label}</span>
            </label>)}
          </div>
        </div>
        <div className="thumbnail-focus-previews">
          <figure className={activeTarget === 'card' ? 'is-active' : undefined}>
            <div className="thumbnail-crop-preview card-preview" style={{ ...focusStyle(cardFocus), aspectRatio: cssAspectRatio(cardAspectRatio, naturalAspectRatio) }}><img src={imageUrl} alt="" /></div>
            <figcaption>画廊卡片 · {cardAspectRatio === 'original' ? '原始' : cardAspectRatio}</figcaption>
          </figure>
          <figure className={activeTarget === 'thumbnail' ? 'is-active' : undefined}>
            <div className="thumbnail-crop-preview rail-preview" style={{ ...focusStyle(thumbnailFocus), aspectRatio: cssAspectRatio(thumbnailAspectRatio, '1 / 1') }}><img src={imageUrl} alt="" /></div>
            <figcaption>信息栏缩略图 · {thumbnailAspectRatio === 'original' ? '原始' : thumbnailAspectRatio}</figcaption>
          </figure>
        </div>
        <div className="thumbnail-focus-controls">
          <label className="form-field"><span>水平位置：{Math.round(activeFocus.x * 100)}%</span><input className="range-input" type="range" min="0" max="100" value={Math.round(activeFocus.x * 100)} onChange={(event) => onActiveFocusChange({ ...activeFocus, x: Number(event.target.value) / 100 })} /></label>
          <label className="form-field"><span>垂直位置：{Math.round(activeFocus.y * 100)}%</span><input className="range-input" type="range" min="0" max="100" value={Math.round(activeFocus.y * 100)} onChange={(event) => onActiveFocusChange({ ...activeFocus, y: Number(event.target.value) / 100 })} /></label>
          <label className="form-field"><span>{targetLabel}缩放：{zoom}%</span><input className="range-input" type="range" min="100" max="1000" step="10" value={zoom} onChange={(event) => onActiveFocusChange({ ...activeFocus, size: 100 / Number(event.target.value) })} /></label>
        </div>
      </div>
    </div>
  </section>;
}
