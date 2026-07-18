import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { galleryInputSchema, postInputSchema, previewSchema, settingsSchema } from '../../shared/schemas.js';
import { requireAuth, requireWriteProtection } from '../auth.js';
import { dataStore } from '../dataStore.js';
import { receiveImage } from '../media.js';
import { receivePostImport } from '../postImport.js';
import { renderMarkdown } from '../markdown.js';

export const adminRouter = Router();

adminRouter.use(requireAuth);

adminRouter.get('/posts', async (_req, res, next) => {
  try {
    res.json(await dataStore.listPosts(true));
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/posts/:id', async (req, res, next) => {
  try {
    const post = await dataStore.getPostById(req.params.id);
    if (!post) {
      res.status(404).json({ error: '文章不存在' });
      return;
    }
    res.json(post);
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/preview', requireWriteProtection, async (req, res, next) => {
  try {
    const input = previewSchema.parse(req.body);
    res.json({ html: await renderMarkdown(input.markdown) });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/posts/import', requireWriteProtection, async (req, res, next) => {
  try {
    res.status(201).json(await receivePostImport(req));
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/posts', requireWriteProtection, async (req, res, next) => {
  try {
    res.status(201).json(await dataStore.savePost(postInputSchema.parse(req.body)));
  } catch (error) {
    next(error);
  }
});

adminRouter.put('/posts/:id', requireWriteProtection, async (req, res, next) => {
  try {
    const input = postInputSchema.parse({ ...req.body, id: req.params.id });
    res.json(await dataStore.savePost(input));
  } catch (error) {
    next(error);
  }
});

adminRouter.delete('/posts/:id', requireWriteProtection, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string' || !(await dataStore.deletePost(id))) {
      res.status(404).json({ error: '文章不存在' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/settings', async (_req, res, next) => {
  try {
    res.json(await dataStore.readSettings());
  } catch (error) {
    next(error);
  }
});

adminRouter.put('/settings', requireWriteProtection, async (req, res, next) => {
  try {
    res.json(await dataStore.writeSettings(settingsSchema.parse(req.body)));
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/media', requireWriteProtection, async (req, res, next) => {
  try {
    const upload = await receiveImage(req);
    res.status(201).json({ url: upload.url });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/gallery', requireWriteProtection, async (req, res, next) => {
  let upload: Awaited<ReturnType<typeof receiveImage>> | null = null;
  try {
    upload = await receiveImage(req);
    const input = galleryInputSchema.parse(upload.fields);
    res.status(201).json(await dataStore.addGalleryItem({ ...input, url: upload.url }));
  } catch (error) {
    if (upload) await unlink(upload.filePath).catch(() => undefined);
    next(error);
  }
});

adminRouter.put('/gallery/:id', requireWriteProtection, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string') {
      res.status(404).json({ error: '图片不存在' });
      return;
    }
    const item = await dataStore.updateGalleryItem(id, galleryInputSchema.parse(req.body));
    if (!item) {
      res.status(404).json({ error: '图片不存在' });
      return;
    }
    res.json(item);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete('/gallery/:id', requireWriteProtection, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string') {
      res.status(404).json({ error: '图片不存在' });
      return;
    }
    const item = await dataStore.deleteGalleryItem(id);
    if (!item) {
      res.status(404).json({ error: '图片不存在' });
      return;
    }
    await unlink(path.join(dataStore.paths.media, path.basename(item.url))).catch(() => undefined);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/settings/media/:kind', requireWriteProtection, async (req, res, next) => {
  try {
    const kind = req.params.kind;
    if (kind !== 'avatar' && kind !== 'background') {
      res.status(400).json({ error: '媒体类型无效' });
      return;
    }
    const upload = await receiveImage(req);
    const current = await dataStore.readSettings();
    const key = kind === 'avatar' ? 'avatar' : 'backgroundImage';
    try {
      const settings = await dataStore.writeSettings({ ...current, [key]: upload.url });
      res.json(settings);
    } catch (error) {
      await unlink(upload.filePath).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    next(error);
  }
});
