import puppeteer, {
  type Browser,
  type ElementHandle,
  type Page,
} from "puppeteer";
import { config } from "./config";
import { logger } from "./logger";
import type { OrderData } from "./types";

export class ArchibaldBot {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private opSeq = 0;
  private lastOpEndNs: bigint | null = null;
  private opRecords: Array<{
    id: number;
    name: string;
    status: "ok" | "error";
    startIso: string;
    endIso: string;
    durationMs: number;
    gapMs: number;
    meta: Record<string, unknown>;
    errorMessage?: string;
  }> = [];

  private async runOp<T>(
    name: string,
    fn: () => Promise<T>,
    meta: Record<string, unknown> = {},
  ): Promise<T> {
    const opId = ++this.opSeq;
    const startIso = new Date().toISOString();
    const startNs = process.hrtime.bigint();
    const gapMs = this.lastOpEndNs
      ? Number(startNs - this.lastOpEndNs) / 1_000_000
      : 0;

    logger.debug(`[OP ${opId} START] ${name}`, { gapMs, ...meta });

    try {
      const result = await fn();
      const endNs = process.hrtime.bigint();
      const durationMs = Number(endNs - startNs) / 1_000_000;
      this.lastOpEndNs = endNs;
      this.opRecords.push({
        id: opId,
        name,
        status: "ok",
        startIso,
        endIso: new Date().toISOString(),
        durationMs,
        gapMs,
        meta,
      });
      logger.debug(`[OP ${opId} END] ${name}`, { durationMs });
      return result;
    } catch (error) {
      const endNs = process.hrtime.bigint();
      const durationMs = Number(endNs - startNs) / 1_000_000;
      this.lastOpEndNs = endNs;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.opRecords.push({
        id: opId,
        name,
        status: "error",
        startIso,
        endIso: new Date().toISOString(),
        durationMs,
        gapMs,
        meta,
        errorMessage,
      });
      logger.error(`[OP ${opId} ERROR] ${name}`, {
        durationMs,
        errorMessage,
      });
      throw error;
    }
  }

  private buildOperationReport(): string {
    const totalDurationMs = this.opRecords.reduce(
      (sum, record) => sum + record.durationMs,
      0,
    );

    const totalGapMs = this.opRecords.reduce(
      (sum, record) => sum + record.gapMs,
      0,
    );

    // Trova le 5 operazioni più lente
    const slowest = [...this.opRecords]
      .filter((r) => r.status === "ok")
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5);

    // Trova i 5 gap più lunghi
    const longestGaps = [...this.opRecords]
      .sort((a, b) => b.gapMs - a.gapMs)
      .slice(0, 5);

    const errors = this.opRecords.filter((record) => record.status === "error");
    const successCount = this.opRecords.filter((r) => r.status === "ok").length;

    const lines: string[] = [];
    lines.push("# 🤖 Archibald Bot Operation Report");
    lines.push("");
    lines.push(`**Generated**: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("## 📊 Summary");
    lines.push("");
    lines.push(`- **Total operations**: ${this.opRecords.length}`);
    lines.push(`- **Successful**: ${successCount}`);
    lines.push(`- **Failed**: ${errors.length}`);
    lines.push(`- **Total duration**: ${(totalDurationMs / 1000).toFixed(2)}s`);
    lines.push(`- **Total gaps**: ${(totalGapMs / 1000).toFixed(2)}s`);
    lines.push(
      `- **Average operation**: ${(totalDurationMs / this.opRecords.length).toFixed(0)}ms`,
    );
    lines.push("");

    if (slowest.length > 0) {
      lines.push("## 🐌 Slowest Operations (Top 5)");
      lines.push("");
      for (let i = 0; i < slowest.length; i++) {
        const op = slowest[i];
        lines.push(
          `${i + 1}. **${op.name}**: ${(op.durationMs / 1000).toFixed(2)}s`,
        );
      }
      lines.push("");
    }

    if (longestGaps.length > 0 && longestGaps[0].gapMs > 100) {
      lines.push("## ⏳ Longest Gaps (Top 5)");
      lines.push("");
      lines.push("*Gaps rappresentano attese inutili tra operazioni*");
      lines.push("");
      for (let i = 0; i < longestGaps.length; i++) {
        const op = longestGaps[i];
        if (op.gapMs > 100) {
          lines.push(
            `${i + 1}. Before **${op.name}**: ${(op.gapMs / 1000).toFixed(2)}s`,
          );
        }
      }
      lines.push("");
    }

    if (errors.length > 0) {
      lines.push("## ❌ Errors");
      lines.push("");
      for (const record of errors) {
        lines.push(`- **[${record.id}] ${record.name}**`);
        lines.push(`  - Error: \`${record.errorMessage ?? "unknown"}\``);
        lines.push(
          `  - Duration before fail: ${(record.durationMs / 1000).toFixed(2)}s`,
        );
      }
      lines.push("");
    }

    lines.push("## 📋 Detailed Timeline");
    lines.push("");
    lines.push(
      "| # | Name | Status | Duration ms | Gap ms | Start | End | Meta |",
    );
    lines.push(
      "| - | ---- | ------ | ----------- | ------ | ----- | --- | ---- |",
    );

    for (const record of this.opRecords) {
      const metaStr = Object.keys(record.meta).length
        ? JSON.stringify(record.meta).replace(/\|/g, "\\|")
        : "";
      const statusEmoji = record.status === "ok" ? "✅" : "❌";
      lines.push(
        `| ${record.id} | ${record.name} | ${statusEmoji} ${record.status} | ${record.durationMs.toFixed(
          1,
        )} | ${record.gapMs.toFixed(1)} | ${record.startIso} | ${
          record.endIso
        } | ${metaStr} |`,
      );
    }

    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("*Generated by Archibald Bot automation system*");

    return lines.join("\n");
  }

  /**
   * Helper method to wait for a specified number of milliseconds
   */
  private async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async writeOperationReport(filePath?: string): Promise<string> {
    const report = this.buildOperationReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fs = await import("fs/promises");
    const path = await import("path");
    const cwd = process.cwd();

    const exists = async (candidate: string): Promise<boolean> => {
      try {
        await fs.access(candidate);
        return true;
      } catch {
        return false;
      }
    };

    let baseLogsDir = path.resolve(cwd, "logs");
    if (await exists(path.resolve(cwd, "backend"))) {
      baseLogsDir = path.resolve(cwd, "backend", "logs");
    }

    const defaultPath = path.join(
      baseLogsDir,
      `operation-report-${timestamp}.md`,
    );
    const targetPath = filePath ?? defaultPath;
    const resolvedPath = path.isAbsolute(targetPath)
      ? targetPath
      : path.resolve(cwd, targetPath);

    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, report, "utf8");
    return resolvedPath;
  }

  async initialize(): Promise<void> {
    logger.info("Inizializzazione browser Puppeteer...");

    this.browser = await this.runOp("browser.launch", async () => {
      return puppeteer.launch({
        headless: config.puppeteer.headless,
        slowMo: config.puppeteer.slowMo,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-web-security",
          "--ignore-certificate-errors",
        ],
        defaultViewport: {
          width: 1280,
          height: 800,
        },
      });
    });

    this.page = await this.runOp("browser.newPage", async () => {
      return this.browser!.newPage();
    });

    // Abilita console logging dal browser per debug
    this.page.on("console", (msg) => {
      const text = msg.text();
      if (text) {
        logger.debug(`[Browser Console] ${text}`);
      }
    });

    // Ignora errori certificato SSL
    await this.runOp("page.setRequestInterception", async () => {
      await this.page!.setRequestInterception(false);
    });

    logger.info("Browser inizializzato con successo");
  }

  async login(): Promise<void> {
    if (!this.page) throw new Error("Browser non inizializzato");

    const loginUrl = `${config.archibald.url}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`;

    logger.info("Tentativo login su Archibald...", {
      loginUrl,
      username: config.archibald.username,
    });

    try {
      // Naviga alla pagina di login
      logger.debug(`Navigazione verso: ${loginUrl}`);

      const response = await this.runOp(
        "login.goto",
        async () => {
          return this.page!.goto(loginUrl, {
            waitUntil: "networkidle2",
            timeout: config.puppeteer.timeout,
          });
        },
        { url: loginUrl },
      );

      if (!response) {
        throw new Error("Nessuna risposta dal server");
      }

      logger.debug(`Pagina caricata con status: ${response.status()}`);

      if (response.status() !== 200) {
        throw new Error(
          `Errore HTTP ${response.status()}: ${response.statusText()}`,
        );
      }

      // Aspetta che la pagina sia completamente caricata
      await this.runOp("login.wait_page", async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      });

      logger.debug("Pagina login caricata, cerco campi username/password...");

      // Cerca i campi di login (DevExpress usa nomi complessi)
      // Dall'analisi HAR sappiamo che il pattern è: Logon$v0_*$MainLayoutEdit$...$dviUserName_Edit

      // Strategia: trova input type=text e type=password visibili
      logger.debug("Cerco campo username...");

      const usernameField = await this.runOp(
        "login.findUsernameField",
        async () =>
          this.page!.evaluate(() => {
            const inputs = Array.from(
              document.querySelectorAll('input[type="text"]'),
            );

            const userInput = inputs.find(
              (input) =>
                input.id.includes("UserName") ||
                input.name.includes("UserName") ||
                input.placeholder?.toLowerCase().includes("account") ||
                input.placeholder?.toLowerCase().includes("username"),
            );

            if (userInput) {
              return (
                (userInput as HTMLInputElement).id ||
                (userInput as HTMLInputElement).name
              );
            }

            // Fallback: prendi il primo input text visibile
            if (inputs.length > 0) {
              return (
                (inputs[0] as HTMLInputElement).id ||
                (inputs[0] as HTMLInputElement).name
              );
            }

            return null;
          }),
      );

      logger.debug("Cerco campo password...");

      const passwordField = await this.runOp(
        "login.findPasswordField",
        async () =>
          this.page!.evaluate(() => {
            const inputs = Array.from(
              document.querySelectorAll('input[type="password"]'),
            );

            if (inputs.length > 0) {
              const pwdField =
                (inputs[0] as HTMLInputElement).id ||
                (inputs[0] as HTMLInputElement).name;
              return pwdField;
            }
            return null;
          }),
      );

      if (!usernameField || !passwordField) {
        // Salva screenshot per debug
        await this.page.screenshot({ path: "logs/login-error.png" });
        logger.error("Screenshot salvato in logs/login-error.png");

        throw new Error("Campi login non trovati nella pagina");
      }

      logger.debug("Campi trovati", { usernameField, passwordField });

      // Compila username (svuota prima eventuali valori esistenti)
      await this.runOp(
        "login.typeUsername",
        async () => {
          const usernameSelector = `#${usernameField}`;
          // Seleziona tutto il testo esistente e sostituiscilo
          await this.page!.click(usernameSelector, { clickCount: 3 });
          await this.page!.keyboard.press("Backspace");
          await this.page!.type(usernameSelector, config.archibald.username, {
            delay: 50,
          });
        },
        { field: usernameField },
      );
      logger.debug("Username inserito");

      // Compila password (svuota prima eventuali valori esistenti)
      await this.runOp(
        "login.typePassword",
        async () => {
          const passwordSelector = `#${passwordField}`;
          // Seleziona tutto il testo esistente e sostituiscilo
          await this.page!.click(passwordSelector, { clickCount: 3 });
          await this.page!.keyboard.press("Backspace");
          await this.page!.type(passwordSelector, config.archibald.password, {
            delay: 50,
          });
        },
        { field: passwordField },
      );
      logger.debug("Password inserita");

      // Cerca e clicca pulsante login
      const loginButtonClicked = await this.runOp(
        "login.clickLoginButton",
        async () =>
          this.page!.evaluate(() => {
            const buttons = Array.from(
              document.querySelectorAll('button, input[type="submit"], a'),
            );
            const loginBtn = buttons.find(
              (btn) =>
                btn.textContent?.toLowerCase().includes("accedi") ||
                btn.textContent?.toLowerCase().includes("login") ||
                (btn as HTMLElement).id?.toLowerCase().includes("login"),
            );
            if (loginBtn) {
              (loginBtn as HTMLElement).click();
              return true;
            }
            return false;
          }),
      );

      if (!loginButtonClicked) {
        // Fallback: premi Enter sul campo password
        await this.runOp("login.submitFallback", async () => {
          await this.page!.keyboard.press("Enter");
        });
      }

      logger.debug("Pulsante login cliccato, attendo redirect...");

      // Attendi redirect dopo login
      await this.runOp("login.waitRedirect", async () => {
        await this.page!.waitForNavigation({
          waitUntil: "networkidle2",
          timeout: config.puppeteer.timeout,
        });
      });

      const currentUrl = this.page.url();

      if (
        currentUrl.includes("Default.aspx") ||
        !currentUrl.includes("Login.aspx")
      ) {
        logger.info("Login riuscito!", { url: currentUrl });
      } else {
        throw new Error("Login fallito: ancora sulla pagina di login");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";
      const errorStack = error instanceof Error ? error.stack : "";

      logger.error("Errore durante login", {
        message: errorMessage,
        stack: errorStack,
        url: this.page?.url(),
      });

      // Salva screenshot anche in caso di altri errori
      try {
        if (this.page) {
          await this.page.screenshot({ path: "logs/login-error-final.png" });
          logger.error(
            "Screenshot errore salvato in logs/login-error-final.png",
          );
        }
      } catch (screenshotError) {
        logger.error("Impossibile salvare screenshot", { screenshotError });
      }

      throw new Error(`Login fallito: ${errorMessage}`);
    }
  }

  async createOrder(orderData: OrderData): Promise<string> {
    if (!this.page) throw new Error("Browser non inizializzato");

    logger.info("🤖 BOT: INIZIO creazione ordine", {
      customerName: orderData.customerName,
      itemsCount: orderData.items.length,
      items: orderData.items.map((item) => ({
        name: item.productName || item.articleCode,
        qty: item.quantity,
      })),
    });

    try {
      // 1. Prima clicca su "Inserimento ordini" nel menu laterale
      await this.runOp("order.menu.inserimento", async () => {
        logger.debug('Cerco voce menu "Inserimento ordini"...');

        // Salva screenshot del menu per debug
        // await this.page.screenshot({
        // path: "logs/menu-dashboard.png",
        // fullPage: true,
        // });

        const menuClicked = await this.page.evaluate(() => {
          // Cerca specificamente nel menu laterale (probabilmente è dentro un div con classe specifica)
          // Prova a cercare in diverse strutture comuni di DevExpress
          const selectors = [
            "a",
            "span",
            "div",
            "td",
            ".dxm-item",
            ".dxm-content", // DevExpress menu classes
            '[role="menuitem"]',
          ];

          const allElements = Array.from(
            document.querySelectorAll(selectors.join(", ")),
          );

          // Cerca l'elemento esatto
          const menuItem = allElements.find((el) => {
            const text = el.textContent?.toLowerCase().trim() || "";
            const isExactMatch = text === "inserimento ordini";
            const isPartialMatch =
              text.includes("inserimento ordini") && text.length < 50;
            return isExactMatch || isPartialMatch;
          });

          if (menuItem) {
            // Prova diversi metodi di click
            (menuItem as HTMLElement).click();

            // Se è un link, prova anche a seguire l'href
            if (menuItem.tagName === "A") {
              const href = (menuItem as HTMLAnchorElement).href;
              if (href && href !== "#") {
                // Link click will be handled automatically
              }
            }

            return true;
          }
          return false;
        });

        if (!menuClicked) {
          logger.warn(
            'Menu "Inserimento ordini" non trovato con evaluate, provo con Puppeteer click',
          );

          // Metodo alternativo: usa Puppeteer per cliccare
          try {
            const menuElements = await this.page.$$("a, span, div, td");

            for (const element of menuElements) {
              const text = await this.page.evaluate(
                (el) => el.textContent?.trim() || "",
                element,
              );

              if (
                text.toLowerCase() === "inserimento ordini" ||
                (text.toLowerCase().includes("inserimento ordini") &&
                  text.length < 50)
              ) {
                logger.debug(`Trovato con Puppeteer: "${text}"`);
                await element.click();
                logger.debug("Click Puppeteer riuscito");
                // Aspetta che carichi la lista ordini e il pulsante "Nuovo" venga renderizzato
                await this.wait(5000);
                break;
              }
            }
          } catch (error) {
            logger.error("Errore nel click Puppeteer", { error });
          }

          // Screenshot dopo tentativo click
          // await this.page.screenshot({
          // path: "logs/menu-clicked.png",
          // fullPage: true,
          // });
        } else {
          logger.debug('Click su menu "Inserimento ordini" riuscito');

          // OTTIMIZZAZIONE: Aspetta dinamicamente che il pulsante "Nuovo" sia visibile
          try {
            await this.page!.waitForFunction(
              () => {
                const allElements = Array.from(
                  document.querySelectorAll("button, a, span, div"),
                );
                const nuovoBtn = allElements.find((el) => {
                  const htmlEl = el as HTMLElement;
                  const text = el.textContent?.toLowerCase().trim() || "";
                  return text === "nuovo" && htmlEl.offsetParent !== null;
                });
                return !!nuovoBtn;
              },
              { timeout: 3000, polling: 200 },
            );
          } catch {
            // Fallback al timeout fisso se la funzione non trova il pulsante
            await this.wait(2000);
          }

          // Screenshot dopo click menu
          // await this.page!.screenshot({
          // path: "logs/menu-clicked.png",
          // fullPage: true,
          // });
        }
      });

      // 2. Clicca sul pulsante "Nuovo"
      await this.runOp("order.click_nuovo", async () => {
        logger.debug('Cerco pulsante "Nuovo"...');

        const nuovoClicked = await this.page!.evaluate(() => {
          const allElements = Array.from(
            document.querySelectorAll("button, a, span, div"),
          );
          const nuovoBtn = allElements.find((el) => {
            const text = el.textContent?.toLowerCase().trim() || "";
            return (
              text === "nuovo" && (el as HTMLElement).offsetParent !== null
            );
          });

          if (nuovoBtn) {
            (nuovoBtn as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (!nuovoClicked) {
          logger.warn(
            'Pulsante "Nuovo" non trovato con evaluate, provo con Puppeteer',
          );

          try {
            const buttons = await this.page!.$$("button, a, span, div");

            for (const button of buttons) {
              const text = await this.page!.evaluate(
                (el) => el.textContent?.trim() || "",
                button,
              );

              if (text.toLowerCase() === "nuovo") {
                logger.debug('Pulsante "Nuovo" trovato con Puppeteer');
                await button.click();
                logger.debug('Click su "Nuovo" riuscito');
                break;
              }
            }
          } catch (error) {
            logger.error("Errore nel click su Nuovo", { error });
          }
        } else {
          logger.debug('Click su pulsante "Nuovo" riuscito');
        }

        // OTTIMIZZAZIONE: Aspetta dinamicamente che il form nuovo ordine sia caricato
        try {
          await this.page!.waitForFunction(
            () => {
              // Aspetta che almeno un input di tipo testo sia visibile (indica form caricato)
              const inputs = document.querySelectorAll('input[type="text"]');
              return Array.from(inputs).some((input) => {
                const htmlInput = input as HTMLElement;
                return htmlInput.offsetParent !== null;
              });
            },
            { timeout: 2000, polling: 200 },
          );
        } catch {
          // Fallback al timeout fisso se la funzione non trova elementi
          await this.wait(2000);
        }

        logger.debug("Form nuovo ordine dovrebbe essere caricato");

        // Screenshot iniziale
        // await this.page.screenshot({
        // path: "logs/order-step1-loaded.png",
        // fullPage: true,
        // });
      });
      logger.debug("Screenshot salvato: order-step1-loaded.png");

      // 2. Attendi caricamento completo DevExpress - OTTIMIZZATO
      await this.runOp("order.wait.devexpress", async () => {
        // STEP 1: Aspetta che il campo cliente sia visibile (dinamico invece di 3s fissi)
        try {
          await this.page!.waitForFunction(
            () => {
              const inputs = Array.from(
                document.querySelectorAll('input[type="text"]'),
              );
              return inputs.some((input) => {
                const htmlInput = input as HTMLInputElement;
                const id = htmlInput.id.toLowerCase();
                return (
                  (id.includes("account") || id.includes("custtable")) &&
                  htmlInput.offsetParent !== null
                );
              });
            },
            { timeout: 2000, polling: 100 },
          );
          // Wait minimo di stabilizzazione
          await this.wait(300);
        } catch {
          // Fallback conservativo
          await this.wait(1500);
        }
      });

      // 3. STEP 6.2: Compila campo "Account esterno" (codice cliente)
      await this.runOp("order.customer.select", async () => {
        logger.debug(
          'Cerco campo "Account esterno" per inserire codice cliente...',
        );

        const allInputs = await this.page.evaluate(() => {
          const inputs = Array.from(
            document.querySelectorAll('input[type="text"]'),
          );
          return inputs.slice(0, 30).map((input) => ({
            id: (input as HTMLInputElement).id,
            name: (input as HTMLInputElement).name,
            placeholder: (input as HTMLInputElement).placeholder,
            value: (input as HTMLInputElement).value,
            visible: (input as HTMLElement).offsetParent !== null,
          }));
        });

        logger.debug("Input text trovati sulla pagina", {
          count: allInputs.length,
          inputs: allInputs,
        });

        // Cerca campo "Account esterno" usando Puppeteer (non evaluate) per usare .type()
        const customerInputSelector = await this.page.evaluate(() => {
          const inputs = Array.from(
            document.querySelectorAll('input[type="text"]'),
          );

          // Cerca per label vicino all'input o per id/name che contiene "account", "cliente", "custtable"
          const customerInput = inputs.find((input) => {
            const id = (input as HTMLInputElement).id.toLowerCase();
            const name = (input as HTMLInputElement).name.toLowerCase();

            // Cerca pattern comuni
            return (
              id.includes("account") ||
              id.includes("cliente") ||
              id.includes("custtable") ||
              id.includes("custaccount") ||
              name.includes("account") ||
              name.includes("cliente") ||
              name.includes("custtable")
            );
          });

          if (customerInput) {
            const fieldId = (customerInput as HTMLInputElement).id;
            return "#" + fieldId;
          }

          return null;
        });

        if (!customerInputSelector) {
          logger.warn('Campo "Account esterno" non trovato');
          // await this.page.screenshot({
          // path: "logs/order-step2-no-customer-field.png",
          // fullPage: true,
          // });
          throw new Error("Campo cliente non trovato");
        }

        logger.debug(
          `Campo "Account esterno" trovato: ${customerInputSelector}`,
        );

        // Usa il nome cliente invece dell'ID
        const customerQuery =
          orderData.customerName?.trim() || orderData.customerId?.trim();

        if (!customerQuery) {
          throw new Error("Nome o codice cliente non fornito");
        }

        // Apri il dropdown a destra del campo cliente
        logger.debug('Cerco dropdown a destra del campo "Account esterno"...');

        const customerInputId = customerInputSelector.startsWith("#")
          ? customerInputSelector.slice(1)
          : customerInputSelector;
        const customerBaseId = customerInputId.endsWith("_I")
          ? customerInputId.slice(0, -2)
          : customerInputId;

        const dropdownSelectors = [
          `#${customerBaseId}_B-1`,
          `#${customerBaseId}_B-1Img`,
          `#${customerBaseId}_B`,
          `#${customerBaseId}_DDD`,
          `#${customerBaseId}_DropDown`,
        ];

        let dropdownClicked = false;

        for (const selector of dropdownSelectors) {
          const handle = await this.page.$(selector);
          if (!handle) continue;
          const box = await handle.boundingBox();
          if (!box) continue;
          await handle.click();
          dropdownClicked = true;
          break;
        }

        if (!dropdownClicked) {
          const [fallbackHandle] = await this.page.$x(
            `//*[@id="${customerInputId}"]/following::*[contains(@id,"_B-1") or contains(@id,"_DDD")][1]`,
          );
          if (fallbackHandle && (await fallbackHandle.boundingBox())) {
            await fallbackHandle.click();
            dropdownClicked = true;
          }
        }

        if (!dropdownClicked) {
          // await this.page.screenshot({
          // path: "logs/order-step2-no-customer-dropdown.png",
          // fullPage: true,
          // });
          throw new Error("Dropdown cliente non trovato");
        }

        logger.debug("Dropdown cliente cliccato, attendo popup...");

        // USA TIMEOUT ADATTIVO per dropdown cliente
        const searchInputSelectors = [
          `#${customerBaseId}_DDD_gv_DXSE_I`,
          'input[placeholder*="enter text to search" i]',
        ];

        let searchInput = null;
        let foundSelector: string | null = "";

        try {
          // STEP 1b: Aspetta dropdown cliente (ottimizzato a 800ms da 1500ms)
          const result = await this.page!.waitForFunction(
            (selectors: string[]) => {
              for (const sel of selectors) {
                const input = document.querySelector(
                  sel,
                ) as HTMLInputElement | null;
                if (
                  input &&
                  input.offsetParent !== null &&
                  !input.disabled &&
                  !input.readOnly
                ) {
                  return sel;
                }
              }
              return null;
            },
            { timeout: 800, polling: 50 }, // Ottimizzato da 1500ms
            searchInputSelectors,
          );

          foundSelector = (await result.jsonValue()) as string | null;

          if (foundSelector) {
            searchInput = await this.page!.$(foundSelector);
          }
        } catch (error) {
          // Fallback: prova selector per selector
          for (const selector of searchInputSelectors) {
            const input = await this.page!.$(selector);
            if (input) {
              const isVisible = await input.evaluate(
                (el) => (el as HTMLElement).offsetParent !== null,
              );
              if (isVisible) {
                searchInput = input;
                foundSelector = selector;
                break;
              }
            }
          }
        }

        // await this.page!.screenshot({
        // path: "logs/order-step2-dropdown-opened.png",
        // fullPage: true,
        // });

        if (!searchInput) {
          // await this.page.screenshot({
          // path: "logs/order-step2-no-search-input.png",
          // fullPage: true,
          // });
          throw new Error(
            'Barra di ricerca "Enter text to search" non trovata',
          );
        }

        // OTTIMIZZAZIONE ULTRA: Incolla direttamente senza click/backspace (più veloce!)
        await this.page!.evaluate(
          (selector, value) => {
            const input = document.querySelector(selector) as HTMLInputElement;
            if (input) {
              input.value = value;
              input.focus();
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
            }
          },
          foundSelector,
          customerQuery,
        );

        await this.page!.keyboard.press("Enter");

        // STEP 2: Aspetta risultati clienti (timeout ottimizzato)
        await this.page!.waitForSelector('tr[class*="dxgvDataRow"]', {
          visible: true,
          timeout: 1500, // Ottimizzato da 3000ms
        });

        const rows = await this.page!.$$('tr[class*="dxgvDataRow"]');

        if (rows.length > 0) {
          // FIX: Clicca sulla prima cella <td> invece che sulla riga
          const firstCell = await rows[0].$("td");
          const clickTarget = firstCell || rows[0];

          try {
            await clickTarget.click();
            logger.debug("Cliente selezionato dalla griglia risultati");
          } catch (error: unknown) {
            // Fallback: click JavaScript
            await clickTarget.evaluate((el) => (el as HTMLElement).click());
            logger.debug("Cliente selezionato via JavaScript click");
          }
        } else {
          logger.warn("Nessuna riga cliente trovata dopo la ricerca");
        }

        logger.info(`Ricerca cliente avviata con: ${customerQuery}`);

        // OTTIMIZZAZIONE: Aspetta che il popup si chiuda invece di timeout fisso
        await this.page!.waitForFunction(
          (baseId: string) => {
            const popup = document.querySelector(
              `#${baseId}_DDD`,
            ) as HTMLElement | null;
            return (
              !popup ||
              popup.style.display === "none" ||
              popup.offsetParent === null
            );
          },
          { timeout: 1500, polling: 100 },
          customerBaseId,
        );

        // OTTIMIZZAZIONE: Ridotto da 1000ms a 300ms per stabilizzazione dati cliente
        await this.wait(300);

        // await this.page.screenshot({
        // path: "logs/order-step2-customer-filled.png",
        // fullPage: true,
        // });
        logger.debug("Screenshot salvato: customer-filled.png");
      });

      // 4. STEP 6.3: Inserimento articoli (ciclo per ogni articolo)
      logger.info(`Inizio inserimento di ${orderData.items.length} articoli`);

      // OTTIMIZZAZIONE: Aspetta che la griglia articoli sia visibile invece di 2000ms fissi
      await this.runOp("order.wait.items_grid", async () => {
        try {
          await this.page!.waitForSelector('[id*="dviSALESLINEs"]', {
            visible: true,
            timeout: 3000,
          });
          await this.wait(200);
        } catch {
          // Fallback
          await this.wait(1000);
        }
      });

      for (let i = 0; i < orderData.items.length; i++) {
        const item = orderData.items[i];
        const itemDisplay = item.productName || item.articleCode;
        logger.info(
          `Articolo ${i + 1}/${orderData.items.length}: ${itemDisplay}`,
        );

        // 4.1: Click sul pulsante + per aggiungere nuovo articolo
        await this.runOp(`order.item.${i}.add_row`, async () => {
          logger.debug(
            "Cerco pulsante + diretto per SALESLINE usando ID specifico...",
          );

          // await this.page.screenshot({
          // path: `logs/order-step3-before-add-item-${i}.png`,
          // fullPage: true,
          // });

          // APPROCCIO DIRETTO: Cerca il pulsante "New" per aggiungere articoli
          const plusButtonClicked = await this.page.evaluate(() => {
            // Strategia 1: Cerca img con title="New" e id che contiene "SALESLINE" e "DXCBtn"
            const newButtonImages = Array.from(
              document.querySelectorAll<HTMLImageElement>(
                'img[title="New"], img[alt="New"]',
              ),
            ).filter((el) => {
              const visible = el.offsetParent !== null;
              const hasSaleslineInId =
                el.id.includes("SALESLINE") || el.id.includes("SalesLine");
              // FIXED: Accetta DXCBtn con qualsiasi numero (DXCBtn0Img, DXCBtn1Img, ecc.)
              const hasDXCBtn =
                el.id.includes("DXCBtn") && el.id.includes("Img");
              return visible && hasSaleslineInId && hasDXCBtn;
            });

            if (newButtonImages.length > 0) {
              const btn = newButtonImages[0];
              btn.click();
              return true;
            }

            // Strategia 2: Cerca qualsiasi DXCBtn nella griglia SALESLINE
            // Cerca direttamente tutti i pulsanti DXCBtn nella sezione SALESLINE
            const allDXCButtons = Array.from(
              document.querySelectorAll<HTMLImageElement>(
                'img[id*="SALESLINE"][id*="DXCBtn"][id*="Img"]',
              ),
            ).filter((img) => {
              const visible = img.offsetParent !== null;
              const isNew = img.title === "New" || img.alt === "New";
              return visible && isNew;
            });

            if (allDXCButtons.length > 0) {
              allDXCButtons[0].click();
              return true;
            }

            return false;
          });

          if (!plusButtonClicked) {
            // await this.page.screenshot({
            // path: `logs/order-error-no-plus-button.png`,
            // fullPage: true,
            // });
            throw new Error(
              "Pulsante + per aggiungere articolo non trovato (SALESLINE)",
            );
          }

          logger.debug("Pulsante New cliccato, attendo apertura nuova riga...");

          // OTTIMIZZAZIONE: Aspetta che appaia la nuova riga editnew invece di 2000ms fissi
          try {
            await this.page!.waitForFunction(
              (itemIndex: number) => {
                const editRows = document.querySelectorAll('tr[id*="editnew"]');
                return editRows.length >= itemIndex + 1;
              },
              { timeout: 3000, polling: 100 },
              i,
            );
            // Breve attesa per stabilizzazione DOM
            await this.wait(300);
          } catch {
            // Fallback al timeout ridotto
            await this.wait(800);
          }

          // await this.page.screenshot({
          // path: `logs/order-step4-after-plus-${i}.png`,
          // fullPage: true,
          // });
        });

        // 4.2: Apri dropdown articolo e cerca nel popup
        let inventtableInputId = "";
        let inventtableBaseId = "";
        let inventtableInput = null;
        await this.runOp(`order.item.${i}.article.find_input`, async () => {
          logger.debug(
            "Cerco campo INVENTTABLE per aprire dropdown articolo...",
          );

          // OTTIMIZZAZIONE: Usa evaluate() per trovare il campo in JS nativo (molto più veloce!)
          const fieldInfo = await this.page!.evaluate(() => {
            // Cerca nella riga editnew più recente
            const editRows = Array.from(
              document.querySelectorAll(
                '[id*="dviSALESLINEs"] tr[id*="editnew"]',
              ),
            );

            // Ordina per ID numerico (l'ultima riga ha numero più alto)
            editRows.sort((a, b) => {
              const aEl = a as HTMLElement;
              const bEl = b as HTMLElement;
              const aNum = parseInt(
                (aEl.id.match(/editnew_(\d+)/) || [])[1] || "0",
              );
              const bNum = parseInt(
                (bEl.id.match(/editnew_(\d+)/) || [])[1] || "0",
              );
              return bNum - aNum; // Ordine decrescente
            });

            // Cerca INVENTTABLE nella prima riga (la più recente)
            for (const row of editRows) {
              const inputs = Array.from(
                (row as HTMLElement).querySelectorAll(
                  'input[id*="INVENTTABLE_Edit"]',
                ),
              );

              for (const input of inputs) {
                const inp = input as HTMLInputElement;
                // Salta campi nascosti o di ricerca interna
                if (inp.id.includes("DXSE") || inp.offsetParent === null)
                  continue;

                // Trovato!
                return {
                  id: inp.id,
                  found: true,
                };
              }
            }

            // Fallback: cerca ovunque
            const allInputs = Array.from(
              document.querySelectorAll('input[id*="INVENTTABLE_Edit"]'),
            );

            for (const input of allInputs) {
              const inp = input as any;
              if (inp.id.includes("DXSE") || inp.offsetParent === null)
                continue;
              if (inp.id.toLowerCase().includes("salesline")) {
                return { id: inp.id, found: true };
              }
            }

            return { id: "", found: false };
          });

          if (!fieldInfo.found) {
            throw new Error("Campo INVENTTABLE (Nome articolo) non trovato");
          }

          inventtableInputId = fieldInfo.id;
          inventtableBaseId = inventtableInputId.endsWith("_I")
            ? inventtableInputId.slice(0, -2)
            : inventtableInputId;

          logger.debug(`Campo INVENTTABLE trovato: ${inventtableInputId}`);

          // Ora seleziona e click
          inventtableInput = await this.page!.$(`#${inventtableInputId}`);
          if (!inventtableInput) {
            throw new Error(
              `Campo INVENTTABLE con ID ${inventtableInputId} non trovato nel DOM`,
            );
          }

          await inventtableInput.click();
          await this.wait(200);
        });

        // OTTIMIZZAZIONE: popupContainer viene inizializzato dentro open_dropdown
        let popupContainer = null;
        let searchInput = null;

        await this.runOp(`order.item.${i}.article.open_dropdown`, async () => {
          const dropdownSelectors = [
            `#${inventtableBaseId}_B-1Img`,
            `#${inventtableBaseId}_B-1`,
            `#${inventtableBaseId}_B`,
            `#${inventtableBaseId}_DDD`,
          ];

          const isArticlePopupOpen = async (): Promise<boolean> => {
            const popup = await this.page.$(`#${inventtableBaseId}_DDD`);
            if (popup && (await popup.boundingBox())) return true;

            const genericPopup = await this.page.$(
              '[id*="INVENTTABLE_Edit_DDD"]',
            );
            if (genericPopup && (await genericPopup.boundingBox())) return true;

            const search = await this.page.$(
              'input[id*="INVENTTABLE_Edit_DDD_gv_DXSE_I"], input[placeholder*="Enter text to search"], input[placeholder*="enter text to search"]',
            );
            if (search && (await search.boundingBox())) return true;

            return false;
          };

          let dropdownClicked = false;
          let dropdownMethod: string | null = null;
          const dropdownAttempts: string[] = [];

          const confirmPopup = async (method: string): Promise<boolean> => {
            dropdownAttempts.push(method);
            // OTTIMIZZAZIONE: Ridotto da 600ms a 300ms e usa waitForSelector invece di polling
            try {
              await this.page!.waitForSelector(`#${inventtableBaseId}_DDD`, {
                visible: true,
                timeout: 500,
              });
              dropdownClicked = true;
              dropdownMethod = method;
              return true;
            } catch {
              // Prova con gli altri selettori
              if (await isArticlePopupOpen()) {
                dropdownClicked = true;
                dropdownMethod = method;
                return true;
              }
            }
            return false;
          };

          const directResult = await this.page.evaluate((inputId) => {
            const input = document.getElementById(inputId);
            if (!input) return null;

            const selectors = [
              'td[id*="INVENTTABLE_Edit_B-1"]',
              'img[id*="INVENTTABLE_Edit_B-1Img"]',
              'img[id*="_B-1Img"]',
              'img[id*="_B-1"]',
              ".dxeButtonEditButton",
              'img[alt="▼"]',
            ];

            const containers: Array<Element | null> = [
              document.querySelector('tr[id*="editnew"]'),
              document.querySelector('[id*="dviSALESLINEs"]'),
              input.closest("tr"),
              input.closest("table"),
              input.parentElement,
              document.body,
            ];

            for (const container of containers) {
              if (!container) continue;
              for (const selector of selectors) {
                const candidate = container.querySelector(
                  selector,
                ) as HTMLElement | null;
                if (candidate && candidate.offsetParent !== null) {
                  candidate.scrollIntoView({
                    block: "center",
                    inline: "center",
                  });
                  candidate.click();
                  return candidate.id || selector;
                }
              }
            }

            return null;
          }, inventtableInputId);

          if (directResult) {
            await confirmPopup(`direct:${directResult}`);
          }

          for (const selector of dropdownSelectors) {
            if (dropdownClicked) break;
            const handles = await this.page.$$(selector);
            if (handles.length === 0) continue;
            for (const handle of handles) {
              if (dropdownClicked) break;
              const box = await handle.boundingBox();
              if (!box) continue;
              await handle.click();
              await confirmPopup(`selector:${selector}`);
            }
          }

          /* DISABLED: broad fallback for nearby dropdowns
          if (!dropdownClicked) {
            const fallbackId = await this.page.evaluate(function (inputId) {
              const input = document.getElementById(inputId);
              if (!input) return null;

              let container = input.parentElement;
              for (let i = 0; i < 6 && container; i++) {
                const candidates = Array.from(
                  container.querySelectorAll(
                    '[id*="_B-1"], [id*="_DDD"], .dxeButtonEditButton, [class*="DropDown"], button, span, img',
                  ),
                ).filter((el) => (el as HTMLElement).offsetParent !== null);

                if (candidates.length > 0) {
                  const id = (candidates[0] as HTMLElement).id || null;
                  if (id) return id;
                }

                container = container.parentElement;
              }

              return null;
            }, inventtableInputId);

            if (fallbackId) {
              const fallbackHandle = await this.page.$(`[id="${fallbackId}"]`);
              if (fallbackHandle && (await fallbackHandle.boundingBox())) {
                await fallbackHandle.click();
                await confirmPopup(`fallback:${fallbackId}`);
              }
            }
          }
          */

          /* DISABLED: row-level DOM click fallback
          if (!dropdownClicked) {
            const domResult = await this.page.evaluate(function (inputId) {
              const input = document.getElementById(inputId);
              if (!input) return null;

              const row =
                input.closest("tr") || input.closest("table") || input.parentElement;
              if (!row) return null;

              const selectors = [
                '[id*="INVENTTABLE_Edit_B-1Img"]',
                '[id*="INVENTTABLE_Edit_B-1"]',
                '[id*="INVENTTABLE_Edit_B"]',
                '[id*="INVENTTABLE_Edit_DDD"]',
                ".dxeButtonEditButton",
                'img[alt="▼"]',
              ];

              const candidate = row.querySelector(
                selectors.join(", "),
              ) as HTMLElement | null;

              if (candidate && candidate.offsetParent !== null) {
                candidate.click();
                return candidate.id || selectors.join(",");
              }

              return null;
            }, inventtableInputId);

            if (domResult) {
              await confirmPopup(`dom:${domResult}`);
            }
          }
          */

          /* DISABLED: edit-row specific fallback
          if (!dropdownClicked) {
            const rowResult = await this.page.evaluate(() => {
              const row = document.querySelector('tr[id*="editnew"]');
              if (!row) return null;
              const candidate = row.querySelector(
                'img[id*="INVENTTABLE_Edit_B-1Img"], img[id*="INVENTTABLE_Edit_B-1"], img[alt="▼"]',
              ) as HTMLElement | null;

              if (candidate && candidate.offsetParent !== null) {
                candidate.click();
                return candidate.id || "row-editnew";
              }

              return null;
            });

            if (rowResult) {
              await confirmPopup(`row:${rowResult}`);
            }
          }
          */

          if (!dropdownClicked) {
            const genericDropdowns = await this.page.$$(
              'img[id*="INVENTTABLE_Edit_B-1Img"], img[id*="INVENTTABLE_Edit_B-1"], [id*="INVENTTABLE_Edit_B-1Img"], [id*="INVENTTABLE_Edit_B-1"]',
            );
            for (const dropdown of genericDropdowns) {
              if (dropdownClicked) break;
              const box = await dropdown.boundingBox();
              if (!box) continue;
              await dropdown.click();
              const dropdownId = await dropdown.evaluate(
                (el) => (el as HTMLElement).id || "generic",
              );
              await confirmPopup(`generic:${dropdownId}`);
            }
          }

          /* DISABLED: keyboard/mouse fallbacks
          if (!dropdownClicked) {
            const box = await inventtableInput.boundingBox();
            if (box) {
              const clickX = box.x + box.width - 6;
              const clickY = box.y + box.height / 2;
              await this.page.mouse.click(clickX, clickY);
              await confirmPopup("edge-click");
            }
          }

          if (!dropdownClicked) {
            await this.page.keyboard.down("Alt");
            await this.page.keyboard.press("ArrowDown");
            await this.page.keyboard.up("Alt");
            await confirmPopup("alt-down");
          }

          if (!dropdownClicked) {
            await this.page.keyboard.press("F4");
            await confirmPopup("f4");
          }
          */

          if (!dropdownClicked) {
            // await this.page.screenshot({
            // path: `logs/order-error-no-article-dropdown-${i}.png`,
            // fullPage: true,
            // });
            logger.debug(
              `Tentativi dropdown articolo: ${dropdownAttempts.join(" | ")}`,
            );
            throw new Error("Dropdown articolo non trovato");
          }

          logger.debug(
            `Dropdown articolo cliccato (${dropdownMethod ?? "unknown"}), attendo popup...`,
          );

          // OTTIMIZZAZIONE: Aspetta dinamicamente che il popup search sia caricato invece di 1200ms fissi
          try {
            await this.page!.waitForSelector(
              `#${inventtableBaseId}_DDD_gv_DXSE_I, input[placeholder*="Enter text to search"], input[placeholder*="enter text to search"]`,
              { visible: true, timeout: 2000 },
            );
          } catch {
            // Fallback al timeout ridotto
            await this.wait(500);
          }

          popupContainer =
            (await this.page.$(`#${inventtableBaseId}_DDD`)) ||
            (await this.page.$(`[id*="${inventtableBaseId}_DDD"]`)) ||
            (await this.page.$('[id*="INVENTTABLE_Edit_DDD"]')) ||
            null;
        });

        await this.runOp(`order.item.${i}.article.find_search`, async () => {
          const directSearchSelectors = [
            `#${inventtableBaseId}_DDD_gv_DXSE_I`,
            `[id*="${inventtableBaseId}_DDD_gv_DXSE_I"]`,
            'input[placeholder*="Enter text to search"]',
            'input[placeholder*="enter text to search"]',
            'input[id$="_DXSE_I"]',
            'input[id*="_DXSE_I"]',
          ];

          // Cerca input articolo con timeout ottimizzato
          for (const selector of directSearchSelectors) {
            try {
              await this.page.waitForSelector(selector, {
                visible: true,
                timeout: 800, // Ottimizzato da 3000ms
              });

              const input = await this.page.$(selector);
              if (!input) continue;
              const box = await input.boundingBox();
              if (!box) continue;
              searchInput = input;
              break;
            } catch {
              // Prova il prossimo selettore
            }
          }

          if (!searchInput) {
            const candidates = popupContainer
              ? await popupContainer.$$('input[type="text"]')
              : await this.page.$$('input[type="text"]');

            for (const candidate of candidates) {
              const info = await candidate.evaluate((el) => {
                const input = el as HTMLInputElement;
                const placeholder = (input.placeholder || "").toLowerCase();
                const value = (input.value || "").toLowerCase();
                const id = (input.id || "").toLowerCase();
                const visible = (input as HTMLElement).offsetParent !== null;
                return { placeholder, value, id, visible };
              });

              if (!info.visible) continue;

              const looksLikeSearch =
                info.id.includes("dxse") ||
                info.placeholder.includes("enter text to search") ||
                info.value.includes("enter text to search");

              if (looksLikeSearch) {
                searchInput = candidate;
                break;
              }
            }
          }

          if (!searchInput) {
            // await this.page.screenshot({
            // path: `logs/order-error-no-article-search-${i}.png`,
            // fullPage: true,
            // });
            throw new Error("Barra ricerca articolo non trovata");
          }
        });

        await this.runOp(`order.item.${i}.article.search_type`, async () => {
          if (!searchInput) {
            throw new Error("Barra ricerca articolo non trovata");
          }

          // OTTIMIZZAZIONE ULTRA: Incolla direttamente senza click/backspace (più veloce!)
          const searchQuery = item.productName || item.articleCode;

          // Ottieni il selector dall'elemento
          const inputSelector = await searchInput.evaluate((el) => {
            const htmlEl = el as HTMLInputElement;
            if (htmlEl.id) return `#${htmlEl.id}`;
            if (htmlEl.placeholder)
              return `input[placeholder="${htmlEl.placeholder}"]`;
            return null;
          });

          if (inputSelector) {
            await this.page!.evaluate(
              (selector: string, value: string) => {
                const input = document.querySelector(
                  selector,
                ) as HTMLInputElement | null;
                if (input) {
                  input.value = value;
                  input.focus();
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                  input.dispatchEvent(new Event("change", { bubbles: true }));
                }
              },
              inputSelector,
              searchQuery,
            );
          }

          await this.page!.keyboard.press("Enter");

          // STEP 3: Aspetta risultati articoli (timeout ottimizzato)
          try {
            await this.page!.waitForSelector('tr[class*="dxgvDataRow"]', {
              visible: true,
              timeout: 1000, // Ottimizzato da 3000ms
            });
            // Attesa minima di stabilizzazione
            await this.wait(100);
          } catch {
            // Fallback ridotto
            await this.wait(300);
          }
        });

        await this.runOp(`order.item.${i}.article.select_row`, async () => {
          const rowSelectors = [
            `#${inventtableBaseId}_DDD_gv_DXMainTable tr`,
            `[id*="${inventtableBaseId}_DDD_gv_DXMainTable"] tr`,
            'tr[class*="dxgvDataRow"]',
            "tr[data-idx]",
          ];

          let rows: Array<import("puppeteer").ElementHandle<Element>> = [];
          for (const selector of rowSelectors) {
            const found = popupContainer
              ? await popupContainer.$$(selector)
              : await this.page.$$(selector);
            if (found.length > 0) {
              rows = found;
              break;
            }
          }

          // Usa productName se disponibile, altrimenti articleCode
          const searchQuery = item.productName || item.articleCode;
          const searchQueryNormalized = searchQuery
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");

          let selectedRow = null;
          let matchedText = "";

          for (const row of rows) {
            const text = await row.evaluate((el) =>
              (el.textContent ?? "").toString(),
            );
            const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (normalized.includes(searchQueryNormalized)) {
              selectedRow = row;
              matchedText = text.substring(0, 50);
              break;
            }
          }

          if (!selectedRow && rows.length > 0) {
            selectedRow = rows[0];
            matchedText = await rows[0].evaluate((el) =>
              (el.textContent ?? "").toString().substring(0, 50),
            );
          }

          if (!selectedRow) {
            // await this.page.screenshot({
            // path: `logs/order-error-no-article-row-${i}.png`,
            // fullPage: true,
            // });
            throw new Error("Riga articolo non trovata nel popup");
          }

          logger.debug(`Seleziono riga articolo (match: ${matchedText})`);

          // Scroll into view
          await selectedRow.evaluate((el) =>
            el.scrollIntoView({ block: "center" }),
          );
          await this.wait(100);

          // FIX: Le righe <tr> non sono cliccabili, clicca sulla prima cella <td>
          let clickableElement = selectedRow;
          try {
            const firstCell = await selectedRow.$("td");
            if (firstCell) {
              clickableElement = firstCell;
              logger.debug("Trovata cella <td> cliccabile nella riga");
            }
          } catch {
            logger.debug("Nessuna cella <td> trovata, clicco sulla riga");
          }

          // Click with retry
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              await clickableElement.click();
              logger.debug(`Click riuscito (attempt ${attempt})`);
              break;
            } catch (error: unknown) {
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              logger.warn(`Click attempt ${attempt}/3 failed: ${errorMsg}`);
              if (attempt === 3) {
                // Ultimo tentativo: usa click JavaScript diretto
                try {
                  await clickableElement.evaluate((el) =>
                    (el as HTMLElement).click(),
                  );
                  logger.debug("Click JavaScript riuscito come fallback");
                  break;
                } catch {
                  throw error;
                }
              }
              await this.wait(300);
            }
          }

          // OTTIMIZZAZIONE: Aspetta che il popup si chiuda invece di 800ms fissi
          try {
            await this.page!.waitForFunction(
              (baseId: string) => {
                const popup = document.querySelector(
                  `#${baseId}_DDD`,
                ) as HTMLElement | null;
                return (
                  !popup ||
                  popup.style.display === "none" ||
                  popup.offsetParent === null
                );
              },
              { timeout: 2000, polling: 100 },
              inventtableBaseId,
            );
          } catch {
            // Fallback
            await this.wait(300);
          }

          // await this.page!.screenshot({
          // path: `logs/order-step5-article-selected-${i}.png`,
          // fullPage: true,
          // });
        });

        // CRITICO: Aspetta che DevExpress finisca di caricare l'articolo
        // Il "Loading..." indica che sta rigenerando la riga con nuovo ID
        await this.runOp(`order.item.${i}.wait_loading_complete`, async () => {
          logger.debug(
            "Attendo che DevExpress completi il caricamento articolo...",
          );

          try {
            // Aspetta che il loading indicator sparisca (massimo 10 secondi)
            await this.page.waitForFunction(
              () => {
                const loadingIndicators = Array.from(
                  document.querySelectorAll(
                    '[id*="LPV"], .dxlp, .dxlpLoadingPanel, [id*="Loading"]',
                  ),
                );
                return loadingIndicators.every(
                  (el) =>
                    (el as HTMLElement).style.display === "none" ||
                    (el as HTMLElement).offsetParent === null,
                );
              },
              { timeout: 3000, polling: 100 },
            );

            // Aspetta ulteriore 500ms per sicurezza che DOM sia stabile
            await this.wait(500);
            logger.debug("DevExpress ha completato il caricamento");
          } catch (error) {
            logger.warn(
              "Timeout waiting for loading indicator, continuo comunque...",
            );
          }
        });

        // 4.3: Inserisci quantità articolo prima del salvataggio
        const quantityValue = item.quantity ?? 1;
        let quantityInputId = "";
        let quantityBaseId = "";
        let quantityInput = null;

        await this.runOp(`order.item.${i}.quantity.find_input`, async () => {
          logger.debug(`Imposto quantità articolo: ${quantityValue}`);

          // OTTIMIZZAZIONE: Usa evaluate() per trovare il campo QTYORDERED (molto più veloce!)
          const qtyFieldInfo = await this.page!.evaluate(() => {
            // Cerca nella riga editnew più recente (ordinata per ID decrescente)
            const editRows = Array.from(
              document.querySelectorAll(
                '[id*="dviSALESLINEs"] tr[id*="editnew"]',
              ),
            );

            editRows.sort((a, b) => {
              const aEl = a as HTMLElement;
              const bEl = b as HTMLElement;
              const aNum = parseInt(
                (aEl.id.match(/editnew_(\d+)/) || [])[1] || "0",
              );
              const bNum = parseInt(
                (bEl.id.match(/editnew_(\d+)/) || [])[1] || "0",
              );
              return bNum - aNum;
            });

            // Cerca QTYORDERED nella prima riga (la più recente)
            for (const row of editRows) {
              const inputs = Array.from(
                (row as any).querySelectorAll('input[id*="QTYORDERED_Edit"]'),
              );

              for (const input of inputs) {
                const inp = input as any;
                // Salta campi nascosti e assicurati che finisca con _I
                if (inp.offsetParent === null) continue;
                if (!inp.id.endsWith("_I")) continue;

                return {
                  id: inp.id,
                  found: true,
                };
              }
            }

            // Fallback: cerca ovunque
            const allInputs = Array.from(
              document.querySelectorAll(
                'input[id*="QTYORDERED_Edit"][id$="_I"]',
              ),
            );

            for (const input of allInputs) {
              const inp = input as any;
              if (inp.offsetParent !== null) {
                return { id: inp.id, found: true };
              }
            }

            return { id: "", found: false };
          });

          if (!qtyFieldInfo.found) {
            throw new Error("Campo quantità articolo non trovato");
          }

          quantityInputId = qtyFieldInfo.id;
          quantityBaseId = quantityInputId.endsWith("_I")
            ? quantityInputId.slice(0, -2)
            : quantityInputId;

          logger.debug(`Campo QTYORDERED trovato: ${quantityInputId}`);

          // Ora seleziona il campo
          quantityInput = await this.page!.$(`#${quantityInputId}`);
          if (!quantityInput) {
            throw new Error(
              `Campo QTYORDERED con ID ${quantityInputId} non trovato nel DOM`,
            );
          }
        });

        await this.runOp(`order.item.${i}.quantity.activate_cell`, async () => {
          // IMPORTANTE: Attendi un po' per stabilizzazione DOM dopo loading
          await this.wait(300);

          // Ri-ottieni SEMPRE gli elementi fresh prima del click
          quantityInput = await this.page!.$(`#${quantityInputId}`);

          if (!quantityInput) {
            throw new Error("Campo quantita articolo non trovato");
          }

          // Prova prima con la cella, se fallisce usa l'input diretto
          const quantityCell = await this.page!.$(`#${quantityBaseId}`);

          let clicked = false;
          if (quantityCell) {
            try {
              // Verifica che sia cliccabile
              const box = await quantityCell.boundingBox();
              if (box) {
                await quantityCell.click({ clickCount: 2 });
                await this.wait(200);
                clicked = true;
              }
            } catch (error: unknown) {
              // Se detached o altro errore, fallback all'input
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              logger.debug(
                `Click su quantityCell fallito (${errorMsg}), uso input diretto`,
              );
            }
          }

          // Fallback: click diretto sull'input
          if (!clicked) {
            // Ri-ottieni input fresh
            quantityInput = await this.page!.$(`#${quantityInputId}`);
            if (!quantityInput) {
              throw new Error("Campo quantita articolo non trovato dopo retry");
            }
            await quantityInput.click({ clickCount: 2 });
            await this.wait(200);
          }
        });

        const formatQuantity = (value: number): string => {
          const fixed = Number.isInteger(value)
            ? value.toFixed(0)
            : value.toFixed(2);
          return fixed.replace(".", ",");
        };

        await this.runOp(`order.item.${i}.quantity.type`, async () => {
          if (!quantityInput) {
            throw new Error("Campo quantita articolo non trovato");
          }

          await quantityInput.focus();
          await this.page.keyboard.down("Control");
          await this.page.keyboard.press("A");
          await this.page.keyboard.up("Control");
          await this.page.keyboard.press("Backspace");
          await quantityInput.type(formatQuantity(quantityValue), {
            delay: 30,
          });
          await this.page.keyboard.press("Enter");
          await this.page.keyboard.press("Tab");
        });

        await this.runOp(`order.item.${i}.quantity.verify`, async () => {
          if (!quantityInput) {
            throw new Error("Campo quantita articolo non trovato");
          }

          const readQuantityValue = async (): Promise<string> => {
            return quantityInput.evaluate(
              (el) => (el as HTMLInputElement).value || "",
            );
          };

          await this.wait(600);
          const rawValue = await readQuantityValue();
          logger.debug(`Quantita inserita (raw): "${rawValue}"`);

          const parsedValue = Number(
            rawValue
              .replace(/\s/g, "")
              .replace(/\./g, "")
              .replace(",", ".")
              .replace(/[^\d.]/g, ""),
          );

          if (!Number.isNaN(parsedValue) && parsedValue !== quantityValue) {
            await quantityInput.evaluate((el, value) => {
              const input = el as HTMLInputElement;
              input.value = value;
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
              input.blur();
            }, formatQuantity(quantityValue));

            const devExpressSet = await this.page.evaluate(
              (baseId, numericValue, textValue) => {
                const w = window as any;
                const collection =
                  w.ASPxClientControl?.GetControlCollection?.() ||
                  w.ASPx?.GetControlCollection?.();
                if (!collection) return null;

                const byName =
                  collection.GetByName?.(baseId) ||
                  collection.GetByName?.(baseId.replace(/_/g, "$"));
                const control = byName || collection.GetById?.(baseId);
                if (!control) return null;

                if (control.SetValue) {
                  control.SetValue(numericValue);
                } else if (control.SetText) {
                  control.SetText(textValue);
                }
                if (control.RaiseValueChanged) {
                  control.RaiseValueChanged();
                }
                return true;
              },
              quantityBaseId,
              quantityValue,
              formatQuantity(quantityValue),
            );

            logger.debug(`Quantita set via DevExpress: ${devExpressSet}`);

            await this.page.keyboard.press("Tab");
            await this.wait(600);
            const rawRetry = await readQuantityValue();
            logger.debug(`Quantita dopo retry (raw): "${rawRetry}"`);
          }
        });

        // 4.3.5: STEP 13 - Inserisci sconto se presente nel PWA
        if (item.discount && item.discount > 0) {
          let discountInputId = "";
          let discountBaseId = "";
          let discountInput: ElementHandle<Element> | null = null;

          await this.runOp(`order.item.${i}.discount.find_input`, async () => {
            logger.debug(`Imposto sconto articolo: ${item.discount}%`);

            // Cerca il campo sconto (LINEDISC, DISCOUNT, etc.)
            const discountFieldInfo = await this.page!.evaluate(() => {
              // Cerca nella riga editnew più recente
              const editRows = Array.from(
                document.querySelectorAll(
                  '[id*="dviSALESLINEs"] tr[id*="editnew"]',
                ),
              );

              editRows.sort((a, b) => {
                const aEl = a as HTMLElement;
                const bEl = b as HTMLElement;
                const aNum = parseInt(
                  (aEl.id.match(/editnew_(\d+)/) || [])[1] || "0",
                );
                const bNum = parseInt(
                  (bEl.id.match(/editnew_(\d+)/) || [])[1] || "0",
                );
                return bNum - aNum;
              });

              // Cerca LINEDISC o DISCOUNT nella prima riga (la più recente)
              for (const row of editRows) {
                const inputs = Array.from(
                  (row as any).querySelectorAll(
                    'input[id*="LINEDISC_Edit"], input[id*="DISCOUNT_Edit"], input[id*="Discount_Edit"]',
                  ),
                );

                for (const input of inputs) {
                  const inp = input as any;
                  // Salta campi nascosti
                  if (inp.offsetParent === null) continue;
                  if (!inp.id.endsWith("_I")) continue;

                  return {
                    id: inp.id,
                    found: true,
                  };
                }
              }

              // Fallback: cerca ovunque
              const allInputs = Array.from(
                document.querySelectorAll(
                  'input[id*="LINEDISC_Edit"][id$="_I"], input[id*="DISCOUNT_Edit"][id$="_I"], input[id*="Discount_Edit"][id$="_I"]',
                ),
              );

              for (const input of allInputs) {
                const inp = input as any;
                if (inp.offsetParent !== null) {
                  return { id: inp.id, found: true };
                }
              }

              return { id: "", found: false };
            });

            if (!discountFieldInfo.found) {
              logger.warn("Campo sconto non trovato, salto questo step");
              return; // Non bloccante, continua senza sconto
            }

            discountInputId = discountFieldInfo.id;
            discountBaseId = discountInputId.endsWith("_I")
              ? discountInputId.slice(0, -2)
              : discountInputId;

            logger.debug(`Campo SCONTO trovato: ${discountInputId}`);

            // Seleziona il campo
            discountInput = await this.page!.$(`#${discountInputId}`);
            if (!discountInput) {
              logger.warn(
                `Campo sconto con ID ${discountInputId} non trovato nel DOM`,
              );
              return;
            }
          });

          // Se il campo sconto non è stato trovato, salta
          if (!discountInput) {
            logger.warn("Campo sconto non trovato, continuo senza");
          } else {
            await this.runOp(
              `order.item.${i}.discount.activate_cell`,
              async () => {
                // Attendi stabilizzazione DOM
                await this.wait(300);

                // Ri-ottieni l'elemento fresh
                discountInput = await this.page!.$(`#${discountInputId}`);

                if (!discountInput) {
                  logger.warn("Campo sconto non trovato");
                  return;
                }

                // Prova prima con la cella, con fallback all'input
                const discountCell = await this.page!.$(`#${discountBaseId}`);

                let clicked = false;
                if (discountCell) {
                  try {
                    const box = await discountCell.boundingBox();
                    if (box) {
                      await discountCell.click({ clickCount: 2 });
                      await this.wait(200);
                      clicked = true;
                    }
                  } catch (error: unknown) {
                    const errorMsg =
                      error instanceof Error ? error.message : String(error);
                    logger.debug(
                      `Click su discountCell fallito (${errorMsg}), uso input diretto`,
                    );
                  }
                }

                // Fallback: click diretto
                if (!clicked) {
                  discountInput = await this.page!.$(`#${discountInputId}`);
                  if (discountInput) {
                    await discountInput.click({ clickCount: 2 });
                    await this.wait(200);
                  }
                }
              },
            );

            const formatDiscount = (value: number): string => {
              const fixed = Number.isInteger(value)
                ? value.toFixed(0)
                : value.toFixed(2);
              return fixed.replace(".", ",");
            };

            await this.runOp(`order.item.${i}.discount.type`, async () => {
              if (!discountInput) {
                return;
              }

              await discountInput.focus();
              await this.page.keyboard.down("Control");
              await this.page.keyboard.press("A");
              await this.page.keyboard.up("Control");
              await this.page.keyboard.press("Backspace");
              await discountInput.type(formatDiscount(item.discount!), {
                delay: 30,
              });
              // STEP 13: Premi Invio dopo aver inserito lo sconto
              await this.page.keyboard.press("Enter");
              await this.page.keyboard.press("Tab");

              logger.info(`✅ Sconto inserito: ${item.discount}%`);
            });

            await this.runOp(`order.item.${i}.discount.verify`, async () => {
              // Attendi che il valore si stabilizzi
              await this.wait(600);

              const discountValue = await discountInput!.evaluate(
                (el) => (el as HTMLInputElement).value || "",
              );
              logger.debug(
                `Sconto inserito (valore finale): "${discountValue}"`,
              );
            });
          }
        } else {
          // STEP 14: Se non presente sconto, procedere oltre
          logger.debug("Nessuno sconto da applicare, procedo");
        }

        // 4.4: Click su pulsante "Update" per salvare l'articolo
        // Il pulsante ha title="Update" e id che contiene "DXCBtn0Img"
        await this.runOp(`order.item.${i}.save_article`, async () => {
          logger.debug("Cerco pulsante Update per salvare articolo...");

          const updateButtonClicked = await this.page.evaluate(() => {
            // FIXED: Accetta qualsiasi DXCBtn, non solo DXCBtn0
            const updateButtons = Array.from(
              document.querySelectorAll<HTMLImageElement>(
                'img[title="Update"], img[alt="Update"]',
              ),
            ).filter((el) => {
              const visible = el.offsetParent !== null;
              const hasDXCBtn =
                el.id.includes("DXCBtn") && el.id.includes("Img");
              const hasSalesLine = el.id.includes("SALESLINE");
              return visible && hasDXCBtn && hasSalesLine;
            });

            if (updateButtons.length > 0) {
              const btn = updateButtons[0];
              btn.click();
              return true;
            }

            // Fallback: cerca qualsiasi Update con DXCBtn
            const fallbackButtons = Array.from(
              document.querySelectorAll<HTMLImageElement>(
                'img[title="Update"], img[alt="Update"]',
              ),
            ).filter((el) => {
              const visible = el.offsetParent !== null;
              const hasDXCBtn =
                el.id.includes("DXCBtn") && el.id.includes("Img");
              return visible && hasDXCBtn;
            });

            if (fallbackButtons.length > 0) {
              const btn = fallbackButtons[0];
              btn.click();
              return true;
            }

            return false;
          });

          if (!updateButtonClicked) {
            throw new Error(
              'Pulsante "Update" per salvare articolo non trovato',
            );
          }

          logger.debug("Pulsante Update cliccato, attendo salvataggio...");
          await this.wait(2000);

          // await this.page.screenshot({
          // path: `logs/order-step6-article-saved-${i}.png`,
          // fullPage: true,
          // });

          logger.info(`Articolo ${i + 1}/${orderData.items.length} salvato`);
        });
      }

      logger.info(
        "🤖 BOT: Tutti gli articoli inseriti con successo, ora salvo l'ordine",
      );

      // 5. STEP 6.4: Click su "Salva e chiudi"
      const orderId = await this.runOp("order.save_and_close", async () => {
        logger.info('🤖 BOT: Click su "Salva e chiudi" per salvare l\'ordine');
        logger.debug('Cerco azione "Salva e chiudi"...');

        // await this.page!.screenshot({
        // path: "logs/order-step7-before-final-save.png",
        // fullPage: true,
        // });

        const tryClickSaveAndClose = async (): Promise<string | null> => {
          if (!this.page) return null;

          return this.page.evaluate(() => {
            const candidates = Array.from(
              document.querySelectorAll(
                'button, a, span, div, img, input[type="button"], input[type="submit"]',
              ),
            );

            const directTargets = [
              "salva e chiudi",
              "salvare e chiudere",
              "save and close",
            ];

            for (const el of candidates) {
              if ((el as HTMLElement).offsetParent === null) continue;
              const text = (el.textContent ?? "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");
              const attr = [
                (el as HTMLElement).getAttribute?.("title") ?? "",
                (el as HTMLElement).getAttribute?.("aria-label") ?? "",
                (el as HTMLImageElement).alt ?? "",
              ]
                .join(" ")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");

              if (
                directTargets.some((term) => text === term || attr === term)
              ) {
                (el as HTMLElement).click();
                return "direct-text";
              }
            }

            for (const el of candidates) {
              if ((el as HTMLElement).offsetParent === null) continue;
              const text = (el.textContent ?? "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");
              const attr = [
                (el as HTMLElement).getAttribute?.("title") ?? "",
                (el as HTMLElement).getAttribute?.("aria-label") ?? "",
                (el as HTMLImageElement).alt ?? "",
              ]
                .join(" ")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");
              const hasSave =
                text.includes("salva") ||
                text.includes("salvare") ||
                attr.includes("salva") ||
                attr.includes("salvare") ||
                text.includes("save") ||
                attr.includes("save");
              const hasClose =
                text.includes("chiudi") ||
                attr.includes("chiudi") ||
                text.includes("close") ||
                attr.includes("close");

              if (hasSave && hasClose) {
                (el as HTMLElement).click();
                return "combined-text";
              }
            }

            return null;
          });
        };

        let saveMethod = await tryClickSaveAndClose();

        if (!saveMethod) {
          logger.debug('Apro il menu "Salvare" per mostrare le opzioni...');

          const dropdownOpened = await this.page!.evaluate(() => {
            const dropdownSelectors = [
              'div[id*="mainMenu_Menu_DXI"][id*="_P"]',
              'div[id*="mainMenu_Menu_DXI"][id*="_p"]',
              '[class*="dxm-subMenu"]',
              '[class*="dxm-dropDown"]',
            ];

            for (const selector of dropdownSelectors) {
              const el = document.querySelector(selector);
              if (el && (el as HTMLElement).offsetParent !== null) {
                (el as HTMLElement).click();
                return true;
              }
            }

            const saveLabels = Array.from(
              document.querySelectorAll("span, a, div, button"),
            ).filter((el) => (el as HTMLElement).offsetParent !== null);

            const saveLabel = saveLabels.find((el) => {
              const text = (el.textContent ?? "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");
              return text === "salvare" || text === "salva";
            });

            if (saveLabel) {
              (saveLabel as HTMLElement).click();
              return true;
            }

            return false;
          });

          if (!dropdownOpened) {
            logger.warn('Menu "Salvare" non trovato, provo alternative');
          } else {
            logger.debug("Menu aperto, attendo render submenu...");
            await this.wait(1500);

            // await this.page!.screenshot({
            // path: "logs/order-step7-dropdown-opened.png",
            // fullPage: true,
            // });
          }

          saveMethod = await tryClickSaveAndClose();
        }

        if (!saveMethod) {
          logger.debug("Fallback: cerco pulsante di salvataggio visibile...");

          const fallbackClicked = await this.page!.evaluate(() => {
            const candidates = Array.from(
              document.querySelectorAll(
                'button, a, img, input[type="button"], input[type="submit"]',
              ),
            );

            for (const el of candidates) {
              if ((el as HTMLElement).offsetParent === null) continue;
              const attr = [
                (el as HTMLElement).getAttribute?.("title") ?? "",
                (el as HTMLElement).getAttribute?.("aria-label") ?? "",
                (el as HTMLImageElement).alt ?? "",
                (el as HTMLImageElement).src ?? "",
              ]
                .join(" ")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");
              if (
                attr.includes("salva") ||
                attr.includes("salvare") ||
                attr.includes("save") ||
                attr.includes("ok") ||
                attr.includes("check")
              ) {
                (el as HTMLElement).click();
                return true;
              }
            }

            return false;
          });

          if (fallbackClicked) {
            saveMethod = "fallback-save";
          }
        }

        if (!saveMethod) {
          logger.error('Pulsante "Salva e chiudi" non trovato');
          // await this.page!.screenshot({
          // path: "logs/order-error-no-save-button.png",
          // fullPage: true,
          // });
          throw new Error('Pulsante "Salva e chiudi" non trovato');
        }

        logger.debug(
          `Azione salvataggio cliccata (${saveMethod}), attendo conferma...`,
        );

        // 9. Attendi salvataggio - può essere redirect O aggiornamento AJAX
        try {
          // Prova prima con navigation (con timeout ridotto)
          await this.page!.waitForNavigation({
            waitUntil: "networkidle2",
            timeout: 1500,
          });
          logger.debug("Navigation rilevata dopo salvataggio");
        } catch (navError) {
          // Se non c'è navigation, aspetta che DevExpress completi l'operazione
          logger.debug("Nessuna navigation, attendo completamento AJAX...");

          await this.wait(2000);

          // Verifica che non ci siano più indicatori di caricamento
          try {
            await this.page!.waitForFunction(
              () => {
                const loadingIndicators = Array.from(
                  document.querySelectorAll(
                    '[id*="LPV"], .dxlp, .dxlpLoadingPanel',
                  ),
                );
                return loadingIndicators.every(
                  (el) =>
                    (el as HTMLElement).style.display === "none" ||
                    (el as HTMLElement).offsetParent === null,
                );
              },
              { timeout: 3000, polling: 100 },
            );
          } catch {
            logger.warn("Timeout waiting for loading indicators after save");
          }
        }

        // 10. Estrai ID ordine dall'URL o dalla pagina
        const currentUrl = this.page!.url();
        const orderIdMatch = currentUrl.match(/\/(\d+)\//);
        let orderId = orderIdMatch ? orderIdMatch[1] : "UNKNOWN";

        // Se l'ID non è nell'URL, prova a cercarlo nella pagina
        if (orderId === "UNKNOWN") {
          try {
            orderId = await this.page!.evaluate(() => {
              // Cerca nel campo ID ordine
              const idField = document.querySelector(
                'input[id*="SALESID"]',
              ) as HTMLInputElement;
              if (idField && idField.value) {
                return idField.value;
              }

              // Cerca in elementi con testo che contiene un numero ordine
              const textElements = Array.from(
                document.querySelectorAll("*"),
              ).filter((el) => {
                const text = el.textContent || "";
                return (
                  /ordine\s*:\s*\d+/i.test(text) ||
                  /order\s*:\s*\d+/i.test(text)
                );
              });

              for (const el of textElements) {
                const match = (el.textContent || "").match(/\d{5,}/);
                if (match) return match[0];
              }

              return "SAVED";
            });
          } catch {
            orderId = "SAVED";
          }
        }

        logger.info("Ordine creato con successo!", {
          orderId,
          url: currentUrl,
        });

        return orderId;
      });

      logger.info("🤖 BOT: FINE creazione ordine", {
        orderId,
        customerName: orderData.customerName,
        itemsCount: orderData.items.length,
      });

      return orderId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : "";
      logger.error("Errore durante creazione ordine", {
        errorMessage,
        errorStack,
        orderData,
      });
      throw error;
    }
  }

  async getCustomers(): Promise<
    Array<{ id: string; name: string; vatNumber?: string; email?: string }>
  > {
    return this.runOp("getCustomers", async () => {
      if (!this.page) {
        throw new Error("Browser non inizializzato");
      }

      // Verifica che la pagina sia ancora valida e ricarica se necessario
      try {
        const url = this.page.url();
        logger.info(`Pagina corrente: ${url}`);
      } catch (error) {
        logger.warn("Frame detached, ricarico la pagina...");
        await this.page.goto(`${config.archibald.url}/`, {
          waitUntil: "networkidle2",
          timeout: 60000,
        });
      }

      logger.info("Navigazione alla pagina clienti...");
      await this.page.goto(`${config.archibald.url}/CUSTTABLE_ListView/`, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      await this.page.waitForSelector("table", { timeout: 10000 });

      const allCustomers: Array<{
        id: string;
        name: string;
        vatNumber?: string;
        email?: string;
      }> = [];
      let currentPage = 1;
      let hasMorePages = true;

      logger.info("Inizio estrazione clienti con paginazione...");

      while (hasMorePages) {
        logger.info(`Estrazione pagina ${currentPage}...`);

        // Attendi che la tabella sia completamente caricata
        await this.page.waitForSelector("table tbody tr", { timeout: 10000 });

        // Breve pausa per assicurarsi che il DOM sia stabile
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Estrai i clienti dalla pagina corrente
        const pageCustomers = await this.page.evaluate(() => {
          const rows = Array.from(
            document.querySelectorAll("table tbody tr"),
          ) as Element[];
          const results: Array<{
            id: string;
            name: string;
            vatNumber?: string;
            email?: string;
          }> = [];

          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll("td")) as Element[];
            if (cells.length < 3) continue;

            // Dalla screenshot: colonne per indice
            // Col 0: checkbox, Col 1: ID interno, Col 2: NUMERO DI CONTO, Col 3: NOME, Col 4: PARTITA IVA, Col 5: PEC
            const id = (cells[1] as Element)?.textContent?.trim() || "";
            const accountNumber =
              (cells[2] as Element)?.textContent?.trim() || "";
            const name = (cells[3] as Element)?.textContent?.trim() || "";
            const vatNumber = (cells[4] as Element)?.textContent?.trim() || "";
            const email = (cells[5] as Element)?.textContent?.trim() || "";

            if (name && (accountNumber || id)) {
              results.push({
                id: accountNumber || id,
                name,
                vatNumber: vatNumber || undefined,
                email: email || undefined,
              });
            }
          }

          return results;
        });

        logger.info(
          `Estratti ${pageCustomers.length} clienti dalla pagina ${currentPage}`,
        );
        allCustomers.push(...pageCustomers);

        // Verifica se esiste un pulsante "Next" o "Successiva"
        hasMorePages = await this.page.evaluate(() => {
          // Cerca pulsanti di paginazione comuni nei controlli DevExpress
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
          logger.info("Navigazione alla pagina successiva...");

          // Clicca sul pulsante Next
          const clicked = await this.page.evaluate(() => {
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
            logger.warn(
              "Pulsante Next trovato ma non cliccabile, interruzione paginazione",
            );
            hasMorePages = false;
          } else {
            // Attendi che la navigazione completi
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await this.page.waitForSelector("table tbody tr", {
              timeout: 10000,
            });
            currentPage++;
          }
        }

        // Limite di sicurezza per evitare loop infiniti (max 100 pagine)
        if (currentPage > 100) {
          logger.warn(
            "Raggiunto limite di 100 pagine, interruzione paginazione",
          );
          hasMorePages = false;
        }
      }

      logger.info(
        `Estrazione completata: ${allCustomers.length} clienti totali da ${currentPage} pagine`,
      );
      return allCustomers;
    });
  }

  async close(): Promise<void> {
    if (this.browser) {
      // Genera e salva report automaticamente prima di chiudere
      try {
        const reportPath = await this.writeOperationReport();
        logger.info(`Report operazioni salvato: ${reportPath}`);
      } catch (error) {
        logger.error("Errore nel salvataggio report operazioni", { error });
      }

      await this.browser.close();
      this.browser = null;
      this.page = null;
      logger.info("Browser chiuso");
    }
  }

  private formatDateForArchibald(isoDate: string): string {
    // Converte da YYYY-MM-DD a DD/MM/YYYY
    const [year, month, day] = isoDate.split("-");
    return `${day}/${month}/${year}`;
  }

  isInitialized(): boolean {
    return this.browser !== null && this.page !== null;
  }
}
