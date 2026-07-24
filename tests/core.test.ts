import yauzl from 'yauzl';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, truncate, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable, Writable } from 'node:stream';
import test, { after } from 'node:test';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cocynoric-blog-'));
process.env.BLOG_DATA_DIR = dataDir;

const [{ DataStore, dataStore }, { renderMarkdown }, { saveAdminPassword, verifyPassword }, { settingsSchema }, { importPostFile }, { matchesGalleryTitle }, { validateGalleryFilename }, { receiveCodeTool, receiveCodeToolProject, serveCodeToolProjectArchiveDownload, validateCodeToolFilename }, { repositoryOverview, repositoryTree }, { centeredCropFocus, centeredCropGeometry, cropAspectRatio }] = await Promise.all([
  import('../src/server/dataStore.js'),
  import('../src/server/markdown.js'),
  import('../src/server/auth.js'),
  import('../src/shared/schemas.js'),
  import('../src/server/postImport.js'),
  import('../src/shared/search.js'),
  import('../src/server/galleryFilename.js'),
  import('../src/server/codeTools.js'),
  import('../src/server/repositoryStore.js'),
  import('../src/shared/galleryCrop.js'),
]);

function crc32(source: Buffer) {
  let crc = 0xffffffff;
  for (const byte of source) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries: Array<{ name: string; source: Buffer | string; externalAttributes?: number; flags?: number }>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const source = Buffer.isBuffer(entry.source) ? entry.source : Buffer.from(entry.source, 'utf8');
    const crc = crc32(source);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE((entry.flags ?? 0) | 0x800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(source.length, 18);
    local.writeUInt32LE(source.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, source);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE((entry.flags ?? 0) | 0x800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(source.length, 20);
    central.writeUInt32LE(source.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((entry.externalAttributes ?? 0) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + source.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

function createProjectUpload(input: {
  projectName: string;
  mode: 'folder' | 'zip';
  zipMode?: 'extract' | 'keep';
  files: Array<{ name: string; source: Buffer | string; contentType?: string }>;
}) {
  const boundary = `----cocynoric-project-${createHash('sha256').update(`${input.projectName}-${input.mode}`).digest('hex').slice(0, 12)}`;
  const parts: Buffer[] = [];
  const field = (name: string, value: string) => {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  };
  field('projectName', input.projectName);
  field('description', '测试项目');
  field('mode', input.mode);
  field('zipMode', input.zipMode ?? 'extract');
  for (const file of input.files) {
    const source = Buffer.isBuffer(file.source) ? file.source : Buffer.from(file.source, 'utf8');
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name}"\r\nContent-Type: ${file.contentType ?? 'application/octet-stream'}\r\n\r\n`),
      source,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  const request = Object.assign(new PassThrough(), {
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    },
  }) as Parameters<typeof receiveCodeToolProject>[0];
  const received = receiveCodeToolProject(request);
  request.end(body);
  return received;
}

function createStreamingProjectUpload(input: {
  projectName: string;
  filename: string;
  source: Iterable<Buffer>;
  zipMode?: 'extract' | 'keep';
}) {
  const boundary = `----cocynoric-streamed-project-${createHash('sha256').update(input.projectName).digest('hex').slice(0, 12)}`;
  const field = (name: string, value: string) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  function* parts() {
    yield field('projectName', input.projectName);
    yield field('description', '流式测试项目');
    yield field('mode', 'zip');
    yield field('zipMode', input.zipMode ?? 'keep');
    yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${input.filename}"\r\nContent-Type: application/zip\r\n\r\n`);
    yield* input.source;
    yield Buffer.from(`\r\n--${boundary}--\r\n`);
  }
  const request = Object.assign(Readable.from(parts()), {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }) as Parameters<typeof receiveCodeToolProject>[0];
  return receiveCodeToolProject(request);
}

class ArchiveResponse extends Writable {
  readonly headers = new Map<string, string>();
  readonly chunks: Buffer[] = [];
  statusCode = 200;

  set(headers: Record<string, string>) {
    for (const [name, value] of Object.entries(headers)) this.headers.set(name.toLowerCase(), value);
    return this;
  }

  sendStatus(status: number) {
    this.statusCode = status;
    this.end();
    return this;
  }

  _write(chunk: Buffer | string, _encoding: BufferEncoding, done: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    done();
  }
}

async function zipEntries(buffer: Buffer) {
  const archive = await yauzl.fromBufferPromise(buffer, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true });
  const entries: Array<{ name: string; source: Buffer }> = [];
  await new Promise<void>((resolve, reject) => {
    archive.on('error', reject);
    archive.on('end', resolve);
    archive.on('entry', (entry) => {
      archive.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          reject(error ?? new Error('无法读取 ZIP 条目'));
          return;
        }
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => {
          entries.push({ name: entry.fileName, source: Buffer.concat(chunks) });
          archive.readEntry();
        });
      });
    });
    archive.readEntry();
  });
  archive.close();
  return entries;
}

function archiveRequest(slug: string) {
  return Object.assign(new PassThrough(), { params: { slug } }) as Parameters<typeof serveCodeToolProjectArchiveDownload>[0];
}

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

test('initializes settings and starter posts', async () => {
  await dataStore.initialize();
  const settings = await dataStore.readSettings();
  const posts = await dataStore.listPosts();

  assert.equal(settings.siteName, "CocyNoric's Blog");
  assert.equal(settings.profileName, 'CocyNoric');
  assert.equal(settings.profileAvatar, null);
  assert.equal(settings.webIcon, null);
  assert.equal(settings.version, 10);
  assert.equal(settings.repositoryAppearance.backgroundImage, null);
  assert.equal(settings.repositoryAppearance.headingMinHeight, 220);
  assert.equal(settings.repositoryAppearance.titleAlign, 'left');
  assert.equal(settings.repositoryAppearance.contentOffset, 0);
  assert.equal(settings.repositoryAppearance.surfaceOpacity, 1);
  assert.equal(settings.repositoryAppearance.directoryLayout, 'grid');
  assert.equal(settings.repositoryAppearance.showDescriptions, true);
  assert.equal(settings.repositoryAppearance.showItemCounts, true);
  assert.equal(settings.repositoryAppearance.showFileMetadata, true);
  assert.equal(settings.footerMode, 'transparent');
  assert.equal(settings.galleryDescription, '项目、作品与视觉记录。');
  assert.equal(settings.repositoryTitle, '仓库');
  assert.equal(settings.repositoryDescription, '代码、工具与项目归档。');
  assert.deepEqual(settings.homeContent, { articleLimit: 4, galleryLimit: 6, articleSurfaceOpacity: 0.94, gallerySurfaceOpacity: 0 });
  assert.equal(settings.homeHero.minHeight, 680);
  assert.equal(settings.homeHero.titleAlign, 'left');
  assert.equal(settings.homeHero.contentOffset, 0);
  assert.equal(settings.browsing.article.railWidth, 340);
  assert.equal(settings.browsing.article.contentWidth, 820);
  assert.equal(settings.browsing.article.showRecentGallery, false);
  assert.equal(settings.browsing.article.thumbnailColumns, 2);
  assert.equal(settings.browsing.article.thumbnailRows, 3);
  assert.equal(settings.browsing.gallery.railWidth, 340);
  assert.equal(settings.browsing.gallery.mediaWidth, 705);
  assert.equal(settings.browsing.gallery.portraitMaxHeight, 880);
  assert.equal(settings.browsing.gallery.thumbnailColumns, 2);
  assert.equal(settings.browsing.gallery.thumbnailRows, 3);
  assert.equal(settings.homeTitle, "CocyNoric's Blog");
  assert.equal(settings.footerText, "CocyNoric's Blog");
  assert.equal(posts.length, 3);
  assert.ok(posts.every((post) => post.status === 'published'));
});

test('migrates legacy settings and persists independent profile and browsing options', async () => {
  const legacyAvatar = '/media/123e4567-e89b-12d3-a456-426614174000.webp';
  const legacy = {
    version: 1 as const,
    siteName: '旧站点名称',
    homeTitle: '旧首页标题',
    description: '',
    avatar: legacyAvatar,
    backgroundImage: null,
    backgroundPosition: 'center' as const,
    backgroundOverlay: 0.8,
    backgroundBlur: 0,
    seedColor: '#415f91',
    contentWidth: 'standard' as const,
    cardDensity: 'comfortable' as const,
    bodyFontSize: 16,
  };

  const migratedV1 = settingsSchema.parse(legacy);
  assert.equal(migratedV1.footerText, "CocyNoric's Blog");
  assert.equal(migratedV1.version, 10);
  assert.deepEqual(migratedV1.repositoryAppearance, {
    backgroundImage: null,
    headingMinHeight: 220,
    titleAlign: 'left',
    contentOffset: 0,
    surfaceOpacity: 1,
    directoryLayout: 'grid',
    showDescriptions: true,
    showItemCounts: true,
    showFileMetadata: true,
    showRecentUpdates: true,
  });
  assert.equal(migratedV1.footerMode, 'transparent');
  assert.equal(migratedV1.repositoryTitle, '仓库');
  assert.equal(migratedV1.repositoryDescription, '代码、工具与项目归档。');
  assert.deepEqual(migratedV1.homeContent, { articleLimit: 4, galleryLimit: 6, articleSurfaceOpacity: 0.94, gallerySurfaceOpacity: 0 });
  assert.equal(migratedV1.profileName, '旧站点名称');
  assert.equal(migratedV1.profileAvatar, legacyAvatar);
  assert.equal(migratedV1.webIcon, legacyAvatar);
  assert.equal('avatar' in migratedV1, false);

  const migratedV7 = settingsSchema.parse({
    ...migratedV1,
    version: 7 as const,
    repositoryTitle: undefined,
    repositoryDescription: undefined,
  });
  assert.equal(migratedV7.version, 10);
  assert.equal(migratedV7.repositoryTitle, '仓库');
  assert.equal(migratedV7.repositoryDescription, '代码、工具与项目归档。');

  assert.deepEqual(migratedV1.browsing.article, {
    railSide: 'left', railWidth: 340, showRecentPosts: true, recentPostsLimit: 4,
    showRecentGallery: false, recentGalleryLimit: 6, thumbnailColumns: 2, thumbnailRows: 3, contentWidth: 820,
  });
  assert.deepEqual(migratedV1.browsing.gallery, {
    railSide: 'right', railWidth: 340, showRecentPosts: true, recentPostsLimit: 4,
    showRecentGallery: true, recentGalleryLimit: 6, mediaWidth: 705,
    portraitMaxHeight: 880, thumbnailColumns: 2, thumbnailRows: 3,
  });

  const migratedV2 = settingsSchema.parse({
    ...legacy,
    version: 2 as const,
    footerText: '旧版权名称',
    detailRail: {
      recentPostsLimit: 7,
      thumbnailLimit: 5,
      desktopWidth: 380,
      article: { side: 'right' as const },
      gallery: { side: 'left' as const },
    },
  });
  assert.equal(migratedV2.version, 10);
  assert.equal(migratedV2.profileName, '旧站点名称');
  assert.equal(migratedV2.profileAvatar, legacyAvatar);
  assert.equal(migratedV2.webIcon, legacyAvatar);
  assert.equal(migratedV2.browsing.article.recentPostsLimit, 7);
  assert.equal(migratedV2.browsing.article.railSide, 'right');
  assert.equal(migratedV2.browsing.gallery.recentGalleryLimit, 5);
  assert.equal(migratedV2.browsing.gallery.railSide, 'left');

  const migratedV5 = settingsSchema.parse({
    ...migratedV1,
    version: 5 as const,
    footerMode: undefined,
    galleryDescription: undefined,
    browsing: {
      ...migratedV1.browsing,
      article: {
        railSide: 'right' as const,
        railWidth: 360,
        showRecentPosts: true,
        recentPostsLimit: 5,
        showRecentGallery: true,
        recentGalleryLimit: 7,
        contentWidth: 900,
      },
    },
  });
  assert.equal(migratedV5.version, 10);
  assert.equal(migratedV5.footerMode, 'transparent');
  assert.equal(migratedV5.galleryDescription, '项目、作品与视觉记录。');
  assert.equal(migratedV5.repositoryTitle, '仓库');
  assert.equal(migratedV5.repositoryDescription, '代码、工具与项目归档。');
  assert.equal(migratedV5.browsing.article.thumbnailColumns, 2);
  assert.equal(migratedV5.browsing.article.thumbnailRows, 3);

  const saved = await dataStore.writeSettings({
    ...migratedV1,
    repositoryTitle: '我的仓库',
    repositoryDescription: '整理代码、工具和实验项目。',
    footerText: '独立版权名称',
    profileName: '个人名称',
    profileAvatar: '/media/123e4567-e89b-12d3-a456-426614174001.png',
    webIcon: null,
    browsing: {
      article: {
        railSide: 'right', railWidth: 420, showRecentPosts: true, recentPostsLimit: 8,
        showRecentGallery: true, recentGalleryLimit: 3, thumbnailColumns: 2, thumbnailRows: 3, contentWidth: 880,
      },
      gallery: {
        railSide: 'left', railWidth: 420, showRecentPosts: true, recentPostsLimit: 8,
        showRecentGallery: true, recentGalleryLimit: 3, mediaWidth: 880,
        portraitMaxHeight: 900, thumbnailColumns: 3, thumbnailRows: 2,
      },
    },
  });
  assert.equal(saved.footerText, '独立版权名称');
  assert.equal(saved.repositoryTitle, '我的仓库');
  assert.equal(saved.repositoryDescription, '整理代码、工具和实验项目。');
  assert.equal(saved.profileName, '个人名称');
  assert.equal(saved.profileAvatar, '/media/123e4567-e89b-12d3-a456-426614174001.png');
  assert.equal(saved.webIcon, null);
  assert.equal(saved.browsing.article.railWidth, 420);
  assert.equal(saved.browsing.article.railSide, 'right');
  assert.equal(saved.browsing.gallery.railSide, 'left');
  assert.equal(saved.browsing.gallery.mediaWidth, 880);
  assert.equal(saved.browsing.gallery.thumbnailColumns, 3);

  const persisted = await dataStore.readSettings();
  assert.equal(persisted.footerText, '独立版权名称');
  assert.equal(persisted.repositoryTitle, '我的仓库');
  assert.equal(persisted.repositoryDescription, '整理代码、工具和实验项目。');
  assert.equal(persisted.profileAvatar, '/media/123e4567-e89b-12d3-a456-426614174001.png');
  assert.equal(persisted.webIcon, null);
  assert.equal(persisted.browsing.article.railWidth, 420);
  assert.equal(persisted.browsing.gallery.recentGalleryLimit, 3);
});

test('preserves omitted settings during partial top-level and nested saves', async () => {
  const before = await dataStore.readSettings();

  const topLevel = await dataStore.writeSettings({
    version: 1,
    siteName: '部分更新站点',
  });
  assert.equal(topLevel.siteName, '部分更新站点');
  assert.equal(topLevel.footerText, before.footerText);
  assert.equal(topLevel.repositoryDescription, before.repositoryDescription);
  assert.deepEqual(topLevel.homeContent, before.homeContent);
  assert.deepEqual(topLevel.browsing, before.browsing);

  const nested = await dataStore.writeSettings({
    repositoryAppearance: { showRecentUpdates: false },
  });
  assert.equal(nested.siteName, '部分更新站点');
  assert.equal(nested.repositoryAppearance.showRecentUpdates, false);
  assert.equal(nested.repositoryAppearance.showFileMetadata, before.repositoryAppearance.showFileMetadata);
  assert.equal(nested.repositoryAppearance.directoryLayout, before.repositoryAppearance.directoryLayout);
  assert.equal(nested.repositoryAppearance.surfaceOpacity, before.repositoryAppearance.surfaceOpacity);
  assert.deepEqual(nested.browsing, before.browsing);

  const persisted = await dataStore.readSettings();
  assert.equal(persisted.siteName, '部分更新站点');
  assert.equal(persisted.repositoryAppearance.showRecentUpdates, false);
  assert.equal(persisted.repositoryAppearance.showDescriptions, before.repositoryAppearance.showDescriptions);
});

test('rejects stale post saves and duplicate slugs', async () => {
  const original = await dataStore.getPostBySlug('welcome', true);
  assert.ok(original);

  const file = path.join(dataStore.paths.posts, `${original.id}.md`);
  await writeFile(file, `${await readFile(file, 'utf8')}\n磁盘外部修改。\n`, 'utf8');

  await assert.rejects(
    dataStore.savePost({ ...original, markdown: '后台修改。' }),
    (error: Error & { code?: string }) => error.code === 'CONFLICT',
  );

  await assert.rejects(
    dataStore.savePost({
      slug: 'welcome',
      title: '重复路径',
      excerpt: '',
      date: '2026-07-16',
      status: 'draft',
      tags: [],
      markdown: '',
    }),
    (error: Error & { code?: string }) => error.code === 'DUPLICATE_SLUG',
  );
});

test('renders GFM and LaTeX without unsafe HTML', async () => {
  const html = await renderMarkdown('~~旧内容~~ $E=mc^2$ <script>alert(1)</script> [危险](javascript:alert(1))');

  assert.match(html, /<del>旧内容<\/del>/);
  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /javascript:/i);
});

test('stores only a password digest and verifies credentials', async () => {
  await saveAdminPassword('correct-horse-battery-staple');
  const stored = await readFile(dataStore.paths.admin, 'utf8');

  assert.doesNotMatch(stored, /correct-horse-battery-staple/);
  assert.equal(await verifyPassword('correct-horse-battery-staple'), true);
  assert.equal(await verifyPassword('wrong-password'), false);
});

test('stores gallery files under sequential identifiers without reusing deleted IDs', async () => {
  const firstTemporary = path.join(dataStore.paths.tmp, '第一张.png');
  await writeFile(firstTemporary, png);
  const first = await dataStore.addGalleryItem({
    temporaryPath: firstTemporary,
    originalFilename: '第一张.png',
    title: '测试图片',
    description: '画廊说明',
    width: 1,
    height: 1,
  });

  assert.equal(first.id, '00000001');
  assert.equal(first.originalFilename, '第一张.png');
  assert.equal(first.url, '/media/gallery/00000001/%E7%AC%AC%E4%B8%80%E5%BC%A0.png');
  assert.deepEqual((await dataStore.listGallery())[0]?.cardFocus, { x: 0.5, y: 0.5, size: 1 });
  assert.equal((await dataStore.listGallery())[0]?.cardAspectRatio, '4:3');
  assert.deepEqual((await dataStore.listGallery())[0]?.thumbnailFocus, { x: 0.5, y: 0.5, size: 1 });
  assert.equal((await dataStore.listGallery())[0]?.thumbnailAspectRatio, '1:1');
  assert.deepEqual(await readFile(dataStore.galleryFilePath(first)), png);
  assert.equal((await dataStore.deleteGalleryItem(first.id))?.id, first.id);

  const secondTemporary = path.join(dataStore.paths.tmp, '第二张.png');
  await writeFile(secondTemporary, png);
  const second = await dataStore.addGalleryItem({ temporaryPath: secondTemporary, originalFilename: '第二张.png', title: '第二张', description: '' });
  assert.equal(second.id, '00000002');
  await dataStore.deleteGalleryItem(second.id);
});

test('allocates unique gallery IDs for concurrent uploads', async () => {
  const uploads = await Promise.all(Array.from({ length: 4 }, async (_, index) => {
    const temporaryPath = path.join(dataStore.paths.tmp, `concurrent-${index}.png`);
    await writeFile(temporaryPath, png);
    return dataStore.addGalleryItem({ temporaryPath, originalFilename: `同名-${index}.png`, title: `并发 ${index}`, description: '' });
  }));
  assert.equal(new Set(uploads.map((item) => item.id)).size, uploads.length);
  await Promise.all(uploads.map((item) => dataStore.deleteGalleryItem(item.id)));
});

test('persists gallery order and rejects stale or invalid reorder requests', async () => {
  const uploads = await Promise.all(['first', 'second', 'third'].map(async (name) => {
    const temporaryPath = path.join(dataStore.paths.tmp, `order-${name}.png`);
    await writeFile(temporaryPath, png);
    return dataStore.addGalleryItem({ temporaryPath, originalFilename: `${name}.png`, title: name, description: '' });
  }));
  const requested = [uploads[0].id, uploads[2].id, uploads[1].id];
  const reordered = await dataStore.reorderGallery({ ids: requested });
  assert.deepEqual(reordered.map((item) => item.id), requested);
  assert.deepEqual((await dataStore.listGallery()).map((item) => item.id), requested);
  const index = JSON.parse(await readFile(dataStore.paths.gallery, 'utf8')) as { items: Array<{ id: string }> };
  assert.deepEqual(index.items.map((item) => item.id), requested);

  const updated = await dataStore.updateGalleryItem(uploads[2].id, { title: 'updated', description: '', cardFocus: uploads[2].cardFocus, cardAspectRatio: uploads[2].cardAspectRatio, thumbnailFocus: uploads[2].thumbnailFocus, thumbnailAspectRatio: uploads[2].thumbnailAspectRatio, cropPositioning: uploads[2].cropPositioning });
  assert.equal(updated?.title, 'updated');
  assert.deepEqual((await dataStore.listGallery()).map((item) => item.id), requested);
  await assert.rejects(dataStore.reorderGallery({ ids: [uploads[0].id, uploads[0].id, uploads[1].id] }));
  await assert.rejects(
    dataStore.reorderGallery({ ids: [uploads[0].id, uploads[1].id] }),
    (error: Error & { code?: string }) => error.code === 'CONFLICT',
  );
  await assert.rejects(
    dataStore.reorderGallery({ ids: [...requested.slice(0, 2), '99999999'] }),
    (error: Error & { code?: string }) => error.code === 'CONFLICT',
  );

  const nextTemporary = path.join(dataStore.paths.tmp, 'order-newest.png');
  await writeFile(nextTemporary, png);
  const newest = await dataStore.addGalleryItem({ temporaryPath: nextTemporary, originalFilename: 'newest.png', title: 'newest', description: '' });
  assert.deepEqual((await dataStore.listGallery()).map((item) => item.id), [newest.id, ...requested]);
  await dataStore.deleteGalleryItem(uploads[2].id);
  assert.deepEqual((await dataStore.listGallery()).map((item) => item.id), [newest.id, uploads[0].id, uploads[1].id]);
  await Promise.all([dataStore.deleteGalleryItem(newest.id), dataStore.deleteGalleryItem(uploads[0].id), dataStore.deleteGalleryItem(uploads[1].id)]);
});
test('updates gallery metadata without changing media fields', async () => {
  const temporaryPath = path.join(dataStore.paths.tmp, '原图.png');
  await writeFile(temporaryPath, png);
  const item = await dataStore.addGalleryItem({
    temporaryPath,
    originalFilename: '原图.png',
    title: '原始标题',
    description: '原始说明',
    width: 1,
    height: 1,
  });

  const updated = await dataStore.updateGalleryItem(item.id, { title: '更新标题', description: '更新说明', cardFocus: { x: 0.2, y: 0.8, size: 0.6 }, cardAspectRatio: '3:4', thumbnailFocus: { x: 0.7, y: 0.3, size: 0.8 }, thumbnailAspectRatio: '16:9' });
  assert.deepEqual(updated, { ...item, title: '更新标题', description: '更新说明', cardFocus: { x: 0.2, y: 0.8, size: 0.6 }, cardAspectRatio: '3:4', thumbnailFocus: { x: 0.7, y: 0.3, size: 0.8 }, thumbnailAspectRatio: '16:9' });
  assert.equal((await dataStore.getGalleryItem(item.id))?.url, item.url);
  assert.equal((await dataStore.getGalleryItem(item.id))?.originalFilename, '原图.png');
  await dataStore.deleteGalleryItem(item.id);
});

test('imports standalone Markdown as a normalized draft and avoids slug conflicts', async () => {
  const firstPath = path.join(dataStore.paths.tmp, 'standalone-one.md');
  const secondPath = path.join(dataStore.paths.tmp, 'standalone-two.md');
  const source = `---\ntitle: Imported Article\nslug: welcome\nstatus: published\ndate: invalid\ntags: [test, test]\n---\n# Ignored Heading\n\nImported body.\n`;
  await writeFile(firstPath, source);
  await writeFile(secondPath, source);

  const first = await importPostFile(firstPath, 'article.md');
  const second = await importPostFile(secondPath, 'article.md');
  assert.equal(first.status, 'draft');
  assert.equal(first.slug, 'welcome-2');
  assert.equal(second.slug, 'welcome-3');
  assert.deepEqual(first.tags, ['test']);
  assert.match(first.markdown, /Imported body/);

  await Promise.all([dataStore.deletePost(first.id), dataStore.deletePost(second.id), unlink(firstPath), unlink(secondPath)]);
});

test('imports a draft with a version that supports immediate saves', async () => {
  const file = path.join(dataStore.paths.tmp, 'immediate-save.md');
  await writeFile(file, '---\ntitle: Immediate Save\n---\n\nInitial body.\n');
  const imported = await importPostFile(file, 'immediate-save.md');
  assert.ok(imported.version);

  const saved = await dataStore.savePost({ ...imported, markdown: `${imported.markdown}\n\nSaved immediately.` });
  assert.notEqual(saved.version, imported.version);
  assert.match(saved.markdown, /Saved immediately/);
  await assert.rejects(
    dataStore.savePost({ ...imported, markdown: 'Stale save.' }),
    (error: Error & { code?: string }) => error.code === 'CONFLICT',
  );

  await Promise.all([dataStore.deletePost(saved.id), unlink(file)]);
});

test('requires ZIP for relative images in standalone Markdown', async () => {
  const file = path.join(dataStore.paths.tmp, 'relative.md');
  await writeFile(file, '# Relative image\n\n![image](images/photo.png)\n');
  await assert.rejects(importPostFile(file, 'relative.md'), /打包为 ZIP/);
  await unlink(file);
});

test('imports ZIP images once and rewrites repeated relative links', async () => {
  const file = path.join(dataStore.paths.tmp, 'article.zip');
  await writeFile(file, createZip([
    { name: 'post/article.md', source: '---\ntitle: ZIP Article\n---\n![one](../images/photo.png)\n\n![two](../images/photo.png)\n' },
    { name: 'images/photo.png', source: png },
  ]));
  const mediaBefore = new Set(await readdir(dataStore.paths.markdownMedia));

  const post = await importPostFile(file, 'article.zip');
  const urls = [...post.markdown.matchAll(/\/media\/[a-f0-9-]+\.png/g)].map((match) => match[0]);
  assert.equal(post.status, 'draft');
  assert.equal(urls.length, 2);
  assert.equal(urls[0], urls[1]);
  const mediaAfter = (await readdir(dataStore.paths.markdownMedia)).filter((name) => !mediaBefore.has(name));
  assert.equal(mediaAfter.length, 1);

  await Promise.all([
    dataStore.deletePost(post.id),
    ...mediaAfter.map((name) => unlink(path.join(dataStore.paths.markdownMedia, name))),
    unlink(file),
  ]);
});

test('imports only Markdown-referenced ZIP images and ignores auxiliary files', async () => {
  const file = path.join(dataStore.paths.tmp, 'article-with-auxiliary-files.zip');
  await writeFile(file, createZip([
    { name: 'post/article.md', source: '---\ntitle: ZIP Article\n---\n![one](../images/photo.png)\n\n![two](../images/photo.png)\n' },
    { name: 'images/photo.png', source: png },
    { name: '.gitignore', source: 'node_modules\n' },
    { name: 'src/tool.ts', source: 'export const ignored = true;\n' },
    { name: 'images/unused.png', source: 'not a png' },
  ]));
  const mediaBefore = new Set(await readdir(dataStore.paths.markdownMedia));

  const post = await importPostFile(file, 'article-with-auxiliary-files.zip');
  const urls = [...post.markdown.matchAll(/\/media\/[a-f0-9-]+\.png/g)].map((match) => match[0]);
  assert.equal(post.status, 'draft');
  assert.equal(urls.length, 2);
  assert.equal(urls[0], urls[1]);
  const mediaAfter = (await readdir(dataStore.paths.markdownMedia)).filter((name) => !mediaBefore.has(name));
  assert.equal(mediaAfter.length, 1);

  await Promise.all([
    dataStore.deletePost(post.id),
    ...mediaAfter.map((name) => unlink(path.join(dataStore.paths.markdownMedia, name))),
    unlink(file),
  ]);
});

test('rejects unsupported Markdown image references and oversized article ZIP files', async () => {
  const unsupportedFile = path.join(dataStore.paths.tmp, 'unsupported-image-reference.zip');
  const oversizedFile = path.join(dataStore.paths.tmp, 'oversized-article-import.zip');
  await writeFile(unsupportedFile, createZip([
    { name: 'article.md', source: '![unsupported](image.gif)' },
    { name: 'image.gif', source: 'GIF89a' },
  ]));
  await assert.rejects(importPostFile(unsupportedFile, 'unsupported-image-reference.zip'), /不支持 Markdown 引用的图片/);
  await writeFile(oversizedFile, 'not a zip');
  await truncate(oversizedFile, 128 * 1024 * 1024 + 1);
  await assert.rejects(
    importPostFile(oversizedFile, 'oversized-article-import.zip'),
    (error: Error & { status?: number }) => error.status === 413 && error.message === 'ZIP 文件不能超过 128 MB',
  );
  await Promise.all([unlink(unsupportedFile), unlink(oversizedFile)]);
});
test('accepts article ZIP files over the former 64 MB limit when auxiliary files are unused', async () => {
  const file = path.join(dataStore.paths.tmp, 'large-article-with-auxiliary-files.zip');
  await writeFile(file, createZip([
    { name: 'article.md', source: '# Large archive\n\nOnly this Markdown should be read.\n' },
    { name: 'repository/archive.bin', source: Buffer.alloc(65 * 1024 * 1024) },
  ]));

  const post = await importPostFile(file, 'large-article-with-auxiliary-files.zip');
  assert.equal(post.title, 'Large archive');
  await Promise.all([dataStore.deletePost(post.id), unlink(file)]);
});

test('rejects unsafe, duplicate, and spoofed ZIP entries without residue', async () => {
  const tmpBefore = new Set(await readdir(dataStore.paths.tmp));
  const mediaBefore = new Set(await readdir(dataStore.paths.markdownMedia));
  const cases = [
    { name: 'invalid.zip', source: Buffer.from('not a zip'), error: /ZIP 文件无效/ },
    { name: 'traversal.zip', source: createZip([{ name: '../article.md', source: '# unsafe' }]), error: /路径穿越/ },
    { name: 'duplicate.zip', source: createZip([{ name: 'article.md', source: '# one' }, { name: 'ARTICLE.md', source: '# two' }]), error: /重复路径/ },
    { name: 'encrypted.zip', source: createZip([{ name: 'article.md', source: '# encrypted', flags: 0x1 }]), error: /加密/ },
    { name: 'symlink.zip', source: createZip([{ name: 'article.md', source: '# article' }, { name: 'link.png', source: 'target', externalAttributes: 0o120777 << 16 }]), error: /符号链接/ },
    { name: 'spoofed.zip', source: createZip([{ name: 'article.md', source: '![bad](bad.png)' }, { name: 'bad.png', source: 'not a png' }]), error: /类型与扩展名不一致/ },
  ];

  for (const item of cases) {
    const file = path.join(dataStore.paths.tmp, item.name);
    await writeFile(file, item.source);
    await assert.rejects(importPostFile(file, item.name), item.error);
    await unlink(file);
  }

  assert.deepEqual(new Set(await readdir(dataStore.paths.tmp)), tmpBefore);
  assert.deepEqual(new Set(await readdir(dataStore.paths.markdownMedia)), mediaBefore);
});

test('validates cross-platform gallery filenames without renaming safe names', () => {
  assert.equal(validateGalleryFilename('夏日 照片.PNG', 'image/png'), '夏日 照片.PNG');
  assert.equal(validateGalleryFilename('archive.photo.jpeg', 'image/jpeg'), 'archive.photo.jpeg');
  for (const filename of ['../photo.png', '..\\photo.png', 'CON.png', 'name?.png', 'trailing .png ', '.']) {
    assert.throws(() => validateGalleryFilename(filename, 'image/png'), /文件名无效/);
  }
  assert.throws(() => validateGalleryFilename('photo.jpg', 'image/png'), /扩展名不一致/);
});

test('migrates legacy storage without rewriting content or security data', async () => {
  const legacyRoot = await mkdtemp(path.join(os.tmpdir(), 'cocynoric-blog-legacy-'));
  const legacyStore = new DataStore(legacyRoot);
  const legacyId = '123e4567-e89b-42d3-a456-426614174000';
  const mediaName = '123e4567-e89b-42d3-a456-426614174001.png';
  const postId = '123e4567-e89b-42d3-a456-426614174002';
  const postSource = Buffer.from(`---\nid: ${postId}\nslug: legacy-post\ntitle: 旧文章\nexcerpt: 保持原始字节\ndate: 2026-07-01\nupdatedAt: 2026-07-01T00:00:00.000Z\nstatus: published\ntags: []\n---\r\n正文 ![](/media/${mediaName})\r\n`, 'utf8');
  const adminSource = '{"salt":"unchanged","digest":"unchanged"}\n';
  const sessionSource = '{"csrfToken":"unchanged"}\n';

  try {
    await Promise.all([
      mkdir(path.join(legacyRoot, 'posts'), { recursive: true }),
      mkdir(path.join(legacyRoot, 'media'), { recursive: true }),
      mkdir(path.join(legacyRoot, 'sessions'), { recursive: true }),
      mkdir(path.join(legacyRoot, 'tmp'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(legacyRoot, 'posts', `${postId}.md`), postSource),
      writeFile(path.join(legacyRoot, 'media', mediaName), png),
      writeFile(path.join(legacyRoot, 'gallery.json'), `${JSON.stringify([{ id: legacyId, url: `/media/${mediaName}`, title: '旧画廊', description: '', createdAt: '2026-07-02T00:00:00.000Z' }], null, 2)}\n`),
      writeFile(path.join(legacyRoot, '.initialized'), '1'),
      writeFile(path.join(legacyRoot, 'admin.json'), adminSource),
      writeFile(path.join(legacyRoot, 'sessions', 'session.json'), sessionSource),
      writeFile(path.join(legacyRoot, 'tmp', 'keep.tmp'), 'keep'),
      writeFile(path.join(legacyRoot, 'unknown.sentinel'), 'keep'),
    ]);

    await legacyStore.initialize();
    const [postAfter, items, adminAfter, sessionAfter] = await Promise.all([
      readFile(path.join(legacyStore.paths.posts, `${postId}.md`)),
      legacyStore.listGallery(),
      readFile(legacyStore.paths.admin, 'utf8'),
      readFile(path.join(legacyStore.paths.sessions, 'session.json'), 'utf8'),
    ]);

    assert.deepEqual(postAfter, postSource);
    assert.deepEqual(await readFile(path.join(legacyStore.paths.markdownMedia, mediaName)), png);
    assert.equal(items[0]?.id, '00000001');
    assert.equal(items[0]?.legacyId, legacyId);
    assert.equal(items[0]?.originalFilename, mediaName);
    assert.equal((await legacyStore.getGalleryItem(legacyId))?.id, '00000001');
    assert.deepEqual(await readFile(legacyStore.galleryFilePath(items[0]!)), png);
    assert.equal(adminAfter, adminSource);
    assert.equal(sessionAfter, sessionSource);
    assert.equal(await readFile(path.join(legacyStore.paths.tmp, 'keep.tmp'), 'utf8'), 'keep');
    assert.equal(await readFile(path.join(legacyRoot, 'unknown.sentinel'), 'utf8'), 'keep');
    assert.deepEqual(await readFile(path.join(legacyStore.paths.media, mediaName)), png);

    await legacyStore.initialize();
    assert.equal((await legacyStore.listGallery())[0]?.id, '00000001');
  } finally {
    await rm(legacyRoot, { recursive: true, force: true });
  }
});

test('detects migration conflicts before moving legacy posts', async () => {
  const legacyRoot = await mkdtemp(path.join(os.tmpdir(), 'cocynoric-blog-conflict-'));
  const legacyStore = new DataStore(legacyRoot);
  const legacyId = '123e4567-e89b-42d3-a456-426614174010';
  const mediaName = '123e4567-e89b-42d3-a456-426614174011.png';
  const postName = '123e4567-e89b-42d3-a456-426614174012.md';
  const postSource = Buffer.from(`---\nid: 123e4567-e89b-42d3-a456-426614174012\nslug: conflict\ntitle: 冲突验证\nexcerpt: 保留源文件\ndate: 2026-07-01\nupdatedAt: 2026-07-01T00:00:00.000Z\nstatus: published\ntags: []\n---\n正文 ![](/media/${mediaName})\n`);
  const conflictingTarget = path.join(legacyStore.paths.galleryRoot, '00000001', mediaName);
  const migratedPost = path.join(legacyStore.paths.posts, postName);

  try {
    await Promise.all([
      mkdir(path.join(legacyRoot, 'posts'), { recursive: true }),
      mkdir(path.join(legacyRoot, 'media'), { recursive: true }),
      mkdir(path.dirname(conflictingTarget), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(legacyRoot, 'posts', postName), postSource),
      writeFile(path.join(legacyRoot, 'media', mediaName), png),
      writeFile(path.join(legacyRoot, 'gallery.json'), `${JSON.stringify([{ id: legacyId, url: `/media/${mediaName}`, title: '冲突图片', description: '', createdAt: '2026-07-02T00:00:00.000Z' }], null, 2)}\n`),
      writeFile(conflictingTarget, 'conflict'),
    ]);

    await assert.rejects(legacyStore.initialize(), /存储迁移目标冲突/);
    assert.deepEqual(await readFile(path.join(legacyRoot, 'posts', postName)), postSource);
    await assert.rejects(readFile(migratedPost), (error: NodeJS.ErrnoException) => error.code === 'ENOENT');
    assert.equal(await readFile(path.join(legacyRoot, 'gallery.json'), 'utf8').then((source) => JSON.parse(source)[0].id), legacyId);
    assert.equal(await readFile(conflictingTarget, 'utf8'), 'conflict');
  } finally {
    await rm(legacyRoot, { recursive: true, force: true });
  }
});

test('validates an existing gallery index before moving legacy posts', async () => {
  const legacyRoot = await mkdtemp(path.join(os.tmpdir(), 'cocynoric-blog-invalid-index-'));
  const legacyStore = new DataStore(legacyRoot);
  const postName = '123e4567-e89b-42d3-a456-426614174020.md';
  const postSource = Buffer.from('legacy post');

  try {
    await Promise.all([
      mkdir(path.join(legacyRoot, 'posts'), { recursive: true }),
      mkdir(legacyStore.paths.galleryRoot, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(legacyRoot, 'posts', postName), postSource),
      writeFile(legacyStore.paths.gallery, '{}'),
    ]);

    await assert.rejects(legacyStore.initialize());
    assert.deepEqual(await readFile(path.join(legacyRoot, 'posts', postName)), postSource);
    await assert.rejects(readFile(path.join(legacyStore.paths.posts, postName)), (error: NodeJS.ErrnoException) => error.code === 'ENOENT');
  } finally {
    await rm(legacyRoot, { recursive: true, force: true });
  }
});

test('stores and validates code-tools files through the manifest', async () => {
  assert.equal(validateCodeToolFilename('工具 · 说明.txt'), '工具 · 说明.txt');
  assert.equal(validateCodeToolFilename('é.txt'), 'é.txt');
  for (const filename of ['../tool.js', '..\\tool.js', 'CON.txt', 'tool?.js', 'trailing.txt ', '.', 'tool/part']) {
    assert.throws(() => validateCodeToolFilename(filename), /文件名无效/);
  }

  const temporaryPath = path.join(dataStore.paths.tmp, 'code-tool.upload');
  const source = Buffer.from('<script>alert(1)</script>');
  await writeFile(temporaryPath, source);
  const item = await dataStore.addCodeTool({
    temporaryPath,
    originalFilename: '工具 · 说明.txt',
    size: source.length,
    mimeType: 'text/plain',
    mimeSource: 'declared',
    sha256: '0'.repeat(64),
  });

  assert.match(item.id, /^[a-f0-9-]{36}$/);
  assert.equal((await dataStore.listCodeTools()).length, 1);
  assert.deepEqual(await readFile(dataStore.codeToolFilePath(item)), source);
  assert.equal((await dataStore.getCodeTool(item.id))?.originalFilename, '工具 · 说明.txt');
  assert.equal((await dataStore.deleteCodeTool(item.id))?.id, item.id);
  assert.equal(await dataStore.getCodeTool(item.id), null);
  await assert.rejects(readFile(dataStore.codeToolFilePath(item)), (error: NodeJS.ErrnoException) => error.code === 'ENOENT');
});

test('accepts one multipart code-tools file without hitting a parts limit', async () => {
  const boundary = '----cocynoric-code-tool-test';
  const source = Buffer.from('single multipart upload');
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="tool.txt"\r\nContent-Type: text/plain\r\n\r\n`),
    source,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const request = Object.assign(new PassThrough(), {
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    },
  }) as Parameters<typeof receiveCodeTool>[0];

  const receivedPromise = receiveCodeTool(request);
  request.end(body);
  const received = await receivedPromise;

  try {
    assert.equal(received.originalFilename, 'tool.txt');
    assert.equal(received.size, source.length);
    assert.equal(received.mimeType, 'text/plain');
    assert.equal(received.mimeSource, 'declared');
    assert.equal(received.sha256, createHash('sha256').update(source).digest('hex'));
    assert.deepEqual(await readFile(received.temporaryPath), source);
  } finally {
    await unlink(received.temporaryPath).catch(() => undefined);
  }
});

test('preserves nested paths for multipart code-tools project folders', async () => {
  const received = await createProjectUpload({
    projectName: 'nested-folder-project',
    mode: 'folder',
    files: [
      { name: 'selected-root/src/nested/tool.ts', source: 'export const answer = 42;\n', contentType: 'text/typescript' },
      { name: 'selected-root/README.md', source: '# Nested project\n', contentType: 'text/markdown' },
    ],
  });

  assert.deepEqual(received.project.files.map((file) => file.relativePath).sort(), ['README.md', 'src/nested/tool.ts']);
  const project = await dataStore.addCodeToolProject(received);
  assert.deepEqual(await readFile(dataStore.codeToolProjectFilePath(project, 'src/nested/tool.ts'), 'utf8'), 'export const answer = 42;\n');

  const root = await dataStore.codeToolProjectListing(project.slug);
  assert.deepEqual(root?.entries.map((entry) => ({ name: entry.name, kind: entry.kind })), [
    { name: 'README.md', kind: 'file' },
    { name: 'src', kind: 'directory' },
  ]);
  const nested = await repositoryTree('code-tools', `${project.slug}/src/nested`);
  assert.deepEqual(nested.entries.map((entry) => entry.name), ['tool.ts']);
  assert.equal(nested.entries[0]?.download, true);

  assert.equal((await dataStore.deleteCodeToolProject(project.slug))?.id, project.id);
  assert.equal(await dataStore.getCodeToolProject(project.slug), null);
  await assert.rejects(readFile(dataStore.codeToolProjectFilePath(project, 'README.md')), (error: NodeJS.ErrnoException) => error.code === 'ENOENT');
});

test('deletes individual code-tools files and nested folders through the project manifest', async () => {
  const received = await createProjectUpload({
    projectName: 'entry-delete-project',
    mode: 'folder',
    files: [
      { name: 'selected-root/README.md', source: '# Keep\n' },
      { name: 'selected-root/src/keep.ts', source: 'export const keep = true;\n' },
      { name: 'selected-root/src/nested/tool.ts', source: 'export const tool = true;\n' },
    ],
  });
  const project = await dataStore.addCodeToolProject(received);

  const fileDeleted = await dataStore.deleteCodeToolProjectEntry(project.slug, 'src/nested/tool.ts');
  assert.equal(fileDeleted?.kind, 'file');
  assert.equal(fileDeleted?.project.fileCount, 2);
  await assert.rejects(readFile(dataStore.codeToolProjectFilePath(project, 'src/nested/tool.ts')), (error: NodeJS.ErrnoException) => error.code === 'ENOENT');
  assert.deepEqual((await dataStore.codeToolProjectListing(project.slug, 'src'))?.entries.map((entry) => entry.name), ['keep.ts']);

  const folderDeleted = await dataStore.deleteCodeToolProjectEntry(project.slug, 'src');
  assert.equal(folderDeleted?.kind, 'directory');
  assert.equal(folderDeleted?.project.fileCount, 1);
  assert.equal((await dataStore.codeToolProjectListing(project.slug))?.entries.find((entry) => entry.name === 'src'), undefined);
  assert.deepEqual(await readFile(dataStore.codeToolProjectFilePath(project, 'README.md'), 'utf8'), '# Keep\n');

  for (const unsafePath of ['', '../README.md', 'src\\keep.ts', '/src', '.git/config', 'src//keep.ts']) {
    await assert.rejects(dataStore.deleteCodeToolProjectEntry(project.slug, unsafePath), (error: Error & { status?: number }) => error.status === 400);
  }
  assert.equal((await dataStore.deleteCodeToolProject(project.slug))?.id, project.id);
});

test('rejects conflicting multipart project paths without residue', async () => {
  const tmpBefore = new Set(await readdir(dataStore.paths.tmp));
  await assert.rejects(createProjectUpload({
    projectName: 'duplicate-folder-project',
    mode: 'folder',
    files: [
      { name: 'selected-root/src/Tool.ts', source: 'one' },
      { name: 'selected-root/src/tool.ts', source: 'two' },
    ],
  }), /重复路径/);
  assert.deepEqual(new Set(await readdir(dataStore.paths.tmp)), tmpBefore);
});

test('extracts and preserves ZIP code-tools projects safely', async () => {
  const archive = createZip([
    { name: 'archive-root/README.md', source: '# Archive\n' },
    { name: 'archive-root/src/nested/tool.js', source: 'export default 1;\n' },
  ]);
  const extracted = await createProjectUpload({
    projectName: 'extracted-zip-project',
    mode: 'zip',
    files: [{ name: 'archive.zip', source: archive, contentType: 'application/zip' }],
  });
  assert.deepEqual(extracted.project.files.map((file) => file.relativePath).sort(), ['README.md', 'src/nested/tool.js']);
  const extractedProject = await dataStore.addCodeToolProject(extracted);
  assert.equal(await readFile(dataStore.codeToolProjectFilePath(extractedProject, 'src/nested/tool.js'), 'utf8'), 'export default 1;\n');

  const kept = await createProjectUpload({
    projectName: 'kept-zip-project',
    mode: 'zip',
    zipMode: 'keep',
    files: [{ name: 'source.zip', source: archive, contentType: 'application/zip' }],
  });
  assert.deepEqual(kept.project.files.map((file) => file.relativePath), ['source.zip']);
  const keptProject = await dataStore.addCodeToolProject(kept);
  assert.deepEqual(await readFile(dataStore.codeToolProjectFilePath(keptProject, 'source.zip')), archive);

  await Promise.all([
    dataStore.deleteCodeToolProject(extractedProject.slug),
    dataStore.deleteCodeToolProject(keptProject.slug),
  ]);
});

test('supports retained ZIP projects up to 128 MB and rejects larger archives', async () => {
  const tmpBefore = new Set(await readdir(dataStore.paths.tmp));
  const validZipHeader = createZip([]);
  const chunkSize = 1024 * 1024;
  const retainedSize = 65 * 1024 * 1024;
  function* retainedZip() {
    for (let written = 0; written < retainedSize - validZipHeader.length; written += chunkSize) {
      yield Buffer.alloc(Math.min(chunkSize, retainedSize - validZipHeader.length - written));
    }
    yield validZipHeader;
  }
  const received = await createStreamingProjectUpload({
    projectName: 'large-retained-zip-project',
    filename: 'large.zip',
    source: retainedZip(),
  });
  assert.equal(received.project.files[0]?.size, retainedSize);
  const project = await dataStore.addCodeToolProject(received);
  assert.equal(project.totalBytes, retainedSize);
  await dataStore.deleteCodeToolProject(project.slug);

  function* oversizedZip() {
    for (let written = 0; written <= 128 * 1024 * 1024; written += chunkSize) yield Buffer.alloc(chunkSize);
    yield validZipHeader;
  }
  await assert.rejects(
    createStreamingProjectUpload({ projectName: 'oversized-retained-zip-project', filename: 'oversized.zip', source: oversizedZip() }),
    (error: Error & { status?: number }) => error.status === 413 && error.message === 'ZIP 文件不能超过 128 MB',
  );
  assert.deepEqual(new Set(await readdir(dataStore.paths.tmp)), tmpBefore);
});

test('rejects extracted ZIP projects over the 100 MB content limit', async () => {
  const tmpBefore = new Set(await readdir(dataStore.paths.tmp));
  const archive = createZip([
    { name: 'first.txt', source: Buffer.alloc(20 * 1024 * 1024) },
    { name: 'second.txt', source: Buffer.alloc(20 * 1024 * 1024) },
    { name: 'third.txt', source: Buffer.alloc(20 * 1024 * 1024) },
    { name: 'fourth.txt', source: Buffer.alloc(20 * 1024 * 1024) },
    { name: 'fifth.txt', source: Buffer.alloc(20 * 1024 * 1024) },
    { name: 'sixth.txt', source: Buffer.alloc(20 * 1024 * 1024) },
  ]);
  await assert.rejects(
    createProjectUpload({ projectName: 'oversized-extracted-zip-project', mode: 'zip', files: [{ name: 'large.zip', source: archive, contentType: 'application/zip' }] }),
    (error: Error & { status?: number }) => error.status === 413 && error.message === '项目解压后的总大小不能超过 100 MB',
  );
  assert.deepEqual(new Set(await readdir(dataStore.paths.tmp)), tmpBefore);
});
test('rejects invalid and empty extracted ZIP projects without residue', async () => {
  const tmpBefore = new Set(await readdir(dataStore.paths.tmp));
  await assert.rejects(createProjectUpload({
    projectName: 'invalid-zip-project',
    mode: 'zip',
    zipMode: 'keep',
    files: [{ name: 'invalid.zip', source: 'not a zip', contentType: 'application/zip' }],
  }), /ZIP 文件无效/);
  await assert.rejects(createProjectUpload({
    projectName: 'empty-zip-project',
    mode: 'zip',
    files: [{ name: 'empty.zip', source: createZip([]), contentType: 'application/zip' }],
  }), /没有可上传的文件/);
  assert.deepEqual(new Set(await readdir(dataStore.paths.tmp)), tmpBefore);
});

test('removes code-tools projects whose physical directory is already missing', async () => {
  const received = await createProjectUpload({
    projectName: 'missing-directory-project',
    mode: 'folder',
    files: [{ name: 'selected-root/tool.txt', source: 'ghost' }],
  });
  const project = await dataStore.addCodeToolProject(received);
  await rm(dataStore.codeToolProjectRootPath(project), { recursive: true, force: true });

  assert.equal((await dataStore.deleteCodeToolProject(project.slug))?.id, project.id);
  assert.equal(await dataStore.getCodeToolProject(project.slug), null);
});

test('initializes an empty code-tools directory when upgrading storage layout v1', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cocynoric-blog-layout-v1-'));
  const store = new DataStore(root);
  try {
    await Promise.all([
      mkdir(store.paths.galleryRoot, { recursive: true }),
      mkdir(store.paths.codeToolsItems, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(store.paths.gallery, `${JSON.stringify({ version: 1, nextId: 1, items: [] })}\n`),
      writeFile(store.paths.storageLayout, '{"version":1}\n'),
      writeFile(store.paths.settings, JSON.stringify({
        version: 9,
        siteName: '迁移测试',
        homeTitle: '迁移测试',
        footerText: '迁移测试',
        description: '',
        backgroundImage: null,
        backgroundPosition: 'center',
        backgroundOverlay: 0,
        backgroundBlur: 0,
        seedColor: '#415f91',
        contentWidth: 'standard',
        cardDensity: 'comfortable',
        bodyFontSize: 16,
        footerMode: 'transparent',
        galleryDescription: '',
        repositoryTitle: '仓库',
        repositoryDescription: '',
        repositoryAppearance: {
          backgroundImage: null,
          headingMinHeight: 220,
          titleAlign: 'left',
          contentOffset: 0,
          surfaceOpacity: 1,
          directoryLayout: 'grid',
          showDescriptions: true,
          showItemCounts: true,
          showFileMetadata: true,
        },
        profileName: '迁移测试',
        profileAvatar: null,
        webIcon: null,
        homeHero: { minHeight: 680, titleAlign: 'left', contentOffset: 0 },
        homeContent: { articleLimit: 4, galleryLimit: 6, articleSurfaceOpacity: 1, gallerySurfaceOpacity: 1 },
        browsing: {
          article: { railSide: 'left', railWidth: 340, showRecentPosts: true, recentPostsLimit: 4, showRecentGallery: false, recentGalleryLimit: 6, thumbnailColumns: 2, thumbnailRows: 3, contentWidth: 820 },
          gallery: { railSide: 'right', railWidth: 340, showRecentPosts: true, recentPostsLimit: 4, showRecentGallery: true, recentGalleryLimit: 6, thumbnailColumns: 2, thumbnailRows: 3, mediaWidth: 705, portraitMaxHeight: 880 },
        },
      }) + '\n'),
    ]);
    await store.initialize();
    assert.deepEqual(JSON.parse(await readFile(store.paths.storageLayout, 'utf8')), { version: 2 });
    assert.deepEqual(JSON.parse(await readFile(store.paths.codeToolsIndex, 'utf8')), { version: 2, items: [], projects: [] });
    assert.deepEqual(await readdir(store.paths.codeToolsItems), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('streams code-tools project archives with manifest-backed files only', async () => {
  const received = await createProjectUpload({
    projectName: 'archive-download-project',
    mode: 'folder',
    files: [
      { name: 'selected-root/README.md', source: '# Archive download\n' },
      { name: 'selected-root/src/nested/tool.ts', source: 'export const zip = true;\n' },
      { name: 'selected-root/empty.txt', source: '' },
    ],
  });
  const project = await dataStore.addCodeToolProject(received);
  try {
    const request = archiveRequest(project.slug);
    const response = new ArchiveResponse();
    const complete = new Promise<void>((resolve, reject) => {
      response.once('finish', resolve);
      response.once('error', reject);
    });
    await serveCodeToolProjectArchiveDownload(request, response as never);
    await complete;

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers.get('content-type'), 'application/zip');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-disposition') ?? '', new RegExp(`${project.slug}\\.zip`));
    assert.equal(response.headers.has('content-length'), false);
    assert.deepEqual(await zipEntries(Buffer.concat(response.chunks)), [
      { name: `${project.slug}/empty.txt`, source: Buffer.alloc(0) },
      { name: `${project.slug}/README.md`, source: Buffer.from('# Archive download\n') },
      { name: `${project.slug}/src/nested/tool.ts`, source: Buffer.from('export const zip = true;\n') },
    ]);
  } finally {
    await dataStore.deleteCodeToolProject(project.slug);
  }
});

test('rejects inconsistent code-tools project archives before streaming', async () => {
  const received = await createProjectUpload({
    projectName: 'broken-archive-project',
    mode: 'folder',
    files: [{ name: 'selected-root/tool.txt', source: 'original' }],
  });
  const project = await dataStore.addCodeToolProject(received);
  try {
    await writeFile(dataStore.codeToolProjectFilePath(project, 'tool.txt'), 'changed');
    const request = archiveRequest(project.slug);
    const response = new ArchiveResponse();
    await serveCodeToolProjectArchiveDownload(request, response as never);
    assert.equal(response.statusCode, 404);
    assert.equal(response.chunks.length, 0);
    assert.equal(response.headers.size, 0);
  } finally {
    await dataStore.deleteCodeToolProject(project.slug);
  }
});

test('lists repository areas and maps legacy content into project trees', async () => {
  const received = await createProjectUpload({
    projectName: 'repository-archive-project',
    mode: 'folder',
    files: [{ name: 'selected-root/src/tool.ts', source: 'export {};\n' }],
  });
  const project = await dataStore.addCodeToolProject(received);
  try {
    const overview = await repositoryOverview();
  assert.deepEqual(overview.areas.map((area) => area.key), ['markdown', 'gallery', 'code-tools']);
  assert.equal(overview.areas.find((area) => area.key === 'markdown')?.entryCount, (await dataStore.listPosts()).length);

  const markdownRoot = await repositoryTree('markdown');
  const welcome = markdownRoot.entries.find((entry) => entry.name === 'welcome');
  assert.equal(welcome?.kind, 'directory');
  assert.equal(markdownRoot.parentPath, null);

  const article = await repositoryTree('markdown', 'welcome');
  assert.equal(article.parentPath, '');
  assert.deepEqual(article.entries.map((entry) => ({ name: entry.name, icon: entry.icon, href: entry.href })), [
    { name: '正文.md', icon: 'markdown', href: '/posts/welcome' },
  ]);
  const projectRoot = await repositoryTree('code-tools');
  assert.equal(projectRoot.entries.find((entry) => entry.path === project.slug)?.archiveHref, `/api/repository/code-tools/projects/${project.slug}/archive`);
  const projectListing = await repositoryTree('code-tools', project.slug);
  assert.equal(projectListing.archiveHref, `/api/repository/code-tools/projects/${project.slug}/archive`);
  const projectNested = await repositoryTree('code-tools', `${project.slug}/src`);
  assert.equal(projectNested.archiveHref, undefined);
  } finally {
    await dataStore.deleteCodeToolProject(project.slug);
  }
});

test('rejects private, malformed, and missing repository paths', async () => {
  await assert.rejects(repositoryTree('settings'), (error: Error & { status?: number }) => error.status === 404);
  for (const pathname of ['../settings', 'folder\\file', '/absolute', 'folder//file', 'folder/./file', 'folder file']) {
    await assert.rejects(repositoryTree('markdown', pathname), (error: Error & { status?: number }) => error.status === 400);
  }
  await assert.rejects(repositoryTree('markdown', 'missing-article'), (error: Error & { status?: number }) => error.status === 404);
});

test('centers and clamps gallery crop focus across zoom levels', () => {
  const square = cropAspectRatio('1:1', 1600, 900);
  const centered = centeredCropFocus({ x: .5, y: .5, size: 1 }, 1600, 900, square);
  assert.deepEqual(centered, { x: .5, y: .5, size: 1 });

  const zoomedEdge = centeredCropFocus({ x: 0, y: 1, size: .5 }, 1600, 900, square);
  assert.equal(zoomedEdge.x, .140625);
  assert.equal(zoomedEdge.y, .75);

  const geometry = centeredCropGeometry({ x: 0, y: 1, size: .5 }, 1600, 900, square);
  assert.deepEqual(geometry.focus, zoomedEdge);
  assert.equal(geometry.left + geometry.focus.x * 1600 * (geometry.imageWidth / 1600), .5);
  assert.equal(geometry.top + geometry.focus.y * 900 * (geometry.imageHeight / 900), .5);
  assert.ok(geometry.left <= 0 && geometry.top <= 0);
  assert.ok(geometry.left + geometry.imageWidth >= 1 && geometry.top + geometry.imageHeight >= 1);
});

test('resolves gallery crop aspect ratios', () => {
  assert.equal(cropAspectRatio('16:9'), 16 / 9);
  assert.equal(cropAspectRatio('original', 1200, 800), 1.5);
  assert.equal(cropAspectRatio('original'), 4 / 3);
});
test('matches gallery titles without searching descriptions', () => {
  assert.equal(matchesGalleryTitle('春日花园', '花园'), true);
  assert.equal(matchesGalleryTitle('春日花园', '春日'), true);
  assert.equal(matchesGalleryTitle('春日花园', '海边'), false);
  assert.equal(matchesGalleryTitle('春日花园', ''), true);
});
test('validates customization boundaries', () => {
  const settings = {
    version: 1 as const,
    siteName: '简洁博客',
    homeTitle: '首页标题',
    footerText: '页脚版权',
    description: '技术与作品',
    avatar: '/media/123e4567-e89b-12d3-a456-426614174000.webp',
    backgroundImage: null,
    backgroundPosition: 'center' as const,
    backgroundOverlay: 0.8,
    backgroundBlur: 4,
    seedColor: '#415f91',
    contentWidth: 'standard' as const,
    cardDensity: 'comfortable' as const,
    bodyFontSize: 16,
  };

  assert.equal(settingsSchema.parse(settings).siteName, '简洁博客');
  assert.equal(settingsSchema.parse({ ...settings, seedColor: '#AABBCC' }).seedColor, '#aabbcc');
  assert.equal(settingsSchema.safeParse({ ...settings, backgroundOverlay: 0 }).success, true);
  assert.equal(settingsSchema.safeParse({ ...settings, backgroundOverlay: 1 }).success, true);
  assert.equal(settingsSchema.safeParse({ ...settings, backgroundOverlay: -0.01 }).success, false);
  assert.equal(settingsSchema.safeParse({ ...settings, backgroundOverlay: 1.01 }).success, false);
  assert.equal(settingsSchema.safeParse({ ...settings, seedColor: 'red' }).success, false);
  assert.equal(settingsSchema.safeParse({ ...settings, backgroundImage: 'https://example.com/a.jpg' }).success, false);
  const migrated = settingsSchema.parse(settings);
  assert.equal(migrated.footerMode, 'transparent');
  assert.equal(migrated.galleryDescription, '项目、作品与视觉记录。');
  assert.equal(migrated.repositoryTitle, '仓库');
  assert.equal(migrated.repositoryDescription, '代码、工具与项目归档。');
  const current = settingsSchema.parse(settings);
  assert.equal(settingsSchema.safeParse({ ...current, footerMode: 'surface' }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, galleryDescription: 'x'.repeat(241) }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, repositoryTitle: '' }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, repositoryTitle: ' '.repeat(121) }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, repositoryTitle: 'x'.repeat(120) }).success, true);
  assert.equal(settingsSchema.safeParse({ ...current, repositoryDescription: '' }).success, true);
  assert.equal(settingsSchema.safeParse({ ...current, repositoryDescription: 'x'.repeat(240) }).success, true);
  assert.equal(settingsSchema.safeParse({ ...current, repositoryDescription: 'x'.repeat(241) }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, profileAvatar: 'https://example.com/avatar.png' }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, webIcon: '/media/icon.svg' }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, profileAvatar: null, webIcon: null }).success, true);
  assert.equal(settingsSchema.safeParse({ ...current, homeHero: { minHeight: 519, titleAlign: 'left', contentOffset: 0 } }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, homeHero: { minHeight: 680, titleAlign: 'center', contentOffset: 181 } }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, browsing: { ...current.browsing, article: { ...current.browsing.article, railWidth: 279 } } }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, browsing: { ...current.browsing, gallery: { ...current.browsing.gallery, railWidth: 440, mediaWidth: 880 } } }).success, true);
  assert.equal(settingsSchema.safeParse({ ...current, browsing: { ...current.browsing, article: { ...current.browsing.article, recentPostsLimit: 0 } } }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, browsing: { ...current.browsing, gallery: { ...current.browsing.gallery, railSide: 'center' } } }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, browsing: { ...current.browsing, article: { ...current.browsing.article, contentWidth: 1100 } } }).success, true);
  assert.equal(settingsSchema.safeParse({ ...current, browsing: { ...current.browsing, gallery: { ...current.browsing.gallery, mediaWidth: 1101 } } }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, browsing: { ...current.browsing, gallery: { ...current.browsing.gallery, portraitMaxHeight: 559 } } }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, browsing: { ...current.browsing, gallery: { ...current.browsing.gallery, thumbnailColumns: 6 } } }).success, false);
  assert.equal(settingsSchema.safeParse({ ...current, browsing: { ...current.browsing, gallery: { ...current.browsing.gallery, thumbnailRows: 4 } } }).success, true);
  assert.equal(settingsSchema.safeParse({ ...current, homeHero: { minHeight: 680, titleAlign: 'left', contentOffset: 0 }, browsing: current.browsing }).success, true);
});
