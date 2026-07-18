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

const supported = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

export function uploadError(message: string, status = 400) {
  return Object.assign(new Error(message), { status });
}

export async function processImageFile(temporaryPath: string) {
  const size = (await stat(temporaryPath)).size;
  if (size > config.uploadLimit) throw uploadError('图片不能超过 20 MB', 413);

  const type = await fileTypeFromFile(temporaryPath);
  const extension = type ? supported.get(type.mime) : undefined;
  if (!extension) throw uploadError('仅支持 PNG、JPEG 或 WebP 图片');

  const compress = size > config.compressionThreshold;
  const filename = `${randomUUID()}.${compress ? 'webp' : extension}`;
  const destination = path.join(dataStore.paths.media, filename);

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

  return { url: `/media/${filename}`, filePath: destination };
}

export async function receiveImage(req: Request) {
  return new Promise<{ url: string; filePath: string; fields: Record<string, string> }>((resolve, reject) => {
    let settled = false;
    let temporaryPath: string | null = null;
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
      busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: config.uploadLimit, fields: 2 } });
    } catch {
      reject(uploadError('上传格式无效'));
      return;
    }

    busboy.on('file', (_name, stream) => {
      if (temporaryPath) {
        stream.resume();
        fail(uploadError('每次只能上传一个文件'));
        return;
      }
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
        if (fileTooLarge) throw uploadError('图片不能超过 20 MB', 413);
        const result = await processImageFile(temporaryPath);
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

export function serveMedia(req: Request, res: Response) {
  const filename = req.params.filename;
  if (typeof filename !== 'string' || !/^[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(filename)) {
    res.sendStatus(404);
    return;
  }
  const filePath = path.join(dataStore.paths.media, filename);
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
