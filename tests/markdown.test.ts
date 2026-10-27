import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdown } from '../src/server/markdown.js';

test('preserves Mermaid fences and multiline labels through Markdown sanitization', async () => {
  const source = 'flowchart TB\n  P["Prompt"] --> TE["可学习 Embedding<br/>B × Lt × 1024"]\n  TE -.->|时间步| A["Self-Attn → 加残差"]';
  const html = await renderMarkdown(`## Forward 计算图\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\n正文。`);
  assert.match(html, /<h2>Forward 计算图<\/h2>/);
  assert.match(html, /<pre><code class="language-mermaid">flowchart TB/);
  assert.match(html, /Embedding&#x3C;br\/>B/);
  assert.match(html, /B × Lt × 1024/);
  assert.match(html, /<p>正文。<\/p>/);
  assert.doesNotMatch(html, /<svg|<br\s*\//);
});

test('keeps Mermaid source inert and leaves other code fences unchanged', async () => {
  const html = await renderMarkdown([
    '```mermaid',
    'flowchart LR',
    ' A["<script>alert(1)</script><img src=x onerror=alert(1)>"]',
    '```',
    '',
    '```typescript',
    'const value = "<script>";',
    '```',
    '',
    '```',
    'flowchart LR',
    ' A --> B',
    '```',
    '',
    '<script>alert(2)</script>',
  ].join('\n'));
  assert.match(html, /class="language-mermaid"/);
  assert.match(html, /&#x3C;script>alert\(1\)&#x3C;\/script>/);
  assert.match(html, /class="language-typescript"/);
  assert.match(html, /<pre><code>flowchart LR/);
  assert.doesNotMatch(html, /<script|<img|<svg/);
});

test('preserves multiple and nested Mermaid fences without consuming surrounding Markdown', async () => {
  const html = await renderMarkdown('> ```mermaid\n> graph LR\n> A --> B\n> ```\n\n```mermaid\nsequenceDiagram\n Alice->>Bob: 你好\n```\n\n**结束**');
  assert.equal((html.match(/class="language-mermaid"/g) ?? []).length, 2);
  assert.match(html, /<blockquote>\n<pre>/);
  assert.match(html, /<strong>结束<\/strong>/);
});
