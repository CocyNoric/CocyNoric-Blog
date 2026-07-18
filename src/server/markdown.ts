import { readFile } from 'node:fs/promises';
import { defaultSchema } from 'hast-util-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

const schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
};

const renderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeSanitize, schema)
  .use(rehypeKatex, { throwOnError: false, strict: false })
  .use(rehypeStringify);

export async function renderMarkdown(markdown: string) {
  const result = await renderer.process(markdown);
  return String(result);
}

export async function renderMarkdownFile(filePath: string) {
  return renderMarkdown(await readFile(filePath, 'utf8'));
}
