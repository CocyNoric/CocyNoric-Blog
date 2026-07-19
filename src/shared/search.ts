export function matchesGalleryTitle(title: string, query: string) {
  const needle = query.trim().toLocaleLowerCase('zh-CN');
  return !needle || title.toLocaleLowerCase('zh-CN').includes(needle);
}
