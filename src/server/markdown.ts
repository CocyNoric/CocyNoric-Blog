import { readFile } from 'node:fs/promises';
import { defaultSchema } from 'hast-util-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import type { Root, RootContent } from 'mdast';
import type { VFile } from 'vfile';
import { unified } from 'unified';

const schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
};

type RenderMarkdownOptions = {
  pageTitle?: string;
};

function markdownText(node: RootContent): string {
  if ('value' in node && typeof node.value === 'string') return node.value;
  if ('children' in node && Array.isArray(node.children)) {
    return node.children.map((child) => markdownText(child as RootContent)).join('');
  }
  return '';
}

function normalizeHeading(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function removeDuplicatePageTitle() {
  return (tree: Root, file: VFile) => {
    const pageTitle = (file.data as { pageTitle?: unknown }).pageTitle;
    const first = tree.children[0];
    if (
      typeof pageTitle === 'string'
      && first?.type === 'heading'
      && first.depth === 1
      && normalizeHeading(markdownText(first)) === normalizeHeading(pageTitle)
    ) {
      tree.children.shift();
    }
  };
}

const renderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(removeDuplicatePageTitle)
  .use(remarkRehype)
  .use(rehypeSanitize, schema)
  .use(rehypeKatex, { throwOnError: false, strict: false })
  .use(rehypeStringify);

export async function renderMarkdown(markdown: string, options: RenderMarkdownOptions = {}) {
  const result = await renderer.process({ value: markdown, data: { pageTitle: options.pageTitle } });
  return String(result);
}

export async function renderMarkdownFile(filePath: string) {
  return renderMarkdown(await readFile(filePath, 'utf8'));
}
