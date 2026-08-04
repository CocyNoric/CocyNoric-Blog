export type ListingViewMode = 'grid' | 'showcase';

export type ShowcaseStep = -1 | 0 | 1;

export function parseListingViewMode(value: string | null): ListingViewMode {
  return value === 'showcase' ? 'showcase' : 'grid';
}

export function parseListingRailPreference(value: string | null) {
  return value === 'open';
}

export function stepShowcaseIndex(current: number, step: ShowcaseStep, itemCount: number) {
  if (itemCount <= 0) return 0;
  return Math.min(itemCount - 1, Math.max(0, current + step));
}

export function swipeShowcaseStep(deltaX: number, deltaY: number, threshold = 48): ShowcaseStep {
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY)) return 0;
  return deltaX < 0 ? 1 : -1;
}
