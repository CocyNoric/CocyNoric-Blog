import { useRef, useState, type DragEvent, type ReactNode } from 'react';

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const imageLimit = 20 * 1024 * 1024;

function imageLimitMessage(maximumBytes: number) {
  return `图片不能超过 ${maximumBytes / 1024 / 1024} MB`;
}

export function validateImageFile(file: File, maximumBytes = imageLimit) {
  if (!imageTypes.has(file.type)) throw new Error('仅支持 PNG、JPEG 或 WebP 图片');
  if (file.size > maximumBytes) throw new Error(imageLimitMessage(maximumBytes));
  return file;
}

type ImageDropFieldProps = {
  className?: string;
  children: ReactNode;
  disabled?: boolean;
  maximumBytes?: number;
  onFile: (file: File) => void;
  onError?: (message: string) => void;
};

export function ImageDropField({ className = '', children, disabled = false, maximumBytes = imageLimit, onFile, onError }: ImageDropFieldProps) {
  const depth = useRef(0);
  const [active, setActive] = useState(false);

  const accept = (files: FileList) => {
    try {
      if (files.length !== 1) throw new Error('每次只能选择一张图片');
      onFile(validateImageFile(files[0]!, maximumBytes));
    } catch (error) {
      onError?.((error as Error).message);
    }
  };

  const enter = (event: DragEvent) => {
    event.preventDefault();
    if (disabled || !event.dataTransfer.types.includes('Files')) return;
    depth.current += 1;
    setActive(true);
  };

  const leave = (event: DragEvent) => {
    event.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (!depth.current) setActive(false);
  };

  return (
    <label
      className={`${className}${active ? ' drag-active' : ''}`}
      onDragEnter={enter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={leave}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setActive(false);
        if (!disabled) accept(event.dataTransfer.files);
      }}
    >
      {children}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled}
        onChange={(event) => {
          if (event.target.files) accept(event.target.files);
          event.target.value = '';
        }}
      />
    </label>
  );
}
