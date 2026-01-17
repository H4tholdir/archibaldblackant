import { EventEmitter } from "events";
import { ProductDatabase } from "./product-db";
import { BrowserPool } from "./browser-pool";
import { logger } from "./logger";
import { SyncCheckpointManager } from "./sync-checkpoint";
import { config } from "./config";

export interface PriceSyncProgress {
  status: "idle" | "syncing" | "completed" | "error";
  currentPage: number;
  totalPages: number;
  pricesProcessed: number;
  message: string;
  error?: string;
}

export class PriceSyncService extends EventEmitter {
  private static instance: PriceSyncService;
  private db: ProductDatabase;
  private browserPool: BrowserPool;
  private checkpointManager: SyncCheckpointManager;
  private syncInProgress = false;
  private shouldStop = false;
  private paused = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private progress: PriceSyncProgress = {
    status: "idle",
    currentPage: 0,
    totalPages: 0,
    pricesProcessed: 0,
    message: "Nessuna sincronizzazione prezzi in corso",
  };

  private constructor() {
    super();
    this.db = ProductDatabase.getInstance();
    this.browserPool = BrowserPool.getInstance();
    this.checkpointManager = SyncCheckpointManager.getInstance();
  }

  static getInstance(): PriceSyncService {
    if (!PriceSyncService.instance) {
      PriceSyncService.instance = new PriceSyncService();
    }
    return PriceSyncService.instance;
  }

  /**
   * Pause the sync service (for PriorityManager)
   * Waits for current sync operation to complete if running
   */
  async pause(): Promise<void> {
    logger.info("[PriceSyncService] Pause requested");
    this.paused = true;

    // If sync is currently running, wait for it to complete
    if (this.syncInProgress) {
      logger.info("[PriceSyncService] Waiting for current sync to complete...");
      // Wait for sync to finish by polling syncInProgress
      while (this.syncInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info("[PriceSyncService] Paused");
  }

  /**
   * Resume the sync service (for PriorityManager)
   */
  resume(): void {
    logger.info("[PriceSyncService] Resume requested");
    this.paused = false;
    logger.info("[PriceSyncService] Resumed");
  }

  /**
   * Avvia il sync automatico in background
   * @param intervalMinutes Intervallo in minuti tra i sync
   * @param skipInitialSync Se true, non esegue il sync iniziale immediato
   */
  startAutoSync(
    intervalMinutes: number = 60,
    skipInitialSync: boolean = false,
  ): void {
    logger.info(
      `Avvio auto-sync prezzi ogni ${intervalMinutes} minuti${skipInitialSync ? " (senza sync iniziale)" : ""}`,
    );

    if (!skipInitialSync) {
      // Sync iniziale al boot (dopo 10 secondi)
      setTimeout(() => {
        this.syncPrices().catch((error) => {
          logger.error("Errore sync iniziale prezzi", { error });
        });
      }, 10000);
    }

    // Sync periodico
    this.syncInterval = setInterval(
      () => {
        this.syncPrices().catch((error) => {
          logger.error("Errore sync periodico prezzi", { error });
        });
      },
      intervalMinutes * 60 * 1000,
    );
  }

  /**
   * Ferma il sync automatico
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info("Auto-sync prezzi fermato");
    }
  }

  /**
   * Richiede interruzione del sync in corso
   */
  requestStop(): void {
    if (this.syncInProgress) {
      logger.warn("⚠️ Richiesta interruzione sync prezzi in corso");
      this.shouldStop = true;
    }
  }

  /**
   * Ottiene lo stato corrente del sync
   */
  getProgress(): PriceSyncProgress {
    return { ...this.progress };
  }

  /**
   * Sincronizza i prezzi dalla tabella prezzi di Archibald
   * @param forceFullSync Se true, ignora checkpoint e parte sempre da pagina 1
   */
  async syncPrices(forceFullSync: boolean = false): Promise<void> {
    if (this.syncInProgress) {
      logger.warn("Sync prezzi già in corso, skip");
      return;
    }

    // Check if paused (for PriorityManager)
    if (this.paused) {
      logger.info("[PriceSyncService] Sync skipped - service is paused");
      return;
    }

    // Resetta flag di stop
    this.shouldStop = false;

    // Verifica se la sync è stata completata di recente
    let resumePoint = this.checkpointManager.getResumePoint("prices");

    // Force full sync: reset checkpoint and start from page 1
    if (forceFullSync && resumePoint !== -1) {
      logger.info("🔄 Full sync forzato: reset checkpoint, start da pagina 1");
      this.checkpointManager.resetCheckpoint("prices");
      resumePoint = 1;
    }

    if (resumePoint === -1) {
      logger.info("⏭️ Sync prezzi recente, skip");
      const productsWithPrices = this.db.getProductsWithPrices();
      this.updateProgress({
        status: "completed",
        currentPage: 0,
        totalPages: 0,
        pricesProcessed: productsWithPrices,
        message: "Sincronizzazione recente, skip",
      });
      return;
    }

    this.syncInProgress = true;

    // Segna sync come iniziata
    this.checkpointManager.startSync("prices");

    this.updateProgress({
      status: "syncing",
      currentPage: 0,
      totalPages: 0,
      pricesProcessed: 0,
      message:
        resumePoint > 1
          ? `Ripresa da pagina ${resumePoint}...`
          : "Avvio sincronizzazione prezzi...",
    });

    let bot = null;

    try {
      logger.info(
        resumePoint > 1
          ? `🔄 Ripresa sincronizzazione prezzi da pagina ${resumePoint}`
          : "Inizio sincronizzazione prezzi da Archibald",
      );

      // Use legacy ArchibaldBot for system sync operations
      const { ArchibaldBot } = await import("./archibald-bot");
      bot = new ArchibaldBot(); // No userId = legacy mode
      await bot.initialize();
      await bot.login(); // Uses config credentials

      // Verifica che la pagina esista e sia ancora valida
      if (!bot.page) {
        throw new Error("Browser page is null");
      }

      try {
        const url = bot.page.url();
        logger.info(`Pagina corrente: ${url}`);
      } catch (error) {
        logger.warn("Frame detached, ricarico la pagina...");
        // Verifica nuovamente che la pagina esista prima di navigare
        if (!bot.page) {
          throw new Error("Browser page is null after detached frame");
        }
        await bot.page.goto(config.archibald.url, {
          waitUntil: "networkidle2",
          timeout: 60000,
        });
      }

      logger.info("Navigazione alla tabella prezzi...");
      await bot.page!.goto(`${config.archibald.url}/PRICEDISCTABLE_ListView/`, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      await bot.page!.waitForSelector("table", { timeout: 10000 });

      // Aspetta che la pagina sia completamente caricata
      logger.info("Attesa caricamento completo pagina prezzi...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const allPrices: Array<{ productId: string; price: number }> = [];

      // Determina il numero totale di pagine
      const totalPagesInfo = await bot.page!.evaluate(() => {
        const pagerContainers = Array.from(
          document.querySelectorAll(
            '.dxp-summary, .dxp-lead, .dxpSummary, [class*="Pager"], [class*="pager"]',
          ),
        );

        let maxPageNumber = 0;

        if (pagerContainers.length > 0) {
          for (const container of pagerContainers) {
            const links = Array.from(container.querySelectorAll("a, span, td"));
            for (const link of links) {
              const text = (link as Element).textContent?.trim() || "";
              if (/^\d+$/.test(text)) {
                const pageNum = parseInt(text);
                if (pageNum > 0 && pageNum < 1000 && pageNum > maxPageNumber) {
                  maxPageNumber = pageNum;
                }
              }
            }
          }
        }

        if (maxPageNumber > 10) {
          return {
            found: true,
            totalPages: maxPageNumber,
          };
        }

        return { found: false, totalPages: 300 };
      });

      const totalPages = totalPagesInfo.found ? totalPagesInfo.totalPages : 300;
      logger.info(`Totale pagine prezzi rilevate: ${totalPages}`);

      logger.info("Inizio estrazione prezzi con paginazione diretta...");

      // Usa navigazione diretta invece di cliccare Next
      // Inizia da resumePoint invece di 1
      for (
        let currentPage = resumePoint;
        currentPage <= totalPages && !this.shouldStop;
        currentPage++
      ) {
        this.updateProgress({
          status: "syncing",
          currentPage,
          totalPages: totalPages,
          pricesProcessed: allPrices.length,
          message: `Estrazione prezzi pagina ${currentPage} di ${totalPages}...`,
        });

        await bot.page!.waitForSelector("table tbody tr", { timeout: 10000 });
        await new Promise((resolve) => setTimeout(resolve, 500));

        const pagePrices = await bot.page!.evaluate(
          (debugFirstRow: boolean) => {
            // Cerca la tabella principale dei dati
            let dataTable =
              document.querySelector(".dxgvControl") ||
              document.querySelector('table[id*="GridView"]');

            if (!dataTable) {
              const allTables = Array.from(document.querySelectorAll("table"));
              let maxRows = 0;
              for (const table of allTables) {
                const rowCount = table.querySelectorAll("tbody tr").length;
                if (rowCount > maxRows) {
                  maxRows = rowCount;
                  dataTable = table;
                }
              }
            }

            if (!dataTable) {
              return { prices: [], debug: null };
            }

            const rows = Array.from(
              dataTable.querySelectorAll("tbody tr"),
            ) as Element[];
            const results: Array<{
              itemSelection: string;
              itemDescription: string;
              price: number;
            }> = [];
            let debugInfo = null;

            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              const cells = Array.from(row.querySelectorAll("td")) as Element[];

              if (cells.length < 14) continue;

              // DEBUG: Log first DATA row (skip empty/header rows) to find correct columns
              if (debugFirstRow && !debugInfo) {
                // Try to find a row with numeric product code
                const allCellTexts = cells.map((cell, idx) => ({
                  index: idx,
                  text:
                    (cell as Element)?.textContent?.trim().substring(0, 50) ||
                    "",
                }));

                // Check if this row has an item description (product name)
                const hasProductId = allCellTexts.some((c) =>
                  /^[A-Z0-9]{2,}[0-9./-]{2,}$/i.test(c.text),
                );

                if (hasProductId) {
                  debugInfo = {
                    rowIndex: i,
                    cellCount: cells.length,
                    cellContents: allCellTexts.slice(0, 60), // First 60 columns only
                  };
                }
              }

              // Search for ITEM SELECTION (ID), ITEM DESCRIPTION (name), and PRICE
              let itemSelection = ""; // ID prodotto (es. "10004473", "051953K0")
              let itemDescription = ""; // Nome prodotto (es. "XTD3324.314.", "TD3233.314.")
              let priceText = "";

              // Extract all cells for analysis
              for (
                let colIdx = 0;
                colIdx < Math.min(cells.length, 60);
                colIdx++
              ) {
                const cellText =
                  (cells[colIdx] as Element)?.textContent?.trim() || "";

                // ITEM SELECTION: numeric ID (8-9 characters, alphanumeric)
                // Examples: "10004473", "051953K0", "0217252K1"
                if (
                  !itemSelection &&
                  /^[0-9A-Z]{7,10}$/i.test(cellText) &&
                  !/[./-]/.test(cellText) // No dots/dashes (distinguishes from ITEM DESCRIPTION)
                ) {
                  itemSelection = cellText;
                }

                // ITEM DESCRIPTION: product name with dots/dashes
                // Examples: "XTD3324.314.", "TD3233.314.", "9686.204.040", "KP6830L.314.012"
                // NOTE: Exclude short codes like "12.565" (price IDs) - real product names are longer
                if (
                  !itemDescription &&
                  cellText.length >= 8 && // Real product names are at least 8 chars
                  /^[A-Z0-9]{2,}[0-9./-]{2,}$/i.test(cellText) &&
                  /[./-]/.test(cellText) // Must contain dots or dashes
                ) {
                  itemDescription = cellText;
                }

                // PRICE: format like "234,59 €"
                if (!priceText && /\d+[,.]?\d*\s*€/.test(cellText)) {
                  priceText = cellText;
                }
              }

              // Validazione: need at least ITEM DESCRIPTION or ITEM SELECTION
              if (
                (!itemDescription && !itemSelection) ||
                (itemDescription && itemDescription.includes("Loading")) ||
                (itemDescription && itemDescription.includes("<"))
              ) {
                continue;
              }

              // Parse prezzo
              let price = 0;
              if (priceText) {
                const priceStr = priceText
                  .replace(/[€\s]/g, "")
                  .replace(",", ".");
                const parsedPrice = parseFloat(priceStr);
                if (!isNaN(parsedPrice) && parsedPrice >= 0) {
                  price = parsedPrice;
                }
              }

              results.push({
                itemSelection, // ID ARTICOLO per matching primario
                itemDescription, // NOME ARTICOLO per matching secondario
                price,
              });
            }

            return { prices: results, debug: debugInfo };
          },
          currentPage === 1,
        );

        // DEBUG: Log table structure on first page
        if (currentPage === 1 && pagePrices.debug) {
          logger.info("DEBUG - First row cell contents:", pagePrices.debug);
        }

        const prices = pagePrices.prices;
        logger.info(
          `Estratti ${prices.length} prezzi dalla pagina ${currentPage}`,
        );

        // DEBUG: Log first 3 price entries to verify data format
        if (currentPage === 1 && prices.length > 0) {
          logger.info("DEBUG - Sample price entries:", {
            samples: prices.slice(0, 3).map((p) => ({
              itemSelection: p.itemSelection,
              itemDescription: p.itemDescription,
              price: p.price,
            })),
          });
        }

        allPrices.push(
          ...prices.map((p) => ({
            productId: p.itemSelection,
            price: p.price,
          })),
        );

        // Aggiorna i prezzi nel database con MATCHING MULTI-LIVELLO ROBUSTO
        if (prices.length > 0) {
          // Prepare statements for multi-level matching
          const updateById = this.db["db"].prepare(
            "UPDATE products SET price = ? WHERE id = ?",
          );
          const updateByNameExact = this.db["db"].prepare(
            "UPDATE products SET price = ? WHERE name = ?",
          );
          const updateByNameNormalized = this.db["db"].prepare(
            "UPDATE products SET price = ? WHERE REPLACE(REPLACE(REPLACE(LOWER(name), '.', ''), ' ', ''), '-', '') = ?",
          );

          let matchedById = 0;
          let matchedByNameExact = 0;
          let matchedByNameNormalized = 0;
          let unmatchedCount = 0;

          const transaction = this.db["db"].transaction(
            (
              priceList: Array<{
                itemSelection: string;
                itemDescription: string;
                price: number;
              }>,
            ) => {
              for (const priceEntry of priceList) {
                let matched = false;

                // LEVEL 1: Match by ID (ITEM SELECTION -> products.id)
                if (priceEntry.itemSelection) {
                  const result = updateById.run(
                    priceEntry.price,
                    priceEntry.itemSelection,
                  );
                  if (result.changes > 0) {
                    matchedById++;
                    matched = true;
                    continue;
                  }
                }

                // LEVEL 2: Match by exact name (ITEM DESCRIPTION -> products.name)
                if (priceEntry.itemDescription && !matched) {
                  const result = updateByNameExact.run(
                    priceEntry.price,
                    priceEntry.itemDescription,
                  );
                  if (result.changes > 0) {
                    matchedByNameExact++;
                    matched = true;
                    continue;
                  }
                }

                // LEVEL 3: Match by normalized name (remove dots, spaces, dashes, lowercase)
                if (priceEntry.itemDescription && !matched) {
                  const normalizedName = priceEntry.itemDescription
                    .toLowerCase()
                    .replace(/[.\s-]/g, "");
                  const result = updateByNameNormalized.run(
                    priceEntry.price,
                    normalizedName,
                  );
                  if (result.changes > 0) {
                    matchedByNameNormalized++;
                    matched = true;
                    continue;
                  }
                }

                // No match found
                if (!matched) {
                  unmatchedCount++;
                  if (unmatchedCount <= 5) {
                    // Log first 5 unmatched for debugging
                    logger.warn(
                      `Unmatched price entry: ID=${priceEntry.itemSelection} Name=${priceEntry.itemDescription} Price=${priceEntry.price}`,
                    );
                  }
                }
              }
            },
          );
          transaction(prices);

          const totalMatched =
            matchedById + matchedByNameExact + matchedByNameNormalized;
          logger.info(
            `Pagina ${currentPage}: ${prices.length} prezzi → ${totalMatched} matched (ID: ${matchedById}, Name exact: ${matchedByNameExact}, Name normalized: ${matchedByNameNormalized}) | ${unmatchedCount} unmatched`,
          );
        }

        // Salva checkpoint dopo ogni pagina completata
        this.checkpointManager.updateProgress(
          "prices",
          currentPage,
          totalPages,
          allPrices.length,
        );

        // Se non ci sono prezzi, interrompi
        if (prices.length === 0) {
          logger.info(`Pagina ${currentPage} vuota, interrompo`);
          break;
        }

        // Naviga alla prossima pagina
        if (currentPage < totalPages) {
          const nextPageNum = currentPage + 1;
          const navigated = await bot.page!.evaluate((targetPage: number) => {
            const pageLinks = Array.from(
              document.querySelectorAll("a, span, td"),
            ).filter((el) => {
              const text = (el as Element).textContent?.trim();
              return text === targetPage.toString();
            });

            for (const link of pageLinks) {
              const el = link as HTMLElement;
              const isInPager =
                el.closest(".dxp-summary") || el.closest('[class*="pager"]');
              if (isInPager && el.tagName === "A") {
                el.click();
                return { success: true };
              }
            }

            const nextButtons = [
              document.querySelector('img[alt="Next"]'),
              document.querySelector('a[title="Next"]'),
            ];

            for (const btn of nextButtons) {
              if (
                btn &&
                !(btn as HTMLElement).classList?.contains("dxp-disabled")
              ) {
                const clickable =
                  btn.tagName === "A"
                    ? btn
                    : btn.closest("a") || btn.parentElement;
                if (clickable) {
                  (clickable as HTMLElement).click();
                  return { success: true };
                }
              }
            }

            return { success: false };
          }, nextPageNum);

          if (!navigated.success) {
            logger.warn(
              `Impossibile navigare alla pagina ${nextPageNum}, interrompo`,
            );
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 1500));
          await bot.page!.waitForSelector("table tbody tr", { timeout: 10000 });
        }
      }

      // Controlla se il sync è stato interrotto
      if (this.shouldStop) {
        logger.warn("⚠️ Sync prezzi interrotto su richiesta");

        // Salva checkpoint alla pagina corrente per permettere ripresa
        const lastProcessedPage =
          allPrices.length > 0 ? Math.ceil(allPrices.length / 20) : resumePoint;
        this.checkpointManager.updateProgress(
          "prices",
          lastProcessedPage,
          totalPages,
          allPrices.length,
        );

        this.updateProgress({
          status: "idle",
          currentPage: lastProcessedPage,
          totalPages,
          pricesProcessed: allPrices.length,
          message:
            "Sincronizzazione interrotta (riprenderà dall'ultima pagina)",
        });

        this.shouldStop = false;
        return;
      }

      logger.info(
        `Estrazione prezzi completata: ${allPrices.length} prezzi aggiornati`,
      );

      // Segna checkpoint come completato
      this.checkpointManager.completeSync(
        "prices",
        totalPages,
        allPrices.length,
      );

      this.updateProgress({
        status: "completed",
        currentPage: totalPages,
        totalPages: totalPages,
        pricesProcessed: allPrices.length,
        message: `Sincronizzazione prezzi completata: ${allPrices.length} prezzi aggiornati`,
      });

      logger.info("Sincronizzazione prezzi completata con successo", {
        total: allPrices.length,
      });
    } catch (error) {
      logger.error("Errore durante la sincronizzazione prezzi", { error });

      // Segna checkpoint come fallito (mantiene lastSuccessfulPage per ripresa)
      this.checkpointManager.failSync(
        "prices",
        error instanceof Error ? error.message : "Errore sconosciuto",
        this.progress.currentPage,
      );

      this.updateProgress({
        status: "error",
        currentPage: this.progress.currentPage,
        totalPages: this.progress.totalPages,
        pricesProcessed: this.progress.pricesProcessed,
        message: "Errore durante la sincronizzazione prezzi",
        error: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    } finally {
      if (bot) {
        await bot.close(); // Close bot after sync (legacy mode)
      }
      this.syncInProgress = false;
    }
  }

  private updateProgress(progress: PriceSyncProgress): void {
    this.progress = { ...progress };
    this.emit("progress", this.progress);
    logger.debug("Sync prezzi progress", this.progress);
  }
}
