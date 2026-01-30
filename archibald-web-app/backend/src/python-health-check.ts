import { spawn } from "child_process";
import { logger } from "./logger";

/**
 * Health check for Python dependencies
 * Verifies python3 and pdfplumber are available
 */
export async function checkPythonDependencies(): Promise<{
  pythonAvailable: boolean;
  pdfplumberAvailable: boolean;
  pythonVersion?: string;
  error?: string;
}> {
  try {
    // Check python3 is available and get version
    const pythonVersion = await new Promise<string>((resolve, reject) => {
      const python = spawn("python3", ["--version"]);
      let output = "";

      python.stdout.on("data", (data) => {
        output += data.toString();
      });

      python.stderr.on("data", (data) => {
        output += data.toString();
      });

      python.on("close", (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error("python3 not found"));
        }
      });

      python.on("error", () => {
        reject(new Error("python3 command failed"));
      });
    });

    // Check pdfplumber is available
    const pdfplumberAvailable = await new Promise<boolean>((resolve) => {
      const python = spawn("python3", ["-c", "import pdfplumber"]);
      python.on("close", (code) => {
        resolve(code === 0);
      });
      python.on("error", () => {
        resolve(false);
      });
    });

    return {
      pythonAvailable: true,
      pdfplumberAvailable,
      pythonVersion,
    };
  } catch (error) {
    return {
      pythonAvailable: false,
      pdfplumberAvailable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run health check at startup and log results
 */
export async function runStartupHealthCheck(): Promise<void> {
  logger.info("[PythonHealthCheck] Running startup health check...");

  const result = await checkPythonDependencies();

  if (!result.pythonAvailable) {
    logger.error("[PythonHealthCheck] Python3 not available", {
      error: result.error,
    });
    logger.error(
      "[PythonHealthCheck] PDF parsing will fail. Please install python3.",
    );
    return;
  }

  logger.info("[PythonHealthCheck] Python3 available", {
    version: result.pythonVersion,
  });

  if (!result.pdfplumberAvailable) {
    logger.error("[PythonHealthCheck] pdfplumber library not available");
    logger.error(
      "[PythonHealthCheck] PDF parsing will fail. Please install pdfplumber: pip3 install pdfplumber",
    );
    return;
  }

  logger.info("[PythonHealthCheck] pdfplumber library available");
  logger.info("[PythonHealthCheck] All Python dependencies OK");
}
