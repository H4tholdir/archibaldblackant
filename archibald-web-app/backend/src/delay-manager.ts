import fs from 'fs';
import path from 'path';
import { logger } from './logger';

/**
 * Operation delay configuration with testing metadata
 */
export interface OperationDelay {
  id: string;
  description: string;
  delay: number;
  tested: boolean;
  lastTest?: string;
  testResult?: 'success' | 'failed';
  failedAtDelays?: number[];
  notes?: string;
}

/**
 * Test session metadata
 */
export interface TestSession {
  sessionId: string;
  startTime: string;
  endTime?: string;
  totalOperations: number;
  testedOperations: number;
  optimizedOperations: number;
  failedOperations: number;
  estimatedTimeSaved: number;
}

/**
 * DelayManager - Manages operation delays with JSON persistence
 *
 * Features:
 * - JSON-based storage for runtime modification
 * - Binary search optimization for finding minimum delay
 * - Test session tracking
 * - Automatic backup before modifications
 */
export class DelayManager {
  private static instance: DelayManager;
  private delays: Map<string, OperationDelay> = new Map();
  private delaysFilePath: string;
  private currentSession: TestSession | null = null;

  private constructor() {
    this.delaysFilePath = path.join(__dirname, '..', 'config', 'operation-delays.json');
    this.loadDelays();
  }

  static getInstance(): DelayManager {
    if (!DelayManager.instance) {
      DelayManager.instance = new DelayManager();
    }
    return DelayManager.instance;
  }

  /**
   * Load delays from JSON file
   */
  private loadDelays(): void {
    try {
      if (fs.existsSync(this.delaysFilePath)) {
        const data = fs.readFileSync(this.delaysFilePath, 'utf-8');
        const parsed = JSON.parse(data);

        if (parsed.operations) {
          parsed.operations.forEach((op: OperationDelay) => {
            this.delays.set(op.id, op);
          });
        }

        logger.info(`Loaded ${this.delays.size} operation delays from ${this.delaysFilePath}`);
      } else {
        logger.info('No delays file found, starting with empty configuration');
        this.initializeDefaults();
      }
    } catch (error) {
      logger.error('Error loading delays file', { error });
      this.initializeDefaults();
    }
  }

  /**
   * Initialize default delays for all operations (starting at 0ms for optimization)
   */
  private initializeDefaults(): void {
    // These will be populated as operations are discovered
    logger.info('Initialized empty delay configuration');
  }

  /**
   * Save delays to JSON file with backup
   */
  saveDelays(): void {
    try {
      // Create backup if file exists
      if (fs.existsSync(this.delaysFilePath)) {
        const backupPath = this.delaysFilePath.replace('.json', `.backup.${Date.now()}.json`);
        fs.copyFileSync(this.delaysFilePath, backupPath);
        logger.debug(`Backup created: ${backupPath}`);
      }

      // Ensure directory exists
      const dir = path.dirname(this.delaysFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        lastUpdate: new Date().toISOString(),
        totalOperations: this.delays.size,
        operations: Array.from(this.delays.values()),
        currentSession: this.currentSession,
      };

      fs.writeFileSync(this.delaysFilePath, JSON.stringify(data, null, 2));
      logger.info(`Saved ${this.delays.size} operation delays to ${this.delaysFilePath}`);
    } catch (error) {
      logger.error('Error saving delays file', { error });
      throw error;
    }
  }

  /**
   * Get delay for operation (returns default if not found)
   */
  getDelay(operationId: string): number {
    const operation = this.delays.get(operationId);
    return operation?.delay ?? 0; // Default to 0ms for untested operations
  }

  /**
   * Get full operation config
   */
  getOperation(operationId: string): OperationDelay | undefined {
    return this.delays.get(operationId);
  }

  /**
   * Register a new operation
   */
  registerOperation(id: string, description: string, initialDelay: number = 0): void {
    if (!this.delays.has(id)) {
      this.delays.set(id, {
        id,
        description,
        delay: initialDelay,
        tested: false,
      });
      logger.debug(`Registered operation: ${id} - ${description}`);
    }
  }

  /**
   * Update delay for operation
   */
  updateDelay(
    operationId: string,
    delay: number,
    testResult: 'success' | 'failed',
    notes?: string
  ): void {
    const operation = this.delays.get(operationId);

    if (operation) {
      operation.delay = delay;
      operation.lastTest = new Date().toISOString();
      operation.testResult = testResult;
      operation.tested = testResult === 'success';

      if (testResult === 'failed') {
        if (!operation.failedAtDelays) {
          operation.failedAtDelays = [];
        }
        if (!operation.failedAtDelays.includes(delay)) {
          operation.failedAtDelays.push(delay);
        }
      }

      if (notes) {
        operation.notes = notes;
      }

      this.saveDelays();

      logger.info(`Updated ${operationId}: delay=${delay}ms, result=${testResult}`);
    } else {
      logger.warn(`Operation ${operationId} not found, cannot update delay`);
    }
  }

  /**
   * Start a new test session
   */
  startTestSession(): string {
    const sessionId = `test-${Date.now()}`;

    this.currentSession = {
      sessionId,
      startTime: new Date().toISOString(),
      totalOperations: this.delays.size,
      testedOperations: 0,
      optimizedOperations: 0,
      failedOperations: 0,
      estimatedTimeSaved: 0,
    };

    logger.info(`Started test session: ${sessionId}`);
    return sessionId;
  }

  /**
   * End current test session
   */
  endTestSession(): void {
    if (this.currentSession) {
      this.currentSession.endTime = new Date().toISOString();

      // Calculate metrics
      this.currentSession.testedOperations = Array.from(this.delays.values())
        .filter(op => op.tested).length;

      this.currentSession.optimizedOperations = Array.from(this.delays.values())
        .filter(op => op.tested && op.delay < 200).length;

      this.currentSession.failedOperations = Array.from(this.delays.values())
        .filter(op => op.testResult === 'failed').length;

      // Estimate time saved (200ms baseline - actual delay)
      this.currentSession.estimatedTimeSaved = Array.from(this.delays.values())
        .filter(op => op.tested)
        .reduce((total, op) => total + (200 - op.delay), 0);

      this.saveDelays();

      logger.info(`Ended test session: ${this.currentSession.sessionId}`, {
        tested: this.currentSession.testedOperations,
        optimized: this.currentSession.optimizedOperations,
        failed: this.currentSession.failedOperations,
        timeSaved: `${this.currentSession.estimatedTimeSaved}ms`,
      });
    }
  }

  /**
   * Get current test session
   */
  getCurrentSession(): TestSession | null {
    return this.currentSession;
  }

  /**
   * Get all operations
   */
  getAllOperations(): OperationDelay[] {
    return Array.from(this.delays.values());
  }

  /**
   * Get untested operations
   */
  getUntestedOperations(): OperationDelay[] {
    return Array.from(this.delays.values()).filter(op => !op.tested);
  }

  /**
   * Get statistics
   */
  getStats() {
    const operations = Array.from(this.delays.values());

    return {
      total: operations.length,
      tested: operations.filter(op => op.tested).length,
      untested: operations.filter(op => !op.tested).length,
      optimized: operations.filter(op => op.tested && op.delay < 200).length,
      failed: operations.filter(op => op.testResult === 'failed').length,
      averageDelay: operations.length > 0
        ? Math.round(operations.reduce((sum, op) => sum + op.delay, 0) / operations.length)
        : 0,
      estimatedTimeSaved: operations
        .filter(op => op.tested)
        .reduce((total, op) => total + (200 - op.delay), 0),
    };
  }

  /**
   * Reset all delays to initial state
   */
  resetAll(): void {
    this.delays.forEach(op => {
      op.delay = 0;
      op.tested = false;
      op.testResult = undefined;
      op.failedAtDelays = undefined;
      op.notes = undefined;
    });

    this.saveDelays();
    logger.warn('Reset all operation delays to 0ms');
  }

  /**
   * Export delays as markdown report
   */
  exportMarkdownReport(): string {
    const stats = this.getStats();
    const operations = this.getAllOperations();

    let report = `# Operation Delay Optimization Report\n\n`;
    report += `**Generated**: ${new Date().toISOString()}\n\n`;

    if (this.currentSession) {
      report += `## Test Session\n\n`;
      report += `- Session ID: ${this.currentSession.sessionId}\n`;
      report += `- Start: ${this.currentSession.startTime}\n`;
      report += `- End: ${this.currentSession.endTime || 'In progress'}\n`;
      report += `- Duration: ${this.currentSession.endTime
        ? `${Math.round((new Date(this.currentSession.endTime).getTime() - new Date(this.currentSession.startTime).getTime()) / 1000)}s`
        : 'N/A'}\n\n`;
    }

    report += `## Summary\n\n`;
    report += `- Total Operations: ${stats.total}\n`;
    report += `- Tested: ${stats.tested} (${Math.round(stats.tested / stats.total * 100)}%)\n`;
    report += `- Optimized: ${stats.optimized} (delays < 200ms)\n`;
    report += `- Failed: ${stats.failed}\n`;
    report += `- Average Delay: ${stats.averageDelay}ms\n`;
    report += `- Estimated Time Saved: ${stats.estimatedTimeSaved}ms per order\n\n`;

    // Group by phase
    const phases = new Map<string, OperationDelay[]>();
    operations.forEach(op => {
      const phase = op.id.split('_')[1]; // Extract phase from ID (e.g., "001_login_..." -> "login")
      if (!phases.has(phase)) {
        phases.set(phase, []);
      }
      phases.get(phase)!.push(op);
    });

    report += `## Operations by Phase\n\n`;

    phases.forEach((ops, phase) => {
      report += `### ${phase.charAt(0).toUpperCase() + phase.slice(1)}\n\n`;
      report += `| ID | Description | Delay | Status | Notes |\n`;
      report += `|----|-------------|-------|--------|-------|\n`;

      ops.forEach(op => {
        const status = op.tested
          ? op.testResult === 'success' ? '✅ OK' : '❌ Failed'
          : '⏳ Untested';

        report += `| ${op.id} | ${op.description} | ${op.delay}ms | ${status} | ${op.notes || '-'} |\n`;
      });

      report += `\n`;
    });

    return report;
  }
}
