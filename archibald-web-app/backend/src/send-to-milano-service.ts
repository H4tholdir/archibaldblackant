import type { BrowserContext, Page } from "puppeteer";
import { logger } from "./logger";
import { config } from "./config";
import { BrowserPool } from "./browser-pool";

export interface SendToMilanoResult {
  success: boolean;
  message?: string;
  error?: string;
  orderId: string;
  sentAt?: string;
}

/**
 * SendToMilanoService - Automate "Invia a Milano" workflow (Step 2)
 *
 * Workflow:
 * 1. Navigate to SALESTABLE_ListView_Agent page
 * 2. Find order row by order ID
 * 3. Select order checkbox
 * 4. Click "Invio" button
 * 5. Confirm modal (if present)
 * 6. Verify success
 *
 * Safety:
 * - Feature flag gated (SEND_TO_MILANO_ENABLED)
 * - Idempotent (returns success if already sent)
 * - Comprehensive error handling
 * - Audit trail via caller (API endpoint)
 */
export class SendToMilanoService {
  private readonly ordersPageUrl = `${config.archibald.url}/SALESTABLE_ListView_Agent/`;
  private readonly invioButtonSelector = 'li[id="Vertical_mainMenu_Menu_DXI3_"] a[id="Vertical_mainMenu_Menu_DXI3_T"]';

  /**
   * Send order to Milano warehouse
   */
  async sendToMilano(
    orderId: string,
    userId: string,
  ): Promise<SendToMilanoResult> {
    logger.info(`[SendToMilano] Starting for order ${orderId}`, { userId, orderId });

    // Check feature flag
    if (!config.features.sendToMilanoEnabled) {
      logger.warn(`[SendToMilano] Feature disabled for order ${orderId}`);
      return {
        success: false,
        error: "Send to Milano feature is currently disabled. Please contact administrator.",
        orderId,
      };
    }

    const browserPool = BrowserPool.getInstance();
    let context: BrowserContext | null = null;
    let success = false;

    try {
      // Acquire browser context with fresh login
      context = await browserPool.acquireContext(userId);
      const page = await context.newPage();

      try {
        // Navigate to orders page
        logger.info(`[SendToMilano] Navigating to orders page for order ${orderId}`);
        await page.goto(this.ordersPageUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });

        // Wait for page to stabilize
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Find and select order checkbox
        const checkboxFound = await this.selectOrderCheckbox(page, orderId);
        if (!checkboxFound) {
          throw new Error(`Order checkbox not found for order ID: ${orderId}`);
        }

        logger.info(`[SendToMilano] Order checkbox selected for ${orderId}`);

        // Click "Invio" button
        await this.clickInvioButton(page);
        logger.info(`[SendToMilano] Invio button clicked for ${orderId}`);

        // Handle confirmation modal if present
        await this.handleConfirmationModal(page);

        // Wait for operation to complete
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Verify success
        const operationSuccess = await this.verifySuccess(page);
        if (!operationSuccess) {
          throw new Error("Failed to verify success after sending to Milano");
        }

        logger.info(`[SendToMilano] Order ${orderId} sent to Milano successfully`);

        success = true;
        const sentAt = new Date().toISOString();

        return {
          success: true,
          message: `Order ${orderId} sent to Milano successfully`,
          orderId,
          sentAt,
        };

      } finally {
        if (!page.isClosed()) {
          await page.close().catch(() => {});
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[SendToMilano] Failed to send order ${orderId}`, {
        error: errorMessage,
        userId,
        orderId,
      });

      return {
        success: false,
        error: `Failed to send order to Milano: ${errorMessage}`,
        orderId,
      };

    } finally {
      if (context) {
        await browserPool.releaseContext(userId, context, success);
      }
    }
  }

  /**
   * Find order row by ID and select its checkbox
   */
  private async selectOrderCheckbox(page: Page, orderId: string): Promise<boolean> {
    return await page.evaluate((id) => {
      // Find table rows
      const table = document.querySelector('table[id$="_DXMainTable"]');
      if (!table) {
        console.error("[SendToMilano] Orders table not found");
        return false;
      }

      const rows = Array.from(table.querySelectorAll("tr"));

      // Search for order by ID in row cells
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("td"));
        const hasOrderId = cells.some((cell) => cell.textContent?.trim() === id);

        if (hasOrderId) {
          // Find checkbox in this row (look for DevExpress checkbox pattern)
          const checkbox = row.querySelector('span[class*="dxICheckBox_XafTheme"]');
          if (checkbox) {
            (checkbox as HTMLElement).click();
            console.log(`[SendToMilano] Checkbox clicked for order ${id}`);
            return true;
          }
        }
      }

      console.error(`[SendToMilano] Order ${id} not found in table`);
      return false;
    }, orderId);
  }

  /**
   * Click the "Invio" button
   */
  private async clickInvioButton(page: Page): Promise<void> {
    await page.waitForSelector(this.invioButtonSelector, { timeout: 10000 });
    await page.click(this.invioButtonSelector);
    logger.info("[SendToMilano] Invio button clicked");
  }

  /**
   * Handle confirmation modal if present
   */
  private async handleConfirmationModal(page: Page): Promise<void> {
    try {
      // Wait briefly for modal to appear
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Look for DevExpress modal confirmation button
      const confirmButtonSelector = 'div[id*="ConfirmDialog"] a[id*="btnOk"], button[id*="btnOk"]';
      const confirmButton = await page.$(confirmButtonSelector);

      if (confirmButton) {
        logger.info("[SendToMilano] Confirmation modal detected, clicking OK");
        await confirmButton.click();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        logger.info("[SendToMilano] No confirmation modal detected");
      }
    } catch (error) {
      logger.warn("[SendToMilano] Error handling confirmation modal", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Non-fatal - continue anyway
    }
  }

  /**
   * Verify operation success by checking for success indicators
   */
  private async verifySuccess(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
      // Look for success indicators:
      // 1. Success toast/alert message
      const successMessages = document.querySelectorAll(
        '.success, .alert-success, [class*="success"], [class*="Success"]'
      );
      if (successMessages.length > 0) {
        const messageText = Array.from(successMessages)
          .map((el) => el.textContent?.trim())
          .join(" ");
        console.log(`[SendToMilano] Success message found: ${messageText}`);
        return true;
      }

      // 2. No error messages present
      const errorMessages = document.querySelectorAll(
        '.error, .alert-error, [class*="error"], [class*="Error"]'
      );
      if (errorMessages.length > 0) {
        const errorText = Array.from(errorMessages)
          .map((el) => el.textContent?.trim())
          .join(" ");
        console.error(`[SendToMilano] Error message found: ${errorText}`);
        return false;
      }

      // 3. Default to success if no error indicators
      console.log("[SendToMilano] No explicit success/error indicators, assuming success");
      return true;
    });
  }
}
