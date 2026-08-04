import { Router } from 'express';
import { dataStore } from '../dataStore.js';
import { renderMarkdown } from '../markdown.js';
import { createThemeTokens } from '../theme.js';
import { matchesGalleryTitle } from '../../shared/search.js';
import { categoryIncludes } from '../../shared/categories.js';
import { galleryIncludesTag } from '../../shared/galleryTags.js';
import { serveCodeToolDownload, serveCodeToolProjectArchiveDownload, serveCodeToolProjectDownload } from '../codeTools.js';
import { repositoryOverview, repositoryTree } from '../repositoryStore.js';
import { archiveCapacityGuard, archiveDownloadLimiter } from '../archiveProtection.js';
import type { AdminPost } from '../../shared/types.js';

export const publicRouter = Router();

async function publicSettings() {
  const settings = await dataStore.readSettings();
  return { ...settings, themes: createThemeTokens(settings.seedColor) };
}

function postSummary<T extends { markdown: string; version: string }>(post: T) {
  const { markdown: _markdown, version: _version, ...summary } = post;
  return summary;
}

const renderedPostCache = new Map<string, { version: string; html: string }>();

async function publicPost(post: AdminPost) {
  let rendered = renderedPostCache.get(post.id);
  if (!rendered || rendered.version !== post.version) {
    rendered = { version: post.version, html: await renderMarkdown(post.markdown) };
    renderedPostCache.delete(post.id);
    renderedPostCache.set(post.id, rendered);
    if (renderedPostCache.size > 128) renderedPostCache.delete(renderedPostCache.keys().next().value!);
  }
  const { markdown: _markdown, version: _version, ...meta } = post;
  return { ...meta, html: rendered.html };
}

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
    res.json(await publicSettings());
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/home', async (_req, res, next) => {
  try {
    const settings = await publicSettings();
    const [posts, gallery] = await Promise.all([
      settings.contentVisibility.articles ? dataStore.listPosts() : Promise.resolve([]),
      settings.contentVisibility.gallery ? dataStore.listGallery() : Promise.resolve([]),
    ]);
    res.json({
      settings,
      posts: posts.slice(0, settings.homeContent.articleLimit).map(postSummary),
      gallery: gallery.slice(0, settings.homeContent.galleryLimit),
    });
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/gallery', async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const tag = typeof req.query.tag === 'string' ? req.query.tag : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const items = await dataStore.listGallery();
    res.json(items.filter((item) => (tag ? galleryIncludesTag(item, tag) : categoryIncludes(item.category, category)) && (!query || matchesGalleryTitle(item.title, query))));
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/gallery/:id/context', async (req, res, next) => {
  try {
    const settings = await dataStore.readSettings();
    const config = settings.browsing.gallery;
    const [gallery, posts] = await Promise.all([
      dataStore.listGallery(),
      config.showRecentPosts && settings.contentVisibility.articles ? dataStore.listPosts() : Promise.resolve([]),
    ]);
    const item = gallery.find((candidate) => candidate.id === req.params.id || candidate.legacyId === req.params.id);
    if (!item) {
      res.status(404).json({ error: '画廊展示不存在' });
      return;
    }
    const visibleGallery = gallery.slice(0, config.recentGalleryLimit);
    const galleryItems = config.showRecentGallery
      ? (visibleGallery.some((candidate) => candidate.id === item.id)
        ? visibleGallery
        : [...visibleGallery.slice(0, Math.max(0, config.recentGalleryLimit - 1)), item])
      : undefined;
    res.json({
      item,
      recentPosts: config.showRecentPosts && settings.contentVisibility.articles
        ? posts.slice(0, config.recentPostsLimit).map(postSummary)
        : undefined,
      galleryItems,
    });
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
    }).map(postSummary);
    res.json(posts);
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/posts/:slug/context', async (req, res, next) => {
  try {
    const settings = await dataStore.readSettings();
    const config = settings.browsing.article;
    const [posts, gallery] = await Promise.all([
      dataStore.listPosts(),
      config.showRecentGallery && settings.contentVisibility.gallery ? dataStore.listGallery() : Promise.resolve([]),
    ]);
    const post = posts.find((candidate) => candidate.slug === req.params.slug);
    if (!post) {
      res.status(404).json({ error: '文章不存在' });
      return;
    }
    res.json({
      post: await publicPost(post),
      recentPosts: config.showRecentPosts
        ? posts.filter((candidate) => candidate.id !== post.id).slice(0, config.recentPostsLimit).map(postSummary)
        : undefined,
      galleryItems: config.showRecentGallery && settings.contentVisibility.gallery
        ? gallery.slice(0, config.recentGalleryLimit)
        : undefined,
    });
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
    res.json(await publicPost(post));
  } catch (error) {
    next(error);
  }
});
