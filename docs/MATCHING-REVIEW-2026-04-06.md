# Documento di Revisione Matching COOP16 ↔ PWA
**Data:** 2026-04-06  
**Fonte dati:** `diag-arca-matching-result.json` (run finale)

---

## Riepilogo statistiche

| Categoria | Totale | Auto-matchati | Da risolvere |
|-----------|--------|---------------|--------------|
| KT 2026 | 183 | 149 (81.4%) | 34 |
| Ordini non-Fresis 2026 | 200 | 149 | 51 |
| FT 2026 | 223 | 143 assegnate | 80 |
| Ordini Fresis 2026 | 46 | 34 | 12 |

---

## SEZIONE A — Fuzzy match da verificare manualmente (9)

Questi KT sono stati matchati dall'algoritmo ma con `art_exact=false`. Classificazione:

- **[OK .000]** = differenza solo nel suffisso `.000`, accettare come corretto
- **[VERIFICARE]** = anomalia che richiede ispezione manuale
- **[SBAGLIATO]** = match sicuramente errato, da correggere

---

### A1. KT 38 ↔ Ordine 48509 — [OK .000]

| Campo | COOP16 | PWA |
|-------|--------|-----|
| Cliente | Dr.EDUARDO VERALLI | Dr.Eduardo Veralli |
| Totale | ~ | ~ |
| Jaccard | 0.78 | — |

**Differenza articoli:**  
- Mancanti in PWA: `DS37×20`, `DS25×10`, `DS37F×20`, `DS37EF×20`, `DS25EF×10`  
- Extra in PWA: `DS37EF.000×20`, `DS37F.000×20`, `DS25.000×10`, `DS37.000×20`, `DS25EF.000×10`  

Sono gli stessi articoli con/senza `.000`. **Accettare.**

---

### A2. KT 40 ↔ Ordine 46799 — [OK .000]

| Campo | COOP16 | PWA |
|-------|--------|-----|
| Cliente | AL.TU. ALFIERI G. A. E TUFANO N | Al.Tu. Dental Centro Odont. E Protesico S.R.L. |
| Jaccard | 0.82 | — |

**Differenza:** `DS37A×1` (KT) ↔ `DS37A.000×1` (PWA). Stesso articolo. **Accettare.**

---

### A3. KT 145 ↔ Ordine 47978 — [OK .000]

| Campo | COOP16 | PWA |
|-------|--------|-----|
| Cliente | DI DOMENICO GIANFRANCO ODONTOIATRIA | Di Domenico Gianfranco Odontoiatria S.R.L. |
| Jaccard | 0.73 | — |

**Differenza:** `SFS100×1`, `SFS101×1`, `SFS102×1`, `SF55×1` ↔ stessi con `.000`. **Accettare.**

---

### A4. KT 179 ↔ Ordine 48656 — [OK .000]

| Campo | COOP16 | PWA |
|-------|--------|-----|
| Cliente | Dr. PIETRO PERNA | Dr. Pietro Perna |
| Jaccard | 0.75 | — |

**Differenza:** `9797×1` ↔ `9797.000×1`. Stesso articolo. **Accettare.**

---

### A5. KT 25 ↔ Ordine 46665 — [VERIFICARE]

| Campo | COOP16 | PWA |
|-------|--------|-----|
| Cliente | C.DENTAL PROTESICO Dr. SENESE GIOELE | Centro Dental Protesico S.A.S. Buonomo Giovanna & C. |
| Totale | ~ | ~ |
| Jaccard | 0.75 | — |

**Anomalia:** Nomi clienti completamente diversi (Senese vs Buonomo).  
**Differenza articoli:** mancanti in PWA: `4663.314×1`, `K1SM.204.014×5`

> **Azione:** Verificare se Senese e Buonomo sono associati alla stessa entità COOP16 (stessa P.IVA?). Se nomi diversi → match sbagliato, trovare il vero ordine PWA di Senese.

---

### A6. KT 68 ↔ Ordine 47034 — [VERIFICARE]

| Campo | COOP16 | PWA |
|-------|--------|-----|
| Cliente | MAGMA CENTER s.r.l. | Magma Center S.R.L. |
| Totale ratio | 1.00 | — |
| Jaccard | 0.00 | — |

**Anomalia:** Jaccard = 0.00 (nessun articolo in comune). KT 68 ha `9598.900.220×260` ma l'ordine 47034 risulta senza articoli nel DB (non ancora sincronizzati?).  
**Ordine candidato alternativo:** Ordine 47182 (Magma Center, tot=600.02, `9598.900.220×280`) — stessa azienda ma **quantità diversa** (280 vs 260).

> **Azione:** Controllare se ordine 47034 ha `articles_synced_at IS NULL`. Se sì, il match può essere accettato (articoli non ancora caricati). Se no, verificare se il KT corretto è 47034 o 47182.

---

### A7. KT 122 ↔ Ordine 47811 — [VERIFICARE / PROBABILE SBAGLIATO]

| Campo | COOP16 | PWA |
|-------|--------|-----|
| Cliente KT | ST. Dr SANTARPIA GAETANO | — |
| Cliente Ordine | — | Pgo Italia S.T.P. S.R.L. |
| Jaccard | 0.90 | — |

**Anomalia:** Nomi clienti completamente diversi (Santarpia vs PGO Italia). High jaccard perché gli articoli si sovrappongono per coincidenza su 28 righe.  
**Differenza articoli:** mancanti: `515L.HP.012×1`, `9797×1` / extra: `9797.000×1`

> **Azione:** Cercare un ordine PWA per Santarpia Gaetano. Se trovato, questo match è sbagliato e va corretto. Se non trovato, potrebbe essere che Santarpia ordini tramite PGO Italia.

---

### A8. KT 183 ↔ Ordine 48822 — [VERIFICARE]

| Campo | COOP16 | PWA |
|-------|--------|-----|
| Cliente | C. DI MASSIMO MASCOLO srl | Centro Medico Di Massimo Moscolo Stp Srl |
| Totale ratio | 0.913 | — |
| Jaccard | 0.95 | — |

**Anomalia:** Totale non corrisponde esattamente (ratio 0.913). L'articolo `H22ALGK.314.016×5` è extra in PWA ma non nel KT 183.  
**Nota:** `H22ALGK.314.016×5` è l'unico articolo del KT 198 (Mascolo, tot=90). È possibile che l'ordine 48822 sia un ordine combinato che include sia KT 183 che KT 198.

> **Azione:** Verificare se il totale di ordine 48822 = totale KT 183 + totale KT 198. Se sì, l'ordine fu fatto come unico ordine PWA ma separato in due KT in Arca. Potrebbe richiedere una gestione manuale.

---

### A9. KT 416 ↔ Ordine 52084 — [SBAGLIATO — DA CORREGGERE]

| Campo | COOP16 | PWA |
|-------|--------|-----|
| Cliente KT | Dr.CARRAZZA GIOVANNI | — |
| Cliente Ordine | — | Centro Dental Zeta Srl |
| Totale ratio | **0.185** | — |
| Jaccard | 0.90 | — |

**Match ERRATO.** KT 416 appartiene a Carrazza ma è stato matchato all'ordine 52084 (Dental Zeta) per via degli articoli simili.

**Situazione reale:**
- **KT 426** (Dental Zeta, tot=650.03, 9 articoli) → corrisponde a **Ordine 52084** (Dental Zeta, tot=650.03)
- **KT 416** (Carrazza, tot≈120) → corrisponde probabilmente a **Ordine 46883** (Carrazza Giovanni, tot=120, `9816.000×20`)

> **Azione:**
> 1. Rimuovere il match KT 416 ↔ 52084
> 2. Abbinare KT 416 ↔ Ordine 46883 (verificare articoli: KT 416 ha 10 articoli ma ordine ha solo `9816.000×20` — controllare se è un test KT corrotto)
> 3. Abbinare KT 426 ↔ Ordine 52084 (KT 426 è uno dei test KT che ha `arca_kt_synced_at` settato — vedi Sezione B)

---

## SEZIONE B — KT non matchati (34)

### B1. Coppie con match quasi certo (24)

Tutti i casi sotto hanno la stessa causa: i codici articolo nel KT non hanno il suffisso `.000` mentre nella PWA sì (o leggeri arrotondamenti di totale ≤ €0.03).

| KT | Nome cliente COOP16 | Tot KT | Ordine | Nome cliente PWA | Tot Ordine | Differenza |
|----|---------------------|--------|--------|------------------|------------|------------|
| **4** | CENTRO ODONTOIATRICO PAVESE | 638.68 | **46524** | Centro Odontoiatrico Pavese S.R.L. | 638.68 | `SFD1F` vs `SFM1F` (1 art diverso!) |
| **19** | Dr. SCOVOTTO GIANFRANCO | 280.00 | **46645** | Scovotto Gianfranco | 280.00 | `.000` suffix |
| **22** | ST. AUTUORI di MATTEO | 88.86 | **46643** | Autuori Matteo | 88.87 | +€0.01, `.000` |
| **35** | Dr. PROCIDA VLADIMIRO | 400.00 | **46707** | Dott. Procida Vladimiro Odontoiatra | 400.00 | `.000` suffix |
| **41** | DENTAL LAB di DRAGONETTI EMANUELE | 149.88 | **46796** | Emanuele Dragonetti Lab. Odont. Tec. | 149.88 | `.000` suffix |
| **51** | Dr.MAGLIANO ANTONIO | 595.01 | **46976** | Magliano Antonio | 595.01 | `661.204.420` vs `661A.204.420` |
| **52** | STUDIO DENT. SORRISO & SALUTE | 500.00 | **46875** | Studio Dentistico Sorriso & Salute | 500.00 | `.000` suffix |
| **59** | LAB.ODONT. MARIO - MAZZIOTTI | 280.01 | **46977** | Dental Perfect Di Mazziotti Mario | 280.00 | -€0.01, `.000` |
| **83** | CENTRO MED. DENT. CILENTANO | 340.00 | **47168** | Centro Medico Dent. Cilentano Srl | 340.02 | +€0.02, `LD1500B` (no `.000`) |
| **118** | ST. ODONTOIATRICO MANFREDONIA | 540.00 | **47744** | Studio Odont. Manfredonia Stp Srl | 539.99 | -€0.01, `.000` |
| **120** | CENTRO ODONT."CUPO" ANTONELLO | 3137.24 | **48070** | Centro Odont. Cupo S.A.S | 3137.24 | `.000` + SF articles |
| **121** | IADANZA s.a.s. | 1249.99 | **47763** | Iadanza S.R.L. | 1249.98 | -€0.01, `.000` |
| **124** | Dr. GIUDICE MATTIA RUBEN | 260.01 | **47762** | Giudice Dott. Mattia Ruben | 259.99 | -€0.02, `.000` |
| **151** | Dr. ANTONIO DRAGONETTI | 1096.79 | **48229** | Dragonetti Antonio | 1096.79 | **ESATTO** |
| **171** | BLANCO S.R.L. S.T.P.B | 768.45 | **48428** | Blanco S.R.L. Societa Tra Professionisti | 768.46 | +€0.01, `WS25` vs `WS25.000` |
| **177** | Dr. GIOVANNI FALCONE | 925.42 | **48533** | Falcone Giovanni | 925.41 | -€0.01, `.000` |
| **181** | Dott. ANDREA MAMMOLA | 1096.83 | **48661** | Dott. Andrea Mammola | 1096.81 | -€0.02, `.000` |
| **188** | Dr. CIAMPAGLIA GABRIELE | 165.01 | **48796** | Ciampaglia Dott. Gabriele | 165.01 | **ESATTO** |
| **206** | CENTRO ODONTOIATRICO PAVESE | 691.50 | **49006** | Centro Odontoiatrico Pavese S.R.L. | 691.50 | **ESATTO** (`SFD1F.000` ok) |
| **241** | LA CASA DEL SORRISO S.R.L. | 309.99 | **49391** | La Casa Del Sorriso S.R.L. | 309.99 | **ESATTO** |
| **275** | Dr. COZZOLINO GIUSEPPE | 500.00 | **50203** | Dott. Cozzolino Giuseppe | 500.01 | +€0.01, `.000` |
| **296** | Dr.MAGLIANO ANTONIO | 260.01 | **50362** | Magliano Antonio | 260.00 | -€0.01, `.000` |
| **379** | D.ssa GNAZZO NICOLETTA | 1096.79 | **51489** | Dott.Ssa Gnazzo Nicoletta | 1096.80 | +€0.01, `.000` |
| **414** | VENEZIA sas Dr. Gino Ambrosio | 313.60 | **46530** | Gino Leonardo Alfredo Ambrosio | 313.60 | **ESATTO** (RIPARAZIONI = skip art) |

**Note particolari:**
- **KT 4:** `SFD1F` nel KT vs `SFM1F.000` nell'ordine — articolo diverso (D=Diamond? vs M=Metal?). Verificare se è un errore di inserimento o prodotto equivalente.
- **KT 51:** `661.204.420` vs `661A.204.420` — potrebbe essere lo stesso prodotto con variante A.
- **KT 120:** Attenzione, ci sono anche ordini 47761 (2026-02-04, tot=3136.98) e 48068+48070 (2026-02-10). Il candidato più probabile è **48070** (totale esatto). L'ordine 47761 potrebbe essere una versione precedente annullata.

---

### B2. Casi con discrepanza significativa da analizzare (7)

| KT | Nome | Tot KT | Candidato ordine | Tot Ordine | Problema |
|----|------|--------|------------------|------------|---------|
| **189** | GRAMPONE STP | 100.00 | — | — | Art `1092312 CAVO APICALE×1` non trovato in nessun ordine PWA. Cercare per GRAMPONE. |
| **198** | C. DI MASSIMO MASCOLO | 90.00 | Probabile: incluso in Ordine **48822** | — | L'art `H22ALGK.314.016×5` appare come extra nell'Ordine 48822 (già matchato a KT 183). L'ordine 48822 potrebbe coprire entrambi i KT. |
| **207** | LABORATORIO DAFFY DENTAL | 365.00 | **49004** | 365.00 | Totale identico ma `SF1982×1` nel KT vs `SF1982.000×10` nell'ordine (quantità ×10 vs ×1!). Verificare. |
| **242** | Dr.AMORUSO ALESSANDRO | 240.00 | **49395** | 258.85 | Tot diverso di €18.85 — differenza significativa. Stesso articolo `TD3576`. Verificare prezzi. |
| **258** | Dr.SOLE GIUSEPPE | 220.00 | — | — | Art `4676A.104×1`. Nessun ordine PWA trovato per Sole Giuseppe. |
| **270** | STUDIO ODONT. di ALDO ANNARUMMA | 1395.01 | **49860** | 1090.11 | Tot diverso di €305 — differenza molto significativa. Anche `661.314.420` vs `661A.314.420`. |
| **282** | PERFECT-SMILE DENTAL CARE | 220.00 | — | — | Art `8859.314.010×5`, `8392.314.016×5`, `H23VIP.314.016×5`. Nessun ordine PWA trovato per Perfect-Smile. |

---

### B3. Test KT — da gestire separatamente (3)

Questi KT sono stati scritti in COOP16 durante test di sviluppo il 2026-04-02. Hanno `arca_kt_synced_at` settato nel DB ma non corrispondono a veri ordini recenti.

| KT | Nome COOP16 | Tot | Ordine PWA probabile | Azione richiesta |
|----|-------------|-----|----------------------|------------------|
| **426** | DENTAL ZETA | 650.03 | **52084** (attualmente abbinato erroneamente a KT 416) | 1. Eliminare KT 426 da COOP16 (riga di test) 2. Abbinare KT 416 a 52084 oppure creare nuova KT corretta |
| **427** | CENTRO ODONT. ELITE GIUSEPPE | 369.99 | Non trovato | Cercare ordine Elite/Mansueto nel DB PWA post-2026-03-09 |
| **437** | CORRADO GIOVANNI "ELBA DENTAL" | 490.03 | Non trovato | Cercare ordine Elba Dental nel DB PWA |

**Articoli KT 427:** `5855.314.025×5`, `6863D.314.016×5`, `KP6881.314.016×5`, `6837KR.314.012×5`, `6847KR.314.016×5`  
**Articoli KT 437:** `DCB5BA.104.220×5`, `DCB6BA.104.120×5`

> **Azione globale test KT:** Prima del re-sync, eseguire:
> ```sql
> -- Verifica
> SELECT id, customer_name, created_at, total_with_vat, arca_kt_synced_at
> FROM agents.order_records
> WHERE arca_kt_synced_at IS NOT NULL
>   AND user_id = 'bbed531f-97a5-4250-865e-39ec149cd048';
> ```
> Poi resettare `arca_kt_synced_at = NULL` per gli ordini dei test KT una volta identificati.

---

## SEZIONE C — Ordini PWA non matchati (51)

### C1. Ordini vuoti / annullati (tot=0) — 13

Probabilmente ordini creati e poi annullati o non completati. Non richiedono KT in Arca.

| Ordine | Cliente | Data | Motivo probabile |
|--------|---------|------|-----------------|
| 47181 | Dragonetti Antonio | 2026-01-26 | Duplicato / annullato (47180 ha stessi dati con tot≠0) |
| 47183 | Magma Center S.R.L. | 2026-01-26 | Duplicato / annullato (47182 ha tot=600.02) |
| 47930 | Centanni Gianluca | 2026-02-06 | Sostituito da 47932 (tot=320.43) |
| 48003 | Studio Odont. Manfredonia | 2026-02-09 | Duplicato annullato (48002 ha tot=539.97) |
| 48061 | Odontoiatrica Ferraioli | 2026-02-10 | Annullato (48065 ha tot=1096.77) |
| 48068 | Centro Odont. Cupo | 2026-02-10 | Annullato prima (48070 ha tot=3137.24 = KT 120) |
| 48071 | Giudice Dott. Mattia Ruben | 2026-02-10 | Annullato (48072 ha tot=259.97) |
| 49762 | Amoruso Dott. Alessandro | 2026-03-03 | Annullato (49395 ha tot=258.85) |
| 49765 | Vicidomini Dr.Ssa Elvira | 2026-03-03 | Annullato (49312 ha tot=158.84) |
| 51442 | C. O. S. Srl | 2026-03-23 | Vuoto |
| 51446 | C. O. S. Srl | 2026-03-23 | Vuoto |
| 51532 | Vicidomini Dr.Ssa Elvira | 2026-03-24 | Vuoto |
| 51811 | Centro Marchitiello | 2026-03-27 | Vuoto (51812 è la versione con articoli) |

---

### C2. Ordini già abbinati in Sezione B (24)

Gli ordini 46524, 46530, 46643, 46645, 46707, 46796, 46875, 46976, 46977, 47168, 47744, 47762, 47763, 48002*, 48070, 48229, 48428, 48533, 48661, 48796, 49006, 49391, 50203, 50362, 51489 corrispondono ai KT listati in Sezione B1.

*Ordine 48002 (Manfredonia, tot=539.97) è un duplicato — il KT 118 va abbinato a 47744. L'ordine 48002 è probabilmente un secondo tentativo che non ha generato nuovo KT in Arca.

---

### C3. Ordini senza KT corrispondente trovato (14)

Questi ordini non hanno un KT identificabile. Potrebbero essere ordini creati dopo il cutoff di sync, ordini in attesa, o richiedere inserimento manuale in Arca.

| Ordine | Cliente | Data | Tot | Articoli | Note |
|--------|---------|------|-----|----------|------|
| **46883** | Carrazza Giovanni | 2026-01-20 | 120.00 | `9816.000×20` | Possibile match KT 416 — ma KT 416 in COOP16 ha 10 articoli e tot ~€120 non torna. Verificare contenuto reale KT 416 in COOP16. |
| **47180** | Dragonetti Antonio | 2026-01-26 | 259.98 | `T92L7.000.2×20` | Nessun KT trovato. Verificare in Arca. |
| **47182** | Magma Center S.R.L. | 2026-01-26 | 600.02 | `9598.900.220×280` | KT 68 ha ×260 (diverso). Potrebbe essere un secondo ordine separato. |
| **47932** | Centanni Gianluca | 2026-02-06 | 320.43 | `TD2364.104×1` | Nessun KT trovato. |
| **48002** | Studio Odont. Manfredonia | 2026-02-09 | 539.97 | `DS37EF.000×40`, `DS37F.000×10` | Duplicato — KT 118 abbinato a 47744. |
| **48065** | Odontoiatrica Ferraioli | 2026-02-10 | 1096.77 | `SF979.000.012×2`, `SF8979.000.014×2`, altri SF | Nessun KT trovato. |
| **48072** | Giudice Dott. Mattia Ruben | 2026-02-10 | 259.97 | `TD3578A.000×1` | Secondo ordine Giudice. KT 124 abbinato a 47762. |
| **49004** | Daffy Dental S.R.L. | 2026-02-23 | 365.00 | `1981.EM1×1`, `SF1982.000×10`, `H162SL.314.014×5` | Candidato KT 207 — ma qty SF1982: ×10 vs ×1 nel KT. |
| **49312** | Vicidomini Dr.Ssa Elvira | 2026-02-26 | 158.84 | `6801.314.016×5`, `8368.314.016×5`, `8368.314.023×5` | Nessun KT trovato. |
| **49395** | Amoruso Dott. Alessandro | 2026-02-26 | 258.85 | `TD3576.000×1` | Candidato KT 242 — ma totale diverso (240 vs 258.85). |
| **50086** | An.Di. Di Annarumma | 2026-03-06 | 250.00 | `CORSOVR.BERTONI.MAG26×1` | Iscrizione corso — non va in Arca come KT ordinario. |
| **51812** | Cliniche Dentali Marchitiello | 2026-03-27 | 387.67 | `6830L.314.018×5`, `H141AZ.205.023×5`, altri | Nessun KT trovato. |
| **49860** | An.Di. Di Annarumma | 2026-03-05 | 1090.11 | `SF11.000×1`, altri SF + `661A.314.420×10` | Candidato KT 270 — ma totale 1090 vs 1395 (diff €305). |
| **49395** | Amoruso | 2026-02-26 | 258.85 | `TD3576.000×1` | Candidato KT 242 |

---

## SEZIONE D — Ordini Fresis senza FT (12)

Questi ordini dell'account Fresis non hanno una FT corrispondente in COOP16.

| Ordine | Data | Tot | Articoli principali | Motivo |
|--------|------|-----|---------------------|--------|
| **47958** | 2026-02-09 | 419.25 | `8881.314.014×5`, `DCB4BA.104.120×1`, `DS37A.000×1`, altri | no FT trovata |
| **48227** | 2026-02-12 | 949.82 | `SF1LM×1`, `SF4.000×1`, `SF1.000×1` | no FT trovata |
| **48228** | 2026-02-12 | 333.56 | `SFD1F.000×1`, `SFM1F.000×1`, `SFD3F.000×1`, `SFM3F.000×1` | no FT trovata |
| **48934** | 2026-02-20 | 0.00 | — | no articoli nel DB |
| **49017** | 2026-02-23 | 1575.34 | `SF1LM×1`, `SF849.000.009×1`, `SF862.000.014×1`, altri SF | no FT trovata |
| **49286** | 2026-02-25 | 0.00 | `CAVO LOCALIZZATORE CON ATTACCO×1` | no FT trovata |
| **49493** | 2026-02-27 | 1165.89 | `OS30×1`, `TD3706.000×1` | no FT trovata |
| **49771** | 2026-03-03 | 12.31 | `CAVO PER MORSETTO×1` | no FT trovata |
| **50326** | 2026-03-10 | 486.79 | `9816.000×20`, `CERC.314.014×10`, altri | no FT trovata |
| **51447** | 2026-03-23 | 0.00 | — | no articoli nel DB |
| **51450** | 2026-03-23 | 0.00 | — | no articoli nel DB |
| **51787** | 2026-03-27 | 472.58 | `9603.104.100×10`, `LD1500B×1`, altri | no FT trovata |

> **Possibili cause:** Questi ordini potrebbero corrispondere a FT in COOP16 non ancora abbinate perché emesse su diversi CODICECF Fresis (`C01000 FRESIS` vs altri), oppure le FT sono state emesse ma con articoli molto diversi dalla PWA (acquisti stock vs ordini clienti).

---

## SEZIONE E — FT non assegnate ad ordini Fresis (80)

Queste FT in COOP16 non hanno un ordine Fresis corrispondente nella PWA. Probabilmente sono fatture di clienti storici che non usano la PWA (ordini telefonici, walk-in, ecc.).

### E1. FT con totale = 0 o negativo (probabili note di credito / rettifiche)

| FT | Cliente | Tot | Note |
|----|---------|-----|------|
| **49** | FRESIS (C01000) | 0.00 | Articoli di test/reso — 20 articoli |
| **99** | Dr.GIUSEPPE BARRETTA | 0.00 | Potenziale NC |
| **165** | DITTA PINZANI CARMINE | 867.39 | No articoli nel DB |
| **228** | BLANCO S.R.L. | 0.00 | `WS25F×10` |
| **343** | C.DENTAL PROTESICO SENESE | 0.00 | Articoli OS — sistema OS30 |

### E2. FT su clienti storici senza account PWA (non richiedono azione)

Questi clienti hanno solo CODICECF in COOP16, nessun account PWA. Le FT sono ordini diretti gestiti da Fresis fuori dalla app.

| Num. FT | Cliente COOP16 | Tot | Articoli |
|---------|----------------|-----|----------|
| **6** | Dr. PAUCIULO GERARDO | 65.00 | `BCR1.000×1` |
| **18** | Centro Dentale "DUE-A" | 65.00 | `350700×1` |
| **31** | CALIFANO VINCENZO MIMESI | 165.01 | kit strumentario |
| **47** | Dr. FABIO STRAZZULLO | 190.00 | `SFS101×1` |
| **56** | Dr. FABIO STRAZZULLO | 120.00 | `DS37×10` |
| **57** | Dr. ALFONSI FORTUNATO | 610.00 | kit bur periodonzio |
| **62** | LAB.ODONT.CITARELLA DOMENICO | 100.00 | `H251GSQ`, `H251EF` |
| **65** | LAB. OD. ANDREA RUSSO | 35.00 | `916D.HP.220×1` |
| **66** | LAB. "GALLUZZO" di TAGLIORETTI | 175.00 | `6911HK.104.220×1`, `ENDO-STAR×1` |
| **67** | [RCENTRO SALERNITANO | 30.00 | `946A.104.180×1` |
| **76** | LAB.ODONT.DENTAL TEAM S.R.L. faro | 190.00 | kit DCB |
| **77** | Dr.BALZANO GIULIO | 170.01 | `LD0542A×1` |
| **80** | C.D.S. CENTRO PATERNOSTER | 315.01 | `011909×4` |
| **82** | IANNOTTO ROSARIO (ALBANELLA) | 365.00 | `LD1500B×1` + `6801L` + `6801` |
| **84** | CENTRO MED. DENT. CILENTANO | 85.00 | `012065×1` |
| **85** | CENTRO MED. DENT. CILENTANO | 95.00 | kit punte fresa |
| **86** | EUDENTAL SRL | 485.00 | `661.204.420×10`, kit completo |
| **88** | LAB. GENNARO AURIEMMA | 150.00 | `6862D`, `KP6881` |
| **91** | CROMOTECNICA di RICCHEZZA | 125.00 | `351700×1`, `223000×1` |
| **92** | Dott. GIOVANNI ESPOSITO | 210.00 | `DS37A×1` |
| **93** | Dr. D'AGOSTINO CIRO | 470.01 | `BCS1.000×2`, `BCS1TIPS.000×1`, `F06L` |
| **96** | LAB.ODONT.PEPE ARTURO | 90.00 | `94027C`, `9537` |
| **97** | Dr VACCARELLA RAFFAELE | 20.00 | `GPFQ04.000.025×1` |
| **100** | STUDIO ODONT. ANNARUMMA | 1550.00 | `ADMPLBEVO×1` (sistema ADM) |
| **101** | ST.OD.di PEPE LUCIANO | 630.00 | kit completo 12 articoli |
| **103** | Dr. DOMENICO PICCOLO | 35.00 | `H251E.104.035×1` |
| **108** | D.ssa BOCCAGNA MARIA PIA | 445.00 | `H162SXL`, `H1.316.027×5`, altri |
| **112** | LAB.ODONT.DENTAL TEAM faro | 55.00 | `305.104` |
| **113** | Dr. MARIO PAPA | 4586.40 | `ADMTTL - 5,0 ERGO CO`, `ADMPLBEVO` (sistema ADM grande) |
| **123** | CENTRO ODONT. ESPOSITO | 195.00 | `DKL-5×1` |
| **131** | ODONTOIATRIA BONIFACIO | 750.00 | kit 11 articoli |
| **135** | ODONTOIATRICA FERRAIOLI s.a.s | 480.00 | `S6830L`, `801.316`, altri |
| **140** | Dr. PROCIDA VLADIMIRO | 210.00 | `661A.204.420×10`, `601A`, `645A` |
| **141** | Enzo Miele / MICHELA ACCARDO | 180.00 | `DS37A×1` |
| **146** | Dr. GIOVANNI SENATORE | 315.54 | `SFM1F×1`, `SFD1F×1` |
| **149** | Dr.MARCHESE EDOARDO | 1096.80 | `SFD1F×3`, `SFM1F×3`, `SFM3F×1`, `SFD3F×1` |
| **150** | Dr.PUCCIARELLI FRANCESCANTONIO | 1830.00 | kit SF completo |
| **164** | VENEZIA sas Dr. Gino Ambrosio | 625.00 | `GPFQ06`, `F06L`, kit chirurgico |
| **166** | Dr. PAUCIULO GERARDO | 1233.93 | kit SFS completo |
| **176** | Dr. ROSARIO REALE | 235.00 | `17325` serie + `G180.204.S×1` |
| **186** | LAB.ODONT.OPROMOLLA FILIPPO | 410.01 | `SF862.000.014×1`, `SFD1F×1`, `SF30D` |
| **190** | SMILE DIFFERENT S.R.L.S. | 180.00 | `834.314.021×1`, kit estetico |
| **213** | Dr. GALIZIA GIANPAOLO | 2330.00 | kit SF + `SF849`, `SF862`, `SFS101` |
| **220** | Dr. MASSIMILIANO DE ANGELIS | 280.00 | `SFD1F×1`, `SFM1F×1` |
| **225** | DE.MA DENTAL di DE MARTINO | 180.00 | `351700×1`, `223000×1`, `351000×1` |
| **230** | DOTT. MAURIZIO DE STEFANO | 150.00 | `SFS120.000.030×1` |
| **235** | LAB.ODONT.GIOVANNI MARMO | 60.00 | `401000×1` |
| **244** | C.D.A. CENTRO DENTALE AMBULATORIALE | 100.00 | `6801.314.012×5`, `801.316.010×5` |
| **252** | Dr D'ANTUONO CARMINE | 1985.04 | `OS30×1`, `TD3706×1` |
| **255** | LAB.ODONT.DENTAL TEAM faro | 155.00 | `9552.900.250×10`, `9634.000.030×10`, `858` |
| **263** | CAPOZZOLO sas | 125.00 | `DS37EF×10` |
| **267** | Dr. GIOVANNI GUIDA | 120.00 | `4680.204×1` |
| **271** | STUDIO ODONT. ANNARUMMA | 140.00 | `SFS120.000.030×1` |
| **277** | Dr. SPINELLI GIOVANNI | 1045.00 | kit grande 10 articoli |
| **283** | GRAMPONE STP | 560.00 | `4118×1`, `4119×1` |
| **286** | RG DENTAL SRLS | 330.00 | kit chirurgico 6 articoli |
| **289** | LAB.ODONT. MARIO - MAZZIOTTI | 100.00 | `9816×20` |
| **291** | ST. DENTISTICO RAFFAELE D'AURIA | 759.00 | kit completo 14 articoli |
| **302** | LAB.ODONT. MARIO - MAZZIOTTI | 260.01 | `94003SC`, `DCB5BA`, `DCB7BA` |
| **303** | Dr. ANTONINO PEPE | 600.01 | kit 9 articoli |
| **316** | Prof. Dr. COLELLA GIUSEPPE | 210.01 | `227B.204.050×1`, `227A.204.050×1` |
| **327** | RG DENTAL SRLS | 40.00 | `329.104×4` |
| **328** | Dr.MASSIMO CRESCENZI | 10.00 | `314.104×1` |
| **329** | STUDIO Dr. MARCO CIRMENI | 297.67 | kit 15 articoli |
| **341** | DENTAL PROSTETIC di CELENTANO | 45.01 | `9485C.104.250×9` |
| **343** | C.DENTAL PROTESICO SENESE | 0.00 | kit OS (vedi E1) |
| **356** | LAB.ODONT.PANTALENA LUCIO | 165.01 | `H356RXE.103.023×1`, `671.104.120×20` |
| **357** | Dr. D'AGOSTINO CIRO | 70.00 | `BCR1.000×1` |
| **365** | C.DENTAL PROTESICO SENESE | 2390.00 | kit OS completo 15 articoli |
| **366** | ST. ODONTOIATRICO PASSARO CARMINE | 225.00 | `H254LE.314.012×5`, `012065×1` |
| **369** | Dr. FABIO STRAZZULLO | 250.01 | `DS37×20` |
| **375** | Dr.GIUSEPPE SALERNO ROSA | 75.01 | `94026M.204.100×5` |
| **386** | Dr. CARMINE APICELLA | 340.01 | `911HK.104.220×1`, kit endodontico |
| **409** | Dr. FERDINANDO AULETTA | 500.00 | `6801L.314.016×8`, kit F06 |
| **411** | LAB.ODON. di SENATORE GENNARO | 440.01 | `6863.104.016×5`, `863.104.012×5`, altri |
| **413** | Dssa LUCIA LEMBO | 460.00 | `801.315×10`, `880.314.012×5`, `ENDO-STAR×1` |

---

## Appendice — Query DB utili

### Verifica arca_kt_synced_at per ordini non matchati

```sql
SELECT id, customer_name, 
       created_at::date AS data,
       total_with_vat,
       arca_kt_synced_at,
       sent_to_verona_at IS NOT NULL AS inviato_verona
FROM agents.order_records
WHERE user_id = 'bbed531f-97a5-4250-865e-39ec149cd048'
  AND id IN (46883, 47180, 47182, 47932, 48065, 49312, 49395, 49004, 51812)
ORDER BY id;
```

### Verifica ordini test KT (arca_kt_synced_at settato)

```sql
SELECT id, customer_name, created_at::date, total_with_vat, arca_kt_synced_at
FROM agents.order_records
WHERE user_id = 'bbed531f-97a5-4250-865e-39ec149cd048'
  AND arca_kt_synced_at IS NOT NULL
  AND EXTRACT(YEAR FROM created_at) = 2026
ORDER BY arca_kt_synced_at;
```

### Reset test KT (ATTENZIONE: solo dopo verifica manuale)

```sql
-- Reset arca_kt_synced_at per ordini test KT 426-437
-- Sostituire gli ID con quelli reali trovati dalla query sopra
UPDATE agents.order_records
SET arca_kt_synced_at = NULL
WHERE user_id = 'bbed531f-97a5-4250-865e-39ec149cd048'
  AND id IN (/* inserire IDs */);
```

### Verifica articoli per ordine specifico

```sql
SELECT a.article_code, a.quantity, a.description
FROM agents.order_articles a
WHERE a.order_id = 47034  -- sostituire con l'ID desiderato
ORDER BY a.article_code;
```
