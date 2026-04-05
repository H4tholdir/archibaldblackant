import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import type { DbPool } from '../db/pool';
import type { AuthRequest } from '../middleware/auth';
import type { User, UserRole, UserTarget } from '../db/repositories/users';
import type { JWTPayload } from '../auth-utils';
import { audit } from '../db/repositories/audit-log';
import { logger } from '../logger';
import {
  getExceptionStats,
  getExceptionsByUser,
  updateClaimStatus,
  getExceptionById,
} from '../db/repositories/tracking-exceptions';
import { generateClaimPdf } from '../services/fedex-claim-pdf';
import { eraseCustomerPersonalData, exportCustomerData, hasActiveOrders } from '../db/repositories/gdpr';
import { buildMailtoLink } from '../services/security-alert-service';
import { config } from '../config';

type AdminJob = {
  jobId: string;
  type: string;
  status: string;
  userId: string;
  username: string;
  orderData: Record<string, unknown>;
  createdAt: number;
  processedAt: number | null;
  finishedAt: number | null;
  result: unknown;
  error: string | null;
  progress: number;
};

type AdminRouterDeps = {
  pool: DbPool;
  getAllUsers: () => Promise<User[]>;
  getUserById: (id: string) => Promise<User | null>;
  createUser: (username: string, fullName: string, role?: UserRole) => Promise<User>;
  updateWhitelist: (id: string, whitelisted: boolean) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  updateUserTarget: (userId: string, yearlyTarget: number, currency: string, commissionRate: number, bonusAmount: number, bonusInterval: number, extraBudgetInterval: number, extraBudgetReward: number, monthlyAdvance: number, hideCommissions: boolean) => Promise<void>;
  getUserTarget: (userId: string) => Promise<UserTarget | null>;
  generateJWT: (payload: Omit<JWTPayload, 'jti'>) => Promise<string>;
  createAdminSession: (adminUserId: string, targetUserId: string) => Promise<number>;
  closeAdminSession: (sessionId: number) => Promise<void>;
  getAllJobs: (limit: number, status?: string) => Promise<AdminJob[]>;
  retryJob: (jobId: string) => Promise<{ success: boolean; newJobId?: string; error?: string }>;
  cancelJob: (jobId: string) => Promise<{ success: boolean; error?: string }>;
  cleanupJobs: () => Promise<{ removedCompleted: number; removedFailed: number }>;
  getRetentionConfig: () => { completedCount: number; failedCount: number };
  importSubclients: (buffer: Buffer, filename: string) => Promise<{ success: boolean; imported?: number; skipped?: number; error?: string }>;
  importKometListino: (buffer: Buffer, filename: string, userId: string) => Promise<{
    totalRows: number;
    ivaUpdated: number;
    scontiUpdated: number;
    unmatched: number;
    unmatchedProducts: Array<{ excelId: string; excelCodiceArticolo: string; reason: string }>;
    errors: string[];
  }>;
};

const createUserSchema = z.object({
  username: z.string().min(1),
  fullName: z.string().min(1),
  role: z.enum(['agent', 'admin']).default('agent'),
});

const updateTargetSchema = z.object({
  yearlyTarget: z.number().min(0),
  currency: z.string().default('EUR'),
  commissionRate: z.number().min(0),
  bonusAmount: z.number().min(0),
  bonusInterval: z.number().int().min(1),
  extraBudgetInterval: z.number().int().min(0),
  extraBudgetReward: z.number().min(0),
  monthlyAdvance: z.number().min(0),
  hideCommissions: z.boolean(),
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const ALLOWED_EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

function createAdminRouter(deps: AdminRouterDeps) {
  const {
    getAllUsers, getUserById, createUser, updateWhitelist, deleteUser,
    updateUserTarget, getUserTarget, generateJWT, createAdminSession, closeAdminSession,
    getAllJobs, retryJob, cancelJob, cleanupJobs, getRetentionConfig, importSubclients, importKometListino,
  } = deps;
  const router = Router();

  router.get('/users', async (req: AuthRequest, res) => {
    try {
      let users = await getAllUsers();
      const { role } = req.query;
      const validRoles = ['agent', 'admin', 'ufficio', 'concessionario'] as const;
      if (validRoles.includes(role as (typeof validRoles)[number])) {
        users = users.filter((u) => u.role === role);
      }
      res.json({
        success: true,
        users: users.map((u) => ({
          id: u.id, username: u.username, fullName: u.fullName,
          role: u.role, whitelisted: u.whitelisted, lastLoginAt: u.lastLoginAt,
          modules: u.modules, mfaEnabled: u.mfaEnabled,
        })),
      });
    } catch (error) {
      logger.error('Error listing users', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.post('/users', async (req: AuthRequest, res) => {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const user = await createUser(parsed.data.username, parsed.data.fullName, parsed.data.role as UserRole);
      res.status(201).json({ success: true, data: user });
    } catch (error) {
      logger.error('Error creating user', { error });
      res.status(500).json({ success: false, error: 'Errore creazione utente' });
    }
  });

  router.patch('/users/:id/whitelist', async (req: AuthRequest, res) => {
    try {
      const { whitelisted } = req.body;
      if (typeof whitelisted !== 'boolean') {
        return res.status(400).json({ success: false, error: 'whitelisted deve essere boolean' });
      }
      const id = req.params.id;
      await updateWhitelist(id, whitelisted);
      void audit(deps.pool, {
        actorId: req.user!.userId,
        actorRole: req.user!.role,
        action: 'user.whitelist_changed',
        targetType: 'user',
        targetId: id,
        ipAddress: req.ip,
        metadata: { whitelisted },
      });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating whitelist', { error });
      res.status(500).json({ success: false, error: 'Errore aggiornamento whitelist' });
    }
  });

  router.patch('/users/:id', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      const parsed = z.object({
        role: z.enum(['agent', 'admin', 'ufficio', 'concessionario']).optional(),
        modules: z.array(z.string()).optional(),
        whitelisted: z.boolean().optional(),
      }).safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }

      const changes = parsed.data;

      if (changes.role !== undefined && id === req.user!.userId) {
        return res.status(403).json({ success: false, error: 'Non puoi modificare il tuo stesso ruolo' });
      }

      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (changes.role !== undefined) { setClauses.push(`role = $${idx++}`); params.push(changes.role); }
      if (changes.modules !== undefined) { setClauses.push(`modules = $${idx++}`); params.push(changes.modules); }
      if (changes.whitelisted !== undefined) { setClauses.push(`whitelisted = $${idx++}`); params.push(changes.whitelisted); }

      if (setClauses.length === 0) {
        return res.status(400).json({ success: false, error: 'Nessun campo da aggiornare' });
      }

      params.push(id);
      await deps.pool.query(`UPDATE agents.users SET ${setClauses.join(', ')} WHERE id = $${idx}`, params);

      const action = 'user.updated';

      void audit(deps.pool, {
        actorId: req.user!.userId,
        actorRole: req.user!.role,
        action,
        targetType: 'user',
        targetId: id,
        ipAddress: req.ip,
        metadata: changes as Record<string, unknown>,
      });

      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating user', { error });
      res.status(500).json({ success: false, error: 'Errore aggiornamento utente' });
    }
  });

  router.delete('/users/:id', async (req: AuthRequest, res) => {
    try {
      await deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting user', { error });
      res.status(500).json({ success: false, error: 'Errore cancellazione utente' });
    }
  });

  router.get('/users/:id/target', async (req: AuthRequest, res) => {
    try {
      const target = await getUserTarget(req.params.id);
      if (!target) {
        return res.status(404).json({ success: false, error: 'Target non trovato' });
      }
      res.json({ success: true, data: target });
    } catch (error) {
      logger.error('Error fetching user target', { error });
      res.status(500).json({ success: false, error: 'Errore recupero target' });
    }
  });

  router.put('/users/:id/target', async (req: AuthRequest, res) => {
    try {
      const parsed = updateTargetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const { yearlyTarget, currency, commissionRate, bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions } = parsed.data;
      await updateUserTarget(req.params.id, yearlyTarget, currency, commissionRate, bonusAmount, bonusInterval, extraBudgetInterval, extraBudgetReward, monthlyAdvance, hideCommissions);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating user target', { error });
      res.status(500).json({ success: false, error: 'Errore aggiornamento target' });
    }
  });

  router.post('/impersonate', async (req: AuthRequest, res) => {
    try {
      const adminUser = req.user!;
      const { targetUserId } = req.body;

      if (!targetUserId) {
        return res.status(400).json({ success: false, error: 'targetUserId richiesto' });
      }

      const targetUser = await getUserById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ success: false, error: 'Utente non trovato' });
      }

      const adminSessionId = await createAdminSession(adminUser.userId, targetUserId);

      const token = await generateJWT({
        userId: targetUser.id,
        username: targetUser.username,
        role: targetUser.role as UserRole,
        isImpersonating: true,
        realAdminId: adminUser.userId,
        adminSessionId,
        modules: targetUser.modules,
      });

      void audit(deps.pool, {
        actorId: adminUser.userId,
        actorRole: 'admin',
        action: 'admin.impersonation_start',
        targetType: 'user',
        targetId: targetUserId,
        ipAddress: req.ip,
      });

      res.json({
        success: true,
        token,
        user: {
          id: targetUser.id,
          username: targetUser.username,
          fullName: targetUser.fullName,
          role: targetUser.role,
          isImpersonating: true,
          realAdminName: adminUser.username,
        },
      });
    } catch (error) {
      logger.error('Impersonation error', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.post('/stop-impersonate', async (req: AuthRequest, res) => {
    try {
      const user = req.user!;

      if (!user.isImpersonating || !user.adminSessionId) {
        return res.status(400).json({ success: false, error: 'Non stai impersonando nessuno' });
      }

      await closeAdminSession(user.adminSessionId);

      const adminUser = await getUserById(user.realAdminId!);
      if (!adminUser) {
        return res.status(404).json({ success: false, error: 'Admin originale non trovato' });
      }

      const token = await generateJWT({
        userId: adminUser.id,
        username: adminUser.username,
        role: adminUser.role as UserRole,
        modules: adminUser.modules,
      });

      void audit(deps.pool, {
        actorId: adminUser.id,
        actorRole: 'admin',
        action: 'admin.impersonation_end',
        targetType: 'user',
        targetId: user.userId,
        ipAddress: req.ip,
      });

      res.json({
        success: true,
        token,
        user: { id: adminUser.id, username: adminUser.username, fullName: adminUser.fullName, role: adminUser.role },
      });
    } catch (error) {
      logger.error('Stop impersonation error', { error });
      res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.get('/jobs', async (req: AuthRequest, res) => {
    try {
      const limit = parseInt((req.query.limit as string) || '50', 10);
      const status = req.query.status as string | undefined;
      const jobs = await getAllJobs(limit, status);
      res.json({ success: true, data: jobs });
    } catch (error) {
      logger.error('Error fetching admin jobs', { error });
      res.status(500).json({ success: false, error: 'Errore recupero jobs' });
    }
  });

  router.post('/jobs/retry/:jobId', async (req: AuthRequest, res) => {
    try {
      const result = await retryJob(req.params.jobId);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error ?? 'Retry fallito' });
      }
      res.json({ success: true, data: { newJobId: result.newJobId } });
    } catch (error) {
      logger.error('Error retrying job', { error });
      res.status(500).json({ success: false, error: 'Errore retry job' });
    }
  });

  router.post('/jobs/cancel/:jobId', async (req: AuthRequest, res) => {
    try {
      const result = await cancelJob(req.params.jobId);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error ?? 'Cancellazione fallita' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error('Error cancelling job', { error });
      res.status(500).json({ success: false, error: 'Errore cancellazione job' });
    }
  });

  router.post('/jobs/cleanup', async (_req: AuthRequest, res) => {
    try {
      const result = await cleanupJobs();
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error cleaning up jobs', { error });
      res.status(500).json({ success: false, error: 'Errore pulizia jobs' });
    }
  });

  router.get('/jobs/retention', async (_req: AuthRequest, res) => {
    res.json({ success: true, data: getRetentionConfig() });
  });

  router.get('/session/check', async (req: AuthRequest, res) => {
    const user = req.user!;
    res.json({
      success: true,
      data: {
        isImpersonating: user.isImpersonating ?? false,
        realAdminId: user.realAdminId ?? null,
        adminSessionId: user.adminSessionId ?? null,
      },
    });
  });

  router.post('/subclients/import', upload.single('file'), async (req: AuthRequest, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'File richiesto' });
      }
      const result = await importSubclients(file.buffer, file.originalname);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error importing subclients', { error });
      res.status(500).json({ success: false, error: 'Errore importazione sottoclienti' });
    }
  });

  router.post('/import-komet-listino', upload.single('file'), async (req: AuthRequest, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'File Excel richiesto' });
    }
    if (!ALLOWED_EXCEL_MIME_TYPES.includes(file.mimetype)) {
      return res.status(400).json({ success: false, error: 'Solo file Excel (.xlsx, .xls) sono accettati' });
    }
    try {
      const result = await importKometListino(file.buffer, file.originalname, req.user!.userId);
      return res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error importing Komet listino', { error });
      return res.status(500).json({ success: false, error: 'Errore durante importazione listino Komet' });
    }
  });

  // --- Tracking FedEx ---

  router.get('/tracking/stats', async (req, res) => {
    try {
      const { userId, from, to } = req.query as Record<string, string>;
      const stats = await getExceptionStats(deps.pool, { userId, from, to });
      const { rows } = await deps.pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE tracking_status IS NOT NULL)::int AS total_with_tracking,
           COUNT(*) FILTER (WHERE tracking_status = 'delivered')::int AS delivered
         FROM agents.order_ddts
         ${userId ? 'WHERE user_id = $1' : ''}`,
        userId ? [userId] : [],
      );
      res.json({ ...rows[0], ...stats });
    } catch (err) {
      logger.error('Error fetching tracking stats', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/tracking/exceptions', async (req, res) => {
    try {
      const { userId, status = 'all', from, to } = req.query as Record<string, string>;
      const exceptions = await getExceptionsByUser(
        deps.pool,
        userId || undefined,
        { status: status as 'open' | 'closed' | 'all', from, to },
      );
      res.json(exceptions);
    } catch (err) {
      logger.error('Error fetching tracking exceptions', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/tracking/exceptions/:id/claim', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
      const { claimStatus } = req.body as { claimStatus: 'open' | 'submitted' | 'resolved' };
      const allowed: Array<'open' | 'submitted' | 'resolved'> = ['open', 'submitted', 'resolved'];
      if (!allowed.includes(claimStatus)) {
        return res.status(400).json({ error: 'Invalid claimStatus' });
      }
      const exception = await getExceptionById(deps.pool, id);
      if (!exception) return res.status(404).json({ error: 'Not found' });
      await updateClaimStatus(deps.pool, id, claimStatus, exception.userId);
      res.json({ id, claimStatus });
    } catch (err) {
      logger.error('Error updating claim status', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/tracking/exceptions/:id/claim-pdf', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
      const exception = await getExceptionById(deps.pool, id);
      if (!exception) return res.status(404).json({ error: 'Not found' });
      const pdfBuffer = await generateClaimPdf(exception);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="reclamo-${exception.trackingNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      logger.error('Error generating claim PDF', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/customers/:id/export', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const data = await exportCustomerData(deps.pool, id);
      const filename = `customer-export-${id}-${new Date().toISOString().split('T')[0]}.json`;

      void audit(deps.pool, {
        actorId: req.user!.userId,
        actorRole: req.user!.role,
        action: 'customer.data_exported',
        targetType: 'customer',
        targetId: id,
        ipAddress: req.ip,
        metadata: { filename },
      });

      res
        .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        .json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Errore durante l\'export dei dati' });
    }
  });

  router.post('/customers/:id/gdpr-erase', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const parsed = z.object({ reason: z.string().min(10) }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const { reason } = parsed.data;

      const active = await hasActiveOrders(deps.pool, id);
      if (active) {
        return res.status(409).json({ success: false, error: 'Impossibile cancellare: ordini attivi per questo cliente' });
      }

      await eraseCustomerPersonalData(deps.pool, id);

      const fieldsErased = ['name', 'street', 'city', 'postal_code', 'email', 'phone', 'mobile', 'pec', 'sdi', 'fiscal_code'];

      void audit(deps.pool, {
        actorId: req.user!.userId,
        actorRole: req.user!.role,
        action: 'customer.erased',
        targetType: 'customer',
        targetId: id,
        ipAddress: req.ip,
        metadata: { reason, fieldsErased },
      });

      res.json({
        success: true,
        data: {
          customerId: id,
          erasedAt: new Date().toISOString(),
          fieldsErased,
          retainedFor: 'fiscal_obligation_10y',
          reason,
        },
      });
    } catch (error) {
      logger.error('Error erasing customer GDPR data', { error });
      res.status(500).json({ success: false, error: 'Errore cancellazione dati GDPR' });
    }
  });

  router.get('/security-alerts', async (_req: AuthRequest, res) => {
    try {
      const { rows } = await deps.pool.query(
        `SELECT id, occurred_at, metadata
         FROM system.audit_log
         WHERE action = 'security.alert' AND occurred_at > NOW() - INTERVAL '7 days'
         ORDER BY occurred_at DESC
         LIMIT 50`,
      );
      const rowsWithMailto = rows.map(row => ({
        ...row,
        mailtoUrl: config.security.alertEmail
          ? buildMailtoLink(config.security.alertEmail, row.metadata?.event, row.metadata ?? {})
          : null,
      }));
      res.json({ data: rowsWithMailto });
    } catch (error) {
      logger.error('Error fetching security alerts', { error });
      res.status(500).json({ success: false, error: 'Errore recupero security alerts' });
    }
  });

  router.get('/audit-log', async (req: AuthRequest, res) => {
    try {
      const { actorId, action, targetType, from, to, page = '1' } = req.query as Record<string, string>;
      const rawPage = parseInt(page, 10);
      const pageNum = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
      const offset = (pageNum - 1) * 50;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (actorId) { conditions.push(`actor_id = $${idx++}`); params.push(actorId); }
      if (action) { conditions.push(`action = $${idx++}`); params.push(action); }
      if (targetType) { conditions.push(`target_type = $${idx++}`); params.push(targetType); }
      if (from) { conditions.push(`occurred_at >= $${idx++}`); params.push(from); }
      if (to) { conditions.push(`occurred_at <= $${idx++}`); params.push(to); }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(50, offset);

      const [{ rows }, { rows: countRows }] = await Promise.all([
        deps.pool.query(
          `SELECT id, occurred_at, actor_id, actor_role, action, target_type, target_id, ip_address, metadata
           FROM system.audit_log ${where}
           ORDER BY occurred_at DESC
           LIMIT $${idx} OFFSET $${idx + 1}`,
          params,
        ),
        deps.pool.query<{ total: string }>(
          `SELECT COUNT(*) AS total FROM system.audit_log ${where}`,
          params.slice(0, -2),
        ),
      ]);

      const total = parseInt(countRows[0]?.total ?? '0', 10);
      res.json({ success: true, data: rows, page: pageNum, total });
    } catch (error) {
      logger.error('Error fetching audit log', { error });
      res.status(500).json({ success: false, error: 'Errore recupero audit log' });
    }
  });

  return router;
}

export { createAdminRouter, type AdminRouterDeps, type AdminJob };
