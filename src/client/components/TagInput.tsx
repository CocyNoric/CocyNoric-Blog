import { useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';

type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  maximum?: number;
  placeholder?: string;
  suggestions?: readonly string[];
};

function normalizedTags(values: string[], maximum: number) {
  const seen = new Set<string>();
  return values.flatMap((value) => value.split(/[,，\n]/))
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase('zh-CN');
      if (!value || value.length > 32 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maximum);
}

export function TagInput({ value, onChange, disabled = false, maximum = 12, placeholder = '搜索或新建标签', suggestions = [] }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selectedKeys = useMemo(() => new Set(value.map((tag) => tag.toLocaleLowerCase('zh-CN'))), [value]);
  const normalizedSuggestions = useMemo(
    () => normalizedTags([...suggestions], Math.max(suggestions.length, maximum)),
    [suggestions, maximum],
  );
  const draftKey = draft.trim().toLocaleLowerCase('zh-CN');
  const available = useMemo(() => normalizedSuggestions
    .filter((tag) => !selectedKeys.has(tag.toLocaleLowerCase('zh-CN')))
    .filter((tag) => !draftKey || tag.toLocaleLowerCase('zh-CN').includes(draftKey))
    .slice(0, 12), [normalizedSuggestions, selectedKeys, draftKey]);
  const exactSuggestion = useMemo(
    () => normalizedSuggestions.some((tag) => tag.toLocaleLowerCase('zh-CN') === draftKey),
    [normalizedSuggestions, draftKey],
  );

  const commit = () => {
    const next = normalizedTags([...value, draft], maximum);
    setDraft('');
    if (next.length !== value.length || next.some((tag, index) => tag !== value[index])) onChange(next);
  };

  const select = (tag: string) => {
    const next = normalizedTags([...value, tag], maximum);
    setDraft('');
    if (next.length !== value.length || next.some((candidate, index) => candidate !== value[index])) onChange(next);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const remove = (index: number) => onChange(value.filter((_tag, tagIndex) => tagIndex !== index));
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Backspace' && !draft && value.length) {
      remove(value.length - 1);
    }
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;
    commit();
    setOpen(false);
  };

  return <div className="tag-picker" ref={rootRef} onBlur={handleBlur}>
    <div className="tag-input" onClick={() => inputRef.current?.focus()}>
      {value.map((tag, index) => <span className="tag-input-chip" key={`${tag}-${index}`}>
        <span>{tag}</span>
        <button type="button" disabled={disabled} onClick={() => remove(index)} aria-label={`移除标签 ${tag}`}>×</button>
      </span>)}
      <input
        ref={inputRef}
        value={draft}
        disabled={disabled || value.length >= maximum}
        maxLength={32}
        placeholder={value.length ? '继续搜索或新建' : placeholder}
        role="combobox"
        aria-label="搜索或新建标签"
        aria-autocomplete="list"
        aria-expanded={open && (available.length > 0 || Boolean(draft.trim()))}
        aria-controls={listboxId}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setDraft(event.target.value); setOpen(true); }}
        onKeyDown={handleKeyDown}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData('text');
          if (!/[,，\n]/.test(pasted)) return;
          event.preventDefault();
          onChange(normalizedTags([...value, draft, pasted], maximum));
          setDraft('');
        }}
      />
    </div>
    {open && !disabled && value.length < maximum && (available.length > 0 || Boolean(draft.trim())) && <div className="tag-picker-menu" id={listboxId} role="listbox" aria-label="可用标签">
      <span className="tag-picker-label">{draft.trim() ? '匹配标签' : '快速选择已有标签'}</span>
      <div className="tag-picker-options">
        {available.map((tag) => <button type="button" role="option" aria-selected="false" key={tag} onMouseDown={(event) => event.preventDefault()} onClick={() => select(tag)}><span aria-hidden="true">＋</span>{tag}</button>)}
        {draft.trim() && !exactSuggestion && <button className="tag-picker-create" type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={commit}><span aria-hidden="true">＋</span>新建“{draft.trim()}”</button>}
      </div>
    </div>}
  </div>;
}
