export function categoryAccent(category: string) {
  const root = category.split('/')[0] ?? category;
  return [...root].reduce((total, character) => total + (character.codePointAt(0) ?? 0), 0) % 5;
}
