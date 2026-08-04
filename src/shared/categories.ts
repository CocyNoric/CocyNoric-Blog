export const uncategorizedCategory = '未分类';
export const maximumCategoryDepth = 4;
export const maximumCategorySegmentLength = 32;

export type CategorySummary = {
  path: string;
  label: string;
  depth: number;
  count: number;
};

export function categorySegments(path: string) {
  return path.split('/').map((segment) => segment.trim()).filter(Boolean);
}

export function normalizeCategoryPath(path: string) {
  const segments = categorySegments(path.replaceAll('／', '/'));
  return segments.length ? segments.join('/') : uncategorizedCategory;
}

export function categoryDisplayName(path: string) {
  return categorySegments(path).join(' / ') || uncategorizedCategory;
}

export function categoryLeafName(path: string) {
  return categorySegments(path).at(-1) ?? uncategorizedCategory;
}

export function categoryIncludes(path: string, selectedPath: string) {
  return !selectedPath || path === selectedPath || path.startsWith(`${selectedPath}/`);
}

export function summarizeCategoryPaths(paths: string[]): CategorySummary[] {
  const counts = new Map<string, number>();
  for (const rawPath of paths) {
    const segments = categorySegments(normalizeCategoryPath(rawPath));
    segments.forEach((_segment, index) => {
      const path = segments.slice(0, index + 1).join('/');
      counts.set(path, (counts.get(path) ?? 0) + 1);
    });
  }

  return [...counts].map(([path, count]) => {
    const segments = categorySegments(path);
    return { path, label: segments.at(-1) ?? uncategorizedCategory, depth: segments.length - 1, count };
  }).sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'));
}
