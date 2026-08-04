import { uncategorizedCategory } from './categories.js';

type GalleryTagSource = {
  category?: string;
  tags?: readonly string[];
};

export type GalleryTagSummary = {
  tag: string;
  count: number;
};

function tagKey(tag: string) {
  return tag.toLocaleLowerCase('zh-CN');
}

export function galleryTagsForItem(item: GalleryTagSource) {
  const values = [
    ...(item.tags ?? []),
    ...(item.category && item.category !== uncategorizedCategory ? [item.category] : []),
  ];
  const seen = new Set<string>();
  return values.map((tag) => tag.trim()).filter((tag) => {
    const key = tagKey(tag);
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function galleryCategoryFromTags(tags: readonly string[]) {
  return tags.find((tag) => tag.trim())?.trim() ?? uncategorizedCategory;
}

export function galleryIncludesTag(item: GalleryTagSource, activeTag: string) {
  const key = tagKey(activeTag.trim());
  return !key || galleryTagsForItem(item).some((tag) => tagKey(tag) === key);
}

export function summarizeGalleryTags(items: readonly GalleryTagSource[]): GalleryTagSummary[] {
  const summaries = new Map<string, GalleryTagSummary>();
  for (const item of items) {
    for (const tag of galleryTagsForItem(item)) {
      const key = tagKey(tag);
      const current = summaries.get(key);
      if (current) current.count += 1;
      else summaries.set(key, { tag, count: 1 });
    }
  }
  return [...summaries.values()].sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag, 'zh-CN'));
}
