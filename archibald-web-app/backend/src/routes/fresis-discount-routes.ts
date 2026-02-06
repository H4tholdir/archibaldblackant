import express, { type Response } from "express";
import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger";
import { authenticateJWT, type AuthRequest } from "../middleware/auth";

const router = express.Router();

const usersDbPath = path.join(__dirname, "../../data/users.db");
const usersDb = new Database(usersDbPath);

router.get(
  "/fresis-discounts",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;

      const rows = usersDb
        .prepare("SELECT * FROM fresis_discounts WHERE user_id = ?")
        .all(userId) as any[];

      res.json({
        success: true,
        discounts: rows.map((r) => ({
          id: r.id,
          articleCode: r.article_code,
          discountPercent: r.discount_percent,
          kpPriceUnit: r.kp_price_unit,
        })),
      });
    } catch (error) {
      logger.error("Error fetching fresis discounts", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

router.post(
  "/fresis-discounts/upload",
  authenticateJWT,
  (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { discounts } = req.body;

      if (!Array.isArray(discounts)) {
        return res.status(400).json({
          success: false,
          error: "discounts deve essere un array",
        });
      }

      const now = Date.now();

      // Clear existing discounts for this user
      usersDb
        .prepare("DELETE FROM fresis_discounts WHERE user_id = ?")
        .run(userId);

      const insertStmt = usersDb.prepare(`
        INSERT INTO fresis_discounts (id, article_code, discount_percent, kp_price_unit, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const insertAll = usersDb.transaction((items: any[]) => {
        for (const d of items) {
          insertStmt.run(
            d.id,
            d.articleCode,
            d.discountPercent,
            d.kpPriceUnit ?? null,
            userId,
            now,
            now,
          );
        }
      });

      insertAll(discounts);

      logger.info("Fresis discounts uploaded", {
        userId,
        count: discounts.length,
      });

      res.json({
        success: true,
        count: discounts.length,
      });
    } catch (error) {
      logger.error("Error uploading fresis discounts", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

export default router;
