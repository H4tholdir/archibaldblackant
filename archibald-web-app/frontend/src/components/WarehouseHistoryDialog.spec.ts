import { describe, test, expect } from 'vitest';
import { computeGlobalRemaining } from './WarehouseHistoryDialog';
import type { WarehouseMatch } from '../services/warehouse-matching';

type CopyOrderMatch = {
  articleCode: string;
  description: string;
  requestedQuantity: number;
  matches: WarehouseMatch[];
};

const makeMatch = (itemId: number, availableQty: number, level: WarehouseMatch['level'] = 'exact'): WarehouseMatch => ({
  item: {
    id: itemId,
    articleCode: `ART.00${itemId}.001`,
    description: '',
    boxName: 'BOX',
    quantity: availableQty,
    uploadedAt: '',
  },
  level,
  score: level === 'exact' ? 100 : 80,
  availableQty,
  reason: '',
});

const makeArt = (code: string, qty: number, matches: WarehouseMatch[]): CopyOrderMatch => ({
  articleCode: code,
  description: '',
  requestedQuantity: qty,
  matches,
});

describe('computeGlobalRemaining', () => {
  test('initialises remaining from match availableQty, no allocations yet', () => {
    const articles = [
      makeArt('A', 10, [makeMatch(1, 50)]),
      makeArt('B', 5, [makeMatch(2, 20)]),
    ];
    const result = computeGlobalRemaining(articles, new Map());

    expect(result.get(1)).toBe(50);
    expect(result.get(2)).toBe(20);
  });

  test('subtracts allocated quantities from matching item IDs', () => {
    const articles = [
      makeArt('A', 10, [makeMatch(1, 50)]),
      makeArt('B', 5, [makeMatch(1, 50)]), // same item
    ];
    const allSelections = new Map([
      ['A', new Map([[1, 10]])],
      ['B', new Map()],
    ]);
    const result = computeGlobalRemaining(articles, allSelections);

    expect(result.get(1)).toBe(40); // 50 - 10
  });

  test('clamps remaining to 0, never negative', () => {
    const articles = [makeArt('A', 10, [makeMatch(7, 5)])];
    const allSelections = new Map([['A', new Map([[7, 10]])]]);
    const result = computeGlobalRemaining(articles, allSelections);

    expect(result.get(7)).toBe(0);
  });

  test('two articles allocating from same item both reduce the global pool', () => {
    const articles = [
      makeArt('A', 20, [makeMatch(3, 50)]),
      makeArt('B', 15, [makeMatch(3, 50)]),
    ];
    const allSelections = new Map([
      ['A', new Map([[3, 20]])],
      ['B', new Map([[3, 15]])],
    ]);
    const result = computeGlobalRemaining(articles, allSelections);

    expect(result.get(3)).toBe(15); // 50 - 20 - 15
  });

  test('item appearing in multiple article match lists is initialised only once (first seen)', () => {
    const articles = [
      makeArt('A', 10, [makeMatch(5, 30)]),
      makeArt('B', 10, [makeMatch(5, 30)]),
    ];
    const result = computeGlobalRemaining(articles, new Map());

    // Should be 30, not 60 (initialised from first occurrence)
    expect(result.get(5)).toBe(30);
  });
});
