import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import writeFileAtomic from 'write-file-atomic';
import { galleryInputSchema, galleryItemSchema, postInputSchema, postMetaSchema, settingsSchema, type GalleryInput, type GalleryItem, type PostInput, type PostMeta, type SiteSettings } from '../shared/schemas.js';
import type { AdminPost } from '../shared/types.js';
import { config } from './config.js';

const defaultSettings: SiteSettings = {
  version: 1,
  siteName: 'CocyNoric‘s Blog',
  homeTitle: 'CocyNoric‘s Blog',
  footerText: 'CocyNoric‘s Blog',
  description: '记录技术、作品与生活。',
  avatar: null,
  backgroundImage: null,
  backgroundPosition: 'center',
  backgroundOverlay: 0.86,
  backgroundBlur: 0,
  seedColor: '#415f91',
  contentWidth: 'standard',
  cardDensity: 'comfortable',
  bodyFontSize: 16,
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

class DataStore {
  readonly paths = {
    root: config.dataDir,
    settings: path.join(config.dataDir, 'settings.json'),
    admin: path.join(config.dataDir, 'admin.json'),
    posts: path.join(config.dataDir, 'posts'),
    media: path.join(config.dataDir, 'media'),
    gallery: path.join(config.dataDir, 'gallery.json'),
    sessions: path.join(config.dataDir, 'sessions'),
    tmp: path.join(config.dataDir, 'tmp'),
    initialized: path.join(config.dataDir, '.initialized'),
  };

  private writes = new Map<string, Promise<void>>();

  async initialize() {
    await Promise.all([
      mkdir(this.paths.root, { recursive: true, mode: 0o700 }),
      mkdir(this.paths.posts, { recursive: true, mode: 0o700 }),
      mkdir(this.paths.media, { recursive: true, mode: 0o700 }),
      mkdir(this.paths.sessions, { recursive: true, mode: 0o700 }),
      mkdir(this.paths.tmp, { recursive: true, mode: 0o700 }),
    ]);

    if (!(await this.exists(this.paths.settings))) {
      await this.writeSettings(defaultSettings);
    }
    if (!(await this.exists(this.paths.gallery))) {
      await this.atomicWrite(this.paths.gallery, '[]\n');
    }
    if (!(await this.exists(this.paths.initialized))) {
      for (const post of starterPosts) await this.savePost(post);
      await this.atomicWrite(this.paths.initialized, '1');
    }
  }

  async readSettings() {
    return settingsSchema.parse(JSON.parse(await readFile(this.paths.settings, 'utf8')));
  }

  async writeSettings(input: SiteSettings) {
    const settings = settingsSchema.parse(input);
    await this.atomicWrite(this.paths.settings, `${JSON.stringify(settings, null, 2)}\n`);
    return settings;
  }

  async listGallery() {
    const value = JSON.parse(await readFile(this.paths.gallery, 'utf8')) as unknown;
    return galleryItemSchema.array().parse(value).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getGalleryItem(id: string) {
    return (await this.listGallery()).find((item) => item.id === id) ?? null;
  }

  async addGalleryItem(input: Omit<GalleryItem, 'id' | 'createdAt'>) {
    const item = galleryItemSchema.parse({ ...input, id: randomUUID(), createdAt: new Date().toISOString() });
    const items = await this.listGallery();
    await this.atomicWrite(this.paths.gallery, `${JSON.stringify([item, ...items], null, 2)}\n`);
    return item;
  }

  async updateGalleryItem(id: string, raw: GalleryInput) {
    const input = galleryInputSchema.parse(raw);
    const items = await this.listGallery();
    const index = items.findIndex((candidate) => candidate.id === id);
    if (index < 0) return null;
    const item = galleryItemSchema.parse({ ...items[index], ...input });
    items[index] = item;
    await this.atomicWrite(this.paths.gallery, `${JSON.stringify(items, null, 2)}\n`);
    return item;
  }

  async deleteGalleryItem(id: string) {
    const items = await this.listGallery();
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return null;
    await this.atomicWrite(this.paths.gallery, `${JSON.stringify(items.filter((candidate) => candidate.id !== id), null, 2)}\n`);
    return item;
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
