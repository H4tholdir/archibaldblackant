import { Router, type Response } from "express";
import {
  authenticateJWT,
  requireAdmin,
  type AuthRequest,
} from "../middleware/auth";
import { UserDatabase } from "../user-db";
import { generateJWT } from "../auth-utils";
import { logger } from "../logger";
import Database from "better-sqlite3";
import path from "path";

const router = Router();
const userDb = UserDatabase.getInstance();

// Open users.db for admin_sessions table
const usersDbPath = path.join(__dirname, "../../data/users.db");
const usersDb = new Database(usersDbPath);

/**
 * GET /api/admin/users
 *
 * Get list of all users (admin only)
 * Query params:
 *   - role: Filter by role ('agent' | 'admin')
 */
router.get(
  "/users",
  authenticateJWT,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const { role } = req.query;

      let users = userDb.getAllUsers();

      if (role === "agent") {
        users = users.filter((u) => u.role === "agent");
      } else if (role === "admin") {
        users = users.filter((u) => u.role === "admin");
      }

      res.json({
        success: true,
        users: users.map((u) => ({
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          role: u.role,
          whitelisted: u.whitelisted,
          lastLoginAt: u.lastLoginAt,
        })),
      });
    } catch (error) {
      logger.error("Error listing users", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

/**
 * POST /api/admin/impersonate
 *
 * Admin impersonates an agent
 * Body: { targetUserId: string }
 * Returns: New JWT token as the target user (with admin role preserved)
 */
router.post(
  "/impersonate",
  authenticateJWT,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const adminUser = req.user!;
      const { targetUserId } = req.body;

      if (!targetUserId) {
        return res.status(400).json({
          success: false,
          error: "targetUserId richiesto",
        });
      }

      const targetUser = userDb.getUserById(targetUserId);

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: "Utente non trovato",
        });
      }

      // Create admin session
      const result = usersDb
        .prepare(
          `
      INSERT INTO admin_sessions (admin_user_id, impersonated_user_id, started_at, last_active)
      VALUES (?, ?, ?, ?)
    `,
        )
        .run(adminUser.userId, targetUserId, Date.now(), Date.now());

      const adminSessionId = result.lastInsertRowid as number;

      // Generate impersonated JWT
      const impersonatedToken = await generateJWT({
        userId: targetUser.id,
        username: targetUser.username,
        role: "admin", // Keep admin role
        isImpersonating: true,
        realAdminId: adminUser.userId,
        adminSessionId,
      });

      logger.info(
        `Admin ${adminUser.username} impersonating ${targetUser.username}`,
        {
          adminId: adminUser.userId,
          targetId: targetUserId,
          sessionId: adminSessionId,
        },
      );

      res.json({
        success: true,
        token: impersonatedToken,
        user: {
          id: targetUser.id,
          username: targetUser.username,
          fullName: targetUser.fullName,
          role: "admin",
          isImpersonating: true,
          realAdminName: adminUser.username,
        },
      });
    } catch (error) {
      logger.error("Impersonation error", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

/**
 * POST /api/admin/stop-impersonate
 *
 * Stop impersonating and return to original admin account
 * Returns: New JWT token as original admin
 */
router.post(
  "/stop-impersonate",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!;

      if (!user.isImpersonating || !user.adminSessionId) {
        return res.status(400).json({
          success: false,
          error: "Non stai impersonando nessuno",
        });
      }

      // Close admin session
      usersDb
        .prepare(
          `
      UPDATE admin_sessions SET ended_at = ? WHERE id = ?
    `,
        )
        .run(Date.now(), user.adminSessionId);

      // Get original admin user
      const adminUser = userDb.getUserById(user.realAdminId!);

      if (!adminUser) {
        return res.status(404).json({
          success: false,
          error: "Admin originale non trovato",
        });
      }

      // Generate original admin JWT
      const adminToken = await generateJWT({
        userId: adminUser.id,
        username: adminUser.username,
        role: adminUser.role,
      });

      logger.info(`Admin ${adminUser.username} stopped impersonating`, {
        sessionId: user.adminSessionId,
      });

      res.json({
        success: true,
        token: adminToken,
        user: {
          id: adminUser.id,
          username: adminUser.username,
          fullName: adminUser.fullName,
          role: adminUser.role,
        },
      });
    } catch (error) {
      logger.error("Stop impersonation error", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

/**
 * GET /api/admin/session/check
 *
 * Check if admin is currently impersonating the current user
 * Used by agents to show banner when admin is working on their account
 */
router.get(
  "/session/check",
  authenticateJWT,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;

      // Find active admin session for this user
      const activeSession = usersDb
        .prepare(
          `
      SELECT s.*, u.fullName as adminName
      FROM admin_sessions s
      JOIN users u ON s.admin_user_id = u.id
      WHERE s.impersonated_user_id = ?
        AND s.ended_at IS NULL
        AND s.last_active > ?
      ORDER BY s.started_at DESC
      LIMIT 1
    `,
        )
        .get(userId, Date.now() - 60000) as any; // Active if last_active < 1 min ago

      if (activeSession) {
        // Update last_active timestamp
        usersDb
          .prepare(
            `
        UPDATE admin_sessions SET last_active = ? WHERE id = ?
      `,
          )
          .run(Date.now(), activeSession.id);

        res.json({
          success: true,
          active: true,
          adminName: activeSession.adminName,
          startedAt: activeSession.started_at,
        });
      } else {
        res.json({
          success: true,
          active: false,
        });
      }
    } catch (error) {
      logger.error("Check admin session error", { error });
      res.status(500).json({ success: false, error: "Errore server" });
    }
  },
);

export default router;
