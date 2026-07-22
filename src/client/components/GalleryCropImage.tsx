import type { CSSProperties } from 'react';
import { centeredCropGeometry, cropAspectRatio } from '../../shared/galleryCrop.js';
import type { GalleryItem, ThumbnailAspectRatio } from '../../shared/schemas.js';

type GalleryCropImageProps = {
  src: string;
  alt: string;
  className?: string;
  focus: GalleryItem['cardFocus'];
  aspectRatio: ThumbnailAspectRatio;
  cropPositioning: GalleryItem['cropPositioning'];
  width?: number;
  height?: number;
  fallbackAspectRatio?: number;
  loading?: 'eager' | 'lazy';
};

export function galleryCropAspectRatio(value: ThumbnailAspectRatio, width?: number, height?: number, fallback = 4 / 3) {
  return cropAspectRatio(value, width, height, fallback);
}

export function GalleryCropImage({
  src,
  alt,
  className,
  focus,
  aspectRatio,
  cropPositioning,
  width,
  height,
  fallbackAspectRatio = 4 / 3,
  loading,
}: GalleryCropImageProps) {
  const resolvedAspectRatio = galleryCropAspectRatio(aspectRatio, width, height, fallbackAspectRatio);
  if (cropPositioning === 'legacy' || !width || !height) {
    return <span className={`gallery-crop-frame${className ? ` ${className}` : ''}`} style={{ aspectRatio: String(resolvedAspectRatio) }}>
      <img src={src} alt={alt} loading={loading} style={{ objectPosition: `${focus.x * 100}% ${focus.y * 100}%`, transform: `scale(${1 / focus.size})`, transformOrigin: `${focus.x * 100}% ${focus.y * 100}%` } as CSSProperties} />
    </span>;
  }

  const geometry = centeredCropGeometry(focus, width, height, resolvedAspectRatio);
  return <span className={`gallery-crop-frame${className ? ` ${className}` : ''}`} style={{ aspectRatio: String(resolvedAspectRatio) }}>
    <img
      src={src}
      alt={alt}
      loading={loading}
      style={{
        width: `${geometry.imageWidth / geometry.aspectRatio * 100}%`,
        height: `${geometry.imageHeight * 100}%`,
        left: `${geometry.left / geometry.aspectRatio * 100}%`,
        top: `${geometry.top * 100}%`,
      }}
    />
  </span>;
}
