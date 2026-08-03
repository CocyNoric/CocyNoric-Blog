import { rm, unlink } from 'node:fs/promises';
import { Router } from 'express';
import { galleryInputSchema, galleryOrderInputSchema, galleryUploadInputSchema, postInputSchema, previewSchema } from '../../shared/schemas.js';
import { requireAuth, requireWriteProtection } from '../auth.js';
import { config } from '../config.js';
import { dataStore } from '../dataStore.js';
import { receiveGalleryImages, receiveImage } from '../media.js';
import { receivePostImport } from '../postImport.js';
import { renderMarkdown } from '../markdown.js';
import { receiveCodeTool, receiveCodeToolProject } from '../codeTools.js';

export const adminRouter = Router();

adminRouter.use(requireAuth);

function adminProject(project: Awaited<ReturnType<typeof dataStore.listCodeToolProjects>>[number]) {
  return { kind: 'project' as const, ...project };
}

adminRouter.get('/repository/code-tools/projects', async (_req, res, next) => {
  try {
    const projects = await dataStore.listCodeToolProjects();
    const legacy = (await dataStore.listCodeTools()).map((item) => ({ kind: 'legacy' as const, id: item.id, slug: item.id, name: item.originalFilename, description: '', updatedAt: item.createdAt, fileCount: 1, totalBytes: item.size, downloadUrl: `/api/repository/code-tools/${item.id}/download/${encodeURIComponent(item.originalFilename)}` }));
    res.json([...projects.map(adminProject), ...legacy]);
  } catch (error) { next(error); }
});

adminRouter.get('/repository/code-tools/projects/:slug', async (req, res, next) => {
  try {
    const pathname = typeof req.query.path === 'string' ? req.query.path : '';
    const listing = await dataStore.codeToolProjectListing(req.params.slug, pathname);
    if (!listing) { res.status(404).json({ error: '项目不存在' }); return; }
    const entries = listing.entries.map((entry) => entry.kind === 'directory'
      ? { kind: 'directory' as const, name: entry.name, path: pathname ? `${pathname}/${entry.name}` : entry.name, icon: 'folder' as const, description: '', updatedAt: listing.project.updatedAt }
      : { kind: 'file' as const, name: entry.name, path: entry.file!.relativePath, icon: 'code' as const, description: '', updatedAt: entry.file!.updatedAt, size: entry.file!.size, mimeType: entry.file!.mimeType, href: `/api/repository/code-tools/projects/${encodeURIComponent(listing.project.slug)}/download/${entry.file!.relativePath.split('/').map(encodeURIComponent).join('/')}`, download: true });
    res.json({ project: adminProject(listing.project), path: pathname, parentPath: pathname.includes('/') ? pathname.slice(0, pathname.lastIndexOf('/')) : null, entries });
  } catch (error) { next(error); }
});

adminRouter.post('/repository/code-tools/projects', requireWriteProtection, async (req, res, next) => {
  let upload: Awaited<ReturnType<typeof receiveCodeToolProject>> | null = null;
  try {
    upload = await receiveCodeToolProject(req);
    const project = await dataStore.addCodeToolProject(upload);
    upload = null;
    res.status(201).json(adminProject(project));
  } catch (error) {
    if (upload) await rm(upload.temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    next(error);
  }
});

adminRouter.delete('/repository/code-tools/projects/:slug', requireWriteProtection, async (req, res, next) => {
  try {
    const slug = req.params.slug;
    if (typeof slug !== 'string' || !(await dataStore.deleteCodeToolProject(slug))) { res.status(404).json({ error: '项目不存在' }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});
adminRouter.delete('/repository/code-tools/projects/:slug/entries', requireWriteProtection, async (req, res, next) => {
  try {
    const slug = req.params.slug;
    const pathname = typeof req.query.path === 'string' ? req.query.path : null;
    if (typeof slug !== 'string' || !pathname) { res.status(400).json({ error: '请选择要删除的文件或文件夹' }); return; }
    const result = await dataStore.deleteCodeToolProjectEntry(slug, pathname);
    if (!result) { res.status(404).json({ error: '文件或文件夹不存在' }); return; }
    res.json({ kind: 'project' as const, ...result.project });
  } catch (error) { next(error); }
});

adminRouter.get('/repository/code-tools', async (_req, res, next) => {
  try {
    res.json((await dataStore.listCodeTools()).map((item) => ({
      ...item,
      downloadUrl: `/api/repository/code-tools/${item.id}/download/${encodeURIComponent(item.originalFilename)}`,
    })));
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/repository/code-tools', requireWriteProtection, async (req, res, next) => {
  let upload: Awaited<ReturnType<typeof receiveCodeTool>> | null = null;
  try {
    upload = await receiveCodeTool(req);
    const item = await dataStore.addCodeTool(upload);
    res.status(201).json({
      ...item,
      downloadUrl: `/api/repository/code-tools/${item.id}/download/${encodeURIComponent(item.originalFilename)}`,
    });
  } catch (error) {
    if (upload) await unlink(upload.temporaryPath).catch(() => undefined);
    next(error);
  }
});

adminRouter.delete('/repository/code-tools/:id', requireWriteProtection, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string' || !(await dataStore.deleteCodeTool(id))) {
      res.status(404).json({ error: '文件不存在' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

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
    res.json(await dataStore.writeSettings(req.body));
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/media', requireWriteProtection, async (req, res, next) => {
  let temporaryPath: string | null = null;
  try {
    const upload = await receiveImage(req, { fieldLimit: 1, preserveOriginal: true });
    temporaryPath = upload.temporaryPath;
    const postId = upload.fields.postId;
    if (!postId) throw Object.assign(new Error('请先保存文章，再插入图片'), { status: 400 });
    const saved = await dataStore.addPostImage(postId, upload.temporaryPath, upload.originalFilename);
    temporaryPath = null;
    res.status(201).json({ url: saved.url });
  } catch (error) {
    if (temporaryPath) await unlink(temporaryPath).catch(() => undefined);
    next(error);
  }
});

adminRouter.post('/gallery', requireWriteProtection, async (req, res, next) => {
  let temporaryPath: string | null = null;
  try {
    const upload = await receiveImage(req, { fieldLimit: 12, preserveOriginal: true, maximumBytes: config.galleryUploadLimit });
    temporaryPath = upload.temporaryPath;
    const { coverIndex: _coverIndex, ...input } = galleryUploadInputSchema.parse(upload.fields);
    const item = await dataStore.addGalleryItem({
      ...input,
      temporaryPath: upload.temporaryPath,
      originalFilename: upload.originalFilename,
      width: upload.width,
      height: upload.height,
    });
    temporaryPath = null;
    res.status(201).json(item);
  } catch (error) {
    if (temporaryPath) await unlink(temporaryPath).catch(() => undefined);
    next(error);
  }
});

adminRouter.post('/gallery/group', requireWriteProtection, async (req, res, next) => {
  let temporaryPaths: string[] = [];
  try {
    const upload = await receiveGalleryImages(req, { maximumFiles: 30, maximumBytes: config.galleryUploadLimit, fieldLimit: 12 });
    temporaryPaths = upload.images.map((image) => image.temporaryPath);
    const input = galleryUploadInputSchema.parse(upload.fields);
    if (input.coverIndex >= upload.images.length) throw Object.assign(new Error('请选择有效的缩略图'), { status: 400 });
    const item = await dataStore.addGalleryGroup({
      ...input,
      images: upload.images,
    });
    temporaryPaths = [];
    res.status(201).json(item);
  } catch (error) {
    await Promise.all(temporaryPaths.map((temporaryPath) => unlink(temporaryPath).catch(() => undefined)));
    next(error);
  }
});

adminRouter.put('/gallery/order', requireWriteProtection, async (req, res, next) => {
  try {
    res.json(await dataStore.reorderGallery(galleryOrderInputSchema.parse(req.body)));
  } catch (error) {
    next(error);
  }
});

adminRouter.put('/gallery/:id', requireWriteProtection, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (typeof id !== 'string') {
      res.status(404).json({ error: '画廊展示不存在' });
      return;
    }
    const item = await dataStore.updateGalleryItem(id, galleryInputSchema.parse(req.body));
    if (!item) {
      res.status(404).json({ error: '画廊展示不存在' });
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
      res.status(404).json({ error: '画廊展示不存在' });
      return;
    }
    const item = await dataStore.deleteGalleryItem(id);
    if (!item) {
      res.status(404).json({ error: '画廊展示不存在' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/settings/media/:kind', requireWriteProtection, async (req, res, next) => {
  try {
    const kind = req.params.kind;
    const mediaFields = {
      profileAvatar: 'profileAvatar',
      webIcon: 'webIcon',
      background: 'backgroundImage',
      repositoryBackground: 'repositoryAppearance.backgroundImage',
    } as const;
    const key = mediaFields[kind as keyof typeof mediaFields];
    if (!key) {
      res.status(400).json({ error: '媒体类型无效' });
      return;
    }
    const upload = await receiveImage(req);
    const current = await dataStore.readSettings();
    const nextSettings = key === 'repositoryAppearance.backgroundImage'
      ? { ...current, repositoryAppearance: { ...current.repositoryAppearance, backgroundImage: upload.url } }
      : { ...current, [key]: upload.url };
    try {
      const settings = await dataStore.writeSettings(nextSettings);
      res.json(settings);
    } catch (error) {
      await unlink(upload.filePath).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    next(error);
  }
});
