export type DiagramSize = { width: number; height: number };
export type DiagramView = { scale: number; x: number; y: number };

export const minDiagramScale = 0.25;
export const maxDiagramScale = 4;
const padding = 16;

function fitScale(content: DiagramSize, viewport: DiagramSize) {
  return Math.min(1, Math.max(1, viewport.width - padding * 2) / content.width, Math.max(1, viewport.height - padding * 2) / content.height);
}

function minimumScale(content: DiagramSize, viewport: DiagramSize) {
  return Math.min(minDiagramScale, fitScale(content, viewport));
}

/** Bound panning without discarding the cursor's zoom anchor when the content fits. */
export function constrainDiagramView(view: DiagramView, content: DiagramSize, viewport: DiagramSize): DiagramView {
  const scale = Math.min(maxDiagramScale, Math.max(minimumScale(content, viewport), view.scale));
  const axis = (offset: number, length: number, available: number) => {
    const opposite = available - length - padding;
    return Math.min(Math.max(padding, opposite), Math.max(Math.min(padding, opposite), offset));
  };
  return {
    scale,
    x: axis(view.x, content.width * scale, viewport.width),
    y: axis(view.y, content.height * scale, viewport.height),
  };
}

export function initialDiagramView(content: DiagramSize, viewport: DiagramSize): DiagramView {
  const scale = fitScale(content, viewport);
  return {
    scale,
    x: (viewport.width - content.width * scale) / 2,
    y: (viewport.height - content.height * scale) / 2,
  };
}

export function zoomDiagramAt(view: DiagramView, scale: number, point: { x: number; y: number }, content: DiagramSize, viewport: DiagramSize): DiagramView {
  const nextScale = Math.min(maxDiagramScale, Math.max(minimumScale(content, viewport), scale));
  const ratio = nextScale / view.scale;
  return constrainDiagramView({ scale: nextScale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio }, content, viewport);
}

export function createMermaidViewport(viewport: HTMLElement) {
  const controls = document.createElement('div');
  controls.className = 'mermaid-controls';
  controls.hidden = true;
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', '图表视图控制');
  const button = (label: string, path: string) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'mermaid-view-button';
    element.setAttribute('aria-label', label);
    element.title = label;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.8');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    icon.append(shape);
    element.append(icon);
    return element;
  };
  const zoomOut = button('缩小图表', 'M5 12h14');
  const zoomIn = button('放大图表', 'M5 12h14M12 5v14');
  const reset = button('适应视图', 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5');
  const percentage = document.createElement('output');
  percentage.className = 'visually-hidden';
  percentage.setAttribute('aria-label', '当前缩放比例');
  percentage.setAttribute('aria-live', 'off');
  controls.append(zoomOut, zoomIn, reset, percentage);
  viewport.setAttribute('aria-label', '图表，拖动或方向键平移，加减键缩放，0 适应视图');

  const events = new AbortController();
  const options = { signal: events.signal };
  let image: SVGSVGElement | undefined;
  let content: DiagramSize = { width: 0, height: 0 };
  let view: DiagramView = { scale: 1, x: padding, y: padding };
  let previousSize: DiagramSize | undefined;
  let fitted = true;
  let drag: { pointerId: number; x: number; y: number; view: DiagramView } | undefined;
  const size = () => ({ width: viewport.clientWidth, height: viewport.clientHeight });

  const draw = () => {
    if (!image) return;
    view = constrainDiagramView(view, content, size());
    image.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    percentage.value = `${Math.round(view.scale * 100)}%`;
    zoomOut.disabled = view.scale <= minimumScale(content, size());
    zoomIn.disabled = view.scale >= maxDiagramScale;
    zoomOut.title = `缩小图表（当前 ${percentage.value}）`;
    zoomIn.title = `放大图表（当前 ${percentage.value}）`;
  };
  const stopDrag = (event?: PointerEvent) => {
    if (event && drag && event.pointerId !== drag.pointerId) return;
    const pointerId = drag?.pointerId;
    drag = undefined;
    if (pointerId !== undefined && viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
    viewport.classList.remove('is-dragging');
  };
  const restore = () => {
    stopDrag();
    fitted = true;
    view = initialDiagramView(content, size());
    draw();
  };
  const zoom = (scale: number, point = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }) => {
    if (!image) return;
    stopDrag();
    fitted = false;
    view = zoomDiagramAt(view, scale, point, content, size());
    draw();
  };

  zoomOut.addEventListener('click', () => zoom(view.scale / 1.2), options);
  zoomIn.addEventListener('click', () => zoom(view.scale * 1.2), options);
  reset.addEventListener('click', restore, options);
  viewport.addEventListener('wheel', (event) => {
    if (!image || !event.deltaY) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    const delta = Math.max(-320, Math.min(320, event.deltaY * unit));
    zoom(view.scale * Math.exp(-delta * 0.002), { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }, { ...options, passive: false });
  viewport.addEventListener('pointerdown', (event) => {
    if (!image || !event.isPrimary || event.button !== 0 || (event.target instanceof Element && event.target.closest('a'))) return;
    event.preventDefault();
    viewport.focus({ preventScroll: true });
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, view: { ...view } };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('is-dragging');
  }, options);
  viewport.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    fitted = false;
    view = { ...drag.view, x: drag.view.x + event.clientX - drag.x, y: drag.view.y + event.clientY - drag.y };
    draw();
  }, options);
  viewport.addEventListener('pointerup', stopDrag, options);
  viewport.addEventListener('pointercancel', stopDrag, options);
  viewport.addEventListener('lostpointercapture', stopDrag, options);
  viewport.addEventListener('keydown', (event) => {
    if (!image || event.target !== viewport || event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key) {
      case '+': case '=': zoom(view.scale * 1.2); break;
      case '-': zoom(view.scale / 1.2); break;
      case '0': case 'Home': restore(); break;
      case 'ArrowLeft': fitted = false; view.x += 40; draw(); break;
      case 'ArrowRight': fitted = false; view.x -= 40; draw(); break;
      case 'ArrowUp': fitted = false; view.y += 40; draw(); break;
      case 'ArrowDown': fitted = false; view.y -= 40; draw(); break;
      default: return;
    }
    event.preventDefault();
  }, options);

  const resize = () => {
    const currentSize = size();
    if (!image || !currentSize.width || !currentSize.height) return;
    if (fitted) view = initialDiagramView(content, currentSize);
    else if (previousSize) {
      view.x += (currentSize.width - previousSize.width) / 2;
      view.y += (currentSize.height - previousSize.height) / 2;
    }
    previousSize = currentSize;
    draw();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);

  return {
    controls,
    resize,
    setImage(nextImage: SVGSVGElement) {
      stopDrag();
      const box = nextImage.viewBox.baseVal;
      const bounds = nextImage.getBoundingClientRect();
      content = { width: box.width || bounds.width, height: box.height || bounds.height };
      if (!(content.width > 0 && content.height > 0)) throw new Error('Diagram has no measurable size');
      nextImage.style.width = `${content.width}px`;
      nextImage.style.height = `${content.height}px`;
      nextImage.style.maxWidth = 'none';
      viewport.style.height = `${content.height + padding * 2}px`;
      controls.hidden = false;
      const firstImage = !image;
      image = nextImage;
      previousSize = size();
      if (firstImage || fitted) restore();
      else draw();
    },
    dispose() {
      stopDrag();
      observer.disconnect();
      events.abort();
    },
  };
}
