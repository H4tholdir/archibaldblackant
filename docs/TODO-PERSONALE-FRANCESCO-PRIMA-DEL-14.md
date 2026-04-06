# TODO Personale — Francesco Formicola
## Cose che devi fare tu, prima del 14 aprile 2026

> Questo documento separa nettamente **cosa devi fare tu** (legale, contrattuale, operativo, infrastrutturale) da ciò che il codice fa già. Niente tecnico che non richieda il tuo intervento diretto.

---

## BLOCCO 1 — URGENTISSIMO entro 7 aprile

### 1. Apri la Partita IVA

**Perché è il 7 aprile e non il 14:** non puoi firmare un contratto professionale come persona fisica senza P.IVA, e non puoi emettere fattura dopo il meeting. Senza P.IVA il MSA è incompleto (45 placeholder `[DA INSERIRE]` contengono la tua P.IVA).

**Come:**
1. Vai su [fisconline.agenziaentrate.gov.it](https://fisconline.agenziaentrate.gov.it) con SPID o CIE
2. Cerca "Modello AA9/12" (dichiarazione inizio attività per persone fisiche)
3. Codice ATECO: **62.01.09** (Produzione di software non connesso all'editoria)
4. Regime fiscale: **Forfettario** (se redditi < 85.000€/anno — quasi certamente sì per primo anno)
5. Il numero ti arriva via email in 1-3 giorni lavorativi

**In alternativa:** qualsiasi CAF o commercialista lo fa in 30 minuti per 50-100€ se non vuoi farlo online.

**Nota importante:** con regime forfettario emetti fatture con ritenuta d'acconto 20% (se il cliente è italiano) o senza ritenuta (se il cliente è estero). Devi indicarlo in fattura. Chiedi conferma al commercialista.

---

### 2. Verifica il tuo contratto di lavoro con Fresis

**Perché:** se hai un contratto di lavoro dipendente con Fresis, potrebbe esserci una **clausola di esclusiva** o **non concorrenza** che ti vieta di svolgere attività autonoma per terzi nel settore. Komet è un fornitore di Fresis — potenziale conflitto di interesse.

**Come:** rileggi il contratto. Cerca le parole "esclusiva", "non concorrenza", "attività extralavoro", "autorizzazione datore di lavoro".

**Se non trovi nulla di bloccante:** parla con tuo padre (presidente Fresis) in modo informale e trasparente. Non serve formalità, basta allineamento.

**Se trovi qualcosa di bloccante:** prima di procedere con la firma del contratto Komet, consulta un avvocato giuslavorista. Non è la fine del mondo — nella maggior parte dei casi si risolve con una lettera di autorizzazione firmata da Fresis.

---

### 3. Crea il bucket Hetzner Object Storage per i backup

**Perché è tecnico ma lo fai tu:** richiede login alla console Hetzner con le tue credenziali.

**Come:**
1. Vai su [console.hetzner.com](https://console.hetzner.com)
2. Sezione "Object Storage" → "New Bucket"
3. Nome: `archibald-backups`
4. Regione: `fsn1` (Falkenstein, Germania)
5. Genera le Access Key: Menu Account → "S3 Access Keys" → "Generate S3 API Credentials"
6. Annotati: `HETZNER_ACCESS_KEY`, `HETZNER_SECRET_KEY`, `HETZNER_S3_ENDPOINT` (es. `https://fsn1.your-objectstorage.com`), `HETZNER_BUCKET=archibald-backups`

---

### 4. Prepara le variabili d'ambiente del VPS

Le seguenti variabili **sono già configurate in produzione** (2026-04-05):
- ✅ `REDIS_PASSWORD` — configurata (Redis protetto da password)
- ✅ `CORS_ORIGINS=https://formicanera.com` — configurata

Da aggiungere ancora al `.env` VPS (dopo aver creato il bucket Hetzner al passo 3):

```
SECURITY_ALERT_EMAIL=<tua email personale>
HETZNER_BUCKET=archibald-backups
HETZNER_S3_ENDPOINT=https://fsn1.your-objectstorage.com
HETZNER_ACCESS_KEY=<dalla console Hetzner>
HETZNER_SECRET_KEY=<dalla console Hetzner>
```

**Non serve più:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` — il sistema di alert non usa più email.

---

## BLOCCO 2 — entro 9-10 aprile

### 5. Contatta Komet per i dati necessari ai contratti

Manda una email al tuo referente Komet chiedendo:

1. **Ragione sociale completa** di Komet Italia S.r.l. (così come appare nella visura camerale)
2. **P.IVA Komet Italia**
3. **Indirizzo sede legale** completo
4. **Email del DPO** (Data Protection Officer), se nominato — o email per esercizio dei diritti GDPR
5. **Chi firma il contratto:** solo Komet Italia, o anche Gebr. Brasseler GmbH & Co. KG (capogruppo tedesca)?
6. **Preferenza sul foro competente:** Tribunale di Napoli o arbitrato CAM Milano?
7. **Canale di notifica manutenzione** per l'SLA: email? Slack? Sistema di ticketing?

Senza questi dati non puoi compilare né MSA né DPA — e senza MSA e DPA firmati il meeting è solo informale.

---

### 6. Definisci il canone mensile con Komet

Il MSA ha un placeholder `[importo canone mensile]` nell'Art. 5. Nessuno può firmare il contratto senza questo numero.

**Quanto chiedere:** dipende dalla tua valutazione del servizio. Considera:
- Costo VPS mensile: ~35€/mese (Hetzner CPX32)
- Costo del tuo tempo per manutenzione mensile (fix, aggiornamenti, supporto)
- Valore del servizio per Komet (gestione ordini, ERP, real-time sync)

Un range realistico per un SaaS B2B di questo tipo: **150-500€/mese**. Komet ha budget per IT.

---

### 7. Compila i placeholder nei 5 documenti contrattuali

Una volta che hai P.IVA e dati Komet, sessione di 1-2 ore con find-and-replace sui file in `docs/contracts/`:

| Placeholder | Valore |
|---|---|
| `[PARTITA IVA DA INSERIRE]` | Tua P.IVA (disponibile dopo step 1) |
| `[P.IVA Komet Italia]` | Da Komet (step 5) |
| `[ragione sociale Komet Italia S.r.l.]` | Da Komet (step 5) |
| `[indirizzo sede legale Komet]` | Da Komet (step 5) |
| `[email DPO Komet]` | Da Komet (step 5) |
| `[importo canone mensile]` | Concordato con Komet (step 6) |
| `[data decorrenza contratto]` | Proposta: 1 maggio 2026 |
| `[data firma]` | La data del meeting: 14 aprile 2026 |
| `[foro competente]` | Da concordare con Komet (step 5) |
| `[provider SMTP]` | Non applicabile — sistema alert senza email |

---

### 8. Decidi: Gebr. Brasseler nel contratto o solo Komet Italia?

Se la capogruppo tedesca (Brasseler) è parte del contratto:
- Il MSA potrebbe richiedere clausole in diritto tedesco
- Potrebbe servire una traduzione in tedesco
- Il foro competente deve gestire la giurisdizione cross-border

Se firma solo Komet Italia:
- Diritto italiano, foro italiano → molto più semplice
- Il MSA attuale è sufficiente

**Raccomandazione:** per il 14 aprile, proponi di firmare solo con Komet Italia. Eventuali estensioni all'accordo con Brasseler si gestiscono in un secondo momento.

---

## BLOCCO 3 — entro 13 aprile

### 9. Redigi il Registro dei Trattamenti come Responsabile (Art. 30.2 GDPR)

**Cos'è:** un documento di 1-2 pagine che descrive, come Responsabile del Trattamento, cosa tratti, per chi, come, per quanto tempo. Non serve un avvocato per farlo. Serve averlo.

**Modello minimo:**

```
REGISTRO DEI TRATTAMENTI — RESPONSABILE DEL TRATTAMENTO
Art. 30(2) GDPR

Nome Responsabile: Formicola Francesco — P.IVA [...]
Email contatto: [...]
Data ultima revisione: [...]

TRATTAMENTO 1: Gestione ordini e clienti rete vendita Komet
- Titolare del trattamento: Komet Italia S.r.l.
- Categorie di dati: anagrafica clienti (nome, indirizzo, email, telefono, P.IVA/CF), storico ordini
- Categorie di interessati: clienti professionali (studi dentistici, cliniche)
- Finalità: gestione operativa degli ordini tramite l'ERP Archibald
- Base giuridica: esecuzione del contratto (Art. 6(1)(b) GDPR)
- Conservazione: per la durata del contratto con Komet + 10 anni (obblighi fiscali)
- Sub-processor: Hetzner Online GmbH (hosting, sede UE)
- Misure di sicurezza: vedere Dichiarazione di Conformità Tecnica n. 2026-001
```

---

### 10. DPIA Screening (10 domande — 30 minuti)

**Cos'è:** una valutazione d'impatto sulla protezione dei dati (Data Protection Impact Assessment). Non è obbligatoria in tutti i casi — solo se certi criteri sono soddisfatti. Il screening determina se serve o no.

**Le 10 domande:**
1. Il trattamento riguarda dati sensibili (salute, orientamento sessuale, ecc.)? → **NO** (dati commerciali B2B)
2. Il trattamento riguarda persone vulnerabili (minori, pazienti)? → **NO** (professionisti)
3. Il trattamento prevede profilazione o decisioni automatizzate? → **NO**
4. Il trattamento riguarda dati biometrici o di localizzazione? → **NO**
5. Il trattamento riguarda i movimenti di persone fisiche? → **NO**
6. Il trattamento combina dataset da fonti diverse? → **NO** (solo dati interni)
7. Il trattamento prevede la comunicazione a terzi? → **NO** (solo Hetzner come host)
8. Il trattamento riguarda un numero elevato di interessati (>10.000)? → **Probabilmente NO** (rete vendita Komet)
9. Il trattamento prevede trasferimenti extra-UE senza adeguate garanzie? → **NO** (solo UE + SCC per FedEx)
10. Esiste un alto rischio identificato? → **NO**

**Conclusione probabile:** DPIA non obbligatoria. Documenta lo screening e il risultato.

**Nota sul JWT in localStorage:** il JWT è memorizzato in localStorage (scelta tecnica per la PWA su iOS). Questo rappresenta un rischio di sicurezza (XSS) documentato e accettato. Va menzionato nel documento di screening come rischio accettato con mitigazione (CSP, rate limiting, revoca attiva).

---

### 11. Distribuisci l'Informativa Privacy agli Agenti (Art. 13 GDPR)

Il documento è già pronto in `docs/contracts/informativa-privacy-utenti.md`. Devi distribuirlo agli agenti della rete Komet che usano Archibald.

**Come:** email a tutti gli agenti con il documento allegato (o link al documento). Conserva una prova dell'avvenuta distribuzione (ricevute email, o un modulo di conferma lettura).

---

### 12. Stampa i documenti per il meeting

Stampa 2 copie (tu + Komet) di:
1. **MSA-contratto-saas.md** — con tutti i placeholder compilati
2. **DPA-art28-gdpr.md** — con tutti i placeholder compilati

**Tieniti a disposizione** (non necessari firma immediata ma utili):
- SLA-allegato-sicurezza.md
- informativa-privacy-utenti.md (da consegnare a Komet)
- DICHIARAZIONE-CONFORMITA-TECNICA.md (presente documento — overview tecnica per Komet)
- sub-processors.md
- incident-response-procedure.md

---

### 13. Fai rivedere MSA e DPA da un avvocato

**Quali clausole sono critiche:**
- **Art. 9 MSA (Limitazione responsabilità):** Il limite di responsabilità è attualmente impostato a 12 mesi di canone. È un valore standard, ma Komet potrebbe chiedere di alzarlo.
- **Art. 10 MSA (Recesso):** Il preavviso di 30 giorni potrebbe non essere accettabile per Komet se il sistema è mission-critical.
- **DPA — Allegato 1 (Sub-processor list):** deve essere sempre aggiornata. Considera se aggiungere un meccanismo di notifica automatica a Komet in caso di cambio sub-processor.

Non è necessario un avvocato specializzato in GDPR per forza — qualsiasi avvocato con esperienza in contratti B2B SaaS è sufficiente.

---

## BLOCCO 4 — Post-meeting / Medio termine

### 14. Apri una SRLS (entro Q3 2026)

**Perché:** la Partita IVA individuale va benissimo per iniziare, ma per proteggere il tuo patrimonio personale in caso di controversie contrattuali con Komet, una S.r.l. Semplificata (SRLS) è molto più sicura. La responsabilità è limitata al capitale sociale (minimo 1€).

**Quando:** dopo il primo anno di attività, quando hai un flusso di cassa stabile. Non blocca il meeting del 14 aprile.

### 15. Consulta un commercialista

**Subito dopo** l'apertura della P.IVA: la gestione delle fatture con ritenuta d'acconto, il regime forfettario, i contributi INPS (Gestione Separata, circa 26% del reddito) non sono complicati ma richiedono attenzione. Un commercialista ti costa 500-1000€/anno e ti evita problemi con il Fisco.

### 16. Valuta una polizza cyber risk

Coprirebbe la tua responsabilità contrattuale verso Komet in caso di data breach imputabile a te. Costo tipico per una persona fisica/piccola impresa: 500-2000€/anno. Da valutare dopo la firma del contratto — nel MSA c'è una clausola che limita la tua responsabilità, ma una polizza ti copre anche in caso di superamento del limite.

### 17. Pentesting (entro Q3 2026)

L'SLA ha un placeholder per la data del primo penetration test. Concordare con Komet se è un obbligo contrattuale o una raccomandazione. Se obbligo: pianificare per settembre 2026, budget tipico 2000-5000€.

### 18. Verifica se rientri come soggetto NIS 2

Il D.Lgs. 138/2024 (recepimento NIS 2 in Italia) classifica i soggetti in "essenziali" e "importanti". Come fornitore ICT di Komet, che è un'azienda che gestisce dispositivi medici (prodotti dentali), **potresti** rientrare nella categoria "soggetti importanti".

**Azione:** consulta ACN (Agenzia per la Cybersicurezza Nazionale) o un consulente specializzato NIS2 entro Q2 2026. Se rientri, devi registrarti e adottare misure aggiuntive. Molto probabilmente, come persona fisica con un solo cliente ICT non direttamente nel settore sanitario, non rientri — ma verificare è obbligatorio.

---

## Riepilogo Rapido: cosa devi fare e quando

| Entro | Azione |
|---|---|
| **7 aprile** | P.IVA individuale (ATECO 62.01.09, regime forfettario) |
| **7 aprile** | Verifica contratto Fresis per clausole di esclusiva |
| **7 aprile** | Crea bucket Hetzner → aggiungi `SECURITY_ALERT_EMAIL` e `HETZNER_*` al `.env` VPS (`REDIS_PASSWORD` e `CORS_ORIGINS` già configurate ✅) |
| ~~**7 aprile**~~ | ~~Deploy del branch su produzione~~ — ✅ **completato 2026-04-05** (CI/CD automatico dopo push master) |
| **8 aprile** | Test backup Hetzner (serve prima il bucket) + abilita MFA per account admin Francesco |
| **9 aprile** | Email a Komet: P.IVA, DPO, Brasseler sì/no, foro, canone |
| **10 aprile** | Compila tutti i 45 placeholder nei contratti |
| **10 aprile** | Decidi il canone mensile con Komet |
| **11 aprile** | Avvocato per review MSA/DPA |
| **12 aprile** | Redigi Registro dei Trattamenti (30 min) |
| **12 aprile** | DPIA screening (30 min) |
| **13 aprile** | Distribuisci informativa privacy agli agenti |
| **13 aprile** | Stampa 2 copie MSA + DPA in versione finale |
| **14 aprile** | **MEETING KOMET** — firma MSA + DPA, consegna dichiarazione conformità tecnica |

---

*Documento creato il 2026-04-05. Aggiorna le checkbox man mano che completi i punti.*
