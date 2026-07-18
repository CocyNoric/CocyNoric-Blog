declare module 'write-file-atomic' {
  type Options = {
    mode?: number;
  };

  export default function writeFileAtomic(
    filePath: string,
    data: string | Buffer,
    options?: Options,
  ): Promise<void>;
}
