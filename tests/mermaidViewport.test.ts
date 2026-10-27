import assert from 'node:assert/strict';
import test from 'node:test';
import { constrainDiagramView, initialDiagramView, zoomDiagramAt } from '../src/client/lib/mermaidViewport.js';

const content = { width: 2000, height: 1200 };
const viewport = { width: 600, height: 400 };

test('zooms around the pointed diagram coordinate rather than the canvas origin', () => {
  const before = { scale: 1, x: -200, y: -100 };
  const pointer = { x: 200, y: 150 };
  const after = zoomDiagramAt(before, 2, pointer, content, viewport);
  assert.equal((pointer.x - after.x) / after.scale, (pointer.x - before.x) / before.scale);
  assert.equal((pointer.y - after.y) / after.scale, (pointer.y - before.y) / before.scale);
  assert.deepEqual(zoomDiagramAt(after, 1, pointer, content, viewport), before);
});

test('clamps extreme zoom input to readable supported scale limits', () => {
  const before = { scale: 1, x: -200, y: -100 };
  assert.equal(zoomDiagramAt(before, 100, { x: 200, y: 150 }, content, viewport).scale, 4);
  assert.equal(zoomDiagramAt(before, 0.001, { x: 200, y: 150 }, content, viewport).scale, 0.25);
});

test('prevents dragging large diagrams beyond their content bounds', () => {
  const after = constrainDiagramView({ scale: 1, x: 10_000, y: -10_000 }, content, viewport);
  assert.equal(after.x, 16);
  assert.equal(after.y + content.height, viewport.height - 16);
});

test('allows small diagrams to move within the canvas without leaving it', () => {
  const small = { width: 100, height: 80 };
  const before = initialDiagramView(small, viewport);
  const moved = constrainDiagramView({ ...before, x: before.x + 30, y: before.y - 20 }, small, viewport);
  assert.equal(moved.x, before.x + 30);
  assert.equal(moved.y, before.y - 20);
  const bounded = constrainDiagramView({ ...before, x: -10_000, y: 10_000 }, small, viewport);
  assert.ok(bounded.x >= 0 && bounded.x + small.width <= viewport.width);
  assert.ok(bounded.y >= 0 && bounded.y + small.height <= viewport.height);
});

test('keeps small diagrams at natural size in the initial fitted view', () => {
  assert.deepEqual(initialDiagramView({ width: 100, height: 80 }, viewport), { scale: 1, x: 250, y: 160 });
});

test('fits and centers the whole diagram across tall, wide and narrow layouts', () => {
  for (const [diagram, canvas] of [
    [content, viewport],
    [{ width: 160, height: 8000 }, viewport],
    [{ width: 12000, height: 160 }, viewport],
    [content, { width: 240, height: 300 }],
  ]) {
    const view = initialDiagramView(diagram, canvas);
    const width = diagram.width * view.scale;
    const height = diagram.height * view.scale;
    assert.ok(view.scale > 0 && view.scale <= 1);
    assert.ok(view.x >= 16 - 1e-8 && view.x + width <= canvas.width - 16 + 1e-8);
    assert.ok(view.y >= 16 - 1e-8 && view.y + height <= canvas.height - 16 + 1e-8);
    assert.ok(Math.abs(view.x - (canvas.width - width) / 2) < 1e-8);
    assert.ok(Math.abs(view.y - (canvas.height - height) / 2) < 1e-8);
  }
});

test('allows fitting very large graphs below 25 percent without clamping the fitted view away', () => {
  const large = { width: 2000, height: 16000 };
  const narrow = { width: 240, height: 300 };
  const view = initialDiagramView(large, narrow);
  assert.ok(view.scale < 0.25);
  assert.deepEqual(constrainDiagramView(view, large, narrow), view);
  const zoomedOut = zoomDiagramAt(view, 0.0001, { x: 120, y: 150 }, large, narrow);
  assert.equal(zoomedOut.scale, view.scale);
});
