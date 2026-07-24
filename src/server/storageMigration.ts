import { mkdir, lstat, readFile, readdir, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { codeToolsIndexSchema, galleryIndexSchema, legacyCodeToolsIndexSchema, legacyGalleryItemSchema, type GalleryIndex, type GalleryItem } from '../shared/schemas.js';

export type StoragePaths = {
  root: string;
  settings: string;
  admin: string;
  media: string;
  sessions: string;
  tmp: string;
  repository: string;
  markdown: string;
  posts: string;
  markdownMedia: string;
  initialized: string;
  galleryRoot: string;
  gallery: string;
  codeTools: string;
  codeToolsIndex: string;
  codeToolsItems: string;
  storageLayout: string;
};

const layoutVersion = 2;
const mediaReferencePattern = /\/media\/([a-f0-9-]+\.(?:png|jpe?g|webp))/gi;

async function exists(filePath: string) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function copyExact(source: string, target: string) {
  const sourceData = await readFile(source);
  if (await exists(target)) {
    const targetData = await readFile(target);
    if (!sourceData.equals(targetData)) throw new Error(`存储迁移目标冲突：${target}`);
    return;
  }
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await writeFileAtomic(target, sourceData, { mode: 0o600 });
}

async function preflightExactCopy(source: string, target: string) {
  if (!(await exists(target))) return;
  const sourceData = await readFile(source);
  const targetData = await readFile(target);
  if (!sourceData.equals(targetData)) throw new Error(`存储迁移目标冲突：${target}`);
}

async function moveExact(source: string, target: string) {
  await copyExact(source, target);
  await unlink(source);
}

function galleryUrl(id: string, filename: string) {
  return `/media/gallery/${id}/${encodeURIComponent(filename)}`;
}

async function buildMigratedGallery(paths: StoragePaths) {
  const raw = JSON.parse(await readFile(path.join(paths.root, 'gallery.json'), 'utf8')) as unknown;
  const legacyItems = legacyGalleryItemSchema.array().parse(raw);
  const positions = new Map(legacyItems.map((item, index) => [item.id, index]));
  const ordered = [...legacyItems].sort((left, right) => {
    const created = right.createdAt.localeCompare(left.createdAt);
    return created || (positions.get(left.id) ?? 0) - (positions.get(right.id) ?? 0);
  });
  const migrated: GalleryItem[] = [];
  const files: Array<{ source: string; target: string }> = [];

  for (const [index, item] of ordered.entries()) {
    const id = String(index + 1).padStart(8, '0');
    const originalFilename = path.basename(item.url);
    const source = path.join(paths.media, originalFilename);
    const target = path.join(paths.galleryRoot, id, originalFilename);
    if (await exists(source)) files.push({ source, target });
    migrated.push(galleryIndexSchema.shape.items.element.parse({
      ...item,
      id,
      legacyId: item.id,
      originalFilename,
      url: galleryUrl(id, originalFilename),
    }));
  }

  return {
    index: galleryIndexSchema.parse({ version: 1, nextId: migrated.length + 1, items: migrated }),
    files,
  };
}

async function migratePosts(paths: StoragePaths) {
  const legacyPosts = path.join(paths.root, 'posts');
  if (!(await exists(legacyPosts))) return;
  const entries = await readdir(legacyPosts, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    await moveExact(path.join(legacyPosts, entry.name), path.join(paths.posts, entry.name));
  }
  await rmdir(legacyPosts).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') throw error;
  });
}

async function collectMarkdownMedia(directory: string, filenames: Set<string>) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const content = await readFile(path.join(directory, entry.name), 'utf8');
    for (const match of content.matchAll(mediaReferencePattern)) filenames.add(match[1]);
  }
}

async function copyMarkdownMedia(paths: StoragePaths) {
  const filenames = new Set<string>();
  await collectMarkdownMedia(paths.posts, filenames);
  for (const filename of filenames) {
    const source = path.join(paths.media, filename);
    if (await exists(source)) await copyExact(source, path.join(paths.markdownMedia, filename));
  }
}

type MigratedGallery = {
  index: GalleryIndex;
  files: Array<{ source: string; target: string }>;
};

async function preflightMigration(paths: StoragePaths, migratedGallery: MigratedGallery | null) {
  const legacyPosts = path.join(paths.root, 'posts');
  const markdownMedia = new Set<string>();
  await collectMarkdownMedia(paths.posts, markdownMedia);
  if (await exists(legacyPosts)) {
    const entries = await readdir(legacyPosts, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const source = path.join(legacyPosts, entry.name);
      await preflightExactCopy(source, path.join(paths.posts, entry.name));
      const content = await readFile(source, 'utf8');
      for (const match of content.matchAll(mediaReferencePattern)) markdownMedia.add(match[1]);
    }
  }

  const legacyInitialized = path.join(paths.root, '.initialized');
  if (await exists(legacyInitialized)) await preflightExactCopy(legacyInitialized, paths.initialized);

  for (const file of migratedGallery?.files ?? []) await preflightExactCopy(file.source, file.target);
  if (migratedGallery) {
    const serialized = `${JSON.stringify(migratedGallery.index, null, 2)}\n`;
    if (await exists(paths.gallery)) {
      const current = await readFile(paths.gallery, 'utf8');
      if (current !== serialized) throw new Error(`存储迁移目标冲突：${paths.gallery}`);
    }
  }

  for (const filename of markdownMedia) {
    const source = path.join(paths.media, filename);
    if (await exists(source)) await preflightExactCopy(source, path.join(paths.markdownMedia, filename));
  }
}

function parseCodeToolsIndex(value: unknown) {
  const legacy = legacyCodeToolsIndexSchema.safeParse(value);
  if (legacy.success) return { version: 2 as const, items: legacy.data.items, projects: [] };
  return codeToolsIndexSchema.parse(value);
}

async function normalizeCodeToolsIndex(paths: StoragePaths) {
  const raw = JSON.parse(await readFile(paths.codeToolsIndex, 'utf8')) as unknown;
  const index = parseCodeToolsIndex(raw);
  if (!codeToolsIndexSchema.safeParse(raw).success) {
    await writeFileAtomic(paths.codeToolsIndex, `${JSON.stringify(index, null, 2)}\n`, { mode: 0o600 });
  }
  return index;
}

async function preflightCodeToolsUpgrade(paths: StoragePaths) {
  const entries = await readdir(paths.codeTools, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name !== 'index.json' && entry.name !== 'items') {
      throw new Error(`存储迁移目标冲突：${path.join(paths.codeTools, entry.name)}`);
    }
    if (entry.name === 'index.json') {
      if (!entry.isFile()) throw new Error(`存储迁移目标冲突：${paths.codeToolsIndex}`);
      const index = parseCodeToolsIndex(JSON.parse(await readFile(paths.codeToolsIndex, 'utf8')) as unknown);
      if (index.items.length) throw new Error(`存储迁移目标冲突：${paths.codeToolsIndex}`);
    }
    if (entry.name === 'items') {
      if (!entry.isDirectory()) throw new Error(`存储迁移目标冲突：${paths.codeToolsItems}`);
      const items = await readdir(paths.codeToolsItems);
      if (items.length) throw new Error(`存储迁移目标冲突：${paths.codeToolsItems}`);
    }
  }
}

async function initializeCodeTools(paths: StoragePaths) {
  await mkdir(paths.codeToolsItems, { recursive: true, mode: 0o700 });
  if (await exists(paths.codeToolsIndex)) {
    await normalizeCodeToolsIndex(paths);
    return;
  }
  await writeFileAtomic(
    paths.codeToolsIndex,
    `${JSON.stringify({ version: 2, items: [], projects: [] }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

async function validateCurrentLayout(paths: StoragePaths) {
  galleryIndexSchema.parse(JSON.parse(await readFile(paths.gallery, 'utf8')) as unknown);
  await normalizeCodeToolsIndex(paths);
  await readdir(paths.codeToolsItems);
}

export async function migrateStorageLayout(paths: StoragePaths) {
  await Promise.all([
    mkdir(paths.root, { recursive: true, mode: 0o700 }),
    mkdir(paths.media, { recursive: true, mode: 0o700 }),
    mkdir(paths.sessions, { recursive: true, mode: 0o700 }),
    mkdir(paths.tmp, { recursive: true, mode: 0o700 }),
    mkdir(paths.posts, { recursive: true, mode: 0o700 }),
    mkdir(paths.markdownMedia, { recursive: true, mode: 0o700 }),
    mkdir(paths.galleryRoot, { recursive: true, mode: 0o700 }),
    mkdir(paths.codeTools, { recursive: true, mode: 0o700 }),
  ]);

  if (await exists(paths.storageLayout)) {
    const marker = JSON.parse(await readFile(paths.storageLayout, 'utf8')) as { version?: unknown };
    if (marker.version === layoutVersion) {
      await validateCurrentLayout(paths);
      return;
    }
    if (marker.version !== 1) throw new Error('存储布局版本无效');
    galleryIndexSchema.parse(JSON.parse(await readFile(paths.gallery, 'utf8')) as unknown);
    await preflightCodeToolsUpgrade(paths);
    await initializeCodeTools(paths);
    await writeFileAtomic(paths.storageLayout, `${JSON.stringify({ version: layoutVersion }, null, 2)}\n`, { mode: 0o600 });
    return;
  }

  const legacyGallery = path.join(paths.root, 'gallery.json');
  const migratedGallery = await exists(legacyGallery)
    ? await buildMigratedGallery(paths)
    : null;
  if (!migratedGallery && await exists(paths.gallery)) {
    galleryIndexSchema.parse(JSON.parse(await readFile(paths.gallery, 'utf8')) as unknown);
  }
  await preflightCodeToolsUpgrade(paths);
  await preflightMigration(paths, migratedGallery);

  await migratePosts(paths);

  const legacyInitialized = path.join(paths.root, '.initialized');
  if (await exists(legacyInitialized)) await moveExact(legacyInitialized, paths.initialized);

  if (migratedGallery) {
    for (const file of migratedGallery.files) await copyExact(file.source, file.target);
    const serialized = `${JSON.stringify(migratedGallery.index, null, 2)}\n`;
    if (await exists(paths.gallery)) {
      const current = await readFile(paths.gallery, 'utf8');
      if (current !== serialized) throw new Error(`存储迁移目标冲突：${paths.gallery}`);
    } else {
      await writeFileAtomic(paths.gallery, serialized, { mode: 0o600 });
    }
    await unlink(legacyGallery);
  } else if (await exists(paths.gallery)) {
    galleryIndexSchema.parse(JSON.parse(await readFile(paths.gallery, 'utf8')) as unknown);
  } else {
    await writeFileAtomic(paths.gallery, `${JSON.stringify({ version: 1, nextId: 1, items: [] }, null, 2)}\n`, { mode: 0o600 });
  }

  await copyMarkdownMedia(paths);
  await initializeCodeTools(paths);
  await writeFileAtomic(paths.storageLayout, `${JSON.stringify({ version: layoutVersion }, null, 2)}\n`, { mode: 0o600 });
}
