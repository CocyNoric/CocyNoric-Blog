const reservedNamePattern = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const sensitiveProjectPart = /^(?:\.git|node_modules|\.env(?:\..*)?|.*\.(?:pem|key|crt|p12|pfx))$/i;
const projectMaxDepth = 16;

export function codeToolPathError(message: string, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function validateCodeToolFilename(input: string) {
  const filename = input.normalize('NFC');
  if (
    !filename
    || filename === '.'
    || filename === '..'
    || /[\0-\x1f\x7f<>:"/\\|?*]/.test(filename)
    || /[. ]$/.test(filename)
    || reservedNamePattern.test(filename)
    || Buffer.byteLength(filename, 'utf8') > 240
  ) {
    throw codeToolPathError('文件名无效');
  }
  return filename;
}

export function validateCodeToolProjectPath(input: string) {
  if (input.includes('\\')) throw codeToolPathError('项目文件路径无效');
  const value = input.normalize('NFC');
  if (!value || value === 'manifest.json' || value === 'index.json' || value.includes('\0') || value.startsWith('/') || /^[a-z]:/i.test(value)) {
    throw codeToolPathError('项目文件路径无效');
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw codeToolPathError('项目文件路径无效');
  if (parts.length > projectMaxDepth) throw codeToolPathError(`项目目录最多嵌套 ${projectMaxDepth} 层`, 413);
  if (parts.some((part) => sensitiveProjectPart.test(part))) throw codeToolPathError('项目中不能包含敏感文件或目录');
  for (const part of parts) validateCodeToolFilename(part);
  return parts.join('/');
}
