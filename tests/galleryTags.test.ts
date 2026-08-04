import assert from 'node:assert/strict';
import test from 'node:test';
import { galleryCategoryFromTags, galleryIncludesTag, galleryTagsForItem, summarizeGalleryTags } from '../src/shared/galleryTags.js';

test('treats legacy gallery categories and tags as one tag set', () => {
  assert.deepEqual(galleryTagsForItem({ category: 'Noric', tags: ['noric', '插画'] }), ['noric', '插画']);
  assert.deepEqual(galleryTagsForItem({ category: '旧分类', tags: [] }), ['旧分类']);
  assert.deepEqual(galleryTagsForItem({ category: '未分类', tags: [] }), []);
  assert.equal(galleryCategoryFromTags([' 插画 ', '人物']), '插画');
  assert.equal(galleryCategoryFromTags([]), '未分类');
});

test('filters and summarizes gallery tags without duplicate counts', () => {
  const items = [
    { category: 'Noric', tags: ['Noric', '人物'] },
    { category: '未分类', tags: ['人物', '蓝色'] },
    { category: '风景', tags: [] },
  ];
  assert.equal(galleryIncludesTag(items[0], 'noric'), true);
  assert.equal(galleryIncludesTag(items[0], '蓝色'), false);
  assert.deepEqual(summarizeGalleryTags(items), [
    { tag: '人物', count: 2 },
    { tag: '风景', count: 1 },
    { tag: '蓝色', count: 1 },
    { tag: 'Noric', count: 1 },
  ]);
});
