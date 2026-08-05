import { useId, useMemo, useRef, useState, type ClipboardEvent, type FocusEvent, type KeyboardEvent } from 'react';
import { categorySegments, maximumCategoryDepth, maximumCategorySegmentLength, normalizeCategoryPath, summarizeCategoryPaths, uncategorizedCategory } from '../../shared/categories.js';

type CategoryInputProps = {
  value: string;
  onChange: (category: string) => void;
  disabled?: boolean;
  suggestions?: readonly string[];
};

function selectedCategorySegments(value: string) {
  const normalized = normalizeCategoryPath(value);
  return normalized === uncategorizedCategory ? [] : categorySegments(normalized).slice(0, maximumCategoryDepth);
}

function validDraftSegments(value: string) {
  return categorySegments(value.replaceAll('／', '/'))
    .filter((segment) => segment.length <= maximumCategorySegmentLength);
}

function pathFromSegments(segments: string[]) {
  return segments.length ? segments.join('/') : uncategorizedCategory;
}

export function CategoryInput({ value, onChange, disabled = false, suggestions = [] }: CategoryInputProps) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const segments = useMemo(() => selectedCategorySegments(value), [value]);

  const available = useMemo(() => {
    const prefixKey = segments.join('/').toLocaleLowerCase('zh-CN');
    const draftKey = draft.trim().toLocaleLowerCase('zh-CN');
    return summarizeCategoryPaths([...suggestions])
      .filter((summary) => summary.path !== uncategorizedCategory && summary.depth === segments.length)
      .filter((summary) => {
        const parentKey = categorySegments(summary.path).slice(0, -1).join('/').toLocaleLowerCase('zh-CN');
        return parentKey === prefixKey;
      })
      .map((summary) => summary.label)
      .filter((label) => !draftKey || label.toLocaleLowerCase('zh-CN').includes(draftKey))
      .slice(0, 12);
  }, [draft, segments, suggestions]);

  const exactSuggestion = useMemo(() => {
    const draftKey = draft.trim().toLocaleLowerCase('zh-CN');
    return available.some((label) => label.toLocaleLowerCase('zh-CN') === draftKey);
  }, [available, draft]);

  const setSegments = (next: string[]) => onChange(pathFromSegments(next.slice(0, maximumCategoryDepth)));

  const append = (values: string[]) => {
    const next = [...segments, ...values].slice(0, maximumCategoryDepth);
    setDraft('');
    if (next.length !== segments.length || next.some((segment, index) => segment !== segments[index])) setSegments(next);
  };

  const commit = () => append(validDraftSegments(draft));

  const removeFrom = (index: number) => setSegments(segments.slice(0, index));

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === '/' || event.key === '／') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Backspace' && !draft && segments.length) {
      removeFrom(segments.length - 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (!/[／/]/.test(pasted)) return;
    event.preventDefault();
    append(validDraftSegments(`${draft}/${pasted}`));
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;
    commit();
    setOpen(false);
  };

  const level = segments.length + 1;
  const menuOpen = open && !disabled && segments.length < maximumCategoryDepth && (available.length > 0 || Boolean(draft.trim()));

  return <div className="tag-picker category-picker" ref={rootRef} onBlur={handleBlur}>
    <div className="tag-input category-input" onClick={() => inputRef.current?.focus()}>
      {segments.map((segment, index) => <span className="category-input-level" key={segments.slice(0, index + 1).join('/')}>
        {index > 0 && <span className="category-input-divider" aria-hidden="true">/</span>}
        <span className="tag-input-chip category-input-chip">
          <span>{segment}</span>
          <button type="button" disabled={disabled} onClick={() => removeFrom(index)} aria-label={`移除分类 ${segment} 及后续层级`}>×</button>
        </span>
      </span>)}
      <input
        ref={inputRef}
        value={draft}
        disabled={disabled || segments.length >= maximumCategoryDepth}
        maxLength={maximumCategorySegmentLength}
        placeholder={segments.length ? '添加下一级分类' : '搜索或新建分类'}
        role="combobox"
        aria-label={`搜索或新建第 ${level} 级分类`}
        aria-autocomplete="list"
        aria-expanded={menuOpen}
        aria-controls={listboxId}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setDraft(event.target.value); setOpen(true); }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />
    </div>
    {menuOpen && <div className="tag-picker-menu" id={listboxId} role="listbox" aria-label={`可用的第 ${level} 级分类`}>
      <span className="tag-picker-label">{draft.trim() ? `匹配第 ${level} 级分类` : segments.length ? `“${segments.at(-1)}”的下一级` : '快速选择已有分类'}</span>
      <div className="tag-picker-options">
        {available.map((label) => <button type="button" role="option" aria-selected="false" key={label} onMouseDown={(event) => event.preventDefault()} onClick={() => append([label])}><span aria-hidden="true">＋</span>{label}</button>)}
        {draft.trim() && !exactSuggestion && <button className="tag-picker-create" type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={commit}><span aria-hidden="true">＋</span>新建“{draft.trim()}”作为第 {level} 级</button>}
      </div>
    </div>}
  </div>;
}
