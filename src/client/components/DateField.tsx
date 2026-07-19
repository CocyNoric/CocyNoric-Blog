import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarIcon } from './Icons.js';

type DateFieldProps = {
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
};

const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.valueOf()) ? null : date;
}

function toDateValue(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function todayValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function addDays(value: string, amount: number) {
  const date = parseDate(value) ?? parseDate(todayValue())!;
  date.setUTCDate(date.getUTCDate() + amount);
  return toDateValue(date);
}

function addMonths(value: string, amount: number) {
  const date = parseDate(value) ?? parseDate(todayValue())!;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toDateValue(date);
}

function monthLabel(value: string) {
  const date = parseDate(value)!;
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月`;
}

function displayValue(value: string) {
  return value ? value.replaceAll('-', '/') : '选择日期';
}

export function DateField({ label, value, required = false, onChange }: DateFieldProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || todayValue());
  const [activeDate, setActiveDate] = useState(value || todayValue());
  const [viewDate, setViewDate] = useState(value || todayValue());

  const dates = useMemo(() => {
    const viewed = parseDate(viewDate)!;
    const first = new Date(Date.UTC(viewed.getUTCFullYear(), viewed.getUTCMonth(), 1));
    const start = new Date(first);
    start.setUTCDate(first.getUTCDate() - first.getUTCDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      return toDateValue(date);
    });
  }, [viewDate]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>(`[data-date="${activeDate}"]`)?.focus());
  }, [activeDate, open, viewDate]);

  const showPicker = () => {
    const selected = value || todayValue();
    setDraft(selected);
    setActiveDate(selected);
    setViewDate(selected);
    setOpen(true);
  };

  const closePicker = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const moveActive = (next: string) => {
    setActiveDate(next);
    setViewDate(next);
  };

  const handleDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let next = activeDate;
    if (event.key === 'ArrowLeft') next = addDays(activeDate, -1);
    else if (event.key === 'ArrowRight') next = addDays(activeDate, 1);
    else if (event.key === 'ArrowUp') next = addDays(activeDate, -7);
    else if (event.key === 'ArrowDown') next = addDays(activeDate, 7);
    else if (event.key === 'Home') next = addDays(activeDate, -(parseDate(activeDate)?.getUTCDay() ?? 0));
    else if (event.key === 'End') next = addDays(activeDate, 6 - (parseDate(activeDate)?.getUTCDay() ?? 0));
    else if (event.key === 'PageUp') next = addMonths(activeDate, event.shiftKey ? -12 : -1);
    else if (event.key === 'PageDown') next = addMonths(activeDate, event.shiftKey ? 12 : 1);
    else return;
    event.preventDefault();
    moveActive(next);
  };

  const viewed = parseDate(viewDate)!;
  const today = todayValue();

  return <div className="form-field date-field">
    <span id={`${id}-label`}>{label}</span>
    <button
      ref={triggerRef}
      type="button"
      className="date-field-trigger"
      aria-labelledby={`${id}-label ${id}-value`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-required={required}
      onClick={showPicker}
    >
      <span id={`${id}-value`}>{displayValue(value)}</span>
      <CalendarIcon />
    </button>
    <dialog
      ref={dialogRef}
      className="date-picker-dialog"
      aria-labelledby={`${id}-dialog-title`}
      onCancel={(event) => { event.preventDefault(); closePicker(); }}
      onClose={() => setOpen(false)}
      onClick={(event) => { if (event.target === dialogRef.current) closePicker(); }}
    >
      <div className="date-picker-surface">
        <p className="date-picker-supporting-text">选择日期</p>
        <h2 id={`${id}-dialog-title`}>{displayValue(draft)}</h2>
        <div className="date-picker-month-bar">
          <strong aria-live="polite">{monthLabel(viewDate)}</strong>
          <div>
            <button type="button" className="icon-button" aria-label="上一月" onClick={() => moveActive(addMonths(activeDate, -1))}>‹</button>
            <button type="button" className="icon-button" aria-label="下一月" onClick={() => moveActive(addMonths(activeDate, 1))}>›</button>
          </div>
        </div>
        <div className="date-picker-weekdays" aria-hidden="true">{weekdayLabels.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="date-picker-grid" role="grid" aria-label={monthLabel(viewDate)}>
          {dates.map((dateValue) => {
            const date = parseDate(dateValue)!;
            const outside = date.getUTCMonth() !== viewed.getUTCMonth();
            return <button
              type="button"
              role="gridcell"
              data-date={dateValue}
              className={`date-picker-day${outside ? ' outside' : ''}${dateValue === draft ? ' selected' : ''}${dateValue === today ? ' today' : ''}`}
              aria-label={`${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`}
              aria-selected={dateValue === draft}
              tabIndex={dateValue === activeDate ? 0 : -1}
              onFocus={() => setActiveDate(dateValue)}
              onKeyDown={handleDayKeyDown}
              onClick={() => { setDraft(dateValue); setActiveDate(dateValue); setViewDate(dateValue); }}
              key={dateValue}
            >{date.getUTCDate()}</button>;
          })}
        </div>
        <div className="date-picker-actions">
          <button type="button" className="button text-button" onClick={() => { const next = todayValue(); setDraft(next); moveActive(next); }}>今天</button>
          <span />
          <button type="button" className="button text-button" onClick={closePicker}>取消</button>
          <button type="button" className="button text-button" onClick={() => { onChange(draft); closePicker(); }}>确定</button>
        </div>
      </div>
    </dialog>
  </div>;
}
