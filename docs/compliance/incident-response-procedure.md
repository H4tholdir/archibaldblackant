# Incident Response Procedure — Archibald PWA

**Versione**: 1.0
**Data**: 2026-04-02
**Responsabile**: Formicola Francesco
**Riferimento normativo**: GDPR Art. 33, NIS 2 Art. 21.2.b, D.Lgs. 138/2024

---

## 1. Classificazione degli incidenti

| Livello | Descrizione | Esempi |
|---|---|---|
| **P1 — Critico** | Dati personali esposti o rubati, accesso non autorizzato confermato | DB dump esfiltrato, credenziali compromesse, ransomware, accesso non autorizzato verificato |
| **P2 — Alto** | Servizio non disponibile >4h, sospetto accesso anomalo non confermato | VPS down prolungato, circuit breaker bloccato, pattern login anomali |
| **P3 — Medio** | Degradazione servizio, anomalia non confermata | Backup fallito, errori 500 elevati, alert email non consegnate |

---

## 2. Procedura di risposta

### P1 — Incidente critico

```
Incidente rilevato (alert automatico o rilevamento manuale)
           ↓
Valutazione immediata: i dati personali sono stati compromessi?
           ↓
        Sì → ATTIVARE PROCEDURA P1
        No → Valutare P2

PROCEDURA P1:
1. Entro 1 ora dal rilevamento:
   - Isolare il sistema se necessario: docker stop backend
   - Raccogliere evidenze: logs, audit_log DB, screen catture
   - NON cancellare nulla

2. Entro 4 ore:
   - Notificare Komet Italia (referente contratto)
   - Usare template notifica (sezione 4)

3. Entro 24 ore:
   - Early warning ACN: https://www.acn.gov.it/portale/segnalazione-incidenti

4. Entro 72 ore dal rilevamento (GDPR Art. 33):
   - Notifica formale al Garante Privacy se dati personali coinvolti
   - URL: https://www.garanteprivacy.it/web/guest/notifica-data-breach
   - Allegare: natura violazione, categorie dati, numero interessati (stima), misure adottate
```

### P2 — Incidente alto

```
1. Entro 24 ore: notificare Komet Italia
2. Valutare se escalare a P1
3. Documentare nel log incidenti
```

### P3 — Incidente medio

```
1. Documentare nel log interno
2. Comunicare a Komet in report mensile
3. Definire azione correttiva
```

---

## 3. Contatti di emergenza

| Ruolo | Contatto |
|---|---|
| Responsabile tecnico (Francesco) | [inserire email + telefono] |
| Referente Komet Italia | [inserire al momento della firma contratto] |
| ACN CSIRT Italia | incidenti@csirt.gov.it |
| Garante Privacy | https://www.garanteprivacy.it/web/guest/notifica-data-breach |

---

## 4. Template notifica a Komet (P1)

```
Oggetto: [SICUREZZA ARCHIBALD] Incidente rilevato — <YYYY-MM-DD>

Gentile [Nome referente Komet],

Si notifica un incidente di sicurezza rilevato in data <data> alle <ora> (UTC+2).

NATURA DELL'INCIDENTE:
<descrizione sintetica>

DATI POTENZIALMENTE COINVOLTI:
- Categorie: <es. "anagrafiche clienti", "dati di accesso agenti">
- Numero stimato interessati: <numero o "in corso di verifica">

STATO ATTUALE:
- Sistema isolato: [Sì / No — motivazione]
- Accesso non autorizzato confermato: [Sì / No]

MISURE ADOTTATE:
- <lista azioni in corso>

PROSSIMI PASSI:
- <lista>

Prossimo aggiornamento: entro <data e ora>

Formicola Francesco
P.IVA [inserire]
```

---

## 5. Post-incident report

Entro 7 giorni dall'incidente, creare:
`docs/compliance/incidents/YYYY-MM-DD-<tipo-incidente>.md`

Struttura:
- Timeline completa (quando rilevato, quando notificato, quando risolto)
- Root cause analysis
- Impatto effettivo sui dati
- Misure correttive implementate
- Misure preventive pianificate con date

---

## 6. Come i sistemi rilevano gli incidenti

Il sistema di alerting automatico (implementato in Archibald) invia email a `SECURITY_ALERT_EMAIL` per:
- Circuit breaker scattato su qualsiasi agente
- 1+ login falliti su account admin/ufficio
- 5+ login falliti su account agent
- Backup PostgreSQL fallito
- Rate limit colpito su account admin
- >10 errori HTTP 500 in 5 minuti

Questi alert sono il punto di ingresso della presente procedura.
