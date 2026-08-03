import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Busboy from 'busboy';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';
import type { Request, Response } from 'express';
import { config } from './config.js';
import { dataStore } from './dataStore.js';
import { validateGalleryFilename } from './galleryFilename.js';

const supported = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

type ImageUploadOptions = {
  fieldLimit?: number;
  preserveOriginal?: boolean;
  domain?: 'general' | 'markdown';
  maximumBytes?: number;
};

function imageLimitMessage(maximumBytes: number) {
  return `图片不能超过 ${maximumBytes / 1024 / 1024} MB`;
}

export function uploadError(message: string, status = 400) {
  return Object.assign(new Error(message), { status });
}

export async function processImageFile(temporaryPath: string, domain: 'general' | 'markdown' = 'general') {
  const size = (await stat(temporaryPath)).size;
  if (size > config.uploadLimit) throw uploadError('图片不能超过 20 MB', 413);

  const type = await fileTypeFromFile(temporaryPath);
  const extension = type ? supported.get(type.mime) : undefined;
  if (!extension) throw uploadError('仅支持 PNG、JPEG 或 WebP 图片');

  const compress = size > config.compressionThreshold;
  const filename = `${randomUUID()}.${compress ? 'webp' : extension}`;
  const directory = domain === 'markdown' ? dataStore.paths.markdownMedia : dataStore.paths.media;
  const destination = path.join(directory, filename);

  if (compress) {
    try {
      await sharp(temporaryPath)
        .keepMetadata()
        .webp({ quality: 82, effort: 4 })
        .toFile(destination);
    } catch (error) {
      await unlink(destination).catch(() => undefined);
      throw error;
    }
    await unlink(temporaryPath);
  } else {
    await rename(temporaryPath, destination);
  }

  const metadata = await sharp(destination).metadata();
  return {
    url: `/media/${filename}`,
    filePath: destination,
    width: metadata.width,
    height: metadata.height,
  };
}

type StoredImage = {
  url: string;
  filePath: string;
  fields: Record<string, string>;
  width?: number;
  height?: number;
};

type ReceivedImage = {
  temporaryPath: string;
  originalFilename: string;
  mime: string;
  fields: Record<string, string>;
  width?: number;
  height?: number;
};

type ReceivedGalleryBatch = {
  fields: Record<string, string>;
  images: Array<Omit<ReceivedImage, 'fields'>>;
};

async function inspectGalleryImage(temporaryPath: string, originalFilename: string, maximumBytes: number) {
  const size = (await stat(temporaryPath)).size;
  if (size > maximumBytes) throw uploadError(imageLimitMessage(maximumBytes), 413);
  const type = await fileTypeFromFile(temporaryPath);
  const extension = type ? supported.get(type.mime) : undefined;
  if (!type || !extension) throw uploadError('仅支持 PNG、JPEG 或 WebP 图片');
  validateGalleryFilename(originalFilename, type.mime);
  const metadata = await sharp(temporaryPath).metadata();
  return { mime: type.mime, width: metadata.width, height: metadata.height };
}

export function receiveImage(req: Request, options: ImageUploadOptions & { preserveOriginal: true }): Promise<ReceivedImage>;
export function receiveImage(req: Request, options?: ImageUploadOptions): Promise<StoredImage>;
export async function receiveImage(req: Request, options?: ImageUploadOptions) {
  const { fieldLimit = 2, preserveOriginal = false, domain = 'general', maximumBytes = config.uploadLimit } = options ?? {};
  return new Promise<StoredImage | ReceivedImage>((resolve, reject) => {
    let settled = false;
    let temporaryPath: string | null = null;
    let originalFilename = '';
    const fields: Record<string, string> = {};
    let writeStream: ReturnType<typeof import('node:fs').createWriteStream> | null = null;
    let uploadPromise: Promise<void> | null = null;
    let fileTooLarge = false;

    const cleanup = async () => {
      if (writeStream && !writeStream.closed) {
        await new Promise<void>((done) => {
          writeStream!.once('close', done);
          writeStream!.destroy();
        });
      }
      if (temporaryPath) await unlink(temporaryPath).catch(() => undefined);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      void cleanup().finally(() => reject(error));
    };

    let busboy: Busboy.Busboy;
    try {
      busboy = Busboy({ headers: req.headers, defParamCharset: 'utf8', limits: { files: 1, fileSize: maximumBytes, fields: fieldLimit } });
    } catch {
      reject(uploadError('上传格式无效'));
      return;
    }

    busboy.on('file', (_name, stream, info) => {
      if (temporaryPath) {
        stream.resume();
        fail(uploadError('每次只能上传一个文件'));
        return;
      }
      originalFilename = info.filename;
      temporaryPath = path.join(dataStore.paths.tmp, `${randomUUID()}.upload`);
      uploadPromise = new Promise<void>((done, error) => {
        writeStream = createWriteStream(temporaryPath!, { flags: 'wx', mode: 0o600 });
        stream.on('limit', () => { fileTooLarge = true; });
        stream.on('error', error);
        writeStream.on('error', error);
        writeStream.on('finish', done);
        stream.pipe(writeStream);
      });
      void uploadPromise.catch(fail);
    });
    busboy.on('field', (name, value) => {
      fields[name] = value;
    });
    busboy.on('error', fail);
    req.on('aborted', () => fail(uploadError('上传已中断')));
    busboy.on('finish', async () => {
      if (settled) return;
      try {
        if (!temporaryPath || !uploadPromise) throw uploadError('请选择图片');
        await uploadPromise;
        if (fileTooLarge) throw uploadError(imageLimitMessage(maximumBytes), 413);
        if (preserveOriginal) {
          const inspected = await inspectGalleryImage(temporaryPath, originalFilename, maximumBytes);
          const savedTemporaryPath = temporaryPath;
          temporaryPath = null;
          settled = true;
          resolve({ temporaryPath: savedTemporaryPath, originalFilename, fields, ...inspected });
          return;
        }
        const result = await processImageFile(temporaryPath, domain);
        temporaryPath = null;
        settled = true;
        resolve({ ...result, fields });
      } catch (error) {
        fail(error as Error);
      }
    });
    req.pipe(busboy);
  });
}

export async function receiveGalleryImages(req: Request, options: { maximumFiles?: number; maximumBytes?: number; fieldLimit?: number } = {}): Promise<ReceivedGalleryBatch> {
  const { maximumFiles = 30, maximumBytes = config.galleryUploadLimit, fieldLimit = 12 } = options;
  return new Promise<ReceivedGalleryBatch>((resolve, reject) => {
    let settled = false;
    const fields: Record<string, string> = {};
    const pending: Array<{
      temporaryPath: string;
      originalFilename: string;
      stream: ReturnType<typeof import('node:fs').createWriteStream>;
      upload: Promise<void>;
      tooLarge: boolean;
    }> = [];

    const cleanup = async () => {
      await Promise.all(pending.map(async (image) => {
        if (!image.stream.closed) {
          await new Promise<void>((done) => {
            image.stream.once('close', done);
            image.stream.destroy();
          });
        }
        await unlink(image.temporaryPath).catch(() => undefined);
      }));
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      void cleanup().finally(() => reject(error));
    };

    let busboy: Busboy.Busboy;
    try {
      busboy = Busboy({ headers: req.headers, defParamCharset: 'utf8', limits: { files: maximumFiles, fileSize: maximumBytes, fields: fieldLimit } });
    } catch {
      reject(uploadError('上传格式无效'));
      return;
    }

    busboy.on('file', (name, stream, info) => {
      if (name !== 'images') {
        stream.resume();
        fail(uploadError('上传图片字段无效'));
        return;
      }
      const temporaryPath = path.join(dataStore.paths.tmp, `${randomUUID()}.upload`);
      const writeStream = createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 });
      const entry = {
        temporaryPath,
        originalFilename: info.filename,
        stream: writeStream,
        upload: Promise.resolve(),
        tooLarge: false,
      };
      entry.upload = new Promise<void>((done, error) => {
        stream.on('limit', () => { entry.tooLarge = true; });
        stream.on('error', error);
        writeStream.on('error', error);
        writeStream.on('finish', done);
        stream.pipe(writeStream);
      });
      pending.push(entry);
      void entry.upload.catch(fail);
    });
    busboy.on('field', (name, value) => { fields[name] = value; });
    busboy.on('filesLimit', () => fail(uploadError(`一个画廊条目最多包含 ${maximumFiles} 张图片`, 413)));
    busboy.on('error', fail);
    req.on('aborted', () => fail(uploadError('上传已中断')));
    busboy.on('finish', async () => {
      if (settled) return;
      try {
        if (!pending.length) throw uploadError('请选择图片');
        await Promise.all(pending.map((image) => image.upload));
        if (pending.some((image) => image.tooLarge)) throw uploadError(imageLimitMessage(maximumBytes), 413);
        const images = [] as ReceivedGalleryBatch['images'];
        for (const image of pending) {
          const inspected = await inspectGalleryImage(image.temporaryPath, image.originalFilename, maximumBytes);
          images.push({ temporaryPath: image.temporaryPath, originalFilename: image.originalFilename, ...inspected });
        }
        settled = true;
        resolve({ fields, images });
      } catch (error) {
        fail(error as Error);
      }
    });
    req.pipe(busboy);
  });
}

export async function serveGalleryMedia(req: Request, res: Response) {
  const id = req.params.id;
  const filename = req.params.filename;
  if (typeof id !== 'string' || typeof filename !== 'string' || !/^\d{8}$/.test(id)) {
    res.sendStatus(404);
    return;
  }
  const item = await dataStore.getGalleryItem(id);
  const image = item?.images.find((candidate) => candidate.originalFilename === filename || candidate.displayFilename === filename);
  if (!item || !image) {
    res.sendStatus(404);
    return;
  }
  const filePath = filename === image.displayFilename
    ? dataStore.galleryMediaDisplayFilePath(item, image)
    : dataStore.galleryMediaFilePath(item, image);
  streamMedia(filePath, filename, res);
}

export async function serveMarkdownMedia(req: Request, res: Response) {
  const wildcard = req.params.path as unknown;
  const segments = Array.isArray(wildcard)
    ? wildcard
    : typeof wildcard === 'string'
      ? wildcard.split('/')
      : [];
  const [projectName, ...relativeParts] = segments;
  if (
    !projectName
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(projectName)
    || !relativeParts.length
    || relativeParts.some((part) => !part || part === '.' || part === '..' || part.includes('\\') || part.includes('\0'))
    || !/\.(?:png|jpe?g|webp)$/i.test(relativeParts.at(-1) ?? '')
  ) {
    res.sendStatus(404);
    return;
  }
  const projectRoot = path.join(dataStore.paths.markdown, projectName);
  const filePath = path.join(projectRoot, ...relativeParts);
  const relative = path.relative(projectRoot, filePath);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    res.sendStatus(404);
    return;
  }
  try {
    let current = projectRoot;
    for (const segment of relativeParts) {
      current = path.join(current, segment);
      if ((await lstat(current)).isSymbolicLink()) {
        res.sendStatus(404);
        return;
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.sendStatus(404);
      return;
    }
    throw error;
  }
  streamMedia(filePath, relativeParts.at(-1)!, res);
}

function streamMedia(filePath: string, filename: string, res: Response) {
  const extension = path.extname(filename).toLowerCase();
  const mime = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
  res.set({
    'Content-Type': mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  const stream = createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) res.sendStatus(404);
    else res.destroy();
  });
  stream.pipe(res);
}

async function existingMediaPath(filename: string) {
  for (const directory of [dataStore.paths.media, dataStore.paths.markdownMedia]) {
    const filePath = path.join(directory, filename);
    try {
      await stat(filePath);
      return filePath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return null;
}

export async function serveMedia(req: Request, res: Response) {
  const filename = req.params.filename;
  if (typeof filename !== 'string' || !/^[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(filename)) {
    res.sendStatus(404);
    return;
  }
  const filePath = await existingMediaPath(filename);
  if (!filePath) {
    res.sendStatus(404);
    return;
  }
  streamMedia(filePath, filename, res);
}
