import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink, rm, readdir, rename, rmdir, lstat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import Busboy from 'busboy';
import { fileTypeFromFile } from 'file-type';
import yauzl, { type Entry, type ZipFile as YauzlZipFile } from 'yauzl';
import { ZipFile } from 'yazl';
import type { Request, Response } from 'express';
import type { CodeToolItem, CodeToolProject, CodeToolProjectFile } from '../shared/schemas.js';
import { config } from './config.js';
import { dataStore } from './dataStore.js';
import { validateCodeToolFilename, validateCodeToolProjectPath } from './codeToolPaths.js';
import { uploadError } from './media.js';

export { validateCodeToolFilename } from './codeToolPaths.js';

const mimePattern = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;

export type ReceivedCodeTool = Omit<CodeToolItem, 'id' | 'createdAt'> & {
  temporaryPath: string;
};

export function receiveCodeTool(req: Request) {
  return new Promise<ReceivedCodeTool>((resolve, reject) => {
    let settled = false;
    let temporaryPath: string | null = null;
    let filename = '';
    let declaredMime = '';
    let size = 0;
    let fileTooLarge = false;
    let writeStream: ReturnType<typeof createWriteStream> | null = null;
    let uploadPromise: Promise<void> | null = null;
    const hash = createHash('sha256');

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
      busboy = Busboy({
        headers: req.headers,
        defParamCharset: 'utf8',
        limits: { files: 1, fileSize: config.uploadLimit, fields: 0 },
      });
    } catch {
      reject(uploadError('上传格式无效'));
      return;
    }

    busboy.on('file', (name, stream, info) => {
      if (name !== 'file' || temporaryPath) {
        stream.resume();
        fail(uploadError(name === 'file' ? '每次只能上传一个文件' : '上传字段无效'));
        return;
      }
      try {
        filename = validateCodeToolFilename(info.filename);
      } catch (error) {
        stream.resume();
        fail(error as Error);
        return;
      }
      declaredMime = info.mimeType;
      temporaryPath = path.join(dataStore.paths.tmp, `${randomUUID()}.upload`);
      uploadPromise = new Promise<void>((done, error) => {
        writeStream = createWriteStream(temporaryPath!, { flags: 'wx', mode: 0o600 });
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
          hash.update(chunk);
        });
        stream.on('limit', () => { fileTooLarge = true; });
        stream.on('error', error);
        writeStream.on('error', error);
        writeStream.on('finish', done);
        stream.pipe(writeStream);
      });
      void uploadPromise.catch(fail);
    });
    busboy.on('field', () => fail(uploadError('上传不能包含额外字段')));
    busboy.on('filesLimit', () => fail(uploadError('每次只能上传一个文件')));
    busboy.on('fieldsLimit', () => fail(uploadError('上传不能包含额外字段')));
    busboy.on('partsLimit', () => fail(uploadError('上传内容过多')));
    busboy.on('error', fail);
    req.on('aborted', () => fail(uploadError('上传已中断')));
    busboy.on('finish', async () => {
      if (settled) return;
      try {
        if (!temporaryPath || !uploadPromise) throw uploadError('请选择文件');
        await uploadPromise;
        if (fileTooLarge) throw uploadError('文件不能超过 20 MB', 413);
        const detected = await fileTypeFromFile(temporaryPath);
        const mimeType = detected?.mime
          ?? (declaredMime.length <= 127 && mimePattern.test(declaredMime) ? declaredMime.toLowerCase() : null);
        const savedTemporaryPath = temporaryPath;
        temporaryPath = null;
        settled = true;
        resolve({
          temporaryPath: savedTemporaryPath,
          originalFilename: filename,
          size,
          mimeType,
          mimeSource: detected ? 'detected' : mimeType ? 'declared' : null,
          sha256: hash.digest('hex'),
        });
      } catch (error) {
        fail(error as Error);
      }
    });
    req.pipe(busboy);
  });
}

const projectArchiveLimit = 64 * 1024 * 1024;
const projectContentLimit = 100 * 1024 * 1024;
const projectEntryLimit = 1000;

const validateProjectPath = validateCodeToolProjectPath;

type ProjectPathKind = 'file' | 'directory';

function registerProjectPath(paths: Map<string, ProjectPathKind>, relativePath: string, kind: ProjectPathKind) {
  const key = relativePath.toLocaleLowerCase('en-US');
  if (paths.has(key)) throw uploadError('项目中包含重复路径');

  const parts = key.split('/');
  for (let index = 1; index < parts.length; index += 1) {
    if (paths.get(parts.slice(0, index).join('/')) === 'file') {
      throw uploadError('项目中包含文件与目录冲突');
    }
  }
  if (kind === 'file' && [...paths.keys()].some((existing) => existing.startsWith(`${key}/`))) {
    throw uploadError('项目中包含文件与目录冲突');
  }
  paths.set(key, kind);
}

function normalizeFolderPath(input: string, root: string | null | undefined) {
  const selectedPath = validateProjectPath(input);
  const parts = selectedPath.split('/');
  const selectedRoot = parts.length > 1 ? parts[0] : null;
  if (root !== undefined && root !== selectedRoot) throw uploadError('项目文件必须来自同一个文件夹');
  return {
    root: selectedRoot,
    relativePath: validateProjectPath(selectedRoot ? parts.slice(1).join('/') : selectedPath),
  };
}

function projectSlug(input: string) {
  const slug = input.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
  return slug || `project-${randomUUID().slice(0, 8)}`;
}

export type ReceivedCodeToolProject = {
  projectName: string;
  description: string;
  mode: 'folder' | 'zip';
  zipMode: 'extract' | 'keep';
  temporaryDirectory: string;
  project: CodeToolProject;
};

function openProjectZip(filePath: string) {
  return new Promise<YauzlZipFile>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true }, (error, zipFile) => {
      if (error || !zipFile) reject(uploadError('ZIP 文件无效'));
      else resolve(zipFile);
    });
  });
}

async function validateProjectZip(filePath: string) {
  const zipFile = await openProjectZip(filePath);
  zipFile.close();
}

function copyZipEntry(zipFile: YauzlZipFile, entry: Entry, destination: string) {
  return new Promise<void>((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? uploadError('无法读取 ZIP 条目'));
        return;
      }
      void pipeline(stream, createWriteStream(destination, { flags: 'wx', mode: 0o600 }))
        .then(() => resolve(), reject);
    });
  });
}

async function extractProjectZip(zipPath: string, destination: string) {
  const zipFile = await openProjectZip(zipPath);
  const seen = new Map<string, ProjectPathKind>();
  let entries = 0;
  let total = 0;
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      zipFile.close();
      reject(error);
    };
    zipFile.on('error', fail);
    zipFile.on('end', () => {
      if (!settled) {
        settled = true;
        zipFile.close();
        resolve();
      }
    });
    zipFile.on('entry', (entry) => {
      void (async () => {
        entries += 1;
        if (entries > projectEntryLimit) throw uploadError(`项目最多包含 ${projectEntryLimit} 个文件`, 413);
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw uploadError('不支持加密的 ZIP 条目');
        const relativeName = entry.fileName.replace(/\/$/, '');
        if (!relativeName) { zipFile.readEntry(); return; }
        const relativePath = validateProjectPath(relativeName);
        const directory = entry.fileName.endsWith('/');
        registerProjectPath(seen, relativePath, directory ? 'directory' : 'file');
        if (directory) { zipFile.readEntry(); return; }
        if (isZipSymlink(entry)) throw uploadError('ZIP 中不能包含符号链接');
        if (entry.uncompressedSize > config.uploadLimit) throw uploadError('项目文件不能超过 20 MB', 413);
        if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > 1000) throw uploadError('ZIP 压缩比例异常');
        total += entry.uncompressedSize;
        if (total > projectContentLimit) throw uploadError('项目解压后的总大小不能超过 100 MB', 413);
        const target = path.join(destination, ...relativePath.split('/'));
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        await copyZipEntry(zipFile, entry, target);
        zipFile.readEntry();
      })().catch(fail);
    });
    zipFile.readEntry();
  });
}

function isZipSymlink(entry: Entry) {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (mode & 0o170000) === 0o120000 || (mode & 0o170000) === 0o060000;
}

async function promoteSingleProjectRoot(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length !== 1 || !entries[0].isDirectory()) return;

  const root = path.join(directory, entries[0].name);
  for (const entry of await readdir(root)) {
    await rename(path.join(root, entry), path.join(directory, entry));
  }
  await rmdir(root);
}

async function collectProjectFiles(root: string, current = ''): Promise<CodeToolProjectFile[]> {
  const directory = path.join(root, current);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: CodeToolProjectFile[] = [];
  for (const entry of entries) {
    if (entry.name === 'manifest.json') continue;
    const relativePath = current ? `${current}/${entry.name}` : entry.name;
    const safePath = validateProjectPath(relativePath);
    const target = path.join(root, ...safePath.split('/'));
    if (entry.isDirectory()) files.push(...await collectProjectFiles(root, safePath));
    else if (entry.isFile()) {
      const details = await stat(target);
      if (details.size > config.uploadLimit) throw uploadError('项目文件不能超过 20 MB', 413);
      const hash = createHash('sha256');
      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(target);
        stream.on('data', (chunk: Buffer) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('close', resolve);
      });
      const detected = await fileTypeFromFile(target);
      files.push({ id: randomUUID(), relativePath: safePath, size: details.size, mimeType: detected?.mime ?? null, mimeSource: detected ? 'detected' : null, sha256: hash.digest('hex'), createdAt: new Date().toISOString(), updatedAt: details.mtime.toISOString() });
    } else throw uploadError('项目中不能包含特殊文件');
  }
  return files;
}

export function receiveCodeToolProject(req: Request) {
  return new Promise<ReceivedCodeToolProject>((resolve, reject) => {
    const temporaryDirectory = path.join(dataStore.paths.tmp, `${randomUUID()}.code-project`);
    let projectName = '';
    let description = '';
    let mode: 'folder' | 'zip' = 'folder';
    let zipMode: 'extract' | 'keep' = 'extract';
    let zipPath: string | null = null;
    let zipFilename = 'project.zip';
    const uploadPromises: Promise<void>[] = [];
    const folderPaths = new Map<string, ProjectPathKind>();
    let folderRoot: string | null | undefined;
    let fileCount = 0;
    let total = 0;
    let settled = false;
    const cleanup = async () => { await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined); };
    const fail = (error: Error) => { if (settled) return; settled = true; void cleanup().finally(() => reject(error)); };
    void mkdir(temporaryDirectory, { recursive: true, mode: 0o700 });
    let busboy: Busboy.Busboy;
    try { busboy = Busboy({ headers: req.headers, defParamCharset: 'utf8', preservePath: true, limits: { files: 1000, fileSize: projectArchiveLimit, fields: 4 } }); }
    catch { reject(uploadError('上传格式无效')); return; }
    busboy.on('field', (name, value) => {
      if (name === 'projectName') projectName = value.trim();
      else if (name === 'description') description = value.trim();
      else if (name === 'mode' && (value === 'folder' || value === 'zip')) mode = value;
      else if (name === 'zipMode' && (value === 'extract' || value === 'keep')) zipMode = value;
      else fail(uploadError('上传字段无效'));
    });
    busboy.on('file', (name, stream, info) => {
      if (name !== 'files' || fileCount >= projectEntryLimit) { stream.resume(); fail(uploadError('项目文件数量超出限制', 413)); return; }
      let relativePath: string;
      try {
        const selectedPath = info.filename;
        if (mode === 'zip' && fileCount > 0) throw uploadError('ZIP 上传只能包含一个文件');
        if (mode === 'zip') {
          zipFilename = validateCodeToolFilename(path.basename(selectedPath));
          relativePath = zipFilename;
        } else {
          const normalized = normalizeFolderPath(selectedPath, folderRoot);
          folderRoot = normalized.root;
          relativePath = normalized.relativePath;
          registerProjectPath(folderPaths, relativePath, 'file');
        }
      }
      catch (error) { stream.resume(); fail(error as Error); return; }
      fileCount += 1;
      total += 0;
      if (mode === 'zip' && !zipPath) zipPath = path.join(temporaryDirectory, '.upload.zip');
      const target = mode === 'zip' ? zipPath! : path.join(temporaryDirectory, ...relativePath.split('/'));
      uploadPromises.push((async () => {
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        stream.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > projectContentLimit) {
            stream.destroy(uploadError('项目总大小不能超过 100 MB', 413));
          }
        });
        stream.on('limit', () => stream.destroy(uploadError('项目文件不能超过 64 MB', 413)));
        await pipeline(stream, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
      })().catch(fail));
    });
    busboy.on('filesLimit', () => fail(uploadError('项目文件数量超出限制', 413)));
    busboy.on('fieldsLimit', () => fail(uploadError('上传字段过多')));
    busboy.on('error', fail);
    req.on('aborted', () => fail(uploadError('上传已中断')));
    busboy.on('finish', async () => {
      if (settled) return;
      try {
        if (!projectName) throw uploadError('请输入项目名称');
        if (fileCount === 0) throw uploadError('请选择文件夹或 ZIP');
        await Promise.all(uploadPromises);
        if (mode === 'zip') {
          if (!zipPath) throw uploadError('请选择 ZIP 文件');
          const archiveDetails = await stat(zipPath);
          if (archiveDetails.size > projectArchiveLimit) throw uploadError('ZIP 文件不能超过 64 MB', 413);
          if (zipMode === 'extract') {
            await extractProjectZip(zipPath, temporaryDirectory);
            await unlink(zipPath);
            await promoteSingleProjectRoot(temporaryDirectory);
          } else {
            await validateProjectZip(zipPath);
            await rename(zipPath, path.join(temporaryDirectory, zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`));
          }
        }
        const files = await collectProjectFiles(temporaryDirectory);
        if (files.length === 0) throw uploadError('项目中没有可上传的文件');
        const now = new Date().toISOString();
        const project = { id: randomUUID(), slug: projectSlug(projectName), name: projectName.slice(0, 120), description: description.slice(0, 240), createdAt: now, updatedAt: now, fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.size, 0), files };
        settled = true;
        resolve({ projectName, description, mode, zipMode, temporaryDirectory, project });
      } catch (error) { fail(error as Error); }
    });
    req.pipe(busboy);
  });
}
function contentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_') || 'download';
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

type VerifiedProjectFile = {
  path: string;
  relativePath: string;
  size: number;
};

async function verifiedProjectFile(project: CodeToolProject, file: CodeToolProjectFile): Promise<VerifiedProjectFile | null> {
  let relativePath: string;
  try {
    relativePath = validateProjectPath(file.relativePath);
  } catch {
    return null;
  }

  const filesRoot = path.join(dataStore.codeToolProjectRootPath(project), 'files');
  const ancestors = [filesRoot];
  for (const part of relativePath.split('/').slice(0, -1)) ancestors.push(path.join(ancestors.at(-1)!, part));
  try {
    for (const ancestor of ancestors) {
      const details = await lstat(ancestor);
      if (!details.isDirectory() || details.isSymbolicLink()) return null;
    }
    const filePath = dataStore.codeToolProjectFilePath(project, relativePath);
    const details = await lstat(filePath);
    if (details.isSymbolicLink() || !details.isFile() || details.size !== file.size) return null;
    return { path: filePath, relativePath, size: details.size };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function verifiedProjectFiles(project: CodeToolProject) {
  if (project.fileCount !== project.files.length || project.fileCount > projectEntryLimit || project.totalBytes > projectContentLimit) return null;
  const paths = new Set<string>();
  let totalBytes = 0;
  const files: VerifiedProjectFile[] = [];
  for (const file of project.files) {
    const verified = await verifiedProjectFile(project, file);
    if (!verified) return null;
    const key = verified.relativePath.toLocaleLowerCase('en-US');
    if (paths.has(key)) return null;
    paths.add(key);
    totalBytes += verified.size;
    if (totalBytes > projectContentLimit) return null;
    files.push(verified);
  }
  if (totalBytes !== project.totalBytes) return null;
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en'));
}

export async function serveCodeToolDownload(req: Request, res: Response) {
  const id = req.params.id;
  const filename = req.params.filename;
  if (
    typeof id !== 'string'
    || typeof filename !== 'string'
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)
  ) {
    res.sendStatus(404);
    return;
  }
  const item = await dataStore.getCodeTool(id);
  if (!item || item.originalFilename !== filename) {
    res.sendStatus(404);
    return;
  }
  const filePath = dataStore.codeToolFilePath(item);
  try {
    const details = await stat(filePath);
    if (!details.isFile() || details.size !== item.size) {
      res.sendStatus(404);
      return;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.sendStatus(404);
      return;
    }
    throw error;
  }
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': contentDisposition(item.originalFilename),
    'Content-Length': String(item.size),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  const stream = createReadStream(filePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

export async function serveCodeToolProjectDownload(req: Request, res: Response) {
  const slug = req.params.slug;
  const rawPath = req.params.path;
  const relativePath = Array.isArray(rawPath) ? rawPath.join('/') : rawPath;
  if (typeof slug !== 'string' || typeof relativePath !== 'string') { res.sendStatus(404); return; }
  let safePath: string;
  try {
    safePath = validateProjectPath(relativePath);
  } catch {
    res.sendStatus(404);
    return;
  }
  const result = await dataStore.getCodeToolProjectFile(slug, safePath);
  if (!result) { res.sendStatus(404); return; }
  const file = await verifiedProjectFile(result.project, result.file);
  if (!file) { res.sendStatus(404); return; }
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': contentDisposition(path.basename(result.file.relativePath)),
    'Content-Length': String(result.file.size),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  const stream = createReadStream(file.path);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

export async function serveCodeToolProjectArchiveDownload(req: Request, res: Response) {
  const slug = req.params.slug;
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    res.sendStatus(404);
    return;
  }
  const project = await dataStore.getCodeToolProject(slug);
  if (!project) {
    res.sendStatus(404);
    return;
  }
  const files = await verifiedProjectFiles(project);
  if (!files) {
    res.sendStatus(404);
    return;
  }

  const archive = new ZipFile();
  let finished = false;
  const abort = () => {
    if (finished) return;
    finished = true;
    (archive.outputStream as Readable).destroy();
  };
  req.once('aborted', abort);
  res.once('close', abort);
  archive.outputStream.once('error', () => res.destroy());
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': contentDisposition(`${project.slug}.zip`),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  archive.outputStream.pipe(res);
  for (const file of files) {
    const archivePath = `${project.slug}/${file.relativePath}`;
    if (file.size === 0) {
      archive.addBuffer(Buffer.alloc(0), archivePath, { mode: 0o100644, compress: true });
      continue;
    }
    const source = createReadStream(file.path, { start: 0, end: file.size - 1 });
    source.once('error', () => res.destroy());
    archive.addReadStream(source, archivePath, { size: file.size, mode: 0o100644, compress: true });
  }
  archive.end();
}
