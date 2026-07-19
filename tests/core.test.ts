import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cocynoric-blog-'));
process.env.BLOG_DATA_DIR = dataDir;

const [{ dataStore }, { renderMarkdown }, { saveAdminPassword, verifyPassword }, { settingsSchema }, { importPostFile }] = await Promise.all([
  import('../src/server/dataStore.js'),
  import('../src/server/markdown.js'),
  import('../src/server/auth.js'),
  import('../src/shared/schemas.js'),
  import('../src/server/postImport.js'),
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

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

test('initializes settings and starter posts', async () => {
  await dataStore.initialize();
  const settings = await dataStore.readSettings();
  const posts = await dataStore.listPosts();

  assert.equal(settings.siteName, 'CocyNoric‘s Blog');
  assert.equal(settings.profileName, 'CocyNoric');
  assert.equal(settings.profileAvatar, null);
  assert.equal(settings.webIcon, null);
  assert.equal(settings.version, 5);
  assert.equal(settings.homeHero.minHeight, 680);
  assert.equal(settings.homeHero.titleAlign, 'left');
  assert.equal(settings.homeHero.contentOffset, 0);
  assert.equal(settings.browsing.article.railWidth, 340);
  assert.equal(settings.browsing.article.contentWidth, 820);
  assert.equal(settings.browsing.article.showRecentGallery, false);
  assert.equal(settings.browsing.gallery.railWidth, 340);
  assert.equal(settings.browsing.gallery.mediaWidth, 705);
  assert.equal(settings.browsing.gallery.portraitMaxHeight, 880);
  assert.equal(settings.browsing.gallery.thumbnailColumns, 2);
  assert.equal(settings.browsing.gallery.thumbnailRows, 3);
  assert.equal(settings.homeTitle, 'CocyNoric‘s Blog');
  assert.equal(settings.footerText, 'CocyNoric‘s Blog');
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
  assert.equal(migratedV1.footerText, 'CocyNoric‘s Blog');
  assert.equal(migratedV1.version, 5);
  assert.equal(migratedV1.profileName, '旧站点名称');
  assert.equal(migratedV1.profileAvatar, legacyAvatar);
  assert.equal(migratedV1.webIcon, legacyAvatar);
  assert.equal('avatar' in migratedV1, false);
  assert.deepEqual(migratedV1.browsing.article, {
    railSide: 'left', railWidth: 340, showRecentPosts: true, recentPostsLimit: 4,
    showRecentGallery: false, recentGalleryLimit: 6, contentWidth: 820,
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
  assert.equal(migratedV2.version, 5);
  assert.equal(migratedV2.profileName, '旧站点名称');
  assert.equal(migratedV2.profileAvatar, legacyAvatar);
  assert.equal(migratedV2.webIcon, legacyAvatar);
  assert.equal(migratedV2.browsing.article.recentPostsLimit, 7);
  assert.equal(migratedV2.browsing.article.railSide, 'right');
  assert.equal(migratedV2.browsing.gallery.recentGalleryLimit, 5);
  assert.equal(migratedV2.browsing.gallery.railSide, 'left');

  const saved = await dataStore.writeSettings({
    ...migratedV1,
    footerText: '独立版权名称',
    profileName: '个人名称',
    profileAvatar: '/media/123e4567-e89b-12d3-a456-426614174001.png',
    webIcon: null,
    browsing: {
      article: {
        railSide: 'right', railWidth: 420, showRecentPosts: true, recentPostsLimit: 8,
        showRecentGallery: true, recentGalleryLimit: 3, contentWidth: 880,
      },
      gallery: {
        railSide: 'left', railWidth: 420, showRecentPosts: true, recentPostsLimit: 8,
        showRecentGallery: true, recentGalleryLimit: 3, mediaWidth: 880,
        portraitMaxHeight: 900, thumbnailColumns: 3, thumbnailRows: 2,
      },
    },
  });
  assert.equal(saved.footerText, '独立版权名称');
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
  assert.equal(persisted.profileAvatar, '/media/123e4567-e89b-12d3-a456-426614174001.png');
  assert.equal(persisted.webIcon, null);
  assert.equal(persisted.browsing.article.railWidth, 420);
  assert.equal(persisted.browsing.gallery.recentGalleryLimit, 3);
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

test('stores and deletes gallery metadata', async () => {
  const item = await dataStore.addGalleryItem({
    url: '/media/123e4567-e89b-12d3-a456-426614174000.webp',
    title: '测试图片',
    description: '画廊说明',
  });

  assert.equal((await dataStore.listGallery())[0]?.title, '测试图片');
  assert.deepEqual((await dataStore.listGallery())[0]?.thumbnailFocus, { x: 0.5, y: 0.5, size: 1 });
  assert.equal((await dataStore.deleteGalleryItem(item.id))?.id, item.id);
  assert.deepEqual(await dataStore.listGallery(), []);
});

test('updates gallery metadata without changing media fields', async () => {
  const item = await dataStore.addGalleryItem({
    url: '/media/123e4567-e89b-12d3-a456-426614174001.webp',
    title: '原始标题',
    description: '原始说明',
  });

  const updated = await dataStore.updateGalleryItem(item.id, { title: '更新标题', description: '更新说明', thumbnailFocus: { x: 0.2, y: 0.8, size: 0.6 } });
  assert.deepEqual(updated, { ...item, title: '更新标题', description: '更新说明', thumbnailFocus: { x: 0.2, y: 0.8, size: 0.6 } });
  assert.equal((await dataStore.getGalleryItem(item.id))?.url, item.url);
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
  const mediaBefore = new Set(await readdir(dataStore.paths.media));

  const post = await importPostFile(file, 'article.zip');
  const urls = [...post.markdown.matchAll(/\/media\/[a-f0-9-]+\.png/g)].map((match) => match[0]);
  assert.equal(post.status, 'draft');
  assert.equal(urls.length, 2);
  assert.equal(urls[0], urls[1]);
  const mediaAfter = (await readdir(dataStore.paths.media)).filter((name) => !mediaBefore.has(name));
  assert.equal(mediaAfter.length, 1);

  await Promise.all([
    dataStore.deletePost(post.id),
    ...mediaAfter.map((name) => unlink(path.join(dataStore.paths.media, name))),
    unlink(file),
  ]);
});

test('rejects unsafe, duplicate, and spoofed ZIP entries without residue', async () => {
  const tmpBefore = new Set(await readdir(dataStore.paths.tmp));
  const mediaBefore = new Set(await readdir(dataStore.paths.media));
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
  assert.deepEqual(new Set(await readdir(dataStore.paths.media)), mediaBefore);
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
  const current = settingsSchema.parse(settings);
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
