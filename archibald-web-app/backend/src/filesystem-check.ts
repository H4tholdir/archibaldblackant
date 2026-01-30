import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "./logger";

/**
 * Check if /tmp directory is writable
 */
export async function checkTmpWritable(): Promise<{
  writable: boolean;
  error?: string;
}> {
  const testFile = path.join("/tmp", `.archibald-write-test-${Date.now()}`);

  try {
    // Try to write a test file
    await fs.writeFile(testFile, "test", "utf-8");

    // Try to read it back
    await fs.readFile(testFile, "utf-8");

    // Clean up
    await fs.unlink(testFile);

    return { writable: true };
  } catch (error) {
    return {
      writable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run filesystem checks at startup
 */
export async function runFilesystemChecks(): Promise<void> {
  logger.info("[FilesystemCheck] Running filesystem checks...");

  const tmpCheck = await checkTmpWritable();

  if (!tmpCheck.writable) {
    logger.error("[FilesystemCheck] /tmp directory not writable", {
      error: tmpCheck.error,
    });
    logger.error(
      "[FilesystemCheck] PDF downloads will fail. Please check /tmp permissions.",
    );
    return;
  }

  logger.info("[FilesystemCheck] /tmp directory is writable");
  logger.info("[FilesystemCheck] All filesystem checks OK");
}
