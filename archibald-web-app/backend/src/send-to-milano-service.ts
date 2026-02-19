import { logger } from "./logger";
import { config } from "./config";
import { ArchibaldBot } from "./bot/archibald-bot";

export interface SendToMilanoResult {
  success: boolean;
  message?: string;
  error?: string;
  orderId: string;
  sentAt?: string;
}

export class SendToMilanoService {
  async sendToMilano(
    orderId: string,
    userId: string,
  ): Promise<SendToMilanoResult> {
    logger.info(`[SendToMilano] Starting for order ${orderId}`, {
      userId,
      orderId,
    });

    if (!config.features.sendToMilanoEnabled) {
      logger.warn(`[SendToMilano] Feature disabled for order ${orderId}`);
      return {
        success: false,
        error:
          "Send to Milano feature is currently disabled. Please contact administrator.",
        orderId,
      };
    }

    const bot = new ArchibaldBot(userId);
    let botSuccess = false;

    try {
      await bot.initialize();

      const result = await bot.sendOrderToVerona(orderId);

      if (!result.success) {
        return {
          success: false,
          error: result.message,
          orderId,
        };
      }

      botSuccess = true;
      const sentAt = new Date().toISOString();

      logger.info(
        `[SendToMilano] Order ${orderId} sent to Verona successfully`,
      );

      return {
        success: true,
        message: result.message,
        orderId,
        sentAt,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`[SendToMilano] Failed to send order ${orderId}`, {
        error: errorMessage,
        userId,
        orderId,
      });

      return {
        success: false,
        error: `Failed to send order to Verona: ${errorMessage}`,
        orderId,
      };
    } finally {
      try {
        await bot.close();
      } catch {
        // ignore close errors
      }
    }
  }
}
