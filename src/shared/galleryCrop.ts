import type { ThumbnailAspectRatio } from './schemas.js';

export type CropFocus = {
  x: number;
  y: number;
  size: number;
};

export type CenteredCropGeometry = {
  aspectRatio: number;
  focus: CropFocus;
  imageWidth: number;
  imageHeight: number;
  left: number;
  top: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function cropAspectRatio(value: ThumbnailAspectRatio, width?: number, height?: number, fallback = 4 / 3) {
  if (value === 'original') return width && height ? width / height : fallback;
  const [numerator, denominator] = value.split(':').map(Number);
  return numerator && denominator ? numerator / denominator : fallback;
}

export function centeredCropFocus(focus: CropFocus, sourceWidth: number, sourceHeight: number, targetAspectRatio: number): CropFocus {
  const safeWidth = Math.max(sourceWidth, 1);
  const safeHeight = Math.max(sourceHeight, 1);
  const aspectRatio = Math.max(targetAspectRatio, Number.EPSILON);
  const zoom = 1 / clamp(focus.size, 0.1, 1);
  const scale = Math.max(aspectRatio / safeWidth, 1 / safeHeight) * zoom;
  const visibleWidth = Math.min(safeWidth, aspectRatio / scale);
  const visibleHeight = Math.min(safeHeight, 1 / scale);
  const centerX = clamp(focus.x * safeWidth, visibleWidth / 2, safeWidth - visibleWidth / 2);
  const centerY = clamp(focus.y * safeHeight, visibleHeight / 2, safeHeight - visibleHeight / 2);

  return { x: centerX / safeWidth, y: centerY / safeHeight, size: clamp(focus.size, 0.1, 1) };
}

export function centeredCropGeometry(focus: CropFocus, sourceWidth: number, sourceHeight: number, targetAspectRatio: number): CenteredCropGeometry {
  const safeWidth = Math.max(sourceWidth, 1);
  const safeHeight = Math.max(sourceHeight, 1);
  const aspectRatio = Math.max(targetAspectRatio, Number.EPSILON);
  const effectiveFocus = centeredCropFocus(focus, safeWidth, safeHeight, aspectRatio);
  const scale = Math.max(aspectRatio / safeWidth, 1 / safeHeight) / effectiveFocus.size;
  const imageWidth = safeWidth * scale;
  const imageHeight = safeHeight * scale;
  const left = aspectRatio / 2 - effectiveFocus.x * safeWidth * scale;
  const top = .5 - effectiveFocus.y * safeHeight * scale;

  return { aspectRatio, focus: effectiveFocus, imageWidth, imageHeight, left, top };
}
