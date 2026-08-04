import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryDisplayName, categoryIncludes, normalizeCategoryPath, summarizeCategoryPaths } from '../src/shared/categories.js';

test('normalizes and displays hierarchical category paths', () => {
  assert.equal(normalizeCategoryPath(' 技术 ／ 前端 / React '), '技术/前端/React');
  assert.equal(normalizeCategoryPath(''), '未分类');
  assert.equal(categoryDisplayName('技术/前端/React'), '技术 / 前端 / React');
});

test('matches parent categories and summarizes descendant counts', () => {
  assert.equal(categoryIncludes('技术/前端/React', '技术'), true);
  assert.equal(categoryIncludes('技术/前端/React', '技术/前端'), true);
  assert.equal(categoryIncludes('技术/后端', '技术/前端'), false);

  const summaries = summarizeCategoryPaths(['技术/前端/React', '技术/前端/Vue', '技术/后端', '未分类']);
  const byPath = new Map(summaries.map((summary) => [summary.path, summary]));
  assert.deepEqual(byPath.get('技术'), { path: '技术', label: '技术', depth: 0, count: 3 });
  assert.deepEqual(byPath.get('技术/前端'), { path: '技术/前端', label: '前端', depth: 1, count: 2 });
  assert.deepEqual(byPath.get('技术/前端/React'), { path: '技术/前端/React', label: 'React', depth: 2, count: 1 });
  assert.deepEqual(byPath.get('未分类'), { path: '未分类', label: '未分类', depth: 0, count: 1 });
});
