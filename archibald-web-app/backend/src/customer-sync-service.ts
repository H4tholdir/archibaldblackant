import { EventEmitter } from "events";
import { CustomerDatabase } from "./customer-db";
import { BrowserPool } from "./browser-pool";
import { logger } from "./logger";
import { SyncCheckpointManager } from "./sync-checkpoint";
import { config } from "./config";

export interface SyncProgress {
  status: "idle" | "syncing" | "completed" | "error";
  currentPage: number;
  totalPages: number;
  customersProcessed: number;
  message: string;
  error?: string;
}

export class CustomerSyncService extends EventEmitter {
  private static instance: CustomerSyncService;
  private db: CustomerDatabase;
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
    customersProcessed: 0,
    message: "Nessuna sincronizzazione in corso",
  };

  private constructor() {
    super();
    this.db = CustomerDatabase.getInstance();
    this.browserPool = BrowserPool.getInstance();
    this.checkpointManager = SyncCheckpointManager.getInstance();
  }

  static getInstance(): CustomerSyncService {
    if (!CustomerSyncService.instance) {
      CustomerSyncService.instance = new CustomerSyncService();
    }
    return CustomerSyncService.instance;
  }

  /**
   * Pause the sync service (for PriorityManager)
   * Waits for current sync operation to complete if running
   */
  async pause(): Promise<void> {
    logger.info("[CustomerSyncService] Pause requested");
    this.paused = true;

    // If sync is currently running, wait for it to complete
    if (this.syncInProgress) {
      logger.info(
        "[CustomerSyncService] Waiting for current sync to complete...",
      );
      // Wait for sync to finish by polling syncInProgress
      while (this.syncInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info("[CustomerSyncService] Paused");
  }

  /**
   * Resume the sync service (for PriorityManager)
   */
  resume(): void {
    logger.info("[CustomerSyncService] Resume requested");
    this.paused = false;
    logger.info("[CustomerSyncService] Resumed");
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
        this.syncCustomers().catch((error) => {
          logger.error("Errore sync iniziale", { error });
        });
      }, 5000);
    }

    // Sync periodico
    this.syncInterval = setInterval(
      () => {
        this.syncCustomers().catch((error) => {
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
      logger.warn("⚠️ Richiesta interruzione sync clienti in corso");
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
   * Sincronizza i clienti da Archibald
   */
  async syncCustomers(): Promise<void> {
    if (this.syncInProgress) {
      logger.warn("Sync già in corso, skip");
      return;
    }

    // Check if paused (for PriorityManager)
    if (this.paused) {
      logger.info("[CustomerSyncService] Sync skipped - service is paused");
      return;
    }

    // Resetta flag di stop
    this.shouldStop = false;

    // Verifica se la sync è stata completata di recente
    const resumePoint = this.checkpointManager.getResumePoint("customers");
    if (resumePoint === -1) {
      logger.info("⏭️ Sync clienti recente, skip");
      this.updateProgress({
        status: "completed",
        currentPage: 0,
        totalPages: 0,
        customersProcessed: this.db.getCustomerCount(),
        message: "Sincronizzazione recente, skip",
      });
      return;
    }

    this.syncInProgress = true;

    // Segna sync come iniziata
    this.checkpointManager.startSync("customers");

    this.updateProgress({
      status: "syncing",
      currentPage: 0,
      totalPages: 0,
      customersProcessed: 0,
      message:
        resumePoint > 1
          ? `Ripresa da pagina ${resumePoint}...`
          : "Avvio sincronizzazione...",
    });

    // Use legacy ArchibaldBot for system sync operations
    const { ArchibaldBot } = await import("./archibald-bot");
    let bot: InstanceType<typeof ArchibaldBot> | null = null;

    try {
      logger.info(
        resumePoint > 1
          ? `🔄 Ripresa sincronizzazione clienti da pagina ${resumePoint}`
          : "Inizio sincronizzazione clienti da Archibald",
      );

      bot = new ArchibaldBot(); // No userId = legacy mode
      await bot.initialize();
      await bot.login(); // Uses config credentials

      // Verifica che la pagina esista e sia ancora valida
      if (!bot.page) {
        throw new Error("Browser page is null");
      }

      // Store reference for TypeScript flow analysis
      const page = bot.page;

      try {
        const url = page.url();
        logger.info(`Pagina corrente: ${url}`);
      } catch (error) {
        logger.warn("Frame detached, ricarico la pagina...");
        await page.goto(config.archibald.url, {
          waitUntil: "networkidle2",
          timeout: 60000,
        });
      }

      logger.info("Navigazione alla pagina clienti...");
      await page.goto(`${config.archibald.url}/CUSTTABLE_ListView_Agent/`, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      await page.waitForSelector("table", { timeout: 10000 });

      // Aspetta che la pagina sia completamente caricata (no "Loading...")
      logger.info("Attesa caricamento completo pagina...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Pulisci qualsiasi filtro di ricerca applicato
      logger.info("Pulizia filtri di ricerca...");
      await page.evaluate(() => {
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
      await page.waitForSelector("table tbody tr", { timeout: 10000 });

      // Forza il reset alla pagina 1 (il browser pool potrebbe essere rimasto su un'altra pagina)
      logger.info("Verifica posizionamento su pagina 1...");
      const isOnFirstPage = await page.evaluate(() => {
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
        await page.evaluate(() => {
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
        await page.waitForSelector("table tbody tr", { timeout: 10000 });
      }

      // Helper function per impostare il filtro "Tutti i clienti"
      const ensureAllCustomersFilter = async () => {
        logger.info('Verifica selezione filtro "Tutti i clienti"...');
        try {
          // Prima, trova tutti i dropdown e logga le informazioni per debugging
          const dropdownsInfo = await page.evaluate(() => {
            // Cerca tutti gli elementi che hanno ID che finisce con "_Cb" (ComboBox DevExpress)
            const allElements = Array.from(
              document.querySelectorAll('[id$="_Cb"]'),
            );
            const allTds = Array.from(document.querySelectorAll("td"));

            // Filtra i td che contengono testi rilevanti
            const relevantTds = allTds
              .filter((td) => {
                const text =
                  (td as Element).textContent?.trim().toLowerCase() || "";
                return (
                  text.includes("clienti") ||
                  text.includes("liberi") ||
                  text.includes("esclusi")
                );
              })
              .slice(0, 10);

            return {
              comboboxIds: allElements.map((el) => ({
                id: (el as Element).id,
                tagName: (el as Element).tagName,
                className: (el as Element).className,
              })),
              relevantTds: relevantTds.map((td) => ({
                id: (td as Element).id,
                className: (td as Element).className,
                text: (td as Element).textContent?.trim().substring(0, 150),
              })),
            };
          });

          logger.debug("Controlli trovati nella pagina", dropdownsInfo);

          const filterDropdownSelected = await page.evaluate(() => {
            // Cerca tutti gli input che hanno ID che finisce con "_Cb_I" (ComboBox Input DevExpress)
            const allInputs = Array.from(
              document.querySelectorAll('input[id$="_Cb_I"]'),
            );

            // Collect debug info for ITCNT inputs
            const debugInfo: Array<{
              id: string;
              value: string;
              type: string;
            }> = [];
            for (const inp of allInputs) {
              const inputEl = inp as HTMLInputElement;
              if (inputEl.id.includes("ITCNT")) {
                debugInfo.push({
                  id: inputEl.id,
                  value: inputEl.value,
                  type: inputEl.type,
                });
              }
            }

            for (const input of allInputs) {
              const inputElement = input as HTMLInputElement;
              const value = inputElement.value?.trim() || "";
              const id = inputElement.id || "";

              // ESCLUDI ITCNT5 (è il dropdown navigazione, non il filtro!)
              // Cerca SOLO ITCNT8 che è il filtro clienti
              if (id.includes("ITCNT8")) {
                // Trova il campo nascosto _VI (sostituisci solo l'ultima occorrenza di _I con _VI)
                const hiddenFieldId = id.replace(/_I$/, "_VI");
                const hiddenField = document.getElementById(
                  hiddenFieldId,
                ) as HTMLInputElement;

                // Controlla se "Tutti i clienti" è già selezionato
                // NOTA: Anche se appare corretto, DevExpress potrebbe averlo resettato internamente
                if (
                  value.toLowerCase() === "tutti i clienti" &&
                  hiddenField &&
                  hiddenField.value === "xaf_xaf_a0All_Customers"
                ) {
                  // Verifica DOPPIA: sia input che hidden field devono essere corretti
                  return {
                    found: true,
                    changed: false,
                    selector: `input#${id}`,
                    optionText: value,
                  };
                } else {
                  // Non è "Tutti i clienti" O uno dei due campi è errato
                  // Imposta il campo nascosto direttamente
                  return {
                    found: true,
                    changed: false,
                    needsSelection: true,
                    currentValue: value,
                    hiddenValue: hiddenField ? hiddenField.value : "NOT_FOUND",
                    selector: `input#${id}`,
                    hiddenFieldId: hiddenFieldId,
                    optionText: null,
                  };
                }
              }
            }

            return {
              found: false,
              changed: false,
              selector: null,
              optionText: null,
              needsSelection: false,
            };
          });

          if (filterDropdownSelected.found) {
            if ((filterDropdownSelected as any).needsSelection) {
              logger.info(
                `Filtro trovato con valore input="${(filterDropdownSelected as any).currentValue}", hidden="${(filterDropdownSelected as any).hiddenValue}" - imposto "Tutti i clienti"...`,
              );

              // Strategia DevExpress: imposta il campo nascosto _VI e l'input, poi triggera callback
              try {
                const result = await page.evaluate(() => {
                  // Debug: trova TUTTI gli input e campi nascosti
                  const allInputs = Array.from(
                    document.querySelectorAll("input"),
                  );
                  const debugInfo = allInputs
                    .filter(
                      (inp) =>
                        (inp as HTMLInputElement).id?.includes("ITCNT") ||
                        (inp as HTMLInputElement).id?.includes("Cb"),
                    )
                    .map((inp) => ({
                      id: (inp as HTMLInputElement).id,
                      type: (inp as HTMLInputElement).type,
                      value: (inp as HTMLInputElement).value?.substring(0, 50),
                    }));

                  // Trova l'input con ID che finisce in "_Cb_I" E contiene "clienti" (non "tutti i clienti")
                  const inputs = Array.from(
                    document.querySelectorAll('input[id$="_Cb_I"]'),
                  );

                  for (const input of inputs) {
                    const inputElement = input as HTMLInputElement;
                    const value = inputElement.value?.trim() || "";
                    const id = inputElement.id || "";

                    // Cerca SOLO ITCNT8 (filtro clienti), NON ITCNT5 (nav)
                    if (id.includes("ITCNT8")) {
                      // Trova il campo nascosto _VI associato (sostituisci solo l'ultima occorrenza)
                      const baseId = inputElement.id.replace(/_I$/, "_VI");
                      const hiddenField = document.getElementById(
                        baseId,
                      ) as HTMLInputElement;

                      if (hiddenField && inputElement) {
                        // Imposta "Tutti i clienti" con il valore esatto dal HAR
                        hiddenField.value = "xaf_xaf_a0All_Customers";
                        inputElement.value = "Tutti i clienti";

                        // Triggera gli eventi DevExpress
                        inputElement.dispatchEvent(
                          new Event("input", { bubbles: true }),
                        );
                        inputElement.dispatchEvent(
                          new Event("change", { bubbles: true }),
                        );
                        inputElement.dispatchEvent(
                          new Event("blur", { bubbles: true }),
                        );

                        // Triggera anche keyup per sicurezza
                        inputElement.dispatchEvent(
                          new KeyboardEvent("keyup", { bubbles: true }),
                        );

                        return {
                          success: true,
                          method: "hidden-field",
                          inputId: inputElement.id,
                          hiddenId: baseId,
                          hiddenValue: "xaf_xaf_a0All_Customers",
                          previousValue: value,
                        };
                      }

                      return {
                        success: false,
                        error: `Hidden field or input not found: baseId=${baseId}, hiddenFound=${!!hiddenField}`,
                        debugInfo,
                      };
                    }
                  }

                  return { success: false, method: "hidden-field", debugInfo };
                });

                if (result.success) {
                  logger.info(
                    `✓ Filtro "Tutti i clienti" impostato via campo nascosto`,
                    {
                      inputId: (result as any).inputId,
                      hiddenValue: (result as any).hiddenValue,
                    },
                  );
                  await new Promise((resolve) => setTimeout(resolve, 2500));
                  await page.waitForSelector("table tbody tr", {
                    timeout: 10000,
                  });
                } else {
                  logger.warn("⚠ Impossibile trovare campo nascosto _VI", {
                    debugInfo: (result as any).debugInfo,
                  });
                }
              } catch (error) {
                logger.warn("⚠ Errore impostazione filtro via campo nascosto", {
                  error,
                });
              }
            } else if ((filterDropdownSelected as any).changed) {
              logger.info(
                `✓ Filtro "${filterDropdownSelected.optionText}" selezionato (era diverso, ora aggiornato usando ${filterDropdownSelected.selector})`,
              );
              // Attendi che la pagina si aggiorni dopo il cambio filtro
              await new Promise((resolve) => setTimeout(resolve, 2000));
              await page.waitForSelector("table tbody tr", {
                timeout: 10000,
              });
            } else {
              logger.info(
                `✓ Filtro "${filterDropdownSelected.optionText}" GIÀ selezionato - procedo senza modifiche`,
              );
            }
          } else {
            logger.warn(
              "⚠ Impossibile trovare il dropdown filtro clienti, procedo comunque...",
            );
          }
        } catch (error) {
          logger.warn(
            "⚠ Errore durante la verifica del filtro, procedo comunque...",
            { error },
          );
        }
      };

      // Imposta il filtro la prima volta
      await ensureAllCustomersFilter();

      // Imposta sort descending su colonna ID per processare clienti più recenti per primi
      logger.info(
        "Verifica ordinamento ID descending per priorità clienti recenti...",
      );
      const sortResult = await page.evaluate(() => {
        // Cerca l'header della colonna "ID" nella tabella
        const allCells = Array.from(document.querySelectorAll("td, th"));
        let idHeaderCell: HTMLElement | null = null;

        for (const cell of allCells) {
          const text = (cell as HTMLElement).textContent?.trim();
          if (text === "ID") {
            idHeaderCell = cell as HTMLElement;
            break;
          }
        }

        if (!idHeaderCell) {
          return {
            found: false,
            error: "Colonna ID non trovata",
          };
        }

        // Verifica lo stato corrente del sort cercando le immagini sort
        const sortUpImg = idHeaderCell.querySelector(
          'img[class*="gvHeaderSortUp"]',
        );
        const sortDownImg = idHeaderCell.querySelector(
          'img[class*="gvHeaderSortDown"]',
        );

        let currentSort: "none" | "ascending" | "descending" = "none";
        if (sortDownImg) {
          currentSort = "descending";
        } else if (sortUpImg) {
          currentSort = "ascending";
        }

        // Se già descending, non fare nulla
        if (currentSort === "descending") {
          return {
            found: true,
            currentSort: "descending",
            action: "none",
            message: "Sort già impostato su descending",
          };
        }

        // Calcola quanti click servono
        let clicksNeeded = 0;
        if (currentSort === "none") {
          clicksNeeded = 2; // none → ascending → descending
        } else if (currentSort === "ascending") {
          clicksNeeded = 1; // ascending → descending
        }

        // Esegui i click necessari
        for (let i = 0; i < clicksNeeded; i++) {
          // Cerca il link cliccabile nell'header (di solito un <a> dentro il <td>)
          const clickableLink = idHeaderCell.querySelector("a");
          if (clickableLink) {
            (clickableLink as HTMLElement).click();
          } else {
            // Fallback: click diretto sulla cella
            idHeaderCell.click();
          }
        }

        return {
          found: true,
          currentSort,
          action: `clicked ${clicksNeeded} times`,
          clicksNeeded,
          message: `Sort impostato da ${currentSort} a descending`,
        };
      });

      if (sortResult.found) {
        logger.info(`✓ Sort ID: ${sortResult.message}`, {
          action: sortResult.action,
          clicksNeeded: sortResult.clicksNeeded,
        });

        // Se abbiamo fatto dei click, attendi che la pagina si aggiorni
        if (
          sortResult.clicksNeeded &&
          (sortResult.clicksNeeded as number) > 0
        ) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
          await page.waitForSelector("table tbody tr", { timeout: 10000 });
          logger.info("✓ Pagina aggiornata con sort descending");
        }
      } else {
        logger.warn(
          "⚠ Impossibile impostare sort descending su colonna ID, procedo comunque...",
          { error: sortResult.error },
        );
      }

      const allCustomers: Array<{
        customerProfile: string;
        internalId?: string;
        name: string;
        vatNumber?: string;
        fiscalCode?: string;
        sdi?: string;
        pec?: string;
        phone?: string;
        mobile?: string;
        url?: string;
        attentionTo?: string;
        street?: string;
        logisticsAddress?: string;
        postalCode?: string;
        city?: string;
        customerType?: string;
        type?: string;
        deliveryTerms?: string;
        description?: string;
        lastOrderDate?: string;
        actualOrderCount?: number;
        previousOrderCount1?: number;
        previousSales1?: number;
        previousOrderCount2?: number;
        previousSales2?: number;
        externalAccountNumber?: string;
        ourAccountNumber?: string;
      }> = [];
      let currentPage = resumePoint; // Inizia da resumePoint invece di 1
      let hasMorePages = true;

      // Se riprendiamo da una pagina > 1, naviga direttamente lì
      if (resumePoint > 1) {
        logger.info(`Navigazione a pagina ${resumePoint}...`);
        // Implementazione navigazione diretta alla pagina
        // Per ora, iteriamo fino alla pagina desiderata
        for (let pageNum = 1; pageNum < resumePoint; pageNum++) {
          const clicked = await page.evaluate(() => {
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
                  return true;
                }
              }
            }
            return false;
          });

          if (!clicked) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await page.waitForSelector("table tbody tr", { timeout: 10000 });
        }
        logger.info(`✓ Posizionato su pagina ${resumePoint}`);
      }

      logger.info("Inizio estrazione clienti con paginazione...");

      while (hasMorePages && !this.shouldStop) {
        this.updateProgress({
          status: "syncing",
          currentPage,
          totalPages: currentPage, // aggiorniamo man mano
          customersProcessed: allCustomers.length,
          message: `Estrazione pagina ${currentPage}...`,
        });

        await page.waitForSelector("table tbody tr", { timeout: 10000 });
        await new Promise((resolve) => setTimeout(resolve, 500));

        const pageCustomers = await page.evaluate(() => {
          // Find all TR elements with ID containing "DXDataRow" (actual data rows)
          const allTr = Array.from(document.querySelectorAll("tr"));
          const dataRows = allTr.filter((tr) => {
            const id = (tr as HTMLElement).id || "";
            return id.includes("DXDataRow");
          });

          const results: Array<{
            customerProfile: string;
            internalId?: string;
            name: string;
            vatNumber?: string;
            fiscalCode?: string;
            sdi?: string;
            pec?: string;
            phone?: string;
            mobile?: string;
            url?: string;
            attentionTo?: string;
            street?: string;
            logisticsAddress?: string;
            postalCode?: string;
            city?: string;
            customerType?: string;
            type?: string;
            deliveryTerms?: string;
            description?: string;
            lastOrderDate?: string;
            actualOrderCount?: number;
            previousOrderCount1?: number;
            previousSales1?: number;
            previousOrderCount2?: number;
            previousSales2?: number;
            externalAccountNumber?: string;
            ourAccountNumber?: string;
          }> = [];

          for (const row of dataRows) {
            const cells = Array.from(row.querySelectorAll("td")) as Element[];
            if (cells.length < 20) continue; // Skip rows with too few cells

            // Extract data from 25-cell structure (cells[0-1] are UI, cells[2-24] are data)
            const internalId = cells[2]?.textContent?.trim() || "";
            const customerProfileRaw = cells[3]?.textContent?.trim() || "";
            // If customerProfile is empty, use internalId as fallback
            const customerProfile = customerProfileRaw || internalId;
            const name = cells[4]?.textContent?.trim() || "";
            const vatNumber = cells[5]?.textContent?.trim() || undefined;
            const pec = cells[6]?.textContent?.trim() || undefined;
            const sdi = cells[7]?.textContent?.trim() || undefined;
            const fiscalCode = cells[8]?.textContent?.trim() || undefined;
            const deliveryTerms = cells[9]?.textContent?.trim() || undefined;
            const street = cells[10]?.textContent?.trim() || undefined;
            const postalCode = cells[11]?.textContent?.trim() || undefined;
            const city = cells[12]?.textContent?.trim() || undefined;
            const phone = cells[13]?.textContent?.trim() || undefined;
            const mobile = cells[14]?.textContent?.trim() || undefined;
            const url = cells[15]?.textContent?.trim() || undefined;
            const attentionTo = cells[16]?.textContent?.trim() || undefined;
            const lastOrderDate = cells[17]?.textContent?.trim() || undefined;
            const actualOrderCountRaw = cells[18]?.textContent?.trim() || "0";
            // Cell 19 appears to be a sales amount, skipping for now
            const previousOrderCount1Raw =
              cells[20]?.textContent?.trim() || "0";
            const previousSales1Raw = cells[21]?.textContent?.trim() || "0";
            const previousOrderCount2Raw =
              cells[22]?.textContent?.trim() || "0";
            const previousSales2Raw = cells[23]?.textContent?.trim() || "0";
            const type = cells[24]?.textContent?.trim() || undefined;

            // Fields not visible in 25-cell structure (would need horizontal scrolling)
            const logisticsAddress = undefined;
            const customerType = undefined;
            const description = undefined;
            const externalAccountNumber = undefined;
            const ourAccountNumber = undefined;

            // Parse numeric fields
            const actualOrderCount =
              parseInt(actualOrderCountRaw.replace(/[^\d]/g, "")) || 0;
            const previousOrderCount1 =
              parseInt(previousOrderCount1Raw.replace(/[^\d]/g, "")) || 0;
            const previousSales1 =
              parseFloat(
                previousSales1Raw
                  .replace(/[^\d.,]/g, "")
                  .replace(/\./g, "")
                  .replace(",", "."),
              ) || 0.0;
            const previousOrderCount2 =
              parseInt(previousOrderCount2Raw.replace(/[^\d]/g, "")) || 0;
            const previousSales2 =
              parseFloat(
                previousSales2Raw
                  .replace(/[^\d.,]/g, "")
                  .replace(/\./g, "")
                  .replace(",", "."),
              ) || 0.0;

            // Validation: customerProfile must be numeric, name must be > 3 chars
            if (
              !customerProfile ||
              customerProfile.includes("Loading") ||
              customerProfile.includes("<") ||
              !name ||
              name.length < 3 ||
              !/\d/.test(customerProfile)
            ) {
              continue;
            }

            results.push({
              customerProfile,
              internalId: internalId || undefined,
              name,
              vatNumber,
              fiscalCode,
              sdi,
              pec,
              phone,
              mobile,
              url,
              attentionTo,
              street,
              logisticsAddress,
              postalCode,
              city,
              customerType,
              type,
              deliveryTerms,
              description,
              lastOrderDate,
              actualOrderCount,
              previousOrderCount1,
              previousSales1,
              previousOrderCount2,
              previousSales2,
              externalAccountNumber,
              ourAccountNumber,
            });
          }

          return results;
        });

        logger.info(
          `Estratti ${pageCustomers.length} clienti dalla pagina ${currentPage}`,
        );
        allCustomers.push(...pageCustomers);

        // Scrivi immediatamente nel database (aggiornamento progressivo)
        if (pageCustomers.length > 0) {
          const batchStats = this.db.upsertCustomers(pageCustomers);
          logger.info(
            `Pagina ${currentPage} salvata nel DB: ${batchStats.inserted} nuovi, ${batchStats.updated} aggiornati${batchStats.unchanged > 0 ? `, ${batchStats.unchanged} invariati` : ""}`,
          );
        }

        // Salva checkpoint dopo ogni pagina completata
        this.checkpointManager.updateProgress(
          "customers",
          currentPage,
          currentPage, // totalPages è sconosciuto fino alla fine
          allCustomers.length,
        );

        hasMorePages = await page.evaluate(() => {
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
              !(btn as HTMLElement).classList?.contains("dxp-disabled") &&
              !(btn.parentElement as HTMLElement)?.classList?.contains(
                "dxp-disabled",
              )
            ) {
              return true;
            }
          }

          return false;
        });

        if (hasMorePages) {
          const clicked = await page.evaluate(() => {
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
                  return true;
                }
              }
            }
            return false;
          });

          if (!clicked) {
            logger.warn("Pulsante Next trovato ma non cliccabile");
            hasMorePages = false;
          } else {
            // Attendi il caricamento della pagina successiva
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await page.waitForSelector("table tbody tr", {
              timeout: 10000,
            });

            // CRITICAL: Re-imposta il filtro "Tutti i clienti" dopo ogni paginazione
            // DevExpress può resettare il filtro durante la navigazione
            logger.info(
              `🔄 Re-impostazione filtro "Tutti i clienti" dopo paginazione a pagina ${currentPage + 1}...`,
            );
            await ensureAllCustomersFilter();

            // Attendi che il filtro venga applicato
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await page.waitForSelector("table tbody tr", {
              timeout: 10000,
            });

            currentPage++;
          }
        }
      }

      // Controlla se il sync è stato interrotto
      if (this.shouldStop) {
        logger.warn("⚠️ Sync clienti interrotto su richiesta");

        // Salva checkpoint alla pagina corrente per permettere ripresa
        this.checkpointManager.updateProgress(
          "customers",
          currentPage,
          currentPage,
          allCustomers.length,
        );

        this.updateProgress({
          status: "idle",
          currentPage,
          totalPages: currentPage,
          customersProcessed: allCustomers.length,
          message:
            "Sincronizzazione interrotta (riprenderà dall'ultima pagina)",
        });

        this.shouldStop = false;
        return;
      }

      logger.info(
        `Estrazione completata: ${allCustomers.length} clienti da ${currentPage} pagine`,
      );

      // I dati sono già nel database (scritti progressivamente)
      // Ora gestiamo solo i clienti eliminati da Archibald
      this.updateProgress({
        status: "syncing",
        currentPage,
        totalPages: currentPage,
        customersProcessed: allCustomers.length,
        message: "Pulizia clienti eliminati...",
      });

      const currentIds = allCustomers.map((c) => c.customerProfile);
      const deletedIds = this.db.findDeletedCustomers(currentIds);

      let deletedCount = 0;
      if (deletedIds.length > 0) {
        deletedCount = this.db.deleteCustomers(deletedIds);
        logger.info(
          `Eliminati ${deletedCount} clienti non più presenti in Archibald`,
        );
      }

      const totalInDb = this.db.getCustomerCount();

      // Segna checkpoint come completato
      this.checkpointManager.completeSync("customers", currentPage, totalInDb);

      this.updateProgress({
        status: "completed",
        currentPage,
        totalPages: currentPage,
        customersProcessed: totalInDb,
        message: `Sincronizzazione completata: ${totalInDb} clienti disponibili${deletedCount > 0 ? ` (${deletedCount} eliminati)` : ""}`,
      });

      logger.info("Sincronizzazione completata con successo", {
        totalInDb,
        deletedCount,
      });
    } catch (error) {
      logger.error("Errore durante la sincronizzazione", { error });

      // Segna checkpoint come fallito (mantiene lastSuccessfulPage per ripresa)
      this.checkpointManager.failSync(
        "customers",
        error instanceof Error ? error.message : "Errore sconosciuto",
        this.progress.currentPage,
      );

      this.updateProgress({
        status: "error",
        currentPage: this.progress.currentPage,
        totalPages: this.progress.totalPages,
        customersProcessed: this.progress.customersProcessed,
        message: "Errore durante la sincronizzazione",
        error: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    } finally {
      if (bot) {
        // Close bot after sync (legacy mode)
        await bot.close();
      }
      this.syncInProgress = false;
    }
  }

  private updateProgress(progress: SyncProgress): void {
    this.progress = { ...progress };
    this.emit("progress", this.progress);
    logger.debug("Sync progress", this.progress);
  }

  /**
   * Get quick hash of first 10 customers for delta sync change detection
   * Used by SyncScheduler to detect if customer data has changed
   */
  async getQuickHash(): Promise<string> {
    const crypto = require("crypto");

    // Get first 10 customers from DB (sorted by customerProfile)
    const customers = this.db.getAllCustomers(10).map((c) => ({
      customerProfile: c.customerProfile,
      name: c.name,
      internalId: c.internalId,
    }));

    const data = JSON.stringify(customers);
    return crypto.createHash("md5").update(data).digest("hex");
  }
}

// Export singleton instance
export const customerSyncService = CustomerSyncService.getInstance();
