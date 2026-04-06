import { describe, expect, test } from 'vitest';
import { median, extractWidths, computeRatioFromWidths } from './image-preprocessing-service';

function makeBuffer(rows: number[][]): Buffer {
  return Buffer.from(rows.flat().map(v => v & 0xff));
}

describe('median', () => {
  test('odd-length array returns middle value', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  test('even-length array returns average of two middle values', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  test('single element', () => {
    expect(median([7])).toBe(7);
  });

  test('identical values', () => {
    expect(median([5, 5, 5, 5])).toBe(5);
  });
});

describe('extractWidths', () => {
  test('all background → all zeros', () => {
    const pixels = makeBuffer([
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ]);
    expect(extractWidths(pixels, 4, 2, 200)).toEqual([0, 0]);
  });

  test('full dark row → width equals image width', () => {
    const pixels = makeBuffer([[50, 50, 50, 50]]);
    expect(extractWidths(pixels, 4, 1, 200)).toEqual([4]);
  });

  test('instrument in center columns measures left-to-right span', () => {
    // columns 1–4 dark (50), columns 0 and 5 light (255)
    const pixels = makeBuffer([[255, 50, 50, 50, 50, 255]]);
    expect(extractWidths(pixels, 6, 1, 200)).toEqual([4]);
  });

  test('gap inside instrument still measures edge-to-edge', () => {
    // left=1 (50<100), gap at 2-3 (200≥100), right=4 (50<100) → width=4
    const pixels = makeBuffer([[255, 50, 200, 200, 50, 255]]);
    expect(extractWidths(pixels, 6, 1, 100)).toEqual([4]);
  });

  test('each row measured independently', () => {
    const pixels = makeBuffer([
      [255, 50, 50, 255],  // row 0: columns 1–2 → width 2
      [50,  50, 255, 255], // row 1: columns 0–1 → width 2
      [255, 255, 255, 255],// row 2: no instrument → width 0
    ]);
    expect(extractWidths(pixels, 4, 3, 200)).toEqual([2, 2, 0]);
  });
});

describe('computeRatioFromWidths', () => {
  test('all zeros (no instrument) → null', () => {
    expect(computeRatioFromWidths(new Array(100).fill(0))).toBeNull();
  });

  test('instrument too short (< MIN rows) → null', () => {
    // only 40 rows with width > 0
    const widths = new Array(100).fill(0);
    for (let i = 30; i < 70; i++) widths[i] = 5;
    expect(computeRatioFromWidths(widths)).toBeNull();
  });

  test('wide-head instrument (round bur on FG shank) → ratio > 1', () => {
    // 200 rows; head (rows 0-69) = 10px wide; shank (rows 70-199) = 5px wide
    // head region: top 30% of 199 = rows 0-59 → median 10
    // shank region: 45%-75% of 199 = rows 89-149 → median 5
    // expected ratio ≈ 10/5 = 2.0
    const widths = new Array(200).fill(0);
    for (let i = 0; i < 70; i++) widths[i] = 10;
    for (let i = 70; i < 200; i++) widths[i] = 5;

    const ratio = computeRatioFromWidths(widths);
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeGreaterThan(1.5);
    expect(ratio!).toBeLessThan(2.5);
  });

  test('narrow-head instrument (torpedo on HP shank) → ratio < 1', () => {
    // head (rows 0-69) = 6px wide; shank (rows 70-199) = 10px wide
    // expected ratio ≈ 6/10 = 0.6
    const widths = new Array(200).fill(0);
    for (let i = 0; i < 70; i++) widths[i] = 6;
    for (let i = 70; i < 200; i++) widths[i] = 10;

    const ratio = computeRatioFromWidths(widths);
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeGreaterThan(0.4);
    expect(ratio!).toBeLessThan(0.8);
  });

  test('ratio > 4.0 (absurd head) → null', () => {
    const widths = new Array(200).fill(0);
    for (let i = 0; i < 70; i++) widths[i] = 50; // head very wide
    for (let i = 70; i < 200; i++) widths[i] = 5;
    // ratio ≈ 50/5 = 10 → out of [0.3, 4.0]
    expect(computeRatioFromWidths(widths)).toBeNull();
  });

  test('shank region covered/hidden (< 5 valid rows) → null', () => {
    // head visible, shank region rows 89-149 all zero, rest has some width
    const widths = new Array(200).fill(0);
    for (let i = 0; i < 60; i++) widths[i] = 10;   // head
    for (let i = 60; i < 90; i++) widths[i] = 5;   // transition (widths[89] = 5)
    for (let i = 90; i < 150; i++) widths[i] = 0;  // shank region hidden
    for (let i = 150; i < 200; i++) widths[i] = 5; // lower part visible
    // shankSlice = widths.slice(89, 150) = [5, 0, 0, ..., 0] → after filter: [5] → length 1 < 5
    expect(computeRatioFromWidths(widths)).toBeNull();
  });
});
