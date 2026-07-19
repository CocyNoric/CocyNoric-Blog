import { Router } from 'express';
import { dataStore } from '../dataStore.js';
import { renderMarkdown } from '../markdown.js';
import { createThemeTokens } from '../theme.js';
import { matchesGalleryTitle } from '../../shared/search.js';

export const publicRouter = Router();

publicRouter.get('/settings', async (_req, res, next) => {
  try {
    const settings = await dataStore.readSettings();
    res.json({ ...settings, themes: createThemeTokens(settings.seedColor) });
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/gallery', async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const items = await dataStore.listGallery();
    res.json(query ? items.filter((item) => matchesGalleryTitle(item.title, query)) : items);
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/gallery/:id', async (req, res, next) => {
  try {
    const item = await dataStore.getGalleryItem(req.params.id);
    if (!item) {
      res.status(404).json({ error: '图片不存在' });
      return;
    }
    res.json(item);
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/posts', async (req, res, next) => {
  try {
    const tag = typeof req.query.tag === 'string' ? req.query.tag : '';
    const query = typeof req.query.q === 'string' ? req.query.q.trim().toLocaleLowerCase('zh-CN') : '';
    const posts = (await dataStore.listPosts()).filter((post) => {
      const hasTag = !tag || post.tags.includes(tag);
      const text = `${post.title} ${post.excerpt} ${post.tags.join(' ')}`.toLocaleLowerCase('zh-CN');
      return hasTag && (!query || text.includes(query));
    }).map(({ markdown: _markdown, version: _version, ...post }) => post);
    res.json(posts);
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/posts/:slug', async (req, res, next) => {
  try {
    const post = await dataStore.getPostBySlug(req.params.slug);
    if (!post) {
      res.status(404).json({ error: '文章不存在' });
      return;
    }
    const { markdown, version: _version, ...meta } = post;
    res.json({ ...meta, html: await renderMarkdown(markdown) });
  } catch (error) {
    next(error);
  }
});
