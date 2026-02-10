import { Router, type Request, type Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { Dropbox } from "dropbox";
import { authenticateJWT, type AuthRequest } from "../middleware/auth";
import { config } from "../config";
import { logger } from "../logger";

const router = Router();

const SHARED_PDF_DIR = path.join(__dirname, "../../data/shared-pdfs");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

type PdfMetadata = {
  createdAt: number;
  originalName: string;
};

const pdfStore = new Map<string, PdfMetadata>();

function ensureSharedPdfDir() {
  if (!fs.existsSync(SHARED_PDF_DIR)) {
    fs.mkdirSync(SHARED_PDF_DIR, { recursive: true });
  }
}

function cleanupExpiredPdfs() {
  ensureSharedPdfDir();
  const now = Date.now();

  for (const [id, meta] of pdfStore.entries()) {
    if (now - meta.createdAt > config.share.pdfTtlMs) {
      const filePath = path.join(SHARED_PDF_DIR, `${id}.pdf`);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (err) {
        logger.error("Failed to delete expired PDF", { id, error: err });
      }
      pdfStore.delete(id);
    }
  }

  // Scan directory for orphaned files not in the map
  try {
    const files = fs.readdirSync(SHARED_PDF_DIR);
    for (const file of files) {
      const id = file.replace(".pdf", "");
      if (!pdfStore.has(id)) {
        const filePath = path.join(SHARED_PDF_DIR, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > config.share.pdfTtlMs) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (err) {
    logger.error("Failed to scan shared-pdfs directory", { error: err });
  }
}

// Cleanup on module load and every hour
ensureSharedPdfDir();
cleanupExpiredPdfs();
setInterval(cleanupExpiredPdfs, 60 * 60 * 1000);

/**
 * POST /upload-pdf
 * Upload a PDF for temporary sharing (24h TTL)
 */
router.post(
  "/upload-pdf",
  authenticateJWT,
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: "Nessun file caricato" });
        return;
      }

      const id = crypto.randomUUID();
      const filePath = path.join(SHARED_PDF_DIR, `${id}.pdf`);

      fs.writeFileSync(filePath, req.file.buffer);
      pdfStore.set(id, {
        createdAt: Date.now(),
        originalName: req.file.originalname || "preventivo.pdf",
      });

      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const url = `${protocol}://${host}/api/share/pdf/${id}.pdf`;

      logger.info("PDF uploaded for sharing", {
        id,
        originalName: req.file.originalname,
        user: req.user?.username,
      });

      res.json({ success: true, url, id });
    } catch (error) {
      logger.error("Failed to upload PDF for sharing", { error });
      res
        .status(500)
        .json({ success: false, error: "Errore durante il caricamento" });
    }
  },
);

/**
 * GET /pdf/:id.pdf (or /pdf/:id for backward compat)
 * Serve a shared PDF (public, no auth required)
 */
router.get("/pdf/:id", (req: Request, res: Response) => {
  const id = req.params.id.replace(/\.pdf$/, "");
  const filePath = path.join(SHARED_PDF_DIR, `${id}.pdf`);
  let meta = pdfStore.get(id);

  if (!meta && fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    meta = { createdAt: stat.mtimeMs, originalName: "preventivo.pdf" };
    pdfStore.set(id, meta);
  }

  if (!meta || Date.now() - meta.createdAt > config.share.pdfTtlMs) {
    if (meta) {
      pdfStore.delete(id);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (_) {}
    }
    res
      .status(404)
      .json({ success: false, error: "PDF non trovato o scaduto" });
    return;
  }

  if (!fs.existsSync(filePath)) {
    pdfStore.delete(id);
    res.status(404).json({ success: false, error: "PDF non trovato" });
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${meta.originalName}"`,
  );
  res.sendFile(filePath);
});

/**
 * POST /email
 * Send a PDF via email using SMTP
 */
router.post(
  "/email",
  authenticateJWT,
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: "Nessun file caricato" });
        return;
      }

      const { to, subject, body } = req.body;
      if (!to) {
        res
          .status(400)
          .json({ success: false, error: "Destinatario mancante" });
        return;
      }

      if (!config.smtp.host || !config.smtp.user) {
        res.status(500).json({ success: false, error: "SMTP non configurato" });
        return;
      }

      const transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass,
        },
      });

      const info = await transporter.sendMail({
        from: config.smtp.from || config.smtp.user,
        to,
        subject: subject || "Preventivo",
        text: body || "",
        attachments: [
          {
            filename: req.file.originalname || "preventivo.pdf",
            content: req.file.buffer,
            contentType: "application/pdf",
          },
        ],
      });

      logger.info("Email sent with PDF", {
        to,
        messageId: info.messageId,
        user: req.user?.username,
      });

      res.json({ success: true, messageId: info.messageId });
    } catch (error) {
      logger.error("Failed to send email", { error });
      const message =
        error instanceof Error ? error.message : "Errore durante l'invio";
      res.status(500).json({ success: false, error: message });
    }
  },
);

/**
 * POST /dropbox
 * Upload a PDF to Dropbox
 */
router.post(
  "/dropbox",
  authenticateJWT,
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: "Nessun file caricato" });
        return;
      }

      const { fileName } = req.body;

      if (
        !config.dropbox.appKey ||
        !config.dropbox.appSecret ||
        !config.dropbox.refreshToken
      ) {
        res
          .status(500)
          .json({ success: false, error: "Dropbox non configurato" });
        return;
      }

      const dbx = new Dropbox({
        clientId: config.dropbox.appKey,
        clientSecret: config.dropbox.appSecret,
        refreshToken: config.dropbox.refreshToken,
      });

      const dropboxPath = `${config.dropbox.basePath}/${fileName || req.file.originalname || "preventivo.pdf"}`;

      const result = await dbx.filesUpload({
        path: dropboxPath,
        contents: req.file.buffer,
        mode: { ".tag": "overwrite" },
      });

      logger.info("PDF uploaded to Dropbox", {
        path: result.result.path_display,
        user: req.user?.username,
      });

      res.json({ success: true, path: result.result.path_display });
    } catch (error) {
      logger.error("Failed to upload to Dropbox", { error });
      const message =
        error instanceof Error ? error.message : "Errore durante l'upload";
      res.status(500).json({ success: false, error: message });
    }
  },
);

export default router;
