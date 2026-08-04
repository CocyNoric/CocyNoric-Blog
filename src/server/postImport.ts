import { createWriteStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { readFile, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Request } from 'express';
import Busboy from 'busboy';
import { fileTypeFromFile } from 'file-type';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import type { AdminPost } from '../shared/types.js';
import { maximumCategoryDepth, maximumCategorySegmentLength } from '../shared/categories.js';
import { config } from './config.js';
import { dataStore } from './dataStore.js';
import { uploadError } from './media.js';

const archiveLimit = 128 * 1024 * 1024;
const archiveContentLimit = 100 * 1024 * 1024;
const markdownLimit = 1024 * 1024;
const entryLimit = 128;
const imageLimit = 64;
const markdownExtensions = new Set(['.md', '.markdown']);
const imageTypes = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

type MarkdownNode = {
  type?: string;
  depth?: number;
  value?: string;
  url?: string;
  identifier?: string;
  children?: MarkdownNode[];
  position?: { start?: { offset?: number }; end?: { offset?: number } };
};

type ImportedImage = {
  sourcePath: string;
  temporaryPath: string;
  expectedMime: string;
};

type ImageReference = {
  start: number;
  end: number;
  sourcePath: string;
};

function importError(message: string, status = 400) {
  return Object.assign(new Error(message), { status });
}

function archiveError(error: Error & { status?: number }) {
  if (error.status) return error;
  if (/encrypt/i.test(error.message)) return importError('不支持加密的 ZIP 条目');
  if (/invalid relative path/i.test(error.message)) {
    return importError(error.message.includes('..') ? 'ZIP 中包含路径穿越' : 'ZIP 中包含不安全的文件路径');
  }
  return importError('ZIP 文件无效');
}

function extensionOf(filename: string) {
  return path.extname(filename).toLowerCase();
}

function safeArchivePath(value: string) {
  if (!value || value.includes('\0') || value.includes('\\') || value.startsWith('/') || /^[a-z]:/i.test(value)) {
    throw importError('ZIP 中包含不安全的文件路径');
  }
  const directory = value.endsWith('/');
  const parts = value.split('/').filter((part, index, all) => part || index === all.length - 1);
  if (parts.some((part) => part === '..')) throw importError('ZIP 中包含路径穿越');
  const normalized = path.posix.normalize(value).replace(/^\.\//, '').replace(/\/$/, '');
  if (!normalized || normalized === '.' || normalized.startsWith('../')) {
    if (directory && (normalized === '' || normalized === '.')) return '';
    throw importError('ZIP 中包含不安全的文件路径');
  }
  return normalized.normalize('NFC');
}

function ignoredArchivePath(filename: string) {
  const parts = filename.split('/');
  return parts.includes('__MACOSX') || parts.at(-1) === '.DS_Store';
}

function isSymlink(entry: Entry) {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (mode & 0o170000) === 0o120000;
}

function openZip(filePath: string) {
  return new Promise<ZipFile>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: false }, (error, zipFile) => {
      if (error || !zipFile) reject(error ?? importError('无法读取 ZIP 文件'));
      else resolve(zipFile);
    });
  });
}

function openEntry(zipFile: ZipFile, entry: Entry) {
  return new Promise<Readable>((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? importError('无法读取 ZIP 条目'));
      else resolve(stream);
    });
  });
}

async function entryBuffer(zipFile: ZipFile, entry: Entry, maximum: number) {
  const stream = await openEntry(zipFile, entry);
  const chunks: Buffer[] = [];
  let size = 0;
  return new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maximum) {
        stream.destroy(importError('Markdown 文件不能超过 1 MB', 413));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function entryFile(zipFile: ZipFile, entry: Entry, destination: string, consumeSize: (size: number) => void) {
  const stream = await openEntry(zipFile, entry);
  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      try {
        if (size > config.uploadLimit) throw importError('ZIP 中的图片不能超过 20 MB', 413);
        consumeSize(chunk.length);
        callback(null, chunk);
      } catch (error) {
        callback(error as Error);
      }
    },
  });
  await pipeline(stream, limiter, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
}

async function scanArchive(filePath: string, visit: (zipFile: ZipFile, entry: Entry, normalized: string) => Promise<void>) {
  let zipFile: ZipFile;
  try {
    zipFile = await openZip(filePath);
  } catch (error) {
    throw archiveError(error as Error);
  }

  const seenPaths = new Set<string>();
  let entries = 0;
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      zipFile.close();
      reject(archiveError(error));
    };
    zipFile.on('error', fail);
    zipFile.on('end', () => {
      if (settled) return;
      settled = true;
      zipFile.close();
      resolve();
    });
    zipFile.on('entry', (entry: Entry) => {
      void (async () => {
        entries += 1;
        if (entries > entryLimit) throw importError('ZIP 最多包含 128 个条目', 413);
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw importError('不支持加密的 ZIP 条目');
        if (isSymlink(entry)) throw importError('ZIP 中不能包含符号链接');

        const normalized = safeArchivePath(entry.fileName);
        const key = normalized.toLocaleLowerCase('en-US');
        if (normalized && seenPaths.has(key)) throw importError('ZIP 中包含重复路径');
        if (normalized) seenPaths.add(key);
        if (entry.uncompressedSize > 1024 * 1024 && entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > 1000) {
          throw importError('ZIP 压缩比例异常');
        }
        if (ignoredArchivePath(normalized) || !normalized || entry.fileName.endsWith('/')) {
          zipFile.readEntry();
          return;
        }

        await visit(zipFile, entry, normalized);
        zipFile.readEntry();
      })().catch(fail);
    });
    zipFile.readEntry();
  });
}

async function readArchive(filePath: string) {
  let markdown: { filename: string; source: Buffer } | null = null;
  const archiveEntries = new Map<string, { sourcePath: string; expectedMime: string | null }>();

  await scanArchive(filePath, async (zipFile, entry, normalized) => {
    const key = normalized.toLocaleLowerCase('en-US');
    const extension = extensionOf(normalized);
    const expectedMime = imageTypes.get(extension) ?? null;
    archiveEntries.set(key, { sourcePath: normalized, expectedMime });
    if (!markdownExtensions.has(extension)) return;
    if (markdown) throw importError('ZIP 中只能包含一个 Markdown 文件');
    if (entry.uncompressedSize > markdownLimit) throw importError('Markdown 文件不能超过 1 MB', 413);
    markdown = { filename: normalized, source: await entryBuffer(zipFile, entry, markdownLimit) };
  });

  const article = markdown as { filename: string; source: Buffer } | null;
  if (!article) throw importError('ZIP 中必须包含一个 Markdown 文件');
  const parsed = matter(decodeMarkdown(article.source));
  if (Buffer.byteLength(parsed.content, 'utf8') > markdownLimit) throw importError('Markdown 正文不能超过 1 MB', 413);
  const { references } = collectImageReferences(parsed.content, article.filename);
  const requiredImages = new Map<string, { sourcePath: string; expectedMime: string }>();
  for (const reference of references) {
    const image = archiveEntries.get(reference.sourcePath);
    const url = parsed.content.slice(reference.start, reference.end);
    if (!image) throw importError(`ZIP 中缺少 Markdown 引用的图片：${url}`);
    if (!image.expectedMime) throw importError(`ZIP 中不支持 Markdown 引用的图片：${url}`);
    requiredImages.set(reference.sourcePath, { sourcePath: image.sourcePath, expectedMime: image.expectedMime });
  }
  if (requiredImages.size > imageLimit) throw importError('ZIP 最多包含 64 张图片', 413);

  const temporaryFiles = new Set<string>();
  const images = new Map<string, ImportedImage>();
  let actualSize = article.source.length;
  const consumeSize = (size: number) => {
    actualSize += size;
    if (actualSize > archiveContentLimit) throw importError('ZIP 解压后的总大小不能超过 100 MB', 413);
  };

  try {
    await scanArchive(filePath, async (zipFile, entry, normalized) => {
      const key = normalized.toLocaleLowerCase('en-US');
      const required = requiredImages.get(key);
      if (!required) return;
      if (entry.uncompressedSize > config.uploadLimit) throw importError('ZIP 中的图片不能超过 20 MB', 413);
      const temporaryPath = path.join(dataStore.paths.tmp, `${randomUUID()}.import-image`);
      temporaryFiles.add(temporaryPath);
      await entryFile(zipFile, entry, temporaryPath, consumeSize);
      images.set(key, { ...required, temporaryPath });
    });
    if (images.size !== requiredImages.size) throw importError('ZIP 中缺少 Markdown 引用的图片');
    return { markdown: article, images, temporaryFiles };
  } catch (error) {
    await Promise.all([...temporaryFiles].map((temporaryPath) => unlink(temporaryPath).catch(() => undefined)));
    throw error;
  }
}

function decodeMarkdown(source: Buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(source).replace(/^﻿/, '');
  } catch {
    throw importError('Markdown 必须使用 UTF-8 编码');
  }
}

function textContent(node: MarkdownNode): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? '';
  return node.children?.map(textContent).join('') ?? '';
}

function firstHeading(root: MarkdownNode) {
  let result = '';
  const visit = (node: MarkdownNode) => {
    if (result) return;
    if (node.type === 'heading' && node.depth === 1) {
      result = textContent(node).trim();
      return;
    }
    node.children?.forEach(visit);
  };
  visit(root);
  return result;
}

function relativeImage(url: string) {
  if (!url || url.startsWith('/media/') || url.startsWith('/') || url.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(url)) return false;
  return true;
}

function resolveImagePath(markdownPath: string, url: string, sourceLabel = 'ZIP') {
  const withoutSuffix = url.split(/[?#]/, 1)[0] ?? '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    throw importError(`图片路径编码无效：${url}`);
  }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.startsWith('/') || /^[a-z]:/i.test(decoded)) throw importError(`图片路径无效：${url}`);
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(markdownPath), decoded));
  if (!resolved || resolved === '.' || resolved.startsWith('../') || path.posix.isAbsolute(resolved)) {
    throw importError(`图片路径超出${sourceLabel}范围：${url}`);
  }
  return resolved.normalize('NFC').toLocaleLowerCase('en-US');
}

function collectImageReferences(markdown: string, markdownPath: string, sourceLabel = 'ZIP') {
  const root = unified().use(remarkParse).parse(markdown) as MarkdownNode;
  const imageIdentifiers = new Set<string>();
  const candidates: MarkdownNode[] = [];

  const visit = (node: MarkdownNode) => {
    if (node.type === 'image' && node.url) candidates.push(node);
    if (node.type === 'imageReference' && node.identifier) imageIdentifiers.add(node.identifier.toLocaleLowerCase('en-US'));
    node.children?.forEach(visit);
  };
  visit(root);

  const definitions = (node: MarkdownNode) => {
    if (node.type === 'definition' && node.url && node.identifier && imageIdentifiers.has(node.identifier.toLocaleLowerCase('en-US'))) {
      candidates.push(node);
    }
    node.children?.forEach(definitions);
  };
  definitions(root);

  const references: ImageReference[] = [];
  for (const node of candidates) {
    const url = node.url!;
    if (!relativeImage(url)) continue;
    const sourcePath = resolveImagePath(markdownPath, url, sourceLabel);
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (start === undefined || end === undefined) throw importError('无法定位 Markdown 图片链接');
    const segment = markdown.slice(start, end);
    const delimiter = node.type === 'definition' ? segment.indexOf(':') : segment.lastIndexOf('](');
    const relativeOffset = segment.indexOf(url, Math.max(delimiter, 0));
    if (relativeOffset < 0) throw importError(`无法改写图片链接：${url}`);
    references.push({ start: start + relativeOffset, end: start + relativeOffset + url.length, sourcePath });
  }
  return { root, references };
}

function imageReferences(markdown: string, markdownPath: string, images?: Map<string, ImportedImage>) {
  const result = collectImageReferences(markdown, markdownPath);
  for (const reference of result.references) {
    if (!images) throw importError(`Markdown 引用了本地图片“${markdown.slice(reference.start, reference.end)}”，请将文章和图片一起打包为 ZIP 后导入`);
    if (!images.has(reference.sourcePath)) {
      const url = markdown.slice(reference.start, reference.end);
      throw importError(`ZIP 中缺少 Markdown 引用的图片：${url}`);
    }
  }
  return result;
}

function normalizedDate(value: unknown) {
  const candidate = value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === 'string' ? value.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    const parsed = new Date(`${candidate}T00:00:00Z`);
    if (!Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === candidate) return candidate;
  }
  return new Date().toISOString().slice(0, 10);
}

function normalizedTags(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(values.map((item) => typeof item === 'string' ? item.trim().slice(0, 32) : '').filter(Boolean))].slice(0, 12);
}

function normalizedCategory(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, maximumCategoryDepth * maximumCategorySegmentLength + maximumCategoryDepth - 1) : '';
}

function slugCandidate(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '');
}

async function availableSlug(preferred: string) {
  const existing = new Set((await dataStore.listPosts(true)).map((post) => post.slug));
  const base = preferred || `article-${randomUUID().slice(0, 8)}`;
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base.slice(0, 100 - String(suffix).length - 1)}-${suffix}`)) suffix += 1;
  return `${base.slice(0, 100 - String(suffix).length - 1)}-${suffix}`;
}

function commonProjectRoot(paths: string[]) {
  const first = paths[0]?.split('/')[0];
  if (!first || !paths.every((value) => value.startsWith(`${first}/`))) return '';
  return `${first}/`;
}

function projectRelativePath(sourcePath: string, root: string) {
  return root && sourcePath.startsWith(root) ? sourcePath.slice(root.length) : sourcePath;
}

async function createImportedPost(source: Buffer, filename: string, images?: Map<string, ImportedImage>) {
  try {
    const decoded = decodeMarkdown(source);
    const parsed = matter(decoded);
    if (Buffer.byteLength(parsed.content, 'utf8') > markdownLimit) throw importError('Markdown 正文不能超过 1 MB', 413);
    const { root, references } = imageReferences(parsed.content, filename, images);
    const titleSource = typeof parsed.data.title === 'string' && parsed.data.title.trim()
      ? parsed.data.title
      : firstHeading(root) || path.basename(filename, extensionOf(filename)) || '未命名文章';
    const title = titleSource.trim().slice(0, 160) || '未命名文章';
    const frontMatterSlug = typeof parsed.data.slug === 'string' ? slugCandidate(parsed.data.slug) : '';
    const slug = await availableSlug(frontMatterSlug || slugCandidate(title) || slugCandidate(path.basename(filename, extensionOf(filename))));
    const urls = new Map<string, string>();
    const referencedPaths = [...new Set(references.map((reference) => reference.sourcePath))];
    const sourcePaths = [filename, ...referencedPaths.map((sourcePath) => images?.get(sourcePath)?.sourcePath ?? sourcePath)];
    const projectRoot = commonProjectRoot(sourcePaths);
    const markdownRelativePath = projectRelativePath(filename, projectRoot);
    const assets: Array<{ temporaryPath: string; relativePath: string }> = [];

    if (images) {
      for (const image of images.values()) {
        const actual = await fileTypeFromFile(image.temporaryPath);
        if (actual?.mime !== image.expectedMime) throw importError(`图片类型与扩展名不一致：${image.sourcePath}`);
      }
      for (const sourcePath of referencedPaths) {
        const image = images.get(sourcePath)!;
        const relativePath = projectRelativePath(image.sourcePath, projectRoot);
        assets.push({ temporaryPath: image.temporaryPath, relativePath });
        urls.set(sourcePath, dataStore.postMediaUrl(slug, relativePath));
      }
    }

    let markdown = parsed.content;
    for (const reference of [...references].sort((a, b) => b.start - a.start)) {
      markdown = `${markdown.slice(0, reference.start)}${urls.get(reference.sourcePath)}${markdown.slice(reference.end)}`;
    }

    return await dataStore.savePost(
      {
        slug,
        title,
        excerpt: typeof parsed.data.excerpt === 'string' ? parsed.data.excerpt.trim().slice(0, 320) : '',
        date: normalizedDate(parsed.data.date),
        status: 'draft',
        category: normalizedCategory(parsed.data.category),
        tags: normalizedTags(parsed.data.tags),
        markdown,
      },
      { markdownRelativePath, assets },
    );
  } finally {
    if (images) await Promise.all([...images.values()].map((image) => unlink(image.temporaryPath).catch(() => undefined)));
  }
}

export async function importPostFile(filePath: string, filename: string): Promise<AdminPost> {
  const extension = extensionOf(filename);
  if (markdownExtensions.has(extension)) {
    const size = (await stat(filePath)).size;
    if (size > markdownLimit) throw importError('Markdown 文件不能超过 1 MB', 413);
    return createImportedPost(await readFile(filePath), path.basename(filename));
  }
  if (extension !== '.zip') throw importError('仅支持 .md、.markdown 或 .zip 文件');
  if ((await stat(filePath)).size > archiveLimit) throw importError('ZIP 文件不能超过 128 MB', 413);
  const archive = await readArchive(filePath);
  return createImportedPost(archive.markdown.source, archive.markdown.filename, archive.images);
}

export async function receivePostImport(req: Request) {
  const temporaryPath = path.join(dataStore.paths.tmp, `${randomUUID()}.article-import`);
  let filename = '';
  let tooLarge = false;

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let acceptedFile = false;
      let uploadFinished = false;
      let multipartFinished = false;
      let validationError: Error | null = null;
      const complete = () => {
        if (!settled && multipartFinished && (!acceptedFile || uploadFinished)) {
          settled = true;
          if (validationError) reject(validationError);
          else if (!acceptedFile) reject(importError('请选择文章文件'));
          else resolve();
        }
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      let busboy: Busboy.Busboy;
      try {
        busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: archiveLimit, fields: 0 } });
      } catch {
        reject(importError('上传格式无效'));
        return;
      }
      busboy.on('file', (name, stream, info) => {
        if (name !== 'article' || acceptedFile) {
          validationError = importError('每次只能上传一个文章文件');
          stream.resume();
          return;
        }
        acceptedFile = true;
        filename = path.basename(info.filename);
        stream.on('limit', () => { tooLarge = true; });
        void pipeline(stream, createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }))
          .then(() => {
            uploadFinished = true;
            complete();
          }, fail);
      });
      busboy.on('filesLimit', () => { validationError = importError('每次只能上传一个文章文件'); });
      busboy.on('fieldsLimit', () => { validationError = importError('文章导入不接受额外字段'); });
      busboy.on('error', fail);
      req.on('aborted', () => busboy.destroy(importError('上传已中断')));
      busboy.on('finish', () => {
        multipartFinished = true;
        complete();
      });
      req.pipe(busboy);
    });
    if (tooLarge) throw importError('ZIP 文件不能超过 128 MB', 413);
    return await importPostFile(temporaryPath, filename);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}
