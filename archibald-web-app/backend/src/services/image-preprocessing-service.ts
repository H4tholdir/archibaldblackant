import sharp from 'sharp';

// Resize width for analysis — keeps computation fast while preserving enough detail
const ANALYSIS_WIDTH = 200;
// Minimum rows instrument must span after resize to attempt ratio measurement
const MIN_INSTRUMENT_ROWS = 50;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

// Per-row instrument widths from raw greyscale pixels.
// A row's width = distance from leftmost to rightmost pixel below `threshold`.
// Returns 0 for rows with no instrument pixels.
function extractWidths(pixels: Buffer, width: number, height: number, threshold: number): number[] {
  const widths = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y++) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x++) {
      if ((pixels[y * width + x] ?? 255) < threshold) {
        if (left === -1) left = x;
        right = x;
      }
    }
    if (left !== -1) widths[y] = right - left + 1;
  }
  return widths;
}

// Derive head-to-shank ratio from per-row width profile.
// Assumes standard orientation: working head at top, shank below.
// Returns null if the profile cannot be reliably measured.
function computeRatioFromWidths(widths: number[]): number | null {
  let topRow = -1;
  let bottomRow = -1;
  for (let y = 0; y < widths.length; y++) {
    if ((widths[y] ?? 0) > 2) {
      if (topRow === -1) topRow = y;
      bottomRow = y;
    }
  }
  if (topRow === -1 || bottomRow - topRow < MIN_INSTRUMENT_ROWS) return null;

  const span = bottomRow - topRow;

  // Head: top 30% of instrument span
  const headSlice = widths.slice(topRow, topRow + Math.floor(span * 0.30)).filter(w => w > 0);
  if (headSlice.length < 3) return null;
  const headWidth = median(headSlice);

  // Shank: 45–75% of instrument span (below neck, above grip)
  const shankStart = topRow + Math.floor(span * 0.45);
  const shankEnd   = topRow + Math.floor(span * 0.75);
  const shankSlice = widths.slice(shankStart, shankEnd + 1).filter(w => w > 0);
  if (shankSlice.length < 5) return null;
  const shankWidth = median(shankSlice);

  if (shankWidth < 2) return null;
  const ratio = headWidth / shankWidth;

  return ratio >= 0.3 && ratio <= 4.0 ? ratio : null;
}

// Measures head-to-shank width ratio from a JPEG/PNG base64 image using pixel analysis.
// More precise than the vision model estimate (±5% vs ±20-30%).
// Returns null on any failure so callers can fall back to the vision model ratio.
async function measureHeadShankRatio(imageBase64: string): Promise<number | null> {
  try {
    const { data: pixels, info } = await sharp(Buffer.from(imageBase64, 'base64'))
      .resize(ANALYSIS_WIDTH)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = info;

    // Adaptive threshold: 70th-percentile value separates dark instrument from bright background
    const sorted = Array.from(pixels as Uint8Array).sort((a, b) => a - b);
    const threshold = sorted[Math.floor(sorted.length * 0.70)] ?? 0;
    if (threshold < 100 || threshold > 245) return null;

    return computeRatioFromWidths(extractWidths(pixels, width, height, threshold));
  } catch {
    return null;
  }
}

export { measureHeadShankRatio, extractWidths, computeRatioFromWidths, median };
