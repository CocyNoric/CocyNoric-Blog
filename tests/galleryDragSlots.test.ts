import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGridSlotLayout, moveIntoVisualSlot, slotIndexForPoint, type CardLayout } from '../src/client/pages/admin/galleryDragSlots.js';

function card(id: string, left: number, top: number, width: number, height: number): CardLayout {
  return { id, rect: { left, top, width, height, right: left + width, bottom: top + height } };
}

const bounds = { left: 0, top: 0, right: 320, bottom: 500 };

test('moves items into the visual target slot', () => {
  const first = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  assert.deepEqual(moveIntoVisualSlot(first, 'A', 2).map((item) => item.id), ['B', 'C', 'A']);
  const second = [{ id: 'B' }, { id: 'C' }, { id: 'A' }];
  assert.deepEqual(moveIntoVisualSlot(second, 'A', 1).map((item) => item.id), ['B', 'A', 'C']);
  assert.equal(moveIntoVisualSlot(second, 'A', 2), second);
});

test('targets horizontal slots symmetrically in both directions', () => {
  const layout = buildGridSlotLayout(bounds, [
    card('A', 0, 0, 100, 100),
    card('B', 110, 0, 100, 100),
    card('C', 220, 0, 100, 100),
  ]);

  assert.equal(slotIndexForPoint(layout, 'A', 0, { x: 160, y: 50 }), 1);
  assert.equal(slotIndexForPoint(layout, 'A', 1, { x: 270, y: 50 }), 2);
  assert.equal(slotIndexForPoint(layout, 'C', 2, { x: 160, y: 50 }), 1);
  assert.equal(slotIndexForPoint(layout, 'C', 1, { x: 50, y: 50 }), 0);
});

test('crosses both neighbors after the source placeholder moves', () => {
  const layout = buildGridSlotLayout(bounds, [
    card('B', 0, 0, 100, 100),
    card('A', 110, 0, 100, 100),
    card('C', 220, 0, 100, 100),
  ]);

  assert.equal(slotIndexForPoint(layout, 'A', 1, { x: 50, y: 50 }), 0);
  assert.equal(slotIndexForPoint(layout, 'A', 1, { x: 270, y: 50 }), 2);
});

test('prioritizes non-source direct hits over the source hold area', () => {
  const layout = buildGridSlotLayout(bounds, [
    card('A', 0, 0, 100, 100),
    card('B', 108, 0, 100, 100),
    card('C', 216, 0, 100, 100),
  ]);

  assert.equal(slotIndexForPoint(layout, 'A', 0, { x: 104, y: 50 }), 0);
  assert.equal(slotIndexForPoint(layout, 'A', 0, { x: 110, y: 50 }), 1);
  assert.equal(slotIndexForPoint(layout, 'A', 0, { x: 117, y: 50 }), 1);
});

test('uses card edges to divide horizontal gutters', () => {
  const layout = buildGridSlotLayout(bounds, [
    card('A', 0, 0, 200, 100),
    card('B', 220, 0, 50, 100),
    card('C', 280, 0, 40, 100),
  ]);

  assert.equal(slotIndexForPoint(layout, 'C', 2, { x: 205, y: 50 }), 0);
  assert.equal(slotIndexForPoint(layout, 'C', 2, { x: 215, y: 50 }), 1);
});

test('uses the tallest card for row ranges and symmetric gap selection', () => {
  const layout = buildGridSlotLayout(bounds, [
    card('A', 0, 0, 100, 260),
    card('B', 110, 0, 100, 100),
    card('C', 220, 0, 100, 140),
    card('D', 0, 270, 100, 110),
    card('E', 110, 270, 100, 120),
    card('F', 220, 270, 100, 90),
  ]);

  assert.equal(layout.rows.length, 2);
  assert.equal(layout.rows[0].bottom, 260);
  assert.equal(layout.rows[0].center, 130);
  assert.equal(layout.rows[1].bottom, 390);
  assert.equal(layout.rows[1].center, 330);
  assert.equal(slotIndexForPoint(layout, 'F', 5, { x: 160, y: 200 }), 1);
  assert.equal(slotIndexForPoint(layout, 'F', 5, { x: 160, y: 265 }), 1);
  assert.equal(slotIndexForPoint(layout, 'F', 5, { x: 160, y: 266 }), 4);
  assert.equal(slotIndexForPoint(layout, 'F', 1, { x: 160, y: 266 }), 4);
  assert.equal(slotIndexForPoint(layout, 'F', 5, { x: 160, y: -20 }), 1);
  assert.equal(slotIndexForPoint(layout, 'F', 5, { x: 160, y: 520 }), 4);
});

test('mirrors row selection when the tallest card is in the lower row', () => {
  const layout = buildGridSlotLayout(bounds, [
    card('A', 0, 0, 100, 90),
    card('B', 110, 0, 100, 90),
    card('C', 220, 0, 100, 90),
    card('D', 0, 100, 100, 260),
    card('E', 110, 100, 100, 80),
    card('F', 220, 100, 100, 120),
  ]);

  assert.equal(slotIndexForPoint(layout, 'C', 2, { x: 160, y: 94 }), 1);
  assert.equal(slotIndexForPoint(layout, 'C', 2, { x: 160, y: 96 }), 4);
  assert.equal(slotIndexForPoint(layout, 'C', 4, { x: 160, y: 220 }), 4);
});
