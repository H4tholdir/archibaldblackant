#!/usr/bin/env node

/**
 * Search the deterministic ERP visual feature index with a local image.
 *
 * This is a local baseline retriever: query image -> nearest ERP silhouettes ->
 * article variants. It intentionally avoids external AI calls.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");

const DEFAULT_FEATURE_INDEX = path.join(
  backendRoot,
  "data",
  "erp-visual-feature-index",
  "2026-06-03-04-52-35-951",
  "erp-visual-feature-index.json",
);

function parseArgs(argv) {
  const args = {
    imagePath: "",
    featureIndexPath: process.env.VISUAL_FEATURE_INDEX_PATH || DEFAULT_FEATURE_INDEX,
    topK: Number(process.env.VISUAL_SEARCH_TOP_K || 10),
    variantsPerHit: Number(process.env.VISUAL_SEARCH_VARIANTS_PER_HIT || 8),
    group: "",
    json: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--image" || arg === "--query") && next) {
      args.imagePath = path.resolve(next);
      i += 1;
    } else if ((arg === "--feature-index" || arg === "--index") && next) {
      args.featureIndexPath = path.resolve(next);
      i += 1;
    } else if (arg === "--top-k" && next) {
      args.topK = Number(next);
      i += 1;
    } else if (arg === "--variants" && next) {
      args.variantsPerHit = Number(next);
      i += 1;
    } else if (arg === "--group" && next) {
      args.group = next;
      i += 1;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/search-erp-visual-index.mjs --image <path> [options]

Options:
  --feature-index <path>  Feature index JSON.
  --top-k <n>             Number of silhouette hits. Default: 10.
  --variants <n>          Variants shown per hit. Default: 8.
  --group <name>          Restrict hits to representative group.
  --json                  Print JSON instead of readable text.
`);
      process.exit(0);
    }
  }

  if (!args.imagePath) throw new Error("Missing --image <path>");
  if (!Number.isFinite(args.topK) || args.topK <= 0) throw new Error(`Invalid --top-k: ${args.topK}`);
  return args;
}

function bitsToHex(bits) {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = bits.slice(i, i + 4).padEnd(4, "0");
    hex += Number.parseInt(nibble, 2).toString(16);
  }
  return hex;
}

function hammingHex(a, b) {
  const len = Math.min(a.length, b.length);
  let distance = Math.abs(a.length - b.length) * 4;
  for (let i = 0; i < len; i += 1) {
    const xor = Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16);
    distance += xor.toString(2).replace(/0/g, "").length;
  }
  return distance;
}

function l1(a, b) {
  const len = Math.min(a.length, b.length);
  let total = Math.abs(a.length - b.length);
  for (let i = 0; i < len; i += 1) total += Math.abs(a[i] - b[i]);
  return total;
}

async function imageFeatures(imagePath) {
  const source = sharp(imagePath, { limitInputPixels: false }).ensureAlpha();
  const metadata = await source.metadata();
  const normalized = await sharp(imagePath, { limitInputPixels: false })
    .ensureAlpha()
    .flatten({ background: "#ffffff" })
    .grayscale()
    .resize(128, 128, { fit: "contain", background: "#ffffff" })
    .raw()
    .toBuffer();

  const mask = new Uint8Array(normalized.length);
  let darkPixels = 0;
  let minX = 128;
  let minY = 128;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const index = y * 128 + x;
      const isDark = normalized[index] < 245;
      mask[index] = isDark ? 1 : 0;
      if (isDark) {
        darkPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const boundingWidth = maxX >= minX ? maxX - minX + 1 : 0;
  const boundingHeight = maxY >= minY ? maxY - minY + 1 : 0;

  const ahashImage = await sharp(imagePath, { limitInputPixels: false })
    .ensureAlpha()
    .flatten({ background: "#ffffff" })
    .grayscale()
    .resize(8, 8, { fit: "fill" })
    .raw()
    .toBuffer();
  const avg = ahashImage.reduce((sum, value) => sum + value, 0) / ahashImage.length;
  const ahash = bitsToHex(Array.from(ahashImage).map((value) => (value < avg ? "1" : "0")).join(""));

  const dhashImage = await sharp(imagePath, { limitInputPixels: false })
    .ensureAlpha()
    .flatten({ background: "#ffffff" })
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();
  let dhashBits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = dhashImage[y * 9 + x];
      const right = dhashImage[y * 9 + x + 1];
      dhashBits += left > right ? "1" : "0";
    }
  }

  const rowProjection = [];
  const colProjection = [];
  for (let bin = 0; bin < 16; bin += 1) {
    let rowSum = 0;
    let colSum = 0;
    for (let offset = 0; offset < 8; offset += 1) {
      const y = bin * 8 + offset;
      const x = bin * 8 + offset;
      for (let i = 0; i < 128; i += 1) {
        rowSum += mask[y * 128 + i];
        colSum += mask[i * 128 + x];
      }
    }
    rowProjection.push(Number((rowSum / (8 * 128)).toFixed(4)));
    colProjection.push(Number((colSum / (8 * 128)).toFixed(4)));
  }

  return {
    sourceWidth: metadata.width ?? null,
    sourceHeight: metadata.height ?? null,
    aspectRatio: metadata.width && metadata.height ? Number((metadata.width / metadata.height).toFixed(4)) : null,
    normalizedSize: 128,
    darkPixelRatio: Number((darkPixels / (128 * 128)).toFixed(6)),
    boundingBox: {
      x: maxX >= minX ? minX : null,
      y: maxY >= minY ? minY : null,
      width: boundingWidth,
      height: boundingHeight,
      aspectRatio: boundingWidth && boundingHeight ? Number((boundingWidth / boundingHeight).toFixed(4)) : null,
    },
    ahash,
    dhash: bitsToHex(dhashBits),
    rowProjection,
    colProjection,
  };
}

function visualDistance(queryFeatures, candidateFeatures) {
  const dh = hammingHex(queryFeatures.dhash, candidateFeatures.dhash);
  const ah = hammingHex(queryFeatures.ahash, candidateFeatures.ahash);
  const row = l1(queryFeatures.rowProjection, candidateFeatures.rowProjection);
  const col = l1(queryFeatures.colProjection, candidateFeatures.colProjection);
  const aspect = Math.abs((queryFeatures.boundingBox.aspectRatio ?? 0) - (candidateFeatures.boundingBox.aspectRatio ?? 0));
  const density = Math.abs(queryFeatures.darkPixelRatio - candidateFeatures.darkPixelRatio);
  return Number((dh * 1.0 + ah * 0.45 + row * 10 + col * 10 + aspect * 0.25 + density * 25).toFixed(4));
}

function compactVariant(variant) {
  return {
    erpItemId: variant.erpItemId,
    articleCode: variant.articleCode,
    group: variant.productGroupDescription,
    figure: variant.figure,
    shank: variant.shank,
    size: variant.size,
    packageContent: variant.packageContent,
    stopped: variant.stopped,
    hasPrice: variant.hasPrice,
    price: variant.price ? {
      minAmount: variant.price.minAmount,
      maxAmount: variant.price.maxAmount,
      currencies: variant.price.currencies,
      accounts: variant.price.accounts,
    } : null,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const index = JSON.parse(await fs.readFile(args.featureIndexPath, "utf8"));
  const queryFeatures = await imageFeatures(args.imagePath);
  const candidates = index.entries
    .filter((entry) => !args.group || entry.representativeGroup === args.group)
    .map((entry) => ({
      imageSha256: entry.imageSha256,
      distance: visualDistance(queryFeatures, entry.features),
      representativeLocalPath: entry.representativeLocalPath,
      representativeGroup: entry.representativeGroup,
      representativeArticleCode: entry.representativeArticleCode,
      representativeFigure: entry.representativeFigure,
      representativeShank: entry.representativeShank,
      representativeSize: entry.representativeSize,
      variantCount: entry.variantCount,
      variantsWithPrice: entry.variantsWithPrice,
      variants: entry.variants.slice(0, args.variantsPerHit).map(compactVariant),
    }))
    .sort((a, b) => a.distance - b.distance || b.variantsWithPrice - a.variantsWithPrice)
    .slice(0, args.topK);

  const result = {
    queryImage: args.imagePath,
    featureIndexPath: args.featureIndexPath,
    queryFeatures,
    topK: args.topK,
    groupFilter: args.group || null,
    candidates,
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Query: ${args.imagePath}`);
  console.log(`Index: ${args.featureIndexPath}`);
  console.log(`Candidates: ${candidates.length}`);
  console.log("");
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    console.log(`#${i + 1} distance=${candidate.distance} variants=${candidate.variantCount} group=${candidate.representativeGroup}`);
    console.log(`   representative: ${candidate.representativeArticleCode} figure=${candidate.representativeFigure} shank=${candidate.representativeShank} size=${candidate.representativeSize}`);
    console.log(`   image: ${candidate.representativeLocalPath}`);
    for (const variant of candidate.variants.slice(0, 5)) {
      const price = variant.price?.minAmount != null ? `${variant.price.minAmount} ${variant.price.currencies?.[0] ?? ""}` : "no-price";
      console.log(`   - ${variant.erpItemId} ${variant.articleCode} ${variant.group} fig=${variant.figure} shank=${variant.shank} size=${variant.size} ${price}`);
    }
    if (candidate.variantCount > candidate.variants.length) {
      console.log(`   ... ${candidate.variantCount - candidate.variants.length} more variants`);
    }
    console.log("");
  }
}

main().catch((error) => {
  console.error("[visual-search] failed", error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
