import { useEffect, useMemo, useRef } from 'react';
import 'katex/dist/katex.min.css';
import { mountMermaidDiagrams } from '../lib/mermaid.js';

/** Accepts only HTML produced by the server's sanitized Markdown renderer. */
export function MarkdownContent({ html }: { html: string }) {
  const root = useRef<HTMLDivElement>(null);
  const content = useMemo(() => ({ __html: html }), [html]);

  useEffect(() => {
    if (root.current) return mountMermaidDiagrams(root.current);
  }, [html]);

  return <div ref={root} className="markdown-body" dangerouslySetInnerHTML={content} />;
}
