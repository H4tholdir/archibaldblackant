import { EventEmitter } from "events";
import { ProductDatabase } from "./product-db";
import { BrowserPool } from "./browser-pool";
import { logger } from "./logger";
import { SyncCheckpointManager } from "./sync-checkpoint";
import { config } from "./config";

export interface SyncProgress {
  status: "idle" | "syncing" | "completed" | "error";
  currentPage: number;
  totalPages: number;
  productsProcessed: number;
  message: string;
  error?: string;
}

export class ProductSyncService extends EventEmitter {
  private static instance: ProductSyncService;
  private db: ProductDatabase;
  private browserPool: BrowserPool;
  private checkpointManager: SyncCheckpointManager;
  private syncInProgress = false;
  private shouldStop = false;
  private paused = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private progress: SyncProgress = {
    status: "idle",
    currentPage: 0,
    totalPages: 0,
    productsProcessed: 0,
    message: "Nessuna sincronizzazione in corso",
  };

  private constructor() {
    super();
    this.db = ProductDatabase.getInstance();
    this.browserPool = BrowserPool.getInstance();
    this.checkpointManager = SyncCheckpointManager.getInstance();
  }

  static getInstance(): ProductSyncService {
    if (!ProductSyncService.instance) {
      ProductSyncService.instance = new ProductSyncService();
    }
    return ProductSyncService.instance;
  }

  /**
   * Pause the sync service (for PriorityManager)
   * Waits for current sync operation to complete if running
   */
  async pause(): Promise<void> {
    logger.info("[ProductSyncService] Pause requested");
    this.paused = true;

    // If sync is currently running, wait for it to complete
    if (this.syncInProgress) {
      logger.info("[ProductSyncService] Waiting for current sync to complete...");
      // Wait for sync to finish by polling syncInProgress
      while (this.syncInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info("[ProductSyncService] Paused");
  }

  /**
   * Resume the sync service (for PriorityManager)
   */
  resume(): void {
    logger.info("[ProductSyncService] Resume requested");
    this.paused = false;
    logger.info("[ProductSyncService] Resumed");
  }

  /**
   * Avvia il sync automatico in background
   * @param intervalMinutes Intervallo in minuti tra i sync
   * @param skipInitialSync Se true, non esegue il sync iniziale immediato
   */
  startAutoSync(
    intervalMinutes: number = 30,
    skipInitialSync: boolean = false,
  ): void {
    logger.info(
      `Avvio auto-sync ogni ${intervalMinutes} minuti${skipInitialSync ? " (senza sync iniziale)" : ""}`,
    );

    if (!skipInitialSync) {
      // Sync iniziale al boot (dopo 5 secondi)
      setTimeout(() => {
        this.syncProducts().catch((error) => {
          logger.error("Errore sync iniziale", { error });
        });
      }, 5000);
    }

    // Sync periodico
    this.syncInterval = setInterval(
      () => {
        this.syncProducts().catch((error) => {
          logger.error("Errore sync periodico", { error });
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
      logger.info("Auto-sync fermato");
    }
  }

  /**
   * Richiede interruzione del sync in corso
   */
  requestStop(): void {
    if (this.syncInProgress) {
      logger.warn("⚠️ Richiesta interruzione sync prodotti in corso");
      this.shouldStop = true;
    }
  }

  /**
   * Ottiene lo stato corrente del sync
   */
  getProgress(): SyncProgress {
    return { ...this.progress };
  }

  /**
   * Sincronizza i prodotti da Archibald
   */
  async syncProducts(): Promise<void> {
    if (this.syncInProgress) {
      logger.warn("Sync già in corso, skip");
      return;
    }

    // Check if paused (for PriorityManager)
    if (this.paused) {
      logger.info("[ProductSyncService] Sync skipped - service is paused");
      return;
    }

    // Resetta flag di stop
    this.shouldStop = false;

    // Verifica se la sync è stata completata di recente
    const resumePoint = this.checkpointManager.getResumePoint("products");
    if (resumePoint === -1) {
      logger.info("⏭️ Sync prodotti recente, skip");
      this.updateProgress({
        status: "completed",
        currentPage: 0,
        totalPages: 0,
        productsProcessed: this.db.getProductCount(),
        message: "Sincronizzazione recente, skip",
      });
      return;
    }

    this.syncInProgress = true;

    // Segna sync come iniziata
    this.checkpointManager.startSync("products");

    this.updateProgress({
      status: "syncing",
      currentPage: 0,
      totalPages: 0,
      productsProcessed: 0,
      message:
        resumePoint > 1
          ? `Ripresa da pagina ${resumePoint}...`
          : "Avvio sincronizzazione...",
    });

    let bot = null;

    try {
      logger.info(
        resumePoint > 1
          ? `🔄 Ripresa sincronizzazione prodotti da pagina ${resumePoint}`
          : "Inizio sincronizzazione prodotti da Archibald",
      );

      bot = await this.browserPool.acquire();

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

      logger.info("Navigazione alla pagina prodotti...");
      await bot.page.goto(`${config.archibald.url}/INVENTTABLE_ListView/`, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      await bot.page!.waitForSelector("table", { timeout: 10000 });

      // Aspetta che la pagina sia completamente caricata (no "Loading...")
      logger.info("Attesa caricamento completo pagina...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Pulisci qualsiasi filtro di ricerca applicato
      logger.info("Pulizia filtri di ricerca...");
      await bot.page!.evaluate(() => {
        // Trova la casella di ricerca e svuotala
        const searchInputs = Array.from(
          document.querySelectorAll('input[type="text"]'),
        );
        for (const input of searchInputs) {
          const inputEl = input as HTMLInputElement;
          if (inputEl.value && inputEl.value.trim().length > 0) {
            inputEl.value = "";
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
            inputEl.dispatchEvent(new Event("change", { bubbles: true }));
            inputEl.dispatchEvent(
              new KeyboardEvent("keyup", { key: "Enter", bubbles: true }),
            );
          }
        }
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await bot.page!.waitForSelector("table tbody tr", { timeout: 10000 });

      // Forza il reset alla pagina 1 (il browser pool potrebbe essere rimasto su un'altra pagina)
      logger.info("Verifica posizionamento su pagina 1...");
      const isOnFirstPage = await bot.page!.evaluate(() => {
        // Cerca il pulsante "1" della paginazione
        const pageButtons = Array.from(
          document.querySelectorAll("a, span, td"),
        ).filter((el) => {
          const text = (el as Element).textContent?.trim();
          return text === "1";
        });

        // Verifica se siamo già sulla pagina 1 (il pulsante 1 è disabilitato/selezionato)
        for (const btn of pageButtons) {
          const el = btn as HTMLElement;
          if (
            el.classList.contains("dxp-current") ||
            el.classList.contains("dxp-disabled") ||
            el.style.fontWeight === "bold" ||
            el.getAttribute("aria-selected") === "true"
          ) {
            return true;
          }
        }
        return false;
      });

      if (!isOnFirstPage) {
        logger.warn("⚠ Non siamo sulla pagina 1, torno all'inizio...");
        await bot.page!.evaluate(() => {
          // Clicca sul pulsante pagina 1
          const pageButtons = Array.from(
            document.querySelectorAll("a, span, td"),
          ).filter((el) => {
            const text = (el as Element).textContent?.trim();
            return text === "1";
          });

          for (const btn of pageButtons) {
            const el = btn as HTMLElement;
            if (
              !el.classList.contains("dxp-disabled") &&
              !el.classList.contains("dxp-current")
            ) {
              const clickable = el.tagName === "A" ? el : el.closest("a");
              if (clickable) {
                (clickable as HTMLElement).click();
                return;
              }
            }
          }
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await bot.page!.waitForSelector("table tbody tr", { timeout: 10000 });
      }

      // Helper function per impostare il filtro (prodotti non hanno filtro, skip)
      const ensureAllProductsFilter = async () => {
        logger.info(
          "Verifica selezione filtro prodotti (skipped - no filter needed)...",
        );
        return;
      };

      // Imposta il filtro la prima volta
      await ensureAllProductsFilter();

      const allProducts: Array<{
        id: string;
        name: string;
        vatNumber?: string;
        email?: string;
      }> = [];

      // Determina il numero totale di pagine dal pager
      const totalPagesInfo = await bot.page!.evaluate(() => {
        // Strategia: Cerca tutti i link di paginazione NEL PAGER AREA e prendi il numero più alto
        // DevExpress mostra i numeri come: "1 2 3 ... 225 226 227"
        // Il pager è tipicamente in un contenitore con classe dxp- o nell'ultimo div/table della pagina

        // Trova il pager - di solito è vicino al bottom della pagina
        const pagerContainers = Array.from(
          document.querySelectorAll(
            '.dxp-summary, .dxp-lead, .dxpSummary, [class*="Pager"], [class*="pager"]',
          ),
        );

        let maxPageNumber = 0;

        // Se troviamo un contenitore del pager, cerca solo lì dentro
        if (pagerContainers.length > 0) {
          for (const container of pagerContainers) {
            const links = Array.from(container.querySelectorAll("a, span, td"));
            for (const link of links) {
              const text = (link as Element).textContent?.trim() || "";
              // Deve essere solo un numero tra 1 e 1000 (numeri di pagina realistici)
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
            text: `Pagine rilevate dal pager: ${maxPageNumber}`,
            totalPages: maxPageNumber,
          };
        }

        return {
          found: false,
          text: "Pager non trovato, uso fallback",
          totalPages: 300,
        };
      });

      const totalPages = totalPagesInfo.found ? totalPagesInfo.totalPages : 300;
      logger.info(
        `Totale pagine rilevate: ${totalPages}${totalPagesInfo.found ? ` (da pager: "${totalPagesInfo.text}")` : " (fallback)"}`,
      );

      logger.info("Inizio estrazione prodotti con paginazione diretta...");

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
          productsProcessed: allProducts.length,
          message: `Estrazione pagina ${currentPage} di ${totalPages}...`,
        });

        await bot.page!.waitForSelector("table tbody tr", { timeout: 10000 });
        await new Promise((resolve) => setTimeout(resolve, 500));

        const pageProducts = await bot.page!.evaluate(() => {
          // Cerca la tabella principale dei dati (DevExpress GridView)
          // Prova prima con i selettori specifici DevExpress
          let dataTable =
            document.querySelector(".dxgvControl") ||
            document.querySelector('table[id*="GridView"]');

          // Se non trova nulla, cerca la tabella più grande (più righe)
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
            return [];
          }

          const rows = Array.from(
            dataTable.querySelectorAll("tbody tr"),
          ) as Element[];
          const results: Array<{
            id: string;
            name: string;
            description?: string;
            groupCode?: string;
            searchName?: string;
            priceUnit?: string;
            productGroupId?: string;
            productGroupDescription?: string;
            packageContent?: string;
            minQty?: number;
            multipleQty?: number;
            maxQty?: number;
          }> = [];

          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll("td")) as Element[];
            if (cells.length < 5) continue;

            // Colonne: 0=checkbox, 1=edit, 2=ID ARTICOLO, 3=NOME, 4=DESCRIZIONE, 5=GRUPPO, 6=IMMAGINE...
            const productId = (cells[2] as Element)?.textContent?.trim() || "";
            const productName =
              (cells[3] as Element)?.textContent?.trim() || "";
            const description =
              (cells[4] as Element)?.textContent?.trim() || "";
            const groupCode = (cells[5] as Element)?.textContent?.trim() || "";
            // cells[6] è IMMAGINE (skip)
            const packageContent =
              (cells[7] as Element)?.textContent?.trim() || "";
            const searchName = (cells[8] as Element)?.textContent?.trim() || "";
            const priceUnit = (cells[9] as Element)?.textContent?.trim() || "";
            const productGroupId =
              (cells[10] as Element)?.textContent?.trim() || "";
            const productGroupDescription =
              (cells[11] as Element)?.textContent?.trim() || "";
            const minQtyStr = (cells[12] as Element)?.textContent?.trim() || "";
            const multipleQtyStr =
              (cells[13] as Element)?.textContent?.trim() || "";
            const maxQtyStr = (cells[14] as Element)?.textContent?.trim() || "";

            // Parse quantità
            const minQty = minQtyStr
              ? parseFloat(minQtyStr.replace(",", "."))
              : undefined;
            const multipleQty = multipleQtyStr
              ? parseFloat(multipleQtyStr.replace(",", "."))
              : undefined;
            const maxQty = maxQtyStr
              ? parseFloat(maxQtyStr.replace(",", "."))
              : undefined;

            // Filtra garbage data (HTML, loading indicators, righe non valide)
            // Validazione: productId e productName devono essere presenti
            if (
              !productId ||
              !productName ||
              productId.includes("Loading") ||
              productId.includes("<") ||
              productName.includes("Loading") ||
              productName.length < 2
            ) {
              continue;
            }

            results.push({
              id: productId,
              name: productName,
              description: description || undefined,
              groupCode: groupCode || undefined,
              searchName: searchName || undefined,
              priceUnit: priceUnit || undefined,
              productGroupId: productGroupId || undefined,
              productGroupDescription: productGroupDescription || undefined,
              packageContent: packageContent || undefined,
              minQty,
              multipleQty,
              maxQty,
            });
          }

          return results;
        });

        logger.info(
          `Estratti ${pageProducts.length} prodotti dalla pagina ${currentPage}`,
        );
        if (pageProducts.length > 0 && currentPage === 1) {
          logger.debug(`Primo prodotto estratto:`, pageProducts[0]);
        }
        allProducts.push(...pageProducts);

        // Scrivi immediatamente nel database (aggiornamento progressivo)
        if (pageProducts.length > 0) {
          const batchStats = this.db.upsertProducts(pageProducts);
          logger.info(
            `Pagina ${currentPage} salvata nel DB: ${batchStats.inserted} nuovi, ${batchStats.updated} aggiornati${batchStats.unchanged > 0 ? `, ${batchStats.unchanged} invariati` : ""}`,
          );
        }

        // Salva checkpoint dopo ogni pagina completata
        this.checkpointManager.updateProgress(
          "products",
          currentPage,
          totalPages,
          allProducts.length,
        );

        // Se non ci sono prodotti in questa pagina, probabilmente siamo oltre l'ultima pagina
        if (pageProducts.length === 0) {
          logger.info(
            `Pagina ${currentPage} vuota, interrompo la sincronizzazione`,
          );
          break;
        }

        // Naviga alla prossima pagina (se non è l'ultima)
        if (currentPage < totalPages) {
          const nextPageNum = currentPage + 1;
          const navigated = await bot.page!.evaluate((targetPage: number) => {
            // Strategia 1: Cerca un link diretto al numero di pagina
            const pageLinks = Array.from(
              document.querySelectorAll("a, span, td"),
            ).filter((el) => {
              const text = (el as Element).textContent?.trim();
              return text === targetPage.toString();
            });

            for (const link of pageLinks) {
              // Verifica che sia un elemento cliccabile del pager
              const el = link as HTMLElement;
              const isInPager =
                el.closest(".dxp-summary") ||
                el.closest('[class*="pager"]') ||
                el.closest('[class*="Pager"]');
              if (isInPager && el.tagName === "A") {
                el.click();
                return { success: true, method: "direct-link" };
              }
            }

            // Strategia 2: Cerca un input field per inserire il numero di pagina
            const pageInputs = Array.from(
              document.querySelectorAll('input[type="text"]'),
            ).filter((inp) => {
              const el = inp as HTMLInputElement;
              // DevExpress spesso usa input con valori numerici per la navigazione
              return el.value && /^\d+$/.test(el.value);
            });

            for (const inp of pageInputs) {
              const inputEl = inp as HTMLInputElement;
              const isInPager =
                inputEl.closest(".dxp-summary") ||
                inputEl.closest('[class*="pager"]') ||
                inputEl.closest('[class*="Pager"]');
              if (isInPager) {
                inputEl.value = targetPage.toString();
                inputEl.dispatchEvent(new Event("input", { bubbles: true }));
                inputEl.dispatchEvent(new Event("change", { bubbles: true }));
                inputEl.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
                );
                inputEl.dispatchEvent(
                  new KeyboardEvent("keyup", { key: "Enter", bubbles: true }),
                );
                return { success: true, method: "input-field" };
              }
            }

            // Strategia 3: Usa il pulsante Next
            const nextButtons = [
              document.querySelector('img[alt="Next"]'),
              document.querySelector('img[title="Next"]'),
              document.querySelector('a[title="Next"]'),
              document.querySelector('button[title="Next"]'),
              document.querySelector('.dxp-button.dxp-bi[title*="Next"]'),
              document.querySelector(".dxWeb_pNext_XafTheme"),
            ];

            for (const btn of nextButtons) {
              if (
                btn &&
                !(btn as HTMLElement).classList?.contains("dxp-disabled")
              ) {
                const clickable =
                  btn.tagName === "A" || btn.tagName === "BUTTON"
                    ? btn
                    : btn.closest("a") ||
                      btn.closest("button") ||
                      btn.parentElement;

                if (clickable) {
                  (clickable as HTMLElement).click();
                  return { success: true, method: "next-button" };
                }
              }
            }

            return { success: false, method: "none" };
          }, nextPageNum);

          if (!navigated.success) {
            logger.warn(
              `Impossibile navigare alla pagina ${nextPageNum}, interrompo`,
            );
            break;
          }

          logger.debug(
            `Navigato a pagina ${nextPageNum} usando ${(navigated as any).method}`,
          );
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await bot.page!.waitForSelector("table tbody tr", { timeout: 10000 });

          // Re-imposta il filtro dopo ogni paginazione
          await ensureAllProductsFilter();
        }
      }

      // Controlla se il sync è stato interrotto
      if (this.shouldStop) {
        logger.warn("⚠️ Sync prodotti interrotto su richiesta");

        // Salva checkpoint alla pagina corrente per permettere ripresa
        const lastProcessedPage =
          allProducts.length > 0
            ? Math.ceil(allProducts.length / 20)
            : resumePoint;
        this.checkpointManager.saveCheckpoint("products", lastProcessedPage);

        this.updateProgress({
          status: "idle",
          currentPage: lastProcessedPage,
          totalPages,
          productsProcessed: allProducts.length,
          message:
            "Sincronizzazione interrotta (riprenderà dall'ultima pagina)",
        });

        this.shouldStop = false;
        return;
      }

      logger.info(
        `Estrazione completata: ${allProducts.length} prodotti da ${totalPages} pagine`,
      );

      // I dati sono già nel database (scritti progressivamente)
      // Ora gestiamo solo i prodotti eliminati da Archibald
      this.updateProgress({
        status: "syncing",
        currentPage: totalPages,
        totalPages: totalPages,
        productsProcessed: allProducts.length,
        message: "Pulizia prodotti eliminati...",
      });

      const currentIds = allProducts.map((c) => c.id);
      const deletedIds = this.db.findDeletedProducts(currentIds);

      let deletedCount = 0;
      if (deletedIds.length > 0) {
        deletedCount = this.db.deleteProducts(deletedIds);
        logger.info(
          `Eliminati ${deletedCount} prodotti non più presenti in Archibald`,
        );
      }

      const totalInDb = this.db.getProductCount();

      // Segna checkpoint come completato
      this.checkpointManager.completeSync("products", totalPages, totalInDb);

      this.updateProgress({
        status: "completed",
        currentPage: totalPages,
        totalPages: totalPages,
        productsProcessed: totalInDb,
        message: `Sincronizzazione completata: ${totalInDb} prodotti disponibili${deletedCount > 0 ? ` (${deletedCount} eliminati)` : ""}`,
      });

      logger.info("Sincronizzazione completata con successo", {
        totalInDb,
        deletedCount,
      });
    } catch (error) {
      logger.error("Errore durante la sincronizzazione", { error });

      // Segna checkpoint come fallito (mantiene lastSuccessfulPage per ripresa)
      this.checkpointManager.failSync(
        "products",
        error instanceof Error ? error.message : "Errore sconosciuto",
        this.progress.currentPage,
      );

      this.updateProgress({
        status: "error",
        currentPage: this.progress.currentPage,
        totalPages: this.progress.totalPages,
        productsProcessed: this.progress.productsProcessed,
        message: "Errore durante la sincronizzazione",
        error: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    } finally {
      if (bot) {
        await this.browserPool.release(bot, false); // Chiudi browser dopo sync
      }
      this.syncInProgress = false;
    }
  }

  private updateProgress(progress: SyncProgress): void {
    this.progress = { ...progress };
    this.emit("progress", this.progress);
    logger.debug("Sync progress", this.progress);
  }
}
