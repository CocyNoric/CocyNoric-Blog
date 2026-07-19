import { useEffect, useId, useRef, type ReactNode } from 'react';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  destructive?: boolean;
  wide?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确定',
  busy = false,
  destructive = false,
  wide = false,
  children,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const restoreFocus = () => openerRef.current?.focus();
    dialog.addEventListener('close', restoreFocus);
    return () => dialog.removeEventListener('close', restoreFocus);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`md-dialog${wide ? ' md-dialog-wide' : ''}`}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current && !busy) onCancel();
      }}
    >
      <div className="md-dialog-surface">
        <h2 id={`${id}-title`}>{title}</h2>
        <p id={`${id}-description`}>{description}</p>
        {children}
        <div className="md-dialog-actions">
          <button type="button" className="button text-button" onClick={onCancel} disabled={busy}>取消</button>
          <button
            type="button"
            className={`button ${destructive ? 'danger-button' : 'primary-button'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '正在处理…' : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
