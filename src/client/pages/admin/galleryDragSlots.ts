export type Rect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

export type CardLayout = {
  id: string;
  rect: Rect;
};

type GridRow = {
  top: number;
  bottom: number;
  center: number;
  cards: CardLayout[];
};

export type GridSlotLayout = {
  bounds: Pick<Rect, 'left' | 'right' | 'top' | 'bottom'>;
  cards: CardLayout[];
  rows: GridRow[];
};

const rowTolerance = 4;
const hysteresis = 12;

export function moveIntoVisualSlot<T extends { id: string }>(items: T[], sourceId: string, slotIndex: number) {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  if (sourceIndex < 0 || slotIndex < 0 || slotIndex >= items.length || sourceIndex === slotIndex) return items;
  const next = [...items];
  const [source] = next.splice(sourceIndex, 1);
  next.splice(slotIndex, 0, source);
  return next;
}

export function buildGridSlotLayout(bounds: Pick<Rect, 'left' | 'right' | 'top' | 'bottom'>, cards: CardLayout[]): GridSlotLayout {
  const sorted = [...cards].sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left);
  const rows: GridRow[] = [];
  for (const card of sorted) {
    const row = rows.at(-1);
    if (!row || Math.abs(card.rect.top - row.top) > rowTolerance) rows.push({ top: card.rect.top, bottom: card.rect.bottom, center: card.rect.top + card.rect.height / 2, cards: [card] });
    else {
      row.cards.push(card);
      row.bottom = Math.max(row.bottom, card.rect.bottom);
      row.center = (row.top + row.bottom) / 2;
    }
  }
  rows.forEach((row) => row.cards.sort((left, right) => left.rect.left - right.rect.left));
  return { bounds, cards: sorted, rows };
}

function rowForPoint(layout: GridSlotLayout, y: number) {
  if (!layout.rows.length) return null;
  const containing = layout.rows.filter((row) => y >= row.top && y <= row.bottom);
  if (containing.length) return containing.reduce((closest, row) => Math.abs(y - row.center) < Math.abs(y - closest.center) ? row : closest);
  return layout.rows.reduce((closest, row) => {
    const distance = y < row.top ? row.top - y : y - row.bottom;
    const closestDistance = y < closest.top ? closest.top - y : y - closest.bottom;
    return distance < closestDistance ? row : closest;
  });
}

function contains(rect: Rect, point: { x: number; y: number }) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function horizontalSlot(row: GridRow, index: number) {
  const previous = row.cards[index - 1];
  const card = row.cards[index];
  const next = row.cards[index + 1];
  return {
    left: previous ? (previous.rect.right + card.rect.left) / 2 : Number.NEGATIVE_INFINITY,
    right: next ? (card.rect.right + next.rect.left) / 2 : Number.POSITIVE_INFINITY,
  };
}

export function slotIndexForPoint(layout: GridSlotLayout, sourceId: string, currentSlotIndex: number, point: { x: number; y: number }) {
  const direct = layout.cards.find((card) => card.id !== sourceId && contains(card.rect, point));
  if (direct) return layout.cards.findIndex((card) => card.id === direct.id);

  const row = rowForPoint(layout, point.y);
  if (!row) return currentSlotIndex;

  const sourceIndex = row.cards.findIndex((card) => card.id === sourceId);
  if (sourceIndex >= 0) {
    const sourceSlot = horizontalSlot(row, sourceIndex);
    if (point.x >= sourceSlot.left - hysteresis && point.x <= sourceSlot.right + hysteresis) return currentSlotIndex;
  }

  for (let index = 0; index < row.cards.length; index += 1) {
    if (point.x <= horizontalSlot(row, index).right) return layout.cards.findIndex((card) => card.id === row.cards[index].id);
  }
  return currentSlotIndex;
}
