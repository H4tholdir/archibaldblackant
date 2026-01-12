import fs from "fs";
import path from "path";
import { Protocol } from "puppeteer";
import { logger } from "./logger";

export interface SessionData {
  cookies: Protocol.Network.Cookie[];
  timestamp: number;
  expiresAt: number;
}

export class SessionManager {
  private static instance: SessionManager;
  private sessionFile: string;
  private readonly SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 ore

  private constructor() {
    const dataDir = path.join(__dirname, "..", "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.sessionFile = path.join(dataDir, "archibald-session.json");
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Salva i cookies della sessione
   */
  async saveSession(cookies: Protocol.Network.Cookie[]): Promise<void> {
    const sessionData: SessionData = {
      cookies,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.SESSION_DURATION_MS,
    };

    try {
      fs.writeFileSync(this.sessionFile, JSON.stringify(sessionData, null, 2));
      logger.info("Sessione Archibald salvata con successo", {
        cookieCount: cookies.length,
        expiresIn: "24h",
      });
    } catch (error) {
      logger.error("Errore salvataggio sessione", { error });
    }
  }

  /**
   * Carica i cookies della sessione se valida
   */
  async loadSession(): Promise<Protocol.Network.Cookie[] | null> {
    if (!fs.existsSync(this.sessionFile)) {
      logger.info("Nessuna sessione salvata trovata");
      return null;
    }

    try {
      const data = fs.readFileSync(this.sessionFile, "utf-8");
      const sessionData: SessionData = JSON.parse(data);

      // Verifica se la sessione è ancora valida
      if (Date.now() > sessionData.expiresAt) {
        logger.info("Sessione Archibald scaduta, richiesto nuovo login", {
          savedAt: new Date(sessionData.timestamp).toISOString(),
          expiredAt: new Date(sessionData.expiresAt).toISOString(),
        });
        this.clearSession();
        return null;
      }

      const remainingHours = Math.round(
        (sessionData.expiresAt - Date.now()) / (60 * 60 * 1000),
      );
      logger.info("Sessione Archibald valida caricata", {
        cookieCount: sessionData.cookies.length,
        savedAt: new Date(sessionData.timestamp).toISOString(),
        expiresIn: `${remainingHours}h`,
      });

      return sessionData.cookies;
    } catch (error) {
      logger.error("Errore caricamento sessione", { error });
      this.clearSession();
      return null;
    }
  }

  /**
   * Elimina la sessione salvata
   */
  clearSession(): void {
    if (fs.existsSync(this.sessionFile)) {
      fs.unlinkSync(this.sessionFile);
      logger.info("Sessione Archibald eliminata");
    }
  }

  /**
   * Verifica se esiste una sessione valida
   */
  async hasValidSession(): Promise<boolean> {
    const cookies = await this.loadSession();
    return cookies !== null && cookies.length > 0;
  }
}
