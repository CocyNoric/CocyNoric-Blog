import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rename, rm, rmdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import writeFileAtomic from 'write-file-atomic';
import sharp from 'sharp';
import { codeToolsIndexSchema, defaultRepositoryAppearance, galleryIndexSchema, galleryInputSchema, galleryItemSchema, legacyCodeToolsIndexSchema, migrateSettings, postInputSchema, postMetaSchema, type CodeToolItem, type CodeToolProject, type CodeToolProjectFile, type CodeToolsIndex, type GalleryIndex, type GalleryInput, type GalleryItem, type PostInput, type PostMeta, type SiteSettings } from '../shared/schemas.js';
import type { AdminPost } from '../shared/types.js';
import { config } from './config.js';
import { migrateStorageLayout, type StoragePaths } from './storageMigration.js';

const defaultSettings: SiteSettings = {
  version: 10,
  siteName: "CocyNoric's Blog",
  homeTitle: "CocyNoric's Blog",
  footerText: "CocyNoric's Blog",
  galleryDescription: '项目、作品与视觉记录。',
  repositoryTitle: '仓库',
  repositoryDescription: '代码、工具与项目归档。',
  repositoryAppearance: defaultRepositoryAppearance,
  footerMode: 'transparent',
  homeContent: {
    articleLimit: 4,
    galleryLimit: 6,
    articleSurfaceOpacity: 0.94,
    gallerySurfaceOpacity: 0,
  },
  description: '记录技术、作品与生活。',
  profileName: 'CocyNoric',
  profileAvatar: null,
  webIcon: null,
  homeHero: {
    minHeight: 680,
    titleAlign: 'left',
    contentOffset: 0,
  },
  backgroundImage: null,
  backgroundPosition: 'center',
  backgroundOverlay: 0.86,
  backgroundBlur: 0,
  seedColor: '#415f91',
  contentWidth: 'standard',
  cardDensity: 'comfortable',
  bodyFontSize: 16,
  browsing: {
    article: {
      railSide: 'left',
      railWidth: 340,
      showRecentPosts: true,
      recentPostsLimit: 4,
      showRecentGallery: false,
      recentGalleryLimit: 6,
      thumbnailColumns: 2,
      thumbnailRows: 3,
      contentWidth: 820,
    },
    gallery: {
      railSide: 'right',
      railWidth: 340,
      showRecentPosts: true,
      recentPostsLimit: 4,
      showRecentGallery: true,
      recentGalleryLimit: 6,
      mediaWidth: 705,
      portraitMaxHeight: 880,
      thumbnailColumns: 2,
      thumbnailRows: 3,
    },
  },
};

const starterPosts: Array<Omit<PostInput, 'version'>> = [
  {
    slug: 'welcome',
    title: '欢迎来到我的博客',
    excerpt: '这是一个支持 Markdown、LaTeX 和自定义主题的个人空间。',
    date: '2026-07-16',
    status: 'published',
    tags: ['随笔'],
    markdown: `这里可以记录技术、展示项目，也可以写下日常想法。\n\n## Markdown 与公式\n\n文章支持常用的 Markdown 语法，也能渲染行内公式 $E = mc^2$。\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n\n登录管理后台后，可以直接编辑这篇文章或创建新内容。`,
  },
  {
    slug: 'build-small-tools',
    title: '把工具做小，把问题看清',
    excerpt: '记录一次从实际问题出发，逐步缩小实现范围的过程。',
    date: '2026-07-12',
    status: 'published',
    tags: ['技术', '工程'],
    markdown: `复杂并不等于完整。一个工具真正有用，通常因为它把最重要的路径做得足够清楚。\n\n## 先确认唯一任务\n\n在增加功能前，先写下用户打开它时最需要完成的一件事。其余功能都要为这条路径让路。\n\n## 保留可修改的边界\n\n小工具也需要清晰的数据格式、可替换的配置和可验证的输出，但不需要为尚未出现的问题提前搭建框架。`,
  },
  {
    slug: 'project-notes',
    title: '项目展示：从草图到可用版本',
    excerpt: '一份简短的项目记录模板，关注目标、限制和最终取舍。',
    date: '2026-07-08',
    status: 'published',
    tags: ['展示', '项目'],
    markdown: `项目展示不只是结果截图，也应该说明为什么这样做。\n\n- **目标**：解决什么具体问题\n- **限制**：时间、设备或环境带来了什么约束\n- **取舍**：哪些方案被放弃，为什么\n- **结果**：现在能完成什么，还有什么未验证\n\n把这些内容写清楚，比堆叠功能列表更容易让读者理解作品。`,
  },
];

function versionOf(source: string) {
  return createHash('sha256').update(source).digest('hex');
}

function normalizeMeta(data: Record<string, unknown>) {
  return {
    ...data,
    date: data.date instanceof Date ? data.date.toISOString().slice(0, 10) : data.date,
    updatedAt: data.updatedAt instanceof Date ? data.updatedAt.toISOString() : data.updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeSettings(current: SiteSettings, input: unknown) {
  if (!isRecord(input)) return input;

  const merged: Record<string, unknown> = {
    ...current,
    ...input,
    version: current.version,
  };
  const mergeNested = (key: string, source: Record<string, unknown>) => {
    if (!(key in input)) return;
    const value = input[key];
    merged[key] = isRecord(value) ? { ...source, ...value } : value;
  };

  mergeNested('repositoryAppearance', current.repositoryAppearance);
  mergeNested('homeContent', current.homeContent);
  mergeNested('homeHero', current.homeHero);

  if ('browsing' in input) {
    const value = input.browsing;
    if (!isRecord(value)) {
      merged.browsing = value;
    } else {
      const browsing: Record<string, unknown> = { ...current.browsing, ...value };
      if ('article' in value) {
        browsing.article = isRecord(value.article)
          ? { ...current.browsing.article, ...value.article }
          : value.article;
      }
      if ('gallery' in value) {
        browsing.gallery = isRecord(value.gallery)
          ? { ...current.browsing.gallery, ...value.gallery }
          : value.gallery;
      }
      merged.browsing = browsing;
    }
  }

  return merged;
}

export class DataStore {
  readonly paths: StoragePaths;

  private writes = new Map<string, Promise<void>>();
  private settingsMutation = Promise.resolve();
  private galleryMutation = Promise.resolve();
  private codeToolsMutation = Promise.resolve();
  private initialization: Promise<void> | null = null;

  constructor(dataDir = config.dataDir) {
    const repository = path.join(dataDir, 'repository');
    const markdown = path.join(repository, 'markdown');
    const galleryRoot = path.join(repository, 'gallery');
    this.paths = {
      root: dataDir,
      settings: path.join(dataDir, 'settings.json'),
      admin: path.join(dataDir, 'admin.json'),
      media: path.join(dataDir, 'media'),
      sessions: path.join(dataDir, 'sessions'),
      tmp: path.join(dataDir, 'tmp'),
      repository,
      markdown,
      posts: path.join(markdown, 'posts'),
      markdownMedia: path.join(markdown, 'media'),
      initialized: path.join(markdown, '.initialized'),
      galleryRoot,
      gallery: path.join(galleryRoot, 'index.json'),
      codeTools: path.join(repository, 'code-tools'),
      codeToolsIndex: path.join(repository, 'code-tools', 'index.json'),
      codeToolsItems: path.join(repository, 'code-tools', 'items'),
      storageLayout: path.join(dataDir, '.storage-layout.json'),
    };
  }

  async initialize() {
    this.initialization ??= this.performInitialization();
    return this.initialization;
  }

  private async performInitialization() {
    await migrateStorageLayout(this.paths);

    if (!(await this.exists(this.paths.settings))) {
      await this.writeSettings(defaultSettings);
    }
    if (!(await this.exists(this.paths.initialized))) {
      for (const post of starterPosts) await this.savePost(post);
      await this.atomicWrite(this.paths.initialized, '1');
    }
  }

  async readSettings() {
    const raw = JSON.parse(await readFile(this.paths.settings, 'utf8')) as unknown;
    const settings = migrateSettings(raw);
    if (JSON.stringify(raw) !== JSON.stringify(settings)) await this.atomicWrite(this.paths.settings, `${JSON.stringify(settings, null, 2)}\n`);
    return settings;
  }

  private mutateSettings<T>(mutation: () => Promise<T>) {
    const result = this.settingsMutation.then(mutation, mutation);
    this.settingsMutation = result.then(() => undefined, () => undefined);
    return result;
  }

  async writeSettings(input: unknown) {
    return this.mutateSettings(async () => {
      const current = (await this.exists(this.paths.settings))
        ? await this.readSettings()
        : migrateSettings(defaultSettings);
      const settings = migrateSettings(mergeSettings(current, input));
      await this.atomicWrite(this.paths.settings, `${JSON.stringify(settings, null, 2)}\n`);
      return settings;
    });
  }

  private async readCodeToolsIndex(): Promise<CodeToolsIndex> {
    const value = JSON.parse(await readFile(this.paths.codeToolsIndex, 'utf8')) as unknown;
    const legacy = legacyCodeToolsIndexSchema.safeParse(value);
    if (legacy.success) return { version: 2, items: legacy.data.items, projects: [] };
    return codeToolsIndexSchema.parse(value);
  }

  private async writeCodeToolsIndex(index: CodeToolsIndex) {
    await this.atomicWrite(
      this.paths.codeToolsIndex,
      `${JSON.stringify(codeToolsIndexSchema.parse(index), null, 2)}\n`,
    );
  }

  private mutateCodeTools<T>(mutation: () => Promise<T>) {
    const result = this.codeToolsMutation.then(mutation, mutation);
    this.codeToolsMutation = result.then(() => undefined, () => undefined);
    return result;
  }

  async listCodeTools() {
    return [...(await this.readCodeToolsIndex()).items]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getCodeTool(id: string) {
    return (await this.readCodeToolsIndex()).items.find((item) => item.id === id) ?? null;
  }

  codeToolFilePath(item: Pick<CodeToolItem, 'id' | 'originalFilename'>) {
    return path.join(this.paths.codeToolsItems, item.id, item.originalFilename);
  }

  async addCodeTool(input: Omit<CodeToolItem, 'id' | 'createdAt'> & { temporaryPath: string }) {
    return this.mutateCodeTools(async () => {
      const index = await this.readCodeToolsIndex();
      if (index.items.length >= 1000) {
        throw Object.assign(new Error('代码和工具目录最多保存 1000 个文件'), { status: 409 });
      }
      const id = randomUUID();
      const item = codeToolsIndexSchema.shape.items.element.parse({
        id,
        originalFilename: input.originalFilename,
        size: input.size,
        mimeType: input.mimeType,
        mimeSource: input.mimeSource,
        sha256: input.sha256,
        createdAt: new Date().toISOString(),
      });
      const directory = path.join(this.paths.codeToolsItems, id);
      const destination = path.join(directory, item.originalFilename);
      await mkdir(directory, { mode: 0o700 });
      await rename(input.temporaryPath, destination);
      try {
        const next = codeToolsIndexSchema.parse({ version: 2, items: [item, ...index.items], projects: index.projects });
        await this.writeCodeToolsIndex(next);
        return item;
      } catch (error) {
        await rename(destination, input.temporaryPath).catch(() => undefined);
        await rmdir(directory).catch(() => undefined);
        throw error;
      }
    });
  }

  async listCodeToolProjects() {
    return [...(await this.readCodeToolsIndex()).projects]
      .map(({ files: _files, ...project }) => project)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getCodeToolProject(slug: string) {
    return (await this.readCodeToolsIndex()).projects.find((project) => project.slug === slug) ?? null;
  }

  codeToolProjectRootPath(project: Pick<CodeToolProject, 'slug'>) {
    return path.join(this.paths.codeTools, project.slug);
  }

  codeToolProjectFilePath(project: Pick<CodeToolProject, 'slug'>, relativePath: string) {
    return path.join(this.codeToolProjectRootPath(project), 'files', ...relativePath.split('/'));
  }

  async addCodeToolProject(input: {
    project: CodeToolProject;
    temporaryDirectory: string;
  }) {
    return this.mutateCodeTools(async () => {
      const index = await this.readCodeToolsIndex();
      if (index.projects.some((project) => project.slug === input.project.slug)) {
        throw Object.assign(new Error('项目名称已存在'), { status: 409 });
      }
      const root = this.codeToolProjectRootPath(input.project);
      const filesDirectory = path.join(root, 'files');
      await mkdir(filesDirectory, { recursive: true, mode: 0o700 });
      try {
        const stagedEntries = await readdir(input.temporaryDirectory, { withFileTypes: true });
        for (const entry of stagedEntries) {
          await cp(
            path.join(input.temporaryDirectory, entry.name),
            path.join(filesDirectory, entry.name),
            { recursive: entry.isDirectory(), errorOnExist: true, force: false }
          );
        }
        await this.atomicWrite(path.join(root, 'manifest.json'), `${JSON.stringify(input.project, null, 2)}\n`);
        await this.writeCodeToolsIndex({ version: 2, items: index.items, projects: [input.project, ...index.projects] });
        await rm(input.temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
        return input.project;
      } catch (error) {
        await rm(root, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
    });
  }

  async deleteCodeToolProject(slug: string) {
    return this.mutateCodeTools(async () => {
      const index = await this.readCodeToolsIndex();
      const project = index.projects.find((candidate) => candidate.slug === slug);
      if (!project) return null;
      const root = this.codeToolProjectRootPath(project);
      const tombstone = path.join(this.paths.tmp, `${randomUUID()}.project-deleted`);
      let backedUp = false;
      let rootExists = false;
      try {
        rootExists = (await stat(root)).isDirectory();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (rootExists) {
        await cp(root, tombstone, { recursive: true, errorOnExist: true, force: false });
        backedUp = true;
        try {
          await rm(root, { recursive: true, force: true });
        } catch (error) {
          await rm(tombstone, { recursive: true, force: true }).catch(() => undefined);
          throw error;
        }
      }
      try {
        await this.writeCodeToolsIndex({ version: 2, items: index.items, projects: index.projects.filter((candidate) => candidate.slug !== slug) });
      } catch (error) {
        if (backedUp) {
          await cp(tombstone, root, { recursive: true, errorOnExist: true, force: false }).catch(() => undefined);
        }
        throw error;
      }
      if (backedUp) await rm(tombstone, { recursive: true, force: true }).catch(() => undefined);
      return project;
    });
  }

  async codeToolProjectListing(slug: string, directory = '') {
    const project = await this.getCodeToolProject(slug);
    if (!project) return null;
    const prefix = directory ? `${directory}/` : '';
    const children = new Map<string, { kind: 'directory' | 'file'; file?: CodeToolProjectFile }>();
    for (const file of project.files) {
      if (!file.relativePath.startsWith(prefix)) continue;
      const remainder = file.relativePath.slice(prefix.length);
      if (!remainder) continue;
      const [name, ...rest] = remainder.split('/');
      if (rest.length) children.set(name, { kind: 'directory' });
      else children.set(name, { kind: 'file', file });
    }
    return { project, entries: [...children.entries()].map(([name, value]) => ({ name, ...value })) };
  }

  async getCodeToolProjectFile(slug: string, relativePath: string) {
    const project = await this.getCodeToolProject(slug);
    if (!project) return null;
    const file = project.files.find((candidate) => candidate.relativePath === relativePath);
    return file ? { project, file } : null;
  }
  async deleteCodeTool(id: string) {
    return this.mutateCodeTools(async () => {
      const index = await this.readCodeToolsIndex();
      const item = index.items.find((candidate) => candidate.id === id);
      if (!item) return null;
      const filePath = this.codeToolFilePath(item);
      const tombstone = path.join(this.paths.tmp, `${randomUUID()}.deleted`);
      await rename(filePath, tombstone);
      try {
        await this.writeCodeToolsIndex({
          version: 2,
          items: index.items.filter((candidate) => candidate.id !== item.id),
          projects: index.projects,
        });
      } catch (error) {
        await rename(tombstone, filePath).catch(() => undefined);
        throw error;
      }
      await unlink(tombstone).catch(() => undefined);
      await rmdir(path.dirname(filePath)).catch(() => undefined);
      return item;
    });
  }

  private async readGalleryIndex() {
    const value = JSON.parse(await readFile(this.paths.gallery, 'utf8')) as unknown;
    return galleryIndexSchema.parse(value);
  }

  private async writeGalleryIndex(index: GalleryIndex) {
    await this.atomicWrite(this.paths.gallery, `${JSON.stringify(galleryIndexSchema.parse(index), null, 2)}\n`);
  }

  private mutateGallery<T>(mutation: () => Promise<T>) {
    const result = this.galleryMutation.then(mutation, mutation);
    this.galleryMutation = result.then(() => undefined, () => undefined);
    return result;
  }

  async listGallery() {
    return [...(await this.readGalleryIndex()).items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getGalleryItem(id: string) {
    return (await this.readGalleryIndex()).items.find((item) => item.id === id || item.legacyId === id) ?? null;
  }

  galleryFilePath(item: Pick<GalleryItem, 'id' | 'originalFilename'>) {
    return path.join(this.paths.galleryRoot, item.id, item.originalFilename);
  }

  async addGalleryItem(input: Pick<GalleryItem, 'title' | 'description'> & Partial<Pick<GalleryItem, 'cardFocus' | 'cardAspectRatio' | 'thumbnailFocus' | 'thumbnailAspectRatio' | 'width' | 'height'>> & { temporaryPath: string; originalFilename: string }) {
    return this.mutateGallery(async () => {
      const index = await this.readGalleryIndex();
      const entries = await readdir(this.paths.galleryRoot, { withFileTypes: true });
      const occupied = entries
        .filter((entry) => entry.isDirectory() && /^\d{8}$/.test(entry.name))
        .map((entry) => Number(entry.name));
      const sequence = Math.max(index.nextId, occupied.length ? Math.max(...occupied) + 1 : 1);
      if (sequence > 99_999_999) throw new Error('画廊 ID 已用尽');

      const id = String(sequence).padStart(8, '0');
      const directory = path.join(this.paths.galleryRoot, id);
      const destination = path.join(directory, input.originalFilename);
      await mkdir(directory, { mode: 0o700 });
      await rename(input.temporaryPath, destination);

      try {
        const item = galleryItemSchema.parse({
          ...input,
          temporaryPath: undefined,
          id,
          url: `/media/gallery/${id}/${encodeURIComponent(input.originalFilename)}`,
          createdAt: new Date().toISOString(),
        });
        await this.writeGalleryIndex({ version: 1, nextId: sequence + 1, items: [item, ...index.items] });
        return item;
      } catch (error) {
        await rename(destination, input.temporaryPath).catch(() => undefined);
        await rm(directory, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
    });
  }

  async updateGalleryItem(id: string, raw: GalleryInput) {
    return this.mutateGallery(async () => {
      const input = galleryInputSchema.parse(raw);
      const index = await this.readGalleryIndex();
      const itemIndex = index.items.findIndex((candidate) => candidate.id === id || candidate.legacyId === id);
      if (itemIndex < 0) return null;
      const current = index.items[itemIndex];
      const item = galleryItemSchema.parse({ ...current, ...input });
      if ((input.cardAspectRatio === 'original' || input.thumbnailAspectRatio === 'original') && (!item.width || !item.height)) {
        const metadata = await sharp(this.galleryFilePath(item)).metadata();
        item.width = metadata.width;
        item.height = metadata.height;
      }
      index.items[itemIndex] = item;
      await this.writeGalleryIndex(index);
      return item;
    });
  }

  async deleteGalleryItem(id: string) {
    return this.mutateGallery(async () => {
      const index = await this.readGalleryIndex();
      const item = index.items.find((candidate) => candidate.id === id || candidate.legacyId === id);
      if (!item) return null;
      await this.writeGalleryIndex({ ...index, items: index.items.filter((candidate) => candidate.id !== item.id) });
      await rm(path.join(this.paths.galleryRoot, item.id), { recursive: true, force: true });
      return item;
    });
  }

  async listPosts(includeDrafts = false) {
    const files = (await readdir(this.paths.posts)).filter((name) => name.endsWith('.md'));
    const posts: AdminPost[] = [];
    for (const file of files) {
      try {
        posts.push(await this.readPostFile(path.join(this.paths.posts, file)));
      } catch (error) {
        console.error(`无法读取文章 ${file}:`, error);
      }
    }
    return posts
      .filter((post) => includeDrafts || post.status === 'published')
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async getPostBySlug(slug: string, includeDrafts = false) {
    const post = (await this.listPosts(true)).find((item) => item.slug === slug);
    if (!post || (!includeDrafts && post.status !== 'published')) return null;
    return post;
  }

  async getPostById(id: string) {
    const file = path.join(this.paths.posts, `${id}.md`);
    if (!(await this.exists(file))) return null;
    return this.readPostFile(file);
  }

  async savePost(raw: Omit<PostInput, 'version'> & { version?: string }) {
    const input = postInputSchema.parse(raw);
    const id = input.id ?? randomUUID();
    const target = path.join(this.paths.posts, `${id}.md`);
    const existing = await this.getPostById(id);

    if (existing && input.version !== existing.version) {
      const error = new Error('文章已在磁盘上更改，请重新载入后再保存');
      Object.assign(error, { code: 'CONFLICT' });
      throw error;
    }

    const duplicate = (await this.listPosts(true)).find((post) => post.slug === input.slug && post.id !== id);
    if (duplicate) {
      const error = new Error('文章路径已存在');
      Object.assign(error, { code: 'DUPLICATE_SLUG' });
      throw error;
    }

    const meta: PostMeta = postMetaSchema.parse({
      id,
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt,
      date: input.date,
      updatedAt: new Date().toISOString(),
      status: input.status,
      tags: [...new Set(input.tags)],
    });
    const source = matter.stringify(input.markdown.trimEnd() + '\n', meta);
    await this.atomicWrite(target, source);
    return this.readPostFile(target);
  }

  async deletePost(id: string) {
    const target = path.join(this.paths.posts, `${id}.md`);
    if (!(await this.exists(target))) return false;
    await unlink(target);
    return true;
  }

  async atomicWrite(filePath: string, data: string | Buffer) {
    const previous = this.writes.get(filePath) ?? Promise.resolve();
    const next = previous.then(async () => {
      await writeFileAtomic(filePath, data, { mode: 0o600 });
    });
    this.writes.set(filePath, next);
    try {
      await next;
    } finally {
      if (this.writes.get(filePath) === next) this.writes.delete(filePath);
    }
  }

  private async readPostFile(filePath: string): Promise<AdminPost> {
    const source = await readFile(filePath, 'utf8');
    const parsed = matter(source);
    const meta = postMetaSchema.parse(normalizeMeta(parsed.data));
    return { ...meta, markdown: parsed.content.trim(), version: versionOf(source) };
  }

  private async exists(filePath: string) {
    try {
      await readFile(filePath);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== 'ENOENT' ? Promise.reject(error) : false;
    }
  }
}

export const dataStore = new DataStore();
