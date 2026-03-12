# Claude Cost Guardrails (Archibald)

Questa checklist evita loop costosi quando lavori con Claude Code su repository grandi.

## 1) Comando da NON usare

Non avviare Claude con:

```bash
claude --dangerously-skip-permissions
```

Quel flag elimina i prompt di conferma file access e puo' far leggere troppo contesto.

## 2) Avvio consigliato

Apri Claude nella cartella piu' piccola utile al task:

```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/backend
claude
```

Oppure frontend:

```bash
cd /Users/hatholdir/Downloads/Archibald/archibald-web-app/frontend
claude
```

## 3) Modello consigliato (default economico)

Imposta Sonnet come default (evita Opus per lavoro quotidiano):

```bash
claude config set model claude-sonnet-4-6
```

Usa Opus solo su task puntuali ad alta complessita'.

## 4) Ignora artefatti pesanti

Sono stati aggiunti:

- `/Users/hatholdir/Downloads/Archibald/.claudeignore`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/.claudeignore`

Questi file escludono `node_modules`, build, logs, screenshot, report, dati runtime e altri asset pesanti dal contesto.

## 5) Regole operative veloci

- Sessioni brevi (nuova sessione per task separati).
- Prompt con scope preciso (file/cartelle esplicite).
- Evita richieste tipo "analizza tutto il progetto".
- Se vedi input token troppo alti in Logs, interrompi e riapri sessione con scope ridotto.

## 6) Sicurezza costo

Nel pannello Anthropic imposta un limite mensile e alert bassi, cosi' eviti runaway spend.

## 7) Profilo operativo (Opus on-demand)

Per ridurre errori manuali usa lo script:

```bash
./scripts/claude-launch.sh
```

Comandi utili:

```bash
# Default: Sonnet + backend
./scripts/claude-launch.sh

# Sonnet + frontend
./scripts/claude-launch.sh --target frontend

# Opus solo esplicito (richiede conferma)
./scripts/claude-launch.sh --model opus --target backend --confirm-opus
```

Questo rende Sonnet il percorso standard e blocca l'avvio Opus accidentale.
