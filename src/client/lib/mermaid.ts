import type { MermaidConfig } from 'mermaid';
import { createMermaidViewport } from './mermaidViewport.js';

let renderQueue = Promise.resolve();
let diagramSequence = 0;
const maxTextSize = 50_000;

function themeConfig(): MermaidConfig {
  const styles = getComputedStyle(document.documentElement);
  const color = (role: string) => styles.getPropertyValue(`--md-sys-color-${role}`).trim();
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    maxTextSize,
    maxEdges: 500,
    // Diagram directives must not relax security or replace the site's theme.
    secure: ['secure', 'securityLevel', 'startOnLoad', 'suppressErrorRendering', 'maxTextSize', 'maxEdges', 'theme', 'themeVariables', 'themeCSS', 'look', 'fontFamily', 'htmlLabels', 'dompurifyConfig'],
    theme: 'base',
    look: 'classic',
    htmlLabels: false,
    fontFamily: getComputedStyle(document.body).fontFamily,
    themeVariables: {
      darkMode: document.documentElement.dataset.theme === 'dark',
      background: color('surface'),
      primaryColor: color('primary-container'),
      primaryTextColor: color('on-primary-container'),
      primaryBorderColor: color('primary'),
      secondaryColor: color('secondary-container'),
      secondaryTextColor: color('on-secondary-container'),
      secondaryBorderColor: color('secondary'),
      tertiaryColor: color('surface-variant'),
      tertiaryTextColor: color('on-surface-variant'),
      tertiaryBorderColor: color('outline'),
      lineColor: color('on-surface-variant'),
      textColor: color('on-surface'),
      clusterBkg: color('surface'),
      clusterBorder: color('outline'),
      edgeLabelBackground: color('surface'),
    },
  };
}

function mountDiagram(pre: HTMLPreElement, code: HTMLElement) {
  const source = code.textContent ?? '';
  const figure = document.createElement('figure');
  figure.className = 'mermaid-diagram';
  const status = document.createElement('p');
  status.className = 'mermaid-status';
  status.setAttribute('role', 'status');
  status.textContent = '正在绘制图表…';
  const viewport = document.createElement('div');
  viewport.className = 'mermaid-viewport';
  viewport.setAttribute('role', 'region');
  viewport.tabIndex = 0;
  viewport.hidden = true;
  const diagramView = createMermaidViewport(viewport);
  const toolbar = document.createElement('div');
  toolbar.className = 'mermaid-toolbar';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mermaid-source-toggle';
  const sourcePanel = document.createElement('div');
  sourcePanel.className = 'mermaid-source';
  const blockId = `blog-mermaid-block-${++diagramSequence}`;
  sourcePanel.id = `${blockId}-source`;
  viewport.id = `${blockId}-view`;
  toggle.setAttribute('aria-controls', `${sourcePanel.id} ${viewport.id}`);
  toolbar.append(toggle, diagramView.controls);
  pre.replaceWith(figure);
  sourcePanel.append(pre);
  figure.append(toolbar, status, viewport, sourcePanel);

  let active = true;
  let revision = 0;
  let ready = false;
  let showingSource = false;

  const syncView = () => {
    sourcePanel.hidden = !showingSource;
    viewport.hidden = showingSource || !ready;
    diagramView.controls.hidden = showingSource || !ready;
    toggle.textContent = showingSource ? '查看 Mermaid 图表' : '查看 Mermaid 源码';
    toggle.setAttribute('aria-pressed', String(showingSource));
    toggle.disabled = showingSource && !ready;
    if (!viewport.hidden) diagramView.resize();
  };
  const toggleView = () => { showingSource = !showingSource; syncView(); };
  toggle.addEventListener('click', toggleView);
  syncView();

  const refresh = () => {
    const currentRevision = ++revision;
    const isCurrent = () => active && currentRevision === revision && figure.isConnected;
    // Serialize initialize + render: Mermaid has global configuration and a shared renderer.
    renderQueue = renderQueue.then(async () => {
      if (!isCurrent()) return;
      if (source.length > maxTextSize) throw new Error('Diagram exceeds the text limit');
      const { default: mermaid } = await import('mermaid');
      await document.fonts.ready;
      if (!isCurrent()) return;
      mermaid.initialize(themeConfig());
      const staging = document.createElement('div');
      staging.className = 'mermaid-staging';
      staging.setAttribute('aria-hidden', 'true');
      document.body.append(staging);
      try {
        const { svg } = await mermaid.render(`blog-mermaid-${++diagramSequence}`, source, staging);
        if (!isCurrent()) return;
        // Mermaid sanitizes SVG in strict mode. Never bind diagram click handlers.
        viewport.innerHTML = svg;
        const image = viewport.querySelector('svg');
        if (!image) throw new Error('Diagram did not produce an SVG');
        image.setAttribute('role', 'img');
        if (!image.hasAttribute('aria-labelledby') && !image.hasAttribute('aria-label')) {
          image.setAttribute('aria-label', 'Mermaid 图表，完整内容可查看源码');
        }
        viewport.hidden = false;
        diagramView.setImage(image);
        ready = true;
        status.hidden = true;
        syncView();
      } finally {
        staging.remove();
      }
    }).catch(() => {
      if (!isCurrent()) return;
      ready = false;
      showingSource = true;
      syncView();
      status.hidden = false;
      status.dataset.error = '';
      status.textContent = source.length > maxTextSize
        ? '图表内容过长（最多 50,000 个字符），已保留源码。'
        : '图表无法显示，请检查 Mermaid 语法或稍后重试。源码已保留。';
    });
  };

  refresh();
  return {
    refresh,
    dispose() {
      active = false;
      toggle.removeEventListener('click', toggleView);
      diagramView.dispose();
      // Restore fences for StrictMode effect replay; detached old articles stay untouched.
      if (figure.isConnected) figure.replaceWith(pre);
    },
  };
}

export function mountMermaidDiagrams(root: HTMLElement) {
  const diagrams = Array.from(root.querySelectorAll<HTMLPreElement>('pre')).flatMap((pre) => {
    const code = pre.firstElementChild;
    return code instanceof HTMLElement && code.tagName === 'CODE'
      && Array.from(code.classList).some((name) => /^language-mermaid$/i.test(name))
      ? [mountDiagram(pre, code)] : [];
  });
  if (!diagrams.length) return;

  const refresh = () => diagrams.forEach((diagram) => diagram.refresh());
  const themeObserver = new MutationObserver(refresh);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  const themeStyle = document.getElementById('site-theme');
  if (themeStyle) themeObserver.observe(themeStyle, { childList: true, characterData: true, subtree: true });

  return () => {
    themeObserver.disconnect();
    diagrams.forEach((diagram) => diagram.dispose());
  };
}
