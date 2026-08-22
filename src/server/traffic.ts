import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import writeFileAtomic from 'write-file-atomic';
import { readFile } from 'node:fs/promises';
import { config } from './config.js';
import type { TransferUsage } from '../shared/types.js';

const bytesPerGb = 1024 ** 3;
const defaultMonthlyLimitGb = 50;
const trafficPath = path.join(config.dataDir, 'traffic.json');

type TrafficRecord = {
  version: 1;
  period: string;
  monthlyLimitGb: number;
  uploadedBytes: number;
  downloadedBytes: number;
};

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function defaultRecord(): TrafficRecord {
  return { version: 1, period: currentPeriod(), monthlyLimitGb: defaultMonthlyLimitGb, uploadedBytes: 0, downloadedBytes: 0 };
}

function normalizeRecord(value: unknown): TrafficRecord {
  if (!value || typeof value !== 'object') return defaultRecord();
  const source = value as Partial<TrafficRecord>;
  const monthlyLimitGb = Number.isInteger(source.monthlyLimitGb) && source.monthlyLimitGb! >= 1 && source.monthlyLimitGb! <= 1000
    ? source.monthlyLimitGb!
    : defaultMonthlyLimitGb;
  return {
    version: 1,
    period: typeof source.period === 'string' && /^\d{4}-\d{2}$/.test(source.period) ? source.period : currentPeriod(),
    monthlyLimitGb,
    uploadedBytes: Number.isSafeInteger(source.uploadedBytes) && source.uploadedBytes! >= 0 ? source.uploadedBytes! : 0,
    downloadedBytes: Number.isSafeInteger(source.downloadedBytes) && source.downloadedBytes! >= 0 ? source.downloadedBytes! : 0,
  };
}

function usage(record: TrafficRecord): TransferUsage {
  const limitBytes = record.monthlyLimitGb * bytesPerGb;
  const usedBytes = record.uploadedBytes + record.downloadedBytes;
  return { ...record, limitBytes, usedBytes, remainingBytes: Math.max(0, limitBytes - usedBytes) };
}

class TrafficStore {
  private mutation = Promise.resolve();

  private mutate<T>(operation: () => Promise<T>) {
    const result = this.mutation.then(operation, operation);
    this.mutation = result.then(() => undefined, () => undefined);
    return result;
  }

  private async read() {
    let record: TrafficRecord;
    try {
      record = normalizeRecord(JSON.parse(await readFile(trafficPath, 'utf8')) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      record = defaultRecord();
    }
    if (record.period !== currentPeriod()) return { ...record, period: currentPeriod(), uploadedBytes: 0, downloadedBytes: 0 };
    return record;
  }

  private async write(record: TrafficRecord) {
    await writeFileAtomic(trafficPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  }

  get() {
    return this.mutate(async () => {
      const record = await this.read();
      await this.write(record);
      return usage(record);
    });
  }

  setLimit(monthlyLimitGb: number) {
    return this.mutate(async () => {
      if (!Number.isInteger(monthlyLimitGb) || monthlyLimitGb < 1 || monthlyLimitGb > 1000) {
        throw Object.assign(new Error('每月总量必须在 1–1000 GB 之间'), { status: 400 });
      }
      const record = { ...await this.read(), monthlyLimitGb };
      await this.write(record);
      return usage(record);
    });
  }

  reset() {
    return this.mutate(async () => {
      const current = await this.read();
      const record = { ...current, period: currentPeriod(), uploadedBytes: 0, downloadedBytes: 0 };
      await this.write(record);
      return usage(record);
    });
  }

  consume(direction: 'upload' | 'download', bytes: number, enforceLimit: boolean) {
    return this.mutate(async () => {
      const record = await this.read();
      const current = usage(record);
      if (enforceLimit && bytes > current.remainingBytes) {
        throw Object.assign(new Error('本月上传下载总量已不足，请调整额度或重置用量'), { status: 429 });
      }
      const safeBytes = Number.isSafeInteger(bytes) && bytes > 0 ? bytes : 0;
      const next = direction === 'upload'
        ? { ...record, uploadedBytes: record.uploadedBytes + safeBytes }
        : { ...record, downloadedBytes: record.downloadedBytes + safeBytes };
      await this.write(next);
      return usage(next);
    });
  }

  ensureAvailable(bytes: number) {
    return this.mutate(async () => {
      const current = usage(await this.read());
      if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > current.remainingBytes) {
        throw Object.assign(new Error('本月上传下载剩余总量不足'), { status: 429 });
      }
      return current;
    });
  }
}

export const trafficStore = new TrafficStore();

export async function accountUpload(req: Request, _res: Response, next: NextFunction) {
  try {
    const contentLength = Number(req.headers['content-length']);
    const current = await trafficStore.get();
    if (Number.isSafeInteger(contentLength) && contentLength > current.remainingBytes) {
      throw Object.assign(new Error('本月上传下载剩余总量不足'), { status: 429 });
    }
    let bytes = 0;
    let overLimit = false;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > current.remainingBytes && !overLimit) {
        overLimit = true;
        req.destroy(Object.assign(new Error('本月上传下载剩余总量不足'), { status: 429 }));
      }
    });
    req.once('end', () => {
      if (!overLimit) void trafficStore.consume('upload', bytes, false).catch((error) => console.error('记录上传流量失败', error));
    });
    next();
  } catch (error) {
    next(error);
  }
}

export async function accountDownload(_req: Request, res: Response, next: NextFunction) {
  try {
    const current = await trafficStore.get();
    if (current.remainingBytes <= 0) {
      res.status(429).json({ error: '本月上传下载总量已用完' });
      return;
    }
    let bytes = 0;
    const allowance = current.remainingBytes;
    let limited = false;
    const count = (chunk: unknown) => {
      if (chunk === undefined || chunk === null || limited) return;
      bytes += Buffer.byteLength(chunk as string | Uint8Array);
      if (bytes > allowance) {
        limited = true;
        process.nextTick(() => res.destroy());
      }
    };
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    res.write = ((chunk: unknown, ...args: unknown[]) => {
      count(chunk);
      return originalWrite(chunk as never, ...(args as never[]));
    }) as typeof res.write;
    res.end = ((chunk?: unknown, ...args: unknown[]) => {
      count(chunk);
      return originalEnd(chunk as never, ...(args as never[]));
    }) as typeof res.end;
    let recorded = false;
    const record = () => {
      if (recorded || bytes <= 0) return;
      recorded = true;
      void trafficStore.consume('download', Math.min(bytes, allowance), false).catch((error) => console.error('记录下载流量失败', error));
    };
    res.once('finish', record);
    res.once('close', record);
    next();
  } catch (error) {
    next(error);
  }
}
