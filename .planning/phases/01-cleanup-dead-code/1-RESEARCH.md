# Phase 1: Cleanup & Dead Code Removal - Research

**Researched:** 2026-02-20
**Domain:** TypeScript dead code detection & removal
**Confidence:** HIGH

<research_summary>
## Summary

Ricercato l'ecosistema di strumenti per dead code detection in TypeScript. Lo strumento standard attuale è **Knip** — ts-prune è in maintenance mode (non riceve più aggiornamenti), e tsr (TypeScript Remove di LINE) è stato archiviato a ottobre 2025 con raccomandazione di usare Knip.

Knip trova: file inutilizzati, export inutilizzati, dipendenze inutilizzate, dipendenze non listate, configurazioni inutilizzate. Ha supporto nativo per workspaces/monorepo, plugin Vite, plugin Vitest, e auto-fix con `--fix`. Per il codebase Archibald (frontend Vite+React, backend Express+TypeScript), Knip è la scelta corretta con configurazione workspace separata per frontend e backend.

**Primary recommendation:** Usare `npx knip` con configurazione workspace per frontend e backend. Analizzare il report, filtrare false positive, poi procedere con rimozione manuale (non auto-fix per la prima volta — troppo rischioso).
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| knip | 5.x | Dead code detection completo | Unico tool attivamente mantenuto, successore di ts-prune, raccomandato da Effective TypeScript |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript compiler (noUnusedLocals) | built-in | Unused local variables | Già disponibile nel tsconfig, complementare a Knip |
| ESLint no-unused-vars | built-in | Unused variables/imports | Complementare, copre scope diverso da Knip |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Knip | ts-prune | ts-prune è unmaintained dal 2024, meno feature |
| Knip | tsr (LINE) | tsr archiviato Oct 2025, era più veloce (2.14x) ma non più supportato |
| Knip --fix | Rimozione manuale | Manuale è più sicuro per prima esecuzione, --fix per run successivi in CI |

### Tooling Notes
Knip non va installato come dipendenza — si usa con `npx knip` direttamente. Si configura con `knip.json` o `knip.jsonc` nella root del progetto.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Approccio Raccomandato per Codebase Esistente

**1. Analisi prima, rimozione dopo:**
```
npx knip → report → review manuale → rimozione selettiva → verifica build/test
```

**2. Configurazione workspace per monorepo Archibald:**
```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "workspaces": {
    "archibald-web-app/frontend": {
      "entry": ["src/main.tsx"],
      "project": ["src/**/*.{ts,tsx}"]
    },
    "archibald-web-app/backend": {
      "entry": ["src/main.ts"],
      "project": ["src/**/*.ts"],
      "ignore": ["src/**/*.spec.ts", "src/**/*.test.ts"]
    }
  }
}
```

**3. Categorie di issue Knip rilevanti per Phase 1:**
- `files` — file mai importati (file orfani)
- `exports` — export mai usati
- `types` — tipi mai usati
- `dependencies` — dipendenze npm inutilizzate
- `unlisted` — dipendenze usate ma non in package.json

### Ordine di Rimozione Sicuro
1. File completamente orfani (nessun import li raggiunge) — rimozione sicura
2. Export inutilizzati in file attivi — rimuovere export, verificare che il file compili
3. Naming inconsistencies — rinomina con ricerca globale
4. Build check + test run dopo ogni batch

### Anti-Patterns to Avoid
- **Rimuovere tutto in un colpo solo:** Procedere per batch, verificare build/test dopo ogni batch
- **Fidarsi ciecamente dell'auto-fix:** Knip `--fix` può rimuovere export che sembrano unused ma sono usati tramite dynamic imports o barrel files
- **Ignorare i test file:** Se un file ha solo test che lo importano e nessun import da codice produzione, il file potrebbe essere dead code (ma i test vanno rimossi insieme)
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Trovare file orfani | Script grep/find custom | Knip `files` category | Knip segue il grafo di import TypeScript, grep perde i re-export e i path alias |
| Trovare export inutilizzati | Ricerca manuale di ogni export | Knip `exports` category | Centinaia di export, impossibile manualmente senza errori |
| Trovare dipendenze npm inutilizzate | `npm ls` + revisione manuale | Knip `dependencies` category | Knip verifica che le dipendenze siano effettivamente importate nel codice |
| Trovare tipi inutilizzati | TypeScript compiler alone | Knip `types` category | TypeScript non trova tipi esportati ma mai importati da altri file |

**Key insight:** La rimozione del dead code è un problema di grafo (dependency graph). Gli strumenti manuali (grep, find) non seguono il grafo TypeScript correttamente — perdono re-export, path alias, dynamic import patterns.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: False Positive da Barrel Files
**What goes wrong:** Knip segnala export come unused quando sono re-esportati tramite barrel file (index.ts)
**Why it happens:** Il mark-and-sweep non traccia sempre correttamente i re-export multi-livello
**How to avoid:** Controllare i barrel file prima di rimuovere export segnalati. In Archibald, verificare se ci sono `index.ts` che ri-esportano
**Warning signs:** Molti export "unused" nello stesso file che è chiaramente attivo

### Pitfall 2: Dynamic Imports Non Riconosciuti
**What goes wrong:** File importati con `import()` dinamico (template string) vengono segnalati come orfani
**Why it happens:** Knip non può risolvere `import(\`./${value}.ts\`)` staticamente
**How to avoid:** Configurare `entry` pattern per file caricati dinamicamente, o aggiungere a `ignore`
**Warning signs:** File che "dovrebbero" essere usati segnalati come unused

### Pitfall 3: Side Effects Import
**What goes wrong:** Rimuovere un import che sembra unused ma ha side effects (es. `import './polyfill'`, `import './styles.css'`)
**Why it happens:** L'import non ha named export usati, ma l'import stesso esegue codice necessario
**How to avoid:** Non rimuovere import senza named binding senza verificare che il file non abbia side effects
**Warning signs:** Import di file .css, file di setup, file di polyfill

### Pitfall 4: Rompere i Test
**What goes wrong:** Rimuovere un file o export che è usato solo dai test, rendendo i test non compilabili
**Why it happens:** Se Knip è configurato per ignorare i test, vede l'export come unused
**How to avoid:** Quando si rimuove un export/file, verificare anche se ci sono test che lo importano e rimuovere/aggiornare anche quelli
**Warning signs:** Test file che importano dal file che stai rimuovendo
</common_pitfalls>

<code_examples>
## Code Examples

### Eseguire Knip Report Completo
```bash
# Dalla root del progetto
npx knip --reporter compact
```

### Eseguire Knip Solo Per Categoria
```bash
# Solo file orfani
npx knip --include files

# Solo export inutilizzati
npx knip --include exports

# Solo dipendenze
npx knip --include dependencies,unlisted
```

### Configurazione knip.json per Archibald
```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "workspaces": {
    "archibald-web-app/frontend": {
      "entry": ["src/main.tsx"],
      "project": ["src/**/*.{ts,tsx}"],
      "ignore": ["src/vite-env.d.ts"]
    },
    "archibald-web-app/backend": {
      "entry": ["src/main.ts"],
      "project": ["src/**/*.ts"],
      "ignore": ["src/**/*.spec.ts", "src/**/*.test.ts", "src/scripts/**"]
    }
  }
}
```

### Verifica Post-Rimozione
```bash
# Dopo ogni batch di rimozioni:
npm run build --prefix archibald-web-app/backend
npm run type-check --prefix archibald-web-app/frontend
npm test --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/frontend
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ts-prune | Knip | 2023-2024 | ts-prune unmaintained, Knip è il successore con più feature |
| tsr (LINE) | Knip | Oct 2025 | tsr archiviato, raccomandato Knip |
| Ricerca manuale grep | Knip + auto-fix | 2024+ | Knip `--fix` può auto-rimuovere, ma usare con cautela |
| Singolo tool | Knip (all-in-one) | 2024+ | Knip copre file, export, dipendenze, tipi in un solo tool |

**New tools/patterns to consider:**
- **Knip `--fix`**: Auto-rimozione, utile per CI dopo la pulizia iniziale manuale
- **Knip `--allow-remove-files`**: Rimuove file completamente orfani automaticamente

**Deprecated/outdated:**
- **ts-prune**: Unmaintained, non usare per nuovi progetti
- **tsr (LINE)**: Archiviato Oct 2025
- **Ricerca manuale con grep**: Perde re-export, path alias, dynamic imports
</sota_updates>

<open_questions>
## Open Questions

1. **Entry point backend esatti**
   - What we know: `main.ts` è il bootstrap entry
   - What's unclear: Ci possono essere altri entry point (script CLI, worker) non importati da main.ts
   - Recommendation: Verificare durante il planning se ci sono script in `src/scripts/` che sono entry point separati

2. **File già segnalati nella roadmap vs analisi Knip**
   - What we know: La roadmap elenca 8 file frontend e 2 backend come orfani
   - What's unclear: Knip potrebbe trovarne di più o meno (alcuni "orfani" potrebbero essere dynamic imports)
   - Recommendation: Eseguire Knip e confrontare con la lista della roadmap — usare l'unione dei risultati
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- Context7 /webpro-nl/knip — configurazione workspace, ignore patterns, auto-fix, plugin Vite
- [Knip official site](https://knip.dev/) — configurazione, monorepo, plugin

### Secondary (MEDIUM confidence)
- [Effective TypeScript — Use knip for dead code](https://effectivetypescript.com/2023/07/29/knip/) — raccomandazione ts-prune → Knip
- [Dead Code Detection: Knip Over ts-prune](https://levelup.gitconnected.com/dead-code-detection-in-typescript-projects-why-we-chose-knip-over-ts-prune-8feea827da35) — confronto tools, verificato con docs ufficiali
- [How to Delete Dead Code in TypeScript](https://camchenry.com/blog/deleting-dead-code-in-typescript) — pitfalls barrel file, false positives

### Tertiary (LOW confidence - needs validation)
- None — tutti i risultati verificati con Context7 o docs ufficiali
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Knip (dead code detection per TypeScript)
- Ecosystem: Knip vs ts-prune vs tsr, TypeScript compiler, ESLint
- Patterns: Analisi incrementale, batch removal, workspace config
- Pitfalls: Barrel files, dynamic imports, side effects, test breakage

**Confidence breakdown:**
- Standard stack: HIGH — Knip è l'unico tool attivamente mantenuto, confermato da multiple fonti
- Architecture: HIGH — pattern di utilizzo documentati in docs ufficiali e Context7
- Pitfalls: HIGH — documentati in blog di esperti, verificati con docs
- Code examples: HIGH — da Context7 e docs ufficiali Knip

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (30 days — Knip ecosystem stabile)
</metadata>

---

*Phase: 1-cleanup-dead-code*
*Research completed: 2026-02-20*
*Ready for planning: yes*
