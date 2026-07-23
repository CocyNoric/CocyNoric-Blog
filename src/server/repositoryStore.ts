import type { RepositoryArea, RepositoryAreaKey, RepositoryEntry, RepositoryListing, RepositoryOverview } from '../shared/types.js';
import { dataStore } from './dataStore.js';

const areaDefinitions: Record<RepositoryAreaKey, Omit<RepositoryArea, 'entryCount' | 'updatedAt'>> = {
  markdown: {
    key: 'markdown',
    name: 'Markdown',
    description: '已发布的文章与配套内容',
  },
  gallery: {
    key: 'gallery',
    name: 'Gallery',
    description: '按独立编号归档的图片项目',
  },
  'code-tools': {
    key: 'code-tools',
    name: '代码和工具',
    description: '代码项目与工具归档',
  },
};

const areaKeys = Object.keys(areaDefinitions) as RepositoryAreaKey[];

export function isRepositoryArea(value: string): value is RepositoryAreaKey {
  return areaKeys.includes(value as RepositoryAreaKey);
}

function validatePath(input: string | undefined) {
  const value = input ?? '';
  if (!value) return '';
  if (value.includes('\\') || value.includes('\0') || value.startsWith('/') || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw Object.assign(new Error('仓库路径无效'), { status: 400 });
  }
  return value;
}

function latest(values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function fileEntry(input: Omit<RepositoryEntry, 'kind'>): RepositoryEntry {
  return { kind: 'file', ...input };
}

function directoryEntry(input: Omit<RepositoryEntry, 'kind' | 'icon'>): RepositoryEntry {
  return { kind: 'directory', icon: 'folder', ...input };
}

async function markdownEntries(pathname: string) {
  const posts = await dataStore.listPosts();
  if (!pathname) {
    return posts.map((post) => directoryEntry({
      name: post.slug,
      path: post.slug,
      description: post.title,
      updatedAt: post.updatedAt ?? `${post.date}T00:00:00.000Z`,
    }));
  }
  const post = posts.find((candidate) => candidate.slug === pathname);
  if (!post) return null;
  return [fileEntry({
    name: '正文.md',
    path: `${post.slug}/正文.md`,
    icon: 'markdown',
    description: post.title,
    updatedAt: post.updatedAt ?? `${post.date}T00:00:00.000Z`,
    href: `/posts/${encodeURIComponent(post.slug)}`,
  })];
}

async function galleryEntries(pathname: string) {
  const items = await dataStore.listGallery();
  if (!pathname) {
    return items.map((item) => directoryEntry({
      name: item.id,
      path: item.id,
      description: item.title,
      updatedAt: item.createdAt,
      href: `/gallery/${encodeURIComponent(item.id)}`,
    }));
  }
  const item = items.find((candidate) => candidate.id === pathname || candidate.legacyId === pathname);
  if (!item) return null;
  return [fileEntry({
    name: item.originalFilename,
    path: `${item.id}/${item.originalFilename}`,
    icon: 'image',
    description: item.title,
    updatedAt: item.createdAt,
    href: `/gallery/${encodeURIComponent(item.id)}`,
  })];
}

const codeToolProjectArchiveUrl = (slug: string) => `/api/repository/code-tools/projects/${encodeURIComponent(slug)}/archive`;

async function codeToolEntries(pathname: string) {
  const [items, projects] = await Promise.all([dataStore.listCodeTools(), dataStore.listCodeToolProjects()]);
  const legacyDownloadUrl = (item: (typeof items)[number]) => `/api/repository/code-tools/${item.id}/download/${encodeURIComponent(item.originalFilename)}`;
  if (!pathname) {
    return [
      ...projects.map((project) => directoryEntry({ name: project.name, path: project.slug, description: project.description || `${project.fileCount} 个文件`, updatedAt: project.updatedAt, archiveHref: codeToolProjectArchiveUrl(project.slug) })),
      ...items.map((item) => directoryEntry({ name: item.originalFilename, path: item.originalFilename, description: '', updatedAt: item.createdAt, href: legacyDownloadUrl(item) })),
    ];
  }
  const [projectSlug, ...pathParts] = pathname.split('/');
  const project = projects.find((candidate) => candidate.slug === projectSlug);
  if (project) {
    const directory = pathParts.join('/');
    const listing = await dataStore.codeToolProjectListing(project.slug, directory);
    if (!listing) return null;
    return listing.entries.map((entry) => {
      const entryPath = [project.slug, directory, entry.name].filter(Boolean).join('/');
      if (entry.kind === 'directory') return directoryEntry({ name: entry.name, path: entryPath, description: '', updatedAt: project.updatedAt });
      const file = entry.file!;
      return fileEntry({ name: entry.name, path: entryPath, icon: 'code', description: '', updatedAt: file.updatedAt, size: file.size, mimeType: file.mimeType, href: `/api/repository/code-tools/projects/${encodeURIComponent(project.slug)}/download/${file.relativePath.split('/').map(encodeURIComponent).join('/')}`, download: true });
    });
  }
  const item = items.find((candidate) => candidate.originalFilename === pathname);
  if (!item) return null;
  return [fileEntry({
    name: item.originalFilename,
    path: `${item.originalFilename}/${item.originalFilename}`,
    icon: 'code',
    description: `${item.size} B${item.mimeType ? ` · ${item.mimeType}` : ''}`,
    updatedAt: item.createdAt,
    size: item.size,
    mimeType: item.mimeType,
    href: legacyDownloadUrl(item),
    download: true,
  })];
}

async function entriesFor(area: RepositoryAreaKey, pathname: string) {
  if (area === 'markdown') return { entries: await markdownEntries(pathname) };
  if (area === 'gallery') return { entries: await galleryEntries(pathname) };
  const entries = await codeToolEntries(pathname);
  const [slug, ...pathParts] = pathname.split('/');
  return {
    entries,
    archiveHref: entries && slug && pathParts.length === 0 && (await dataStore.getCodeToolProject(slug)) ? codeToolProjectArchiveUrl(slug) : undefined,
  };
}

export async function repositoryOverview(): Promise<RepositoryOverview> {
  const [posts, gallery, codeTools, codeToolProjects] = await Promise.all([
    dataStore.listPosts(),
    dataStore.listGallery(),
    dataStore.listCodeTools(),
    dataStore.listCodeToolProjects(),
  ]);
  const areas: RepositoryArea[] = [
    {
      ...areaDefinitions.markdown,
      entryCount: posts.length,
      updatedAt: latest(posts.map((post) => post.updatedAt ?? `${post.date}T00:00:00.000Z`)),
    },
    {
      ...areaDefinitions.gallery,
      entryCount: gallery.length,
      updatedAt: latest(gallery.map((item) => item.createdAt)),
    },
    {
      ...areaDefinitions['code-tools'],
      entryCount: codeTools.length + codeToolProjects.length,
      updatedAt: latest([...codeTools.map((item) => item.createdAt), ...codeToolProjects.map((project) => project.updatedAt)]),
    },
  ];
  return { areas };
}

export async function repositoryTree(area: string, rawPath?: string): Promise<RepositoryListing> {
  if (!isRepositoryArea(area)) throw Object.assign(new Error('仓库目录无效'), { status: 404 });
  const pathname = validatePath(rawPath);
  const result = await entriesFor(area, pathname);
  if (!result.entries) throw Object.assign(new Error('仓库路径不存在'), { status: 404 });
  const entries = result.entries;
  entries.sort((left, right) => Number(right.kind === 'directory') - Number(left.kind === 'directory') || left.name.localeCompare(right.name, 'zh-CN'));
  const parentPath = pathname.includes('/') ? pathname.slice(0, pathname.lastIndexOf('/')) : pathname ? '' : null;
  return { area, path: pathname, parentPath, archiveHref: result.archiveHref, entries };
}

export function repositoryArea(area: RepositoryAreaKey) {
  return areaDefinitions[area];
}
