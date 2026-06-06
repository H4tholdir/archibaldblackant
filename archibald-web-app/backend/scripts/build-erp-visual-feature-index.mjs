#!/usr/bin/env node

/**
 * Build deterministic visual features for ERP silhouette images.
 *
 * This is the first searchable visual layer before ML embeddings. It computes
 * compact perceptual hashes and shape signatures from each deduplicated ERP
 * image in erp-visual-index.json.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const backendRoot = path.resolve(__dirname, "..");

const DEFAULT_VISUAL_INDEX = path.join(
  backendRoot,
  "data",
  "erp-visual-index",
  "2026-06-03-04-47-30-729",
  "erp-visual-index.json",
);
const DEFAULT_OUTPUT_DIR = path.join(backendRoot, "data", "erp-visual-feature-index");
const DEFAULT_DOCS_DIR = path.join(repoRoot, "docs", "recognition");

function parseArgs(argv) {
  const args = {
    visualIndexPath: process.env.VISUAL_INDEX_PATH || DEFAULT_VISUAL_INDEX,
    outputDir: process.env.VISUAL_FEATURE_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    docsDir: process.env.VISUAL_FEATURE_DOCS_DIR || DEFAULT_DOCS_DIR,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--visual-index" || arg === "--input") && next) {
      args.visualIndexPath = path.resolve(next);
      i += 1;
    } else if (arg === "--output-dir" && next) {
      args.outputDir = path.resolve(next);
      i += 1;
    } else if (arg === "--docs-dir" && next) {
      args.docsDir = path.resolve(next);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/build-erp-visual-feature-index.mjs [options]

Options:
  --visual-index <path>  Input erp-visual-index.json.
  --output-dir <path>    Directory for feature JSON.
  --docs-dir <path>      Directory for Markdown report.
`);
      process.exit(0);
    }
  }
  return args;
}

function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function runIdStamp() {
  return `${todayStamp()}-${new Date().toISOString().replace(/[:.]/g, "-").slice(11, 23)}`;
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
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

async function imageStats(imagePath) {
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
  const dhash = bitsToHex(dhashBits);

  const rowProjection = [];
  const colProjection = [];
  const bins = 16;
  for (let bin = 0; bin < bins; bin += 1) {
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
    dhash,
    rowProjection,
    colProjection,
  };
}

function visualDistance(a, b) {
  const dh = hammingHex(a.features.dhash, b.features.dhash);
  const ah = hammingHex(a.features.ahash, b.features.ahash);
  const row = l1(a.features.rowProjection, b.features.rowProjection);
  const col = l1(a.features.colProjection, b.features.colProjection);
  const aspect = Math.abs((a.features.boundingBox.aspectRatio ?? 0) - (b.features.boundingBox.aspectRatio ?? 0));
  const density = Math.abs(a.features.darkPixelRatio - b.features.darkPixelRatio);
  return Number((dh * 1.0 + ah * 0.45 + row * 10 + col * 10 + aspect * 0.25 + density * 25).toFixed(4));
}

function representativeGroup(entry) {
  const counts = new Map();
  for (const variant of entry.variants ?? []) {
    const group = variant.productGroupDescription || "N/A";
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "N/A";
}

function topNearest(entries, entry, k = 8) {
  return entries
    .filter((candidate) => candidate.imageSha256 !== entry.imageSha256)
    .map((candidate) => ({
      imageSha256: candidate.imageSha256,
      distance: visualDistance(entry, candidate),
      representativeGroup: candidate.representativeGroup,
      variantCount: candidate.variantCount,
      representativeArticleCode: candidate.representativeArticleCode,
    }))
    .sort((a, b) => a.distance - b.distance || b.variantCount - a.variantCount)
    .slice(0, k);
}

async function buildFeatureEntries(visualIndex) {
  const entries = [];
  for (let i = 0; i < visualIndex.index.length; i += 1) {
    const entry = visualIndex.index[i];
    const features = await imageStats(entry.representativeLocalPath);
    const representative = entry.variants[0] ?? {};
    entries.push({
      imageSha256: entry.imageSha256,
      representativeLocalPath: entry.representativeLocalPath,
      representativeGroup: representativeGroup(entry),
      representativeArticleCode: representative.articleCode ?? null,
      representativeFigure: representative.figure ?? null,
      representativeShank: representative.shank ?? null,
      representativeSize: representative.size ?? null,
      variantCount: entry.variants.length,
      variantsWithPrice: entry.variants.filter((variant) => variant.hasPrice).length,
      features,
      variants: entry.variants,
    });

    if ((i + 1) % 100 === 0) {
      console.log(`[visual-features] processed ${i + 1}/${visualIndex.index.length}`);
    }
  }
  return entries;
}

function summarize(entries) {
  const groupMap = new Map();
  for (const entry of entries) {
    const current = groupMap.get(entry.representativeGroup) ?? { group: entry.representativeGroup, uniqueImages: 0, variants: 0 };
    current.uniqueImages += 1;
    current.variants += entry.variantCount;
    groupMap.set(entry.representativeGroup, current);
  }

  return {
    uniqueImages: entries.length,
    visualVariants: entries.reduce((sum, entry) => sum + entry.variantCount, 0),
    variantsWithPrice: entries.reduce((sum, entry) => sum + entry.variantsWithPrice, 0),
    groups: Array.from(groupMap.values()).sort((a, b) => b.variants - a.variants || a.group.localeCompare(b.group)),
    featureRanges: {
      darkPixelRatio: {
        min: Math.min(...entries.map((entry) => entry.features.darkPixelRatio)),
        max: Math.max(...entries.map((entry) => entry.features.darkPixelRatio)),
      },
      boundingAspectRatio: {
        min: Math.min(...entries.map((entry) => entry.features.boundingBox.aspectRatio ?? 0)),
        max: Math.max(...entries.map((entry) => entry.features.boundingBox.aspectRatio ?? 0)),
      },
    },
  };
}

function buildMarkdown({ runId, startedAt, endedAt, args, summary, entries, outputPath }) {
  const groupRows = summary.groups.slice(0, 30)
    .map((row) => `| ${markdownCell(row.group)} | ${row.uniqueImages} | ${row.variants} |`)
    .join("\n");

  const exampleRows = entries.slice(0, 18)
    .map((entry) => {
      const nearest = entry.nearest?.[0];
      return `| ${markdownCell(entry.representativeGroup)} | ${entry.variantCount} | ${markdownCell(entry.representativeArticleCode)} | ${entry.features.boundingBox.width}x${entry.features.boundingBox.height} | ${entry.features.darkPixelRatio} | ${nearest ? `${markdownCell(nearest.representativeGroup)} (${nearest.distance})` : "N/A"} |`;
    })
    .join("\n");

  return `# ERP Visual Feature Index

Data run: ${startedAt.toISOString()}  
Fine run: ${endedAt.toISOString()}  
Run ID: \`${runId}\`

## Input/Output

- Input visual index: \`${args.visualIndexPath}\`
- Output feature JSON: \`${outputPath}\`

## Sintesi

- Immagini uniche con feature: ${summary.uniqueImages}
- Varianti articolo rappresentate: ${summary.visualVariants}
- Varianti con prezzo/listino: ${summary.variantsWithPrice}
- Range densita' silhouette: ${summary.featureRanges.darkPixelRatio.min} - ${summary.featureRanges.darkPixelRatio.max}
- Range aspect ratio bounding box: ${summary.featureRanges.boundingAspectRatio.min} - ${summary.featureRanges.boundingAspectRatio.max}

## Gruppi

| Gruppo rappresentativo | Immagini uniche | Varianti |
| --- | ---: | ---: |
${groupRows || "| N/A | 0 | 0 |"}

## Esempi Feature/Nearest

| Gruppo | Varianti | Primo codice | Bounding box | Densita' | Nearest deterministico |
| --- | ---: | --- | ---: | ---: | --- |
${exampleRows || "| N/A | 0 | N/A | N/A | N/A | N/A |"}

## Nota

Questo indice usa feature deterministiche: aHash, dHash, proiezioni di forma, densita' e proporzioni. Serve per un primo retrieval locale e per benchmark tecnici. Non sostituisce un modello visivo moderno, ma rende misurabile il problema prima di introdurre embedding/AI.
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const runId = runIdStamp();
  const startedAt = new Date();
  const runDir = path.join(args.outputDir, runId);

  await fs.mkdir(runDir, { recursive: true });
  await fs.mkdir(args.docsDir, { recursive: true });

  const visualIndex = JSON.parse(await fs.readFile(args.visualIndexPath, "utf8"));
  const entries = await buildFeatureEntries(visualIndex);
  for (const entry of entries) {
    entry.nearest = topNearest(entries, entry, 8);
  }
  const summary = summarize(entries);
  const endedAt = new Date();
  const outputPath = path.join(runDir, "erp-visual-feature-index.json");
  const report = {
    runId,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    args,
    summary,
    entries,
  };
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  const markdown = buildMarkdown({ runId, startedAt, endedAt, args, summary, entries, outputPath });
  const markdownPath = path.join(args.docsDir, `erp-visual-feature-index-${todayStamp()}.md`);
  await fs.writeFile(markdownPath, markdown);

  console.log("[visual-features] complete");
  console.log(JSON.stringify({
    runId,
    uniqueImages: summary.uniqueImages,
    visualVariants: summary.visualVariants,
    outputPath,
    markdownPath,
  }, null, 2));
}

main().catch((error) => {
  console.error("[visual-features] failed", error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
