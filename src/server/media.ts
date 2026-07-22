import { createReadStream, createWriteStream } from 'node:fs';
import { rename, stat, unlink } from 'node:fs/promises';
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

export async function serveGalleryMedia(req: Request, res: Response) {
  const id = req.params.id;
  const filename = req.params.filename;
  if (typeof id !== 'string' || typeof filename !== 'string' || !/^\d{8}$/.test(id)) {
    res.sendStatus(404);
    return;
  }
  const item = await dataStore.getGalleryItem(id);
  if (!item || item.originalFilename !== filename) {
    res.sendStatus(404);
    return;
  }
  streamMedia(dataStore.galleryFilePath(item), filename, res);
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
