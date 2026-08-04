import { useRef, useState, type KeyboardEvent } from 'react';

type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  maximum?: number;
  placeholder?: string;
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

export function TagInput({ value, onChange, disabled = false, maximum = 12, placeholder = '输入标签后按回车' }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const next = normalizedTags([...value, draft], maximum);
    setDraft('');
    if (next.length !== value.length || next.some((tag, index) => tag !== value[index])) onChange(next);
  };

  const remove = (index: number) => onChange(value.filter((_tag, tagIndex) => tagIndex !== index));
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && !draft && value.length) {
      remove(value.length - 1);
    }
  };

  return <div className="tag-input" onClick={() => inputRef.current?.focus()}>
    {value.map((tag, index) => <span className="tag-input-chip" key={`${tag}-${index}`}>
      <span>{tag}</span>
      <button type="button" disabled={disabled} onClick={() => remove(index)} aria-label={`移除标签 ${tag}`}>×</button>
    </span>)}
    <input
      ref={inputRef}
      value={draft}
      disabled={disabled || value.length >= maximum}
      maxLength={32}
      placeholder={value.length ? '' : placeholder}
      aria-label="添加标签"
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={commit}
      onPaste={(event) => {
        const pasted = event.clipboardData.getData('text');
        if (!/[,，\n]/.test(pasted)) return;
        event.preventDefault();
        onChange(normalizedTags([...value, draft, pasted], maximum));
        setDraft('');
      }}
    />
  </div>;
}
