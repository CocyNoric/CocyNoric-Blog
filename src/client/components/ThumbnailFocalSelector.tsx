import { useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { centeredCropFocus, cropAspectRatio } from '../../shared/galleryCrop.js';
import type { GalleryItem, ThumbnailAspectRatio } from '../../shared/schemas.js';
import { GalleryCropImage } from './GalleryCropImage.js';

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
  cropPositioning?: GalleryItem['cropPositioning'];
  onCropChange?: () => void;
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
  cropPositioning = 'center',
  onCropChange,
}: ThumbnailFocalSelectorProps) {
  const headingId = useId();
  const targetRadioName = useId();
  const aspectRadioName = useId();
  const sourceRef = useRef<HTMLDivElement>(null);
  const [activeTarget, setActiveTarget] = useState<Target>('card');
  const [dragging, setDragging] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 4, height: 3 });
  const activeFocus = activeTarget === 'card' ? cardFocus : thumbnailFocus;
  const activeAspectRatio = activeTarget === 'card' ? cardAspectRatio : thumbnailAspectRatio;
  const onActiveFocusChange = activeTarget === 'card' ? onCardFocusChange : onThumbnailFocusChange;
  const onActiveAspectRatioChange = activeTarget === 'card' ? onCardAspectRatioChange : onThumbnailAspectRatioChange;
  const targetAspectRatio = cropAspectRatio(activeAspectRatio, naturalSize.width, naturalSize.height, activeTarget === 'thumbnail' ? 1 : 4 / 3);
  const effectiveFocus = centeredCropFocus(activeFocus, naturalSize.width, naturalSize.height, targetAspectRatio);
  const updateFocus = (value: ThumbnailFocus) => {
    onActiveFocusChange(centeredCropFocus(value, naturalSize.width, naturalSize.height, targetAspectRatio));
    onCropChange?.();
  };
  const updateAspectRatio = (value: ThumbnailAspectRatio) => {
    const nextAspectRatio = cropAspectRatio(value, naturalSize.width, naturalSize.height, activeTarget === 'thumbnail' ? 1 : 4 / 3);
    onActiveFocusChange(centeredCropFocus(activeFocus, naturalSize.width, naturalSize.height, nextAspectRatio));
    onActiveAspectRatioChange(value);
    onCropChange?.();
  };
  const previewCropPositioning = cropPositioning;
  const zoom = Math.round(100 / effectiveFocus.size);
  const isDefault = effectiveFocus.x === 0.5 && effectiveFocus.y === 0.5 && effectiveFocus.size === 1;
  const targetLabel = activeTarget === 'card' ? '卡片' : '缩略图';

  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = sourceRef.current?.getBoundingClientRect();
    if (!bounds) return;
    updateFocus({
      ...activeFocus,
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    });
  };

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    if (event.key === 'ArrowLeft') updateFocus({ ...activeFocus, x: activeFocus.x - step });
    else if (event.key === 'ArrowRight') updateFocus({ ...activeFocus, x: activeFocus.x + step });
    else if (event.key === 'ArrowUp') updateFocus({ ...activeFocus, y: activeFocus.y - step });
    else if (event.key === 'ArrowDown') updateFocus({ ...activeFocus, y: activeFocus.y + step });
    else return;
    event.preventDefault();
  };

  return <section className="thumbnail-focus-editor" aria-labelledby={headingId}>
    <div className="thumbnail-focus-heading">
      <div><h3 id={headingId}>缩略图设置</h3><p>选择显示目标，再在原图上调整裁剪中心和显示比例。</p></div>
      <button type="button" className="button text-button reset-default-button" disabled={isDefault} onClick={() => updateFocus({ x: 0.5, y: 0.5, size: 1 })}>恢复默认</button>
    </div>
    <div className="thumbnail-focus-workspace">
      <div className="thumbnail-focus-source-panel">
        <span className="thumbnail-focus-label">选择裁剪中心 · {targetLabel}</span>
        <div className="thumbnail-focus-source-canvas">
          <div
            ref={sourceRef}
            className={`thumbnail-focus-source${dragging ? ' is-dragging' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${targetLabel}裁剪中心：水平 ${Math.round(effectiveFocus.x * 100)}%，垂直 ${Math.round(effectiveFocus.y * 100)}%。可点击、拖动或使用方向键调整。`}
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
              if (image.naturalWidth && image.naturalHeight) setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
            }} />
            <span className="thumbnail-focus-marker" style={{ left: `${effectiveFocus.x * 100}%`, top: `${effectiveFocus.y * 100}%` }} aria-hidden="true" />
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
              <input type="radio" name={aspectRadioName} value={option.value} checked={activeAspectRatio === option.value} onChange={() => updateAspectRatio(option.value)} />
              <span className="thumbnail-aspect-shape" style={{ aspectRatio: cssAspectRatio(option.value, `${naturalSize.width} / ${naturalSize.height}`) }} aria-hidden="true" />
              <span>{option.label}</span>
            </label>)}
          </div>
        </div>
        <div className="thumbnail-focus-previews">
          <figure className={activeTarget === 'card' ? 'is-active' : undefined}>
            <div className="thumbnail-crop-preview"><GalleryCropImage className="thumbnail-crop-image" src={imageUrl} alt="" focus={cardFocus} aspectRatio={cardAspectRatio} cropPositioning={previewCropPositioning} width={naturalSize.width} height={naturalSize.height} /></div>
            <figcaption>画廊卡片 · {cardAspectRatio === 'original' ? '原始' : cardAspectRatio}</figcaption>
          </figure>
          <figure className={activeTarget === 'thumbnail' ? 'is-active' : undefined}>
            <div className="thumbnail-crop-preview"><GalleryCropImage className="thumbnail-crop-image" src={imageUrl} alt="" focus={thumbnailFocus} aspectRatio={thumbnailAspectRatio} cropPositioning={previewCropPositioning} width={naturalSize.width} height={naturalSize.height} fallbackAspectRatio={1} /></div>
            <figcaption>信息栏缩略图 · {thumbnailAspectRatio === 'original' ? '原始' : thumbnailAspectRatio}</figcaption>
          </figure>
        </div>
        <div className="thumbnail-focus-controls">
          <label className="form-field"><span>水平中心：{Math.round(effectiveFocus.x * 100)}%</span><input className="range-input" type="range" min="0" max="100" value={Math.round(effectiveFocus.x * 100)} onChange={(event) => updateFocus({ ...activeFocus, x: Number(event.target.value) / 100 })} /></label>
          <label className="form-field"><span>垂直中心：{Math.round(effectiveFocus.y * 100)}%</span><input className="range-input" type="range" min="0" max="100" value={Math.round(effectiveFocus.y * 100)} onChange={(event) => updateFocus({ ...activeFocus, y: Number(event.target.value) / 100 })} /></label>
          <label className="form-field"><span>{targetLabel}缩放：{zoom}%</span><input className="range-input" type="range" min="100" max="1000" step="10" value={zoom} onChange={(event) => updateFocus({ ...activeFocus, size: 100 / Number(event.target.value) })} /></label>
        </div>
      </div>
    </div>
  </section>;
}
