#!/usr/bin/env node

/**
 * Run visual retrieval benchmark cases against search-erp-visual-index.mjs.
 *
 * The manifest contains image paths and expected labels. This script evaluates
 * top-k retrieval quality at group/figure/article levels.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const backendRoot = path.resolve(__dirname, "..");

const DEFAULT_MANIFEST = path.join(backendRoot, "data", "recognition-benchmark", "smoke-manifest.json");
const DEFAULT_FEATURE_INDEX = path.join(
  backendRoot,
  "data",
  "erp-visual-feature-index",
  "2026-06-03-04-52-35-951",
  "erp-visual-feature-index.json",
);
const DEFAULT_OUTPUT_DIR = path.join(backendRoot, "data", "recognition-benchmark", "runs");
const DEFAULT_DOCS_DIR = path.join(repoRoot, "docs", "recognition");

function parseArgs(argv) {
  const args = {
    manifestPath: process.env.BENCHMARK_MANIFEST || DEFAULT_MANIFEST,
    featureIndexPath: process.env.VISUAL_FEATURE_INDEX_PATH || DEFAULT_FEATURE_INDEX,
    outputDir: process.env.BENCHMARK_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    docsDir: process.env.BENCHMARK_DOCS_DIR || DEFAULT_DOCS_DIR,
    topK: Number(process.env.BENCHMARK_TOP_K || 10),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--manifest" || arg === "--cases") && next) {
      args.manifestPath = path.resolve(next);
      i += 1;
    } else if ((arg === "--feature-index" || arg === "--index") && next) {
      args.featureIndexPath = path.resolve(next);
      i += 1;
    } else if (arg === "--top-k" && next) {
      args.topK = Number(next);
      i += 1;
    } else if (arg === "--output-dir" && next) {
      args.outputDir = path.resolve(next);
      i += 1;
    } else if (arg === "--docs-dir" && next) {
      args.docsDir = path.resolve(next);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/run-erp-visual-benchmark.mjs [options]

Options:
  --manifest <path>       Benchmark manifest JSON.
  --feature-index <path>  Feature index JSON.
  --top-k <n>             Retrieval depth. Default: 10.
  --output-dir <path>     Directory for benchmark JSON results.
  --docs-dir <path>       Directory for Markdown report.
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

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function searchCase(testCase, args) {
  const scriptPath = path.join(backendRoot, "scripts", "search-erp-visual-index.mjs");
  const { stdout } = await execFileAsync(process.execPath, [
    scriptPath,
    "--image",
    testCase.imagePath,
    "--feature-index",
    args.featureIndexPath,
    "--top-k",
    String(args.topK),
    "--variants",
    "1000",
    "--json",
  ], {
    cwd: repoRoot,
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function candidateMatches(candidate, expected, fieldName) {
  if (!expected?.[fieldName]) return null;
  if (fieldName === "group") {
    if (candidate.representativeGroup === expected.group) return true;
    return candidate.variants?.some((variant) => variant.group === expected.group) ?? false;
  }
  if (fieldName === "figure") {
    if (candidate.representativeFigure === expected.figure) return true;
    return candidate.variants?.some((variant) => variant.figure === expected.figure) ?? false;
  }
  if (fieldName === "shank") {
    if (candidate.representativeShank === expected.shank) return true;
    return candidate.variants?.some((variant) => variant.shank === expected.shank) ?? false;
  }
  if (fieldName === "size") {
    if (candidate.representativeSize === expected.size) return true;
    return candidate.variants?.some((variant) => variant.size === expected.size) ?? false;
  }
  if (fieldName === "erpItemId") {
    return candidate.variants?.some((variant) => variant.erpItemId === expected.erpItemId) ?? false;
  }
  if (fieldName === "articleCode") {
    return candidate.variants?.some((variant) => variant.articleCode === expected.articleCode) ?? false;
  }
  return false;
}

function firstRank(candidates, expected, fieldName) {
  if (!expected?.[fieldName]) return null;
  const index = candidates.findIndex((candidate) => candidateMatches(candidate, expected, fieldName));
  return index >= 0 ? index + 1 : null;
}

function evaluateResult(testCase, searchResult) {
  const candidates = searchResult.candidates ?? [];
  const expected = testCase.expected ?? {};
  const ranks = {
    group: firstRank(candidates, expected, "group"),
    figure: firstRank(candidates, expected, "figure"),
    shank: firstRank(candidates, expected, "shank"),
    size: firstRank(candidates, expected, "size"),
    erpItemId: firstRank(candidates, expected, "erpItemId"),
    articleCode: firstRank(candidates, expected, "articleCode"),
  };

  return {
    id: testCase.id,
    imagePath: testCase.imagePath,
    expected,
    ranks,
    topCandidate: candidates[0] ? {
      distance: candidates[0].distance,
      group: candidates[0].representativeGroup,
      articleCode: candidates[0].representativeArticleCode,
      figure: candidates[0].representativeFigure,
      shank: candidates[0].representativeShank,
      size: candidates[0].representativeSize,
      variantCount: candidates[0].variantCount,
    } : null,
    candidates,
  };
}

function addMetric(metrics, fieldName, rank) {
  if (rank == null) return;
  metrics[`${fieldName}Known`] += 1;
  if (rank === 1) metrics[`${fieldName}Top1`] += 1;
  if (rank <= 3) metrics[`${fieldName}Top3`] += 1;
  if (rank <= 10) metrics[`${fieldName}Top10`] += 1;
}

function summarize(results, skipped) {
  const fields = ["group", "figure", "shank", "size", "erpItemId", "articleCode"];
  const metrics = {
    totalCases: results.length + skipped.length,
    runnableCases: results.length,
    skippedCases: skipped.length,
  };

  for (const field of fields) {
    metrics[`${field}Known`] = 0;
    metrics[`${field}Top1`] = 0;
    metrics[`${field}Top3`] = 0;
    metrics[`${field}Top10`] = 0;
  }

  for (const result of results) {
    for (const field of fields) addMetric(metrics, field, result.ranks[field]);
  }

  return metrics;
}

function percent(n, d) {
  if (!d) return "N/A";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

function buildMarkdown({ runId, startedAt, endedAt, args, manifest, summary, results, skipped, outputPath }) {
  const metricRows = ["group", "figure", "shank", "size", "erpItemId", "articleCode"]
    .map((field) => {
      const known = summary[`${field}Known`];
      return `| ${field} | ${known} | ${summary[`${field}Top1`]} (${percent(summary[`${field}Top1`], known)}) | ${summary[`${field}Top3`]} (${percent(summary[`${field}Top3`], known)}) | ${summary[`${field}Top10`]} (${percent(summary[`${field}Top10`], known)}) |`;
    })
    .join("\n");

  const resultRows = results
    .map((result) => `| ${markdownCell(result.id)} | ${markdownCell(result.expected.group)} | ${markdownCell(result.expected.figure)} | ${result.ranks.group ?? ""} | ${result.ranks.figure ?? ""} | ${result.ranks.erpItemId ?? ""} | ${markdownCell(result.topCandidate?.group)} | ${markdownCell(result.topCandidate?.articleCode)} | ${result.topCandidate?.distance ?? ""} |`)
    .join("\n");

  const skippedRows = skipped
    .map((item) => `| ${markdownCell(item.id)} | ${markdownCell(item.imagePath)} | ${markdownCell(item.reason)} |`)
    .join("\n");

  return `# ERP Visual Benchmark

Data run: ${startedAt.toISOString()}  
Fine run: ${endedAt.toISOString()}  
Run ID: \`${runId}\`

## Input/Output

- Manifest: \`${args.manifestPath}\`
- Feature index: \`${args.featureIndexPath}\`
- Output JSON: \`${outputPath}\`
- Benchmark name: ${markdownCell(manifest.name)}

## Sintesi

- Casi totali: ${summary.totalCases}
- Casi eseguiti: ${summary.runnableCases}
- Casi saltati: ${summary.skippedCases}

## Metriche

| Target | Known | Top 1 | Top 3 | Top 10 |
| --- | ---: | ---: | ---: | ---: |
${metricRows}

## Risultati

| Caso | Gruppo atteso | Figura attesa | Rank gruppo | Rank figura | Rank ERP item | Top gruppo | Top codice | Top distanza |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: |
${resultRows || "| N/A | N/A | N/A | | | | N/A | N/A | |"}

## Saltati

| Caso | Immagine | Motivo |
| --- | --- | --- |
${skippedRows || "| N/A | N/A | N/A |"}
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const runId = runIdStamp();
  const startedAt = new Date();
  const runDir = path.join(args.outputDir, runId);

  await fs.mkdir(runDir, { recursive: true });
  await fs.mkdir(args.docsDir, { recursive: true });

  const manifest = JSON.parse(await fs.readFile(args.manifestPath, "utf8"));
  const results = [];
  const skipped = [];

  for (const testCase of manifest.cases ?? []) {
    if (!(await pathExists(testCase.imagePath))) {
      skipped.push({ id: testCase.id, imagePath: testCase.imagePath, reason: "image file not found" });
      continue;
    }

    console.log(`[benchmark] ${testCase.id}`);
    const searchResult = await searchCase(testCase, args);
    results.push(evaluateResult(testCase, searchResult));
  }

  const summary = summarize(results, skipped);
  const endedAt = new Date();
  const outputPath = path.join(runDir, "erp-visual-benchmark.json");
  const report = {
    runId,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    args,
    manifest: {
      name: manifest.name,
      description: manifest.description,
      cases: manifest.cases?.length ?? 0,
    },
    summary,
    results,
    skipped,
  };

  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
  const markdown = buildMarkdown({ runId, startedAt, endedAt, args, manifest, summary, results, skipped, outputPath });
  const markdownPath = path.join(args.docsDir, `erp-visual-benchmark-${todayStamp()}.md`);
  await fs.writeFile(markdownPath, markdown);

  console.log("[benchmark] complete");
  console.log(JSON.stringify({
    runId,
    summary,
    outputPath,
    markdownPath,
  }, null, 2));
}

main().catch((error) => {
  console.error("[benchmark] failed", error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
