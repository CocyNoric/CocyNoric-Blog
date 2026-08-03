import { Router } from 'express';
import { dataStore } from '../dataStore.js';
import { renderMarkdown } from '../markdown.js';
import { createThemeTokens } from '../theme.js';
import { matchesGalleryTitle } from '../../shared/search.js';
import { categoryIncludes } from '../../shared/categories.js';
import { serveCodeToolDownload, serveCodeToolProjectArchiveDownload, serveCodeToolProjectDownload } from '../codeTools.js';
import { repositoryOverview, repositoryTree } from '../repositoryStore.js';
import { archiveCapacityGuard, archiveDownloadLimiter } from '../archiveProtection.js';

export const publicRouter = Router();

function publicCodeTool(item: Awaited<ReturnType<typeof dataStore.listCodeTools>>[number]) {
  return {
    ...item,
    downloadUrl: `/api/repository/code-tools/${item.id}/download/${encodeURIComponent(item.originalFilename)}`,
  };
}

publicRouter.get('/repository', async (_req, res, next) => {
  try {
    res.json(await repositoryOverview());
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/repository/tree/:area', async (req, res, next) => {
  try {
    const pathname = typeof req.query.path === 'string' ? req.query.path : undefined;
    res.json(await repositoryTree(req.params.area, pathname));
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/repository/code-tools', async (_req, res, next) => {
  try {
    res.json((await dataStore.listCodeTools()).map(publicCodeTool));
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/repository/code-tools/projects/:slug/archive', archiveDownloadLimiter, archiveCapacityGuard, async (req, res, next) => {
  try { await serveCodeToolProjectArchiveDownload(req, res); } catch (error) { next(error); }
});
publicRouter.get('/repository/code-tools/projects/:slug/download/*path', async (req, res, next) => {
  try { await serveCodeToolProjectDownload(req, res); } catch (error) { next(error); }
});
publicRouter.get('/repository/code-tools/:id/download/:filename', async (req, res, next) => {
  try {
    await serveCodeToolDownload(req, res);
  } catch (error) {
    next(error);
  }
});

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
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const items = await dataStore.listGallery();
    res.json(items.filter((item) => categoryIncludes(item.category, category) && (!query || matchesGalleryTitle(item.title, query))));
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/gallery/:id', async (req, res, next) => {
  try {
    const item = await dataStore.getGalleryItem(req.params.id);
    if (!item) {
      res.status(404).json({ error: '画廊展示不存在' });
      return;
    }
    res.json(item);
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/posts', async (req, res, next) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const query = typeof req.query.q === 'string' ? req.query.q.trim().toLocaleLowerCase('zh-CN') : '';
    const posts = (await dataStore.listPosts()).filter((post) => {
      const hasCategory = categoryIncludes(post.category, category);
      const text = `${post.title} ${post.excerpt} ${post.category}`.toLocaleLowerCase('zh-CN');
      return hasCategory && (!query || text.includes(query));
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
