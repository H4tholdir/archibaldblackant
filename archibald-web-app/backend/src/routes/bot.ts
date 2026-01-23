import { Router, type Response } from "express";
import { authenticateJWT, type AuthRequest } from "../middleware/auth";
import type { OrderData } from "../types";
import { QueueManager } from "../queue-manager";
import { logger } from "../logger";

const router = Router();
const queueManager = QueueManager.getInstance();

/**
 * POST /api/bot/submit-orders
 *
 * Batch submit multiple orders to the bot queue
 *
 * Body: {
 *   orders: OrderData[] - Array of order data to submit
 * }
 *
 * Returns: {
 *   success: boolean
 *   jobIds: string[] - Array of job IDs for tracking
 *   message: string
 * }
 */
router.post(
  "/api/bot/submit-orders",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const username = req.user!.username;
      const { orders } = req.body;

      if (!Array.isArray(orders) || orders.length === 0) {
        return res.status(400).json({
          success: false,
          error: "orders array required",
        });
      }

      logger.info("📥 Bot API: Batch order submission requested", {
        userId,
        username,
        orderCount: orders.length,
      });

      const jobIds: string[] = [];

      for (const orderData of orders) {
        try {
          const job = await queueManager.addOrder(
            orderData as OrderData,
            userId,
          );
          jobIds.push(job.id!);

          logger.info("✅ Bot API: Order queued", {
            jobId: job.id,
            customerName: orderData.customerName,
            itemsCount: orderData.items?.length || 0,
          });
        } catch (error) {
          logger.error("❌ Bot API: Failed to queue order", {
            customerName: orderData.customerName,
            error,
          });
          throw error;
        }
      }

      logger.info("✅ Bot API: Batch submission complete", {
        userId,
        username,
        jobIds,
      });

      res.json({
        success: true,
        jobIds,
        message: `${jobIds.length} orders queued for submission`,
      });
    } catch (error) {
      logger.error("❌ Bot API: Batch submission failed", { error });

      const errorMessage =
        error instanceof Error ? error.message : "Internal server error";

      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  },
);

export default router;
