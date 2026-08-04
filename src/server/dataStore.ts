import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readdir, readFile, rename, rm, rmdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import writeFileAtomic from 'write-file-atomic';
import sharp from 'sharp';
import { codeToolsIndexSchema, defaultContentVisibility, defaultRepositoryAppearance, galleryIndexSchema, galleryInputSchema, galleryItemSchema, galleryOrderInputSchema, legacyCodeToolsIndexSchema, migrateSettings, postInputSchema, postMetaSchema, type CodeToolItem, type CodeToolProject, type CodeToolProjectFile, type CodeToolsIndex, type GalleryIndex, type GalleryInput, type GalleryItem, type GalleryMedia, type PostInput, type PostMeta, type SiteSettings } from '../shared/schemas.js';
import type { AdminPost } from '../shared/types.js';
import { config } from './config.js';
import { migrateStorageLayout, type StoragePaths } from './storageMigration.js';
import { validateCodeToolProjectPath, codeToolPathError } from './codeToolPaths.js';

const defaultSettings: SiteSettings = {
  version: 11,
  siteName: "CocyNoric's Blog",
  homeTitle: "CocyNoric's Blog",
  footerText: "CocyNoric's Blog",
  galleryDescription: '项目、作品与视觉记录。',
  repositoryTitle: '仓库',
  repositoryDescription: '代码、工具与项目归档。',
  repositoryAppearance: defaultRepositoryAppearance,
  contentVisibility: defaultContentVisibility,
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
      gridMaxColumns: 3,
      showcaseCardImageLimit: 5,
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
    category: '随笔',
    tags: ['随笔'],
    markdown: `这里可以记录技术、展示项目，也可以写下日常想法。\n\n## Markdown 与公式\n\n文章支持常用的 Markdown 语法，也能渲染行内公式 $E = mc^2$。\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n\n登录管理后台后，可以直接编辑这篇文章或创建新内容。`,
  },
  {
    slug: 'build-small-tools',
    title: '把工具做小，把问题看清',
    excerpt: '记录一次从实际问题出发，逐步缩小实现范围的过程。',
    date: '2026-07-12',
    status: 'published',
    category: '技术',
    tags: ['技术', '工程'],
    markdown: `复杂并不等于完整。一个工具真正有用，通常因为它把最重要的路径做得足够清楚。\n\n## 先确认唯一任务\n\n在增加功能前，先写下用户打开它时最需要完成的一件事。其余功能都要为这条路径让路。\n\n## 保留可修改的边界\n\n小工具也需要清晰的数据格式、可替换的配置和可验证的输出，但不需要为尚未出现的问题提前搭建框架。`,
  },
  {
    slug: 'project-notes',
    title: '项目展示：从草图到可用版本',
    excerpt: '一份简短的项目记录模板，关注目标、限制和最终取舍。',
    date: '2026-07-08',
    status: 'published',
    category: '项目',
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

function validatePostRelativePath(value: string) {
  const normalized = value.normalize('NFC').replace(/^\.\//, '');
  const parts = normalized.split('/');
  if (
    !normalized
    || normalized.includes('\\')
    || normalized.includes('\0')
    || normalized.startsWith('/')
    || /^[a-z]:/i.test(normalized)
    || parts.some((part) => !part || part === '.' || part === '..' || /[\x00-\x1f\x7f<>:"|?*]/.test(part) || /[. ]$/.test(part))
  ) {
    throw Object.assign(new Error('文章项目路径无效'), { status: 400 });
  }
  return parts.join('/');
}

function encodedPath(value: string) {
  return value.split('/').map(encodeURIComponent).join('/');
}

type PostStorageAsset = {
  temporaryPath: string;
  relativePath: string;
};

type GalleryImageUpload = {
  temporaryPath: string;
  originalFilename: string;
  width?: number;
  height?: number;
};

type GalleryMetadataInput = Pick<GalleryItem, 'title' | 'description'> & Partial<Pick<GalleryItem, 'category' | 'tags' | 'cardFocus' | 'cardAspectRatio' | 'thumbnailFocus' | 'thumbnailAspectRatio' | 'cropPositioning'>>;

type LocatedPost = {
  post: AdminPost;
  filePath: string;
  projectRoot: string;
  projectName: string;
  markdownRelativePath: string;
};

type FileCache<T> = {
  mtimeMs: number;
  size: number;
  value: T;
};

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
  mergeNested('contentVisibility', current.contentVisibility);
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
  private postMutation = Promise.resolve();
  private codeToolsMutation = Promise.resolve();
  private initialization: Promise<void> | null = null;
  private settingsCache: FileCache<SiteSettings> | null = null;
  private galleryCache: FileCache<GalleryIndex> | null = null;
  private postFileCache = new Map<string, FileCache<AdminPost>>();
  private postsRead: Promise<LocatedPost[]> | null = null;

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
    await this.ensureGalleryDisplayFiles();

    if (!(await this.exists(this.paths.settings))) {
      await this.writeSettings(defaultSettings);
    }
    if (!(await this.exists(this.paths.initialized))) {
      for (const post of starterPosts) await this.savePost(post);
      await this.atomicWrite(this.paths.initialized, '1');
    }
  }

  async readSettings() {
    let details = await stat(this.paths.settings);
    if (this.settingsCache?.mtimeMs === details.mtimeMs && this.settingsCache.size === details.size) {
      return structuredClone(this.settingsCache.value);
    }
    const raw = JSON.parse(await readFile(this.paths.settings, 'utf8')) as unknown;
    const settings = migrateSettings(raw);
    if (JSON.stringify(raw) !== JSON.stringify(settings)) {
      await this.atomicWrite(this.paths.settings, `${JSON.stringify(settings, null, 2)}\n`);
      details = await stat(this.paths.settings);
    }
    this.settingsCache = { mtimeMs: details.mtimeMs, size: details.size, value: structuredClone(settings) };
    return structuredClone(settings);
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
      const details = await stat(this.paths.settings);
      this.settingsCache = { mtimeMs: details.mtimeMs, size: details.size, value: structuredClone(settings) };
      return structuredClone(settings);
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
    const safePath = validateCodeToolProjectPath(relativePath);
    return path.join(this.codeToolProjectRootPath(project), 'files', ...safePath.split('/'));
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
    const safeDirectory = directory ? validateCodeToolProjectPath(directory) : '';
    const project = await this.getCodeToolProject(slug);
    if (!project) return null;
    const prefix = safeDirectory ? `${safeDirectory}/` : '';
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
    const safePath = validateCodeToolProjectPath(relativePath);
    const project = await this.getCodeToolProject(slug);
    if (!project) return null;
    const file = project.files.find((candidate) => candidate.relativePath === safePath);
    return file ? { project, file } : null;
  }

  async deleteCodeToolProjectEntry(slug: string, relativePath: string) {
    const safePath = validateCodeToolProjectPath(relativePath);
    return this.mutateCodeTools(async () => {
      const index = await this.readCodeToolsIndex();
      const project = index.projects.find((candidate) => candidate.slug === slug);
      if (!project) return null;

      const directFile = project.files.find((file) => file.relativePath === safePath);
      const matchingFiles = directFile
        ? [directFile]
        : project.files.filter((file) => file.relativePath.startsWith(`${safePath}/`));
      if (!matchingFiles.length) return null;

      const root = this.codeToolProjectRootPath(project);
      const filesRoot = path.join(root, 'files');
      const target = this.codeToolProjectFilePath(project, safePath);
      const targetKind = directFile ? 'file' : 'directory';
      const ancestors = [filesRoot];
      for (const part of safePath.split('/').slice(0, -1)) ancestors.push(path.join(ancestors.at(-1)!, part));
      for (const ancestor of ancestors) {
        try {
          if ((await lstat(ancestor)).isSymbolicLink()) throw codeToolPathError('项目文件路径无效');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
          throw error;
        }
      }

      let exists = false;
      try {
        const details = await lstat(target);
        if (details.isSymbolicLink() || (targetKind === 'file' ? !details.isFile() : !details.isDirectory())) {
          throw codeToolPathError('项目文件状态无效', 409);
        }
        exists = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }

      const now = new Date().toISOString();
      const remainingFiles = project.files.filter((file) => !matchingFiles.some((match) => match.id === file.id));
      const updatedProject = codeToolsIndexSchema.shape.projects.element.parse({
        ...project,
        updatedAt: now,
        fileCount: remainingFiles.length,
        totalBytes: remainingFiles.reduce((sum, file) => sum + file.size, 0),
        files: remainingFiles,
      });
      const manifestPath = path.join(root, 'manifest.json');
      const previousManifest = await readFile(manifestPath);
      const tombstone = path.join(this.paths.tmp, `${randomUUID()}.project-entry-deleted`);
      let moved = false;

      if (exists) {
        await rename(target, tombstone);
        moved = true;
      }
      try {
        await this.atomicWrite(manifestPath, `${JSON.stringify(updatedProject, null, 2)}\n`);
        await this.writeCodeToolsIndex({
          version: 2,
          items: index.items,
          projects: index.projects.map((candidate) => candidate.slug === project.slug ? updatedProject : candidate),
        });
      } catch (error) {
        await this.atomicWrite(manifestPath, previousManifest).catch(() => undefined);
        if (moved) await rename(tombstone, target).catch(() => undefined);
        throw error;
      }
      if (moved) await rm(tombstone, { recursive: targetKind === 'directory', force: true }).catch(() => undefined);
      return { project: updatedProject, kind: targetKind, deletedFileCount: matchingFiles.length };
    });
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
    const details = await stat(this.paths.gallery);
    if (this.galleryCache?.mtimeMs === details.mtimeMs && this.galleryCache.size === details.size) {
      return structuredClone(this.galleryCache.value);
    }
    const value = JSON.parse(await readFile(this.paths.gallery, 'utf8')) as unknown;
    const index = galleryIndexSchema.parse(value);
    this.galleryCache = { mtimeMs: details.mtimeMs, size: details.size, value: structuredClone(index) };
    return structuredClone(index);
  }

  private async writeGalleryIndex(index: GalleryIndex) {
    const parsed = galleryIndexSchema.parse(index);
    await this.atomicWrite(this.paths.gallery, `${JSON.stringify(parsed, null, 2)}\n`);
    const details = await stat(this.paths.gallery);
    this.galleryCache = { mtimeMs: details.mtimeMs, size: details.size, value: structuredClone(parsed) };
  }

  private mutateGallery<T>(mutation: () => Promise<T>) {
    const result = this.galleryMutation.then(mutation, mutation);
    this.galleryMutation = result.then(() => undefined, () => undefined);
    return result;
  }

  async listGallery() {
    return [...(await this.readGalleryIndex()).items];
  }

  async reorderGallery(raw: unknown) {
    const input = galleryOrderInputSchema.parse(raw);
    return this.mutateGallery(async () => {
      const index = await this.readGalleryIndex();
      if (input.ids.length !== index.items.length) throw Object.assign(new Error('画廊列表已变化，请刷新后重试'), { code: 'CONFLICT' });
      const byId = new Map(index.items.map((item) => [item.id, item]));
      if (input.ids.some((id) => !byId.has(id))) throw Object.assign(new Error('画廊列表已变化，请刷新后重试'), { code: 'CONFLICT' });
      const items = input.ids.map((id) => byId.get(id)!);
      await this.writeGalleryIndex({ ...index, items });
      return items;
    });
  }

  async getGalleryItem(id: string) {
    return (await this.readGalleryIndex()).items.find((item) => item.id === id || item.legacyId === id) ?? null;
  }

  galleryFilePath(item: Pick<GalleryItem, 'id' | 'originalFilename'>) {
    return path.join(this.paths.galleryRoot, item.id, item.originalFilename);
  }

  galleryDisplayFilePath(item: Pick<GalleryItem, 'id' | 'originalFilename' | 'displayFilename'>) {
    return path.join(this.paths.galleryRoot, item.id, item.displayFilename ?? item.originalFilename);
  }

  galleryMediaFilePath(item: Pick<GalleryItem, 'id'>, image: Pick<GalleryMedia, 'originalFilename'>) {
    return path.join(this.paths.galleryRoot, item.id, image.originalFilename);
  }

  galleryMediaDisplayFilePath(item: Pick<GalleryItem, 'id'>, image: Pick<GalleryMedia, 'originalFilename' | 'displayFilename'>) {
    return path.join(this.paths.galleryRoot, item.id, image.displayFilename ?? image.originalFilename);
  }

  private galleryDisplayFilename(originalFilename: string) {
    return originalFilename.toLocaleLowerCase('en-US') === 'display.webp' ? 'display-compressed.webp' : 'display.webp';
  }

  private uniqueGalleryFilename(filename: string, occupied: Set<string>) {
    const extension = path.extname(filename);
    const stem = path.basename(filename, extension);
    let candidate = filename;
    let suffix = 2;
    while (occupied.has(candidate.toLocaleLowerCase('en-US'))) candidate = `${stem}-${suffix++}${extension}`;
    occupied.add(candidate.toLocaleLowerCase('en-US'));
    return candidate;
  }

  private async writeGalleryDisplayFile(source: string, destination: string) {
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await sharp(source)
        .rotate()
        .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 4, smartSubsample: true })
        .toFile(temporary);
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  private async ensureGalleryDisplayFiles() {
    await this.mutateGallery(async () => {
      const displayMigrationMarker = path.join(this.paths.galleryRoot, '.display-v2');
      const refreshExisting = !(await this.exists(displayMigrationMarker));
      const raw = JSON.parse(await readFile(this.paths.gallery, 'utf8')) as unknown;
      const index = galleryIndexSchema.parse(raw);
      let changed = JSON.stringify(raw) !== JSON.stringify(index);
      for (const item of index.items) {
        const occupied = new Set(item.images.flatMap((image) => [image.originalFilename, image.displayFilename].filter((value): value is string => Boolean(value))).map((value) => value.toLocaleLowerCase('en-US')));
        for (const image of item.images) {
          const original = this.galleryMediaFilePath(item, image);
          const preferredDisplayFilename = item.images.length === 1
            ? this.galleryDisplayFilename(image.originalFilename)
            : `display-${image.mediaId}.webp`;
          let displayFilename = image.displayFilename ?? this.uniqueGalleryFilename(preferredDisplayFilename, occupied);
          let display = path.join(this.paths.galleryRoot, item.id, displayFilename);
          let displayExists = await this.exists(display);
          if (refreshExisting && displayExists) {
            const currentIsV2 = /^display-v2(?:-|\.)/i.test(displayFilename);
            if (!currentIsV2 || await this.galleryDisplayNeedsRefresh(display)) {
              const migratedFilename = item.images.length === 1 ? 'display-v2.webp' : `display-v2-${image.mediaId}.webp`;
              displayFilename = this.uniqueGalleryFilename(migratedFilename, occupied);
              display = path.join(this.paths.galleryRoot, item.id, displayFilename);
              displayExists = await this.exists(display);
            }
          }
          if (!displayExists) await this.writeGalleryDisplayFile(original, display);
          const expectedUrl = `/media/gallery/${item.id}/${encodeURIComponent(displayFilename)}`;
          if (image.displayFilename !== displayFilename || image.url !== expectedUrl) {
            image.displayFilename = displayFilename;
            image.url = expectedUrl;
            changed = true;
          }
        }
        const cover = item.images.find((image) => image.mediaId === item.coverImageId) ?? item.images[0];
        if (
          item.coverImageId !== cover.mediaId
          || item.originalFilename !== cover.originalFilename
          || item.displayFilename !== cover.displayFilename
          || item.url !== cover.url
          || item.width !== cover.width
          || item.height !== cover.height
        ) {
          item.coverImageId = cover.mediaId;
          item.originalFilename = cover.originalFilename;
          item.displayFilename = cover.displayFilename;
          item.url = cover.url;
          item.width = cover.width;
          item.height = cover.height;
          changed = true;
        }
      }
      if (changed) await this.writeGalleryIndex(index);
      if (refreshExisting) await this.atomicWrite(displayMigrationMarker, '1');
      const cleanupMarker = path.join(this.paths.galleryRoot, '.display-v2-cleanup');
      if (!(await this.exists(cleanupMarker)) && await this.cleanupUnreferencedGalleryDisplays(index)) {
        await this.atomicWrite(cleanupMarker, '1');
      }
    });
  }

  private async cleanupUnreferencedGalleryDisplays(index: GalleryIndex) {
    let complete = true;
    for (const item of index.items) {
      const referenced = new Set(item.images.flatMap((image) => [image.originalFilename, image.displayFilename].filter((value): value is string => Boolean(value))).map((value) => value.toLocaleLowerCase('en-US')));
      const directory = path.join(this.paths.galleryRoot, item.id);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !/^display(?:-.+)?\.webp$/i.test(entry.name) || referenced.has(entry.name.toLocaleLowerCase('en-US'))) continue;
        try {
          await unlink(path.join(directory, entry.name));
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== 'EBUSY' && code !== 'EPERM') throw error;
          complete = false;
        }
      }
    }
    return complete;
  }

  private async addGalleryGroupUnlocked(input: GalleryMetadataInput & { images: GalleryImageUpload[]; coverIndex: number }) {
    if (input.images.length < 1 || input.images.length > 30) throw Object.assign(new Error('一个画廊条目需要包含 1 到 30 张图片'), { status: 400 });
    if (input.coverIndex < 0 || input.coverIndex >= input.images.length) throw Object.assign(new Error('请选择有效的缩略图'), { status: 400 });

    const index = await this.readGalleryIndex();
    const entries = await readdir(this.paths.galleryRoot, { withFileTypes: true });
    const occupiedIds = entries
      .filter((entry) => entry.isDirectory() && /^\d{8}$/.test(entry.name))
      .map((entry) => Number(entry.name));
    const sequence = Math.max(index.nextId, occupiedIds.length ? Math.max(...occupiedIds) + 1 : 1);
    if (sequence > 99_999_999) throw new Error('画廊 ID 已用尽');

    const id = String(sequence).padStart(8, '0');
    const directory = path.join(this.paths.galleryRoot, id);
    const occupiedFilenames = new Set<string>();
    const moved: Array<{ source: string; destination: string }> = [];
    await mkdir(directory, { mode: 0o700 });

    try {
      const originals = [] as Array<GalleryImageUpload & { mediaId: string; storedFilename: string }>;
      for (const [imageIndex, upload] of input.images.entries()) {
        if (path.basename(upload.originalFilename) !== upload.originalFilename || !upload.originalFilename) {
          throw Object.assign(new Error('图片文件名无效'), { status: 400 });
        }
        const storedFilename = this.uniqueGalleryFilename(upload.originalFilename, occupiedFilenames);
        const destination = path.join(directory, storedFilename);
        await rename(upload.temporaryPath, destination);
        moved.push({ source: upload.temporaryPath, destination });
        originals.push({ ...upload, mediaId: String(imageIndex + 1).padStart(4, '0'), storedFilename });
      }

      const images: GalleryMedia[] = [];
      for (const original of originals) {
        const preferredDisplayFilename = originals.length === 1
          ? this.galleryDisplayFilename(original.storedFilename)
          : `display-${original.mediaId}.webp`;
        const displayFilename = this.uniqueGalleryFilename(preferredDisplayFilename, occupiedFilenames);
        await this.writeGalleryDisplayFile(path.join(directory, original.storedFilename), path.join(directory, displayFilename));
        images.push({
          mediaId: original.mediaId,
          originalFilename: original.storedFilename,
          displayFilename,
          url: `/media/gallery/${id}/${encodeURIComponent(displayFilename)}`,
          width: original.width,
          height: original.height,
        });
      }

      const cover = images[input.coverIndex];
      const { images: _uploads, coverIndex: _coverIndex, ...metadata } = input;
      const item = galleryItemSchema.parse({
        ...metadata,
        id,
        coverImageId: cover.mediaId,
        originalFilename: cover.originalFilename,
        displayFilename: cover.displayFilename,
        url: cover.url,
        width: cover.width,
        height: cover.height,
        images,
        createdAt: new Date().toISOString(),
      });
      await this.writeGalleryIndex({ version: 1, nextId: sequence + 1, items: [item, ...index.items] });
      return item;
    } catch (error) {
      for (const file of [...moved].reverse()) await rename(file.destination, file.source).catch(() => undefined);
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async galleryDisplayNeedsRefresh(filePath: string) {
    try {
      const metadata = await sharp(filePath).metadata();
      return metadata.format !== 'webp' || (metadata.width ?? 0) > 2560 || (metadata.height ?? 0) > 2560;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
      throw error;
    }
  }

  async addGalleryItem(input: GalleryMetadataInput & GalleryImageUpload) {
    return this.mutateGallery(async () => {
      const { temporaryPath, originalFilename, width, height, ...metadata } = input;
      return this.addGalleryGroupUnlocked({ ...metadata, images: [{ temporaryPath, originalFilename, width, height }], coverIndex: 0 });
    });
  }

  async addGalleryGroup(input: GalleryMetadataInput & { images: GalleryImageUpload[]; coverIndex: number }) {
    return this.mutateGallery(() => this.addGalleryGroupUnlocked(input));
  }

  async updateGalleryItem(id: string, raw: GalleryInput) {
    return this.mutateGallery(async () => {
      const input = galleryInputSchema.parse(raw);
      const index = await this.readGalleryIndex();
      const itemIndex = index.items.findIndex((candidate) => candidate.id === id || candidate.legacyId === id);
      if (itemIndex < 0) return null;
      const current = index.items[itemIndex];
      const { imageOrder, ...metadata } = input;
      let images = current.images;
      if (imageOrder) {
        const imageById = new Map(current.images.map((image) => [image.mediaId, image]));
        if (imageOrder.length !== current.images.length || imageOrder.some((mediaId) => !imageById.has(mediaId))) {
          throw Object.assign(new Error('图片排序必须完整包含当前画廊的所有图片'), { status: 400 });
        }
        images = imageOrder.map((mediaId) => imageById.get(mediaId)!);
      }
      if (metadata.coverImageId && !images.some((image) => image.mediaId === metadata.coverImageId)) {
        throw Object.assign(new Error('选择的缩略图不存在'), { status: 400 });
      }
      if (imageOrder && metadata.coverImageId && metadata.coverImageId !== imageOrder[0]) {
        throw Object.assign(new Error('缩略图必须是排序后的第一张图片'), { status: 400 });
      }
      const coverImageId = imageOrder?.[0] ?? metadata.coverImageId ?? current.coverImageId;
      let item = galleryItemSchema.parse({ ...current, ...metadata, images, coverImageId });
      const transitionsToCenteredCrop = current.cropPositioning === 'legacy' && metadata.cropPositioning === 'center';
      if ((transitionsToCenteredCrop || metadata.cardAspectRatio === 'original' || metadata.thumbnailAspectRatio === 'original') && (!item.width || !item.height)) {
        const imageMetadata = await sharp(this.galleryFilePath(item)).metadata();
        const nextImages = item.images.map((image) => image.mediaId === item.coverImageId ? { ...image, width: imageMetadata.width, height: imageMetadata.height } : image);
        item = galleryItemSchema.parse({ ...item, images: nextImages });
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

  private mutatePosts<T>(mutation: () => Promise<T>) {
    const result = this.postMutation.then(mutation, mutation);
    this.postMutation = result.then(() => undefined, () => undefined);
    return result;
  }

  private async articleMarkdownFiles(directory = this.paths.markdown, relativeDirectory = ''): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry): Promise<string[]> => {
      if (!relativeDirectory && (entry.name.startsWith('.') || entry.name === 'posts' || entry.name === 'media')) return [];
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return this.articleMarkdownFiles(filePath, relativePath);
      if (entry.isFile() && /\.(?:md|markdown)$/i.test(entry.name)) return [relativePath];
      return [];
    }));
    return files.flat();
  }

  private async readLocatedPosts(): Promise<LocatedPost[]> {
    const relativePaths = await this.articleMarkdownFiles();
    const activeFiles = new Set(relativePaths.map((relativePath) => path.join(this.paths.markdown, ...relativePath.split('/'))));
    const located = await Promise.all(relativePaths.map(async (relativePath): Promise<LocatedPost | null> => {
      const [projectName, ...projectPath] = relativePath.split('/');
      if (!projectName || !projectPath.length) return null;
      const filePath = path.join(this.paths.markdown, ...relativePath.split('/'));
      try {
        const details = await stat(filePath);
        const cached = this.postFileCache.get(filePath);
        const post = cached?.mtimeMs === details.mtimeMs && cached.size === details.size
          ? cached.value
          : await this.readPostFile(filePath);
        if (post !== cached?.value) this.postFileCache.set(filePath, { mtimeMs: details.mtimeMs, size: details.size, value: post });
        return {
          post,
          filePath,
          projectRoot: path.join(this.paths.markdown, projectName),
          projectName,
          markdownRelativePath: projectPath.join('/'),
        };
      } catch (error) {
        console.error(`无法读取文章 ${relativePath}:`, error);
        return null;
      }
    }));
    for (const filePath of this.postFileCache.keys()) {
      if (!activeFiles.has(filePath)) this.postFileCache.delete(filePath);
    }
    return located.filter((entry): entry is LocatedPost => entry !== null);
  }

  private async locatedPosts(): Promise<LocatedPost[]> {
    if (this.postsRead) return this.postsRead;
    const pending = this.readLocatedPosts();
    this.postsRead = pending;
    try {
      return await pending;
    } finally {
      if (this.postsRead === pending) this.postsRead = null;
    }
  }

  private async locatePostById(id: string) {
    return (await this.locatedPosts()).find((entry) => entry.post.id === id) ?? null;
  }

  async listPosts(includeDrafts = false) {
    return (await this.locatedPosts())
      .map((entry) => entry.post)
      .filter((post) => includeDrafts || post.status === 'published')
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async getPostBySlug(slug: string, includeDrafts = false) {
    const post = (await this.listPosts(true)).find((item) => item.slug === slug);
    if (!post || (!includeDrafts && post.status !== 'published')) return null;
    return post;
  }

  async getPostById(id: string) {
    return (await this.locatePostById(id))?.post ?? null;
  }

  postMediaUrl(projectName: string, relativePath: string) {
    const safeProject = validatePostRelativePath(projectName);
    const safePath = validatePostRelativePath(relativePath);
    return `/media/markdown/${encodedPath(safeProject)}/${encodedPath(safePath)}`;
  }

  async savePost(
    raw: Omit<PostInput, 'version'> & { version?: string },
    storage?: { markdownRelativePath: string; assets?: PostStorageAsset[] },
  ) {
    return this.mutatePosts(async () => {
      const input = postInputSchema.parse(raw);
      const id = input.id ?? randomUUID();
      const existing = await this.locatePostById(id);

      if (existing && input.version !== existing.post.version) {
        const error = new Error('文章已在磁盘上更改，请重新载入后再保存');
        Object.assign(error, { code: 'CONFLICT' });
        throw error;
      }
      if (existing && storage) throw Object.assign(new Error('已存在的文章不能重新导入项目文件'), { status: 409 });

      const duplicate = (await this.listPosts(true)).find((post) => post.slug === input.slug && post.id !== id);
      if (duplicate) {
        const error = new Error('文章路径已存在');
        Object.assign(error, { code: 'DUPLICATE_SLUG' });
        throw error;
      }

      const projectRoot = existing?.projectRoot ?? path.join(this.paths.markdown, input.slug);
      const markdownRelativePath = existing?.markdownRelativePath
        ?? validatePostRelativePath(storage?.markdownRelativePath ?? `${input.slug}.md`);
      const target = existing?.filePath ?? path.join(projectRoot, ...markdownRelativePath.split('/'));
      const isNew = !existing;
      if (isNew) {
        try {
          await lstat(projectRoot);
          const error = new Error('文章项目目录已存在');
          Object.assign(error, { code: 'DUPLICATE_SLUG' });
          throw error;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }

      const assets = (storage?.assets ?? []).map((asset) => ({ ...asset, relativePath: validatePostRelativePath(asset.relativePath) }));
      const occupied = new Set([markdownRelativePath.toLocaleLowerCase('en-US')]);
      for (const asset of assets) {
        const key = asset.relativePath.toLocaleLowerCase('en-US');
        if (occupied.has(key)) throw Object.assign(new Error('文章项目中包含重复路径'), { status: 400 });
        occupied.add(key);
      }

      const meta: PostMeta = postMetaSchema.parse({
        id,
        slug: input.slug,
        title: input.title,
        excerpt: input.excerpt,
        date: input.date,
        updatedAt: new Date().toISOString(),
        status: input.status,
        category: input.category,
        tags: [...new Set(input.tags)],
      });
      const source = matter.stringify(input.markdown.trimEnd() + '\n', meta);

      try {
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        for (const asset of assets) {
          const destination = path.join(projectRoot, ...asset.relativePath.split('/'));
          await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
          await rename(asset.temporaryPath, destination);
        }
        await this.atomicWrite(target, source);
        this.postFileCache.delete(target);
        return this.readPostFile(target);
      } catch (error) {
        if (isNew) await rm(projectRoot, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
    });
  }

  async addPostImage(id: string, temporaryPath: string, originalFilename: string) {
    return this.mutatePosts(async () => {
      const located = await this.locatePostById(id);
      if (!located) throw Object.assign(new Error('文章不存在'), { status: 404 });
      validatePostRelativePath(`assets/${originalFilename}`);
      const directory = path.join(located.projectRoot, 'assets');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const existingNames = new Set((await readdir(directory)).map((name) => name.toLocaleLowerCase('en-US')));
      const extension = path.extname(originalFilename);
      const stem = path.basename(originalFilename, extension);
      let filename = originalFilename;
      let suffix = 2;
      while (existingNames.has(filename.toLocaleLowerCase('en-US'))) filename = `${stem}-${suffix++}${extension}`;
      await rename(temporaryPath, path.join(directory, filename));
      const relativePath = `assets/${filename}`;
      return { url: this.postMediaUrl(located.projectName, relativePath), relativePath };
    });
  }

  async postProjectListing(id: string, directory = '') {
    const located = await this.locatePostById(id);
    if (!located) return null;
    const safeDirectory = directory ? validatePostRelativePath(directory) : '';
    const target = safeDirectory ? path.join(located.projectRoot, ...safeDirectory.split('/')) : located.projectRoot;
    try {
      if (!(await lstat(target)).isDirectory()) return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const entries = [];
    for (const entry of await readdir(target, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isFile()) continue;
      const relativePath = [safeDirectory, entry.name].filter(Boolean).join('/');
      const details = await stat(path.join(target, entry.name));
      entries.push({
        name: entry.name,
        relativePath,
        kind: entry.isDirectory() ? 'directory' as const : 'file' as const,
        size: entry.isFile() ? details.size : undefined,
        updatedAt: details.mtime.toISOString(),
        article: relativePath === located.markdownRelativePath,
      });
    }
    return { ...located, directory: safeDirectory, entries };
  }

  async deletePost(id: string) {
    return this.mutatePosts(async () => {
      const located = await this.locatePostById(id);
      if (!located) return false;
      await rm(located.projectRoot, { recursive: true, force: true });
      for (const filePath of this.postFileCache.keys()) {
        if (filePath === located.projectRoot || filePath.startsWith(`${located.projectRoot}${path.sep}`)) this.postFileCache.delete(filePath);
      }
      return true;
    });
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
      await lstat(filePath);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== 'ENOENT' ? Promise.reject(error) : false;
    }
  }
}

export const dataStore = new DataStore();
