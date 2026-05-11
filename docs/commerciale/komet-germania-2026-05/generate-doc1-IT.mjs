import puppeteer from '/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logoB64 = readFileSync('/Users/hatholdir/Downloads/Archibald/archibald-web-app/frontend/dist/formicaneralogo.png').toString('base64');
const logoSrc = `data:image/png;base64,${logoB64}`;

const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Formicanera — Presentazione per Komet Germania</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
:root{
  --navy:#1a1a2e;--navy2:#16213e;--navy3:#0f3460;
  --gold:#c8a96e;--gold-light:#f5edd8;--gold-mid:#e8d5a3;
  --text:#2d2d2d;--text-mid:#4b5563;--text-light:#6b7280;
  --border:#e5e7eb;--bg:#f9fafb;
  --green:#059669;--green-light:#ecfdf5;
  --red:#dc2626;--blue:#3b82f6;
}
@page{margin:0;}
html,body{font-family:'Inter',-apple-system,sans-serif;color:var(--text);background:#fff;font-size:10pt;line-height:1.65;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
.pb-before{break-before:page;page-break-before:always;}
h1,h2,h3{break-after:avoid;page-break-after:avoid;}
h1{font-size:17pt;font-weight:800;color:var(--navy);padding-bottom:10px;border-bottom:2.5px solid var(--gold);margin-bottom:20px;}
h1 .n{color:var(--gold);margin-right:7px;}
h2{font-size:11.5pt;font-weight:700;color:var(--navy);margin-top:22px;margin-bottom:10px;}
p{margin-bottom:10px;line-height:1.72;}
ul{margin-left:18px;margin-bottom:10px;}
li{margin-bottom:5px;line-height:1.6;}
strong{font-weight:700;color:var(--navy);}
em{color:var(--text-light);font-style:italic;}

/* ── COVER ── */
.cover{
  width:100%;min-height:297mm;
  background:linear-gradient(160deg,var(--navy) 0%,var(--navy2) 60%,var(--navy3) 100%);
  display:flex;flex-direction:column;justify-content:space-between;
  padding:56px 68px;position:relative;overflow:hidden;
  break-after:page;page-break-after:always;
}
.cover::before{content:'';position:absolute;top:-140px;right:-140px;width:560px;height:560px;border-radius:50%;background:radial-gradient(circle,rgba(200,169,110,.11) 0%,transparent 65%);}
.cover::after{content:'';position:absolute;bottom:-100px;left:-100px;width:440px;height:440px;border-radius:50%;background:radial-gradient(circle,rgba(200,169,110,.06) 0%,transparent 65%);}
.cover-top{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;}
.cover-logo-wrap{display:flex;align-items:center;gap:14px;}
.cover-logo-img{width:60px;height:60px;object-fit:contain;filter:drop-shadow(0 4px 16px rgba(0,0,0,.45));}
.cover-brand{font-size:10pt;font-weight:300;color:rgba(255,255,255,.45);letter-spacing:4.5px;text-transform:uppercase;}
.cover-conf{font-size:7.5pt;color:rgba(255,255,255,.32);letter-spacing:2px;text-transform:uppercase;border:1px solid rgba(255,255,255,.15);padding:5px 13px;border-radius:3px;}
.cover-main{position:relative;z-index:1;flex:1;display:flex;flex-direction:column;justify-content:center;padding:64px 0 48px;}
.cover-eyebrow{display:flex;align-items:center;gap:12px;margin-bottom:20px;}
.cover-eyebrow-line{width:40px;height:2px;background:var(--gold);}
.cover-eyebrow-text{font-size:8pt;font-weight:700;color:var(--gold);letter-spacing:3.5px;text-transform:uppercase;}
.cover-title{font-family:'Playfair Display',Georgia,serif;font-size:38pt;font-weight:800;color:#fff;line-height:1.1;margin-bottom:20px;}
.cover-title em{font-style:normal;color:var(--gold);}
.cover-desc{font-size:11.5pt;font-weight:300;color:rgba(255,255,255,.58);max-width:530px;line-height:1.65;margin-bottom:38px;}
.cover-scope{display:flex;flex-direction:column;gap:9px;}
.cover-scope-item{display:flex;align-items:center;gap:10px;font-size:9pt;color:rgba(255,255,255,.52);}
.cover-scope-item::before{content:'';width:5px;height:5px;border-radius:50%;background:var(--gold);flex-shrink:0;}
.cover-bottom{position:relative;z-index:1;border-top:1px solid rgba(255,255,255,.1);padding-top:26px;}
.cover-meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;}
.cover-meta-item label{font-size:7pt;color:rgba(255,255,255,.3);letter-spacing:2px;text-transform:uppercase;display:block;margin-bottom:5px;}
.cover-meta-item span{font-size:9pt;color:rgba(255,255,255,.75);font-weight:500;line-height:1.45;}

/* ── LAYOUT ── */
.section{padding:38px 68px 30px;}

/* ── TYPOGRAPHY ── */
.lead{font-size:11pt;color:var(--text-mid);line-height:1.75;max-width:680px;margin-bottom:22px;}
.callout{background:var(--gold-light);border-left:4px solid var(--gold);padding:14px 20px;margin:16px 0;border-radius:0 7px 7px 0;}
.callout p{margin:0;font-size:9.5pt;line-height:1.65;}
.callout-navy{background:var(--navy);border-left-color:var(--gold);}
.callout-navy p{color:rgba(255,255,255,.88);}
.callout-navy strong{color:var(--gold);}

/* ── TABLES ── */
table{width:100%;border-collapse:collapse;font-size:8.5pt;margin:16px 0;}
thead tr{background:var(--navy);}
thead th{padding:11px 13px;text-align:left;font-weight:600;color:rgba(255,255,255,.9);font-size:8pt;letter-spacing:.3px;}
tbody tr{border-bottom:1px solid var(--border);}
tbody tr:nth-child(even){background:var(--bg);}
td{padding:10px 13px;vertical-align:middle;line-height:1.5;}
td.check{color:var(--green);font-weight:700;text-align:center;font-size:10pt;}
td.cross{color:var(--red);font-weight:700;text-align:center;font-size:10pt;}
.market-note{font-size:7.5pt;color:var(--text-light);margin-top:8px;font-style:italic;line-height:1.55;}

/* ── BEFORE/AFTER TABLE ── */
.before-after{width:100%;border-collapse:collapse;font-size:8.5pt;margin:14px 0;}
.before-after thead tr{background:var(--navy);}
.before-after thead th{padding:10px 12px;text-align:left;color:rgba(255,255,255,.9);font-size:8pt;}
.before-after tbody tr{border-bottom:1px solid var(--border);}
.before-after tbody tr:nth-child(even){background:var(--bg);}
.before-after td{padding:9px 12px;vertical-align:top;line-height:1.5;}
.before-after td:first-child{font-weight:600;color:var(--navy);width:22%;}
.before-after td.erp-col{color:var(--text-light);width:37%;font-size:8pt;}
.before-after td.pwa-col{color:var(--green);width:41%;font-weight:500;}

/* ── FEATURE GRID ── */
.feature-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0;}
.feature-card{border:1px solid var(--border);border-radius:10px;padding:14px 16px;background:#fff;}
.feature-card-icon{font-size:18pt;margin-bottom:6px;}
.feature-card-title{font-size:10pt;font-weight:700;color:var(--navy);margin-bottom:6px;}
.feature-card-list{font-size:8pt;color:var(--text-mid);line-height:1.6;}
.feature-card-list li{margin-bottom:3px;}

/* ── ROADMAP GRID ── */
.roadmap-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:14px 0;}
.roadmap-card{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 14px;}
.roadmap-card-icon{font-size:14pt;margin-bottom:4px;}
.roadmap-card-title{font-size:9pt;font-weight:700;color:var(--navy);margin-bottom:4px;}
.roadmap-card-desc{font-size:7.5pt;color:var(--text-light);line-height:1.45;}

/* ── STAT HERO ── */
.stat-hero{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0;}
.stat-box{background:var(--navy);border-radius:10px;padding:14px 16px;text-align:center;}
.stat-value{font-size:20pt;font-weight:900;color:var(--gold);line-height:1;margin-bottom:4px;}
.stat-label{font-size:7.5pt;color:rgba(255,255,255,.55);line-height:1.4;}

/* ── ROI ── */
.roi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin:10px 0;}
.roi-card{border:1px solid var(--border);border-radius:10px;padding:13px 16px;background:#fff;}
.roi-card-icon{font-size:16pt;margin-bottom:4px;}
.roi-card-value{font-size:17pt;font-weight:900;color:var(--navy);line-height:1;margin-bottom:3px;}
.roi-card-value span{color:var(--gold);}
.roi-card-label{font-size:8.5pt;font-weight:600;color:var(--navy);margin-bottom:3px;}
.roi-card-desc{font-size:7.5pt;color:var(--text-light);line-height:1.45;}
.roi-total{background:var(--navy);border-radius:10px;padding:13px 20px;margin-top:4px;display:flex;align-items:center;justify-content:space-between;}
.roi-total-label{font-size:9pt;color:rgba(255,255,255,.6);}
.roi-total-value{font-size:18pt;font-weight:900;color:var(--gold);}
.roi-total-sub{font-size:7pt;color:rgba(255,255,255,.3);margin-top:2px;}

/* ── STEPS ── */
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0;}
.step{background:#fff;border:1px solid var(--border);border-radius:8px;padding:15px;}
.step-num{font-size:7.5pt;font-weight:700;color:var(--gold);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px;}
.step-title{font-size:9.5pt;font-weight:700;color:var(--navy);margin-bottom:4px;}
.step-desc{font-size:8pt;color:var(--text-light);line-height:1.5;}

/* ── SECURITY GRID ── */
.security-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0;}
.security-item{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px 16px;}
.security-item-icon{font-size:16pt;margin-bottom:6px;}
.security-item-title{font-size:9.5pt;font-weight:700;color:var(--navy);margin-bottom:5px;}
.security-item-desc{font-size:8pt;color:var(--text-mid);line-height:1.55;}

/* ── FOOTER ── */
.doc-footer{
  background:var(--navy);padding:20px 68px;
  display:flex;justify-content:space-between;align-items:center;
}
.footer-left{display:flex;align-items:center;gap:14px;}
.footer-logo{width:46px;height:46px;object-fit:contain;}
.footer-brand{color:var(--gold);font-weight:700;font-size:13pt;}
.footer-sub{font-size:7.5pt;color:rgba(255,255,255,.35);margin-top:3px;}
.footer-meta{font-size:7.5pt;color:rgba(255,255,255,.3);text-align:right;line-height:1.85;}

/* ── MODULE ARCH ── */
.module-row{display:flex;gap:10px;margin:14px 0;}
.module-base{flex:1;background:var(--navy);border-radius:10px;padding:16px 18px;color:#fff;}
.module-base-title{font-size:9pt;font-weight:700;color:var(--gold);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;}
.module-base-list{list-style:none;margin:0;}
.module-base-list li{font-size:8pt;color:rgba(255,255,255,.75);padding:3px 0;border-bottom:1px solid rgba(255,255,255,.07);}
.module-base-list li:last-child{border-bottom:none;}
.module-opt{flex:1;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:16px 18px;}
.module-opt-title{font-size:9pt;font-weight:700;color:var(--navy);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;}
.module-opt-list{list-style:none;margin:0;}
.module-opt-list li{font-size:8pt;color:var(--text-mid);padding:3px 0;border-bottom:1px solid var(--border);display:flex;gap:7px;}
.module-opt-list li:last-child{border-bottom:none;}
.module-opt-list li::before{content:'→';color:var(--gold);flex-shrink:0;}
</style>
</head>
<body>

<!-- ══════════════════ COVER ══════════════════ -->
<div class="cover">
  <div class="cover-top">
    <div class="cover-logo-wrap">
      <img src="${logoSrc}" class="cover-logo-img" alt="Formicanera">
      <div class="cover-brand">Formicanera</div>
    </div>
    <div class="cover-conf">Riservato — Gebr. Brasseler GmbH &amp; Co. KG</div>
  </div>
  <div class="cover-main">
    <div class="cover-eyebrow">
      <div class="cover-eyebrow-line"></div>
      <div class="cover-eyebrow-text">Presentazione della soluzione</div>
    </div>
    <div class="cover-title">Una piattaforma costruita<br><em>dall'interno</em>.<br>Pensata per chi<br>lavora sul campo.</div>
    <div class="cover-desc">Il vantaggio competitivo per gli agenti Komet — uno strumento nato dall'esperienza diretta, già in produzione, già collaudato su ordini e clienti reali ogni giorno.</div>
    <div class="cover-scope">
      <div class="cover-scope-item">PWA installabile su qualsiasi dispositivo — zero app store, zero configurazioni</div>
      <div class="cover-scope-item">Sincronizzazione automatica con ERP Archibald — l'agente non deve mai aprire il gestionale</div>
      <div class="cover-scope-item">Già in produzione — non un prototipo, non una demo</div>
      <div class="cover-scope-item">Conformità GDPR · Hosting Germania · Crittografia standard bancario</div>
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-meta-grid">
      <div class="cover-meta-item"><label>Preparato da</label><span>Francesco Formicola<br>Formicanera</span></div>
      <div class="cover-meta-item"><label>Destinatari</label><span>Philipp Rovina<br>Gebr. Brasseler GmbH &amp; Co. KG</span></div>
      <div class="cover-meta-item"><label>Data</label><span>Maggio 2026</span></div>
      <div class="cover-meta-item"><label>Status</label><span>In produzione</span></div>
    </div>
  </div>
</div>

<!-- ══════════════════ SEZ 1 — IL GAP ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">1.</span>Il Gap: L'ERP nel 2026 non è fatto per chi lavora in mobilità</h1>
  <p class="lead">L'ERP Archibald è uno strumento funzionale — ma è stato progettato per essere usato da una scrivania, con un PC fisso e una connessione stabile. Il mondo degli agenti commerciali non funziona così.</p>

  <p>Un agente Komet lavora sul campo. Entra in uno studio dentistico, in un laboratorio odontotecnico, in una clinica. Ha bisogno di rispondere a domande in tempo reale: <em>"Quando arriva il mio ordine? Ho ancora a listino quella fresa? Posso avere la fattura di marzo?"</em></p>

  <div class="callout callout-navy">
    <p>Ogni operazione che dovrebbe richiedere <strong>trenta secondi</strong> ne richiede <strong>dieci minuti</strong>. Ogni informazione che dovrebbe essere immediata richiede un processo. Il tempo perso non si misura solo in minuti — si misura in clienti che aspettano, opportunità che sfumano, professionalità che non si riesce a dimostrare.</p>
  </div>

  <h2>Le 8 criticità strutturali dell'ERP attuale</h2>
  <div class="security-grid">
    <div class="security-item">
      <div class="security-item-icon">📵</div>
      <div class="security-item-title">Non accessibile da mobile</div>
      <div class="security-item-desc">Nessuna app, nessuna versione responsive. L'agente deve tornare in ufficio o aprire un laptop per accedere a qualsiasi informazione.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🔕</div>
      <div class="security-item-title">Nessuna notifica proattiva</div>
      <div class="security-item-desc">L'agente deve andare a cercare attivamente ogni informazione. Nessun alert su ordini confermati, documenti disponibili, spedizioni aggiornate.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🔁</div>
      <div class="security-item-title">Operazioni manuali e ripetitive</div>
      <div class="security-item-desc">Ogni ordine richiede sequenze di click identiche sull'ERP. Nessuna automazione. Errori umani frequenti con costi di gestione misurabili.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🧩</div>
      <div class="security-item-title">Nessuna visione aggregata</div>
      <div class="security-item-desc">I dati sono dispersi in schermate diverse. Non esiste un cruscotto unico. Confrontare il fatturato di un cliente richiede navigazione manuale tra sezioni multiple.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">📎</div>
      <div class="security-item-title">Documenti non integrati</div>
      <div class="security-item-desc">DDT e fatture richiedono operazioni separate per essere recuperati. L'agente non può condividere un documento dal campo in meno di 10 minuti.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">📦</div>
      <div class="security-item-title">Nessun tracking spedizioni</div>
      <div class="security-item-desc">L'agente non sa dove si trova fisicamente una consegna. Deve chiamare il magazzino o accedere separatamente al portale del corriere.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">📴</div>
      <div class="security-item-title">Nessun supporto offline</div>
      <div class="security-item-desc">Senza connessione, l'agente è completamente cieco. In zone con segnale debole — ospedali, seminterrati, aree rurali — il gestionale diventa inutilizzabile.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🖥</div>
      <div class="security-item-title">UI pensata solo per desktop</div>
      <div class="security-item-desc">Interfaccia progettata per mouse e tastiera. Su tablet o smartphone l'esperienza è inutilizzabile. Il campo richiede un'interfaccia touch-first.</div>
    </div>
  </div>
</div>

<!-- ══════════════════ SEZ 2 — COS'È FORMICANERA ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">2.</span>Cos'è Formicanera (in 90 secondi)</h1>
  <p class="lead">Formicanera è una Progressive Web App (PWA) — un'applicazione web installabile su qualsiasi dispositivo che funziona come un'app nativa ma si aggiorna automaticamente, senza passare dagli store.</p>

  <div class="stat-hero">
    <div class="stat-box">
      <div class="stat-value">3 sec</div>
      <div class="stat-label">Tempo di installazione su qualsiasi dispositivo — iPhone, iPad, Android, laptop, desktop</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">0</div>
      <div class="stat-label">Passaggi richiesti su App Store o Google Play — aggiornamenti automatici, trasparenti</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">100%</div>
      <div class="stat-label">Sincronizzazione automatica con l'ERP Archibald — l'agente vede i dati aggiornati sempre</div>
    </div>
  </div>

  <div class="callout callout-navy">
    <p style="font-size:12pt;font-weight:300;line-height:1.65;"><strong>Il principio fondamentale di Formicanera:</strong><br>"L'agente non dovrebbe mai dover aprire l'ERP per fare il suo lavoro."</p>
  </div>

  <h2>Come funziona</h2>
  <p>Formicanera si sincronizza con Archibald in modo automatico e trasparente. Un bot dedicato — associato alle credenziali personali di ciascun agente — si connette all'ERP, recupera i dati aggiornati e li rende disponibili nella PWA. L'agente vede ordini, clienti, documenti e spedizioni senza mai aprire il gestionale.</p>
  <p>Quando l'agente crea un nuovo ordine da Formicanera, il bot lo piazza su Archibald in modo asincrono — l'agente può continuare a lavorare mentre il bot opera in background. La progressione è visibile in tempo reale. La conferma arriva come notifica push.</p>

  <div class="callout">
    <p><strong>Già in produzione.</strong> Formicanera non è un prototipo e non è una demo. È un sistema operativo ogni giorno su ordini reali con clienti reali. Ogni funzionalità è stata progettata, testata e validata nel ciclo commerciale quotidiano prima di essere rilasciata.</p>
  </div>
</div>

<!-- ══════════════════ SEZ 3 — PRIMA/DOPO ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">3.</span>Cosa Cambia Concretamente</h1>
  <p class="lead">Un confronto operazione per operazione tra il flusso attuale con l'ERP e il nuovo flusso con Formicanera.</p>

  <table class="before-after">
    <thead>
      <tr>
        <th style="width:22%">Operazione</th>
        <th style="width:37%">Con ERP Archibald</th>
        <th style="width:41%">Con Formicanera</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Consultare un ordine</td>
        <td class="erp-col">Accedi al PC, apri l'ERP, naviga tra schermate, cerca il cliente, filtra per data</td>
        <td class="pwa-col">Apri l'app, cerca il cliente — risultati in 5 secondi da qualsiasi dispositivo</td>
      </tr>
      <tr>
        <td>Piazzare un nuovo ordine</td>
        <td class="erp-col">15–20 minuti di compilazione manuale su form ERP, rischio errori su codici articolo e dati cliente</td>
        <td class="pwa-col">3–5 minuti: compila il form mobile con autocomplete, il bot inserisce su Archibald in modo asincrono</td>
      </tr>
      <tr>
        <td>Scaricare DDT o fattura</td>
        <td class="erp-col">5–10 minuti: accedi all'ERP, naviga nella sezione documenti, cerca e scarica il PDF, invia per email</td>
        <td class="pwa-col">1 tap nella scheda ordine — download immediato, condivisibile via WhatsApp o Gmail sul momento</td>
      </tr>
      <tr>
        <td>Verificare la spedizione</td>
        <td class="erp-col">Chiama il magazzino a Verona oppure accedi separatamente al portale FedEx con numero tracking manuale</td>
        <td class="pwa-col">Tracking FedEx integrato nella scheda ordine — aggiornato in tempo reale, eventi con orario e città</td>
      </tr>
      <tr>
        <td>Controllare stato cliente</td>
        <td class="erp-col">Naviga tra più schermate ERP per trovare storico ordini, indirizzi, note — impossibile da mobile</td>
        <td class="pwa-col">Scheda cliente completa in un tap: storico ordini, documenti, indirizzi alternativi, P.IVA, note</td>
      </tr>
      <tr>
        <td>Creare un preventivo</td>
        <td class="erp-col">10–15 minuti di compilazione manuale, formattazione, salvataggio ed invio per email</td>
        <td class="pwa-col">Meno di 3 secondi — un tap dallo storico ordini, PDF professionale pronto da mostrare al cliente</td>
      </tr>
      <tr>
        <td>Verificare stock articolo</td>
        <td class="erp-col">5–10 minuti tra ERP e telefonate al magazzino, risposta spesso non definitiva</td>
        <td class="pwa-col">Meno di 2 secondi — badge disponibilità in tempo reale con prezzo cliente specifico visibile</td>
      </tr>
      <tr>
        <td>Invio in batch di più ordini</td>
        <td class="erp-col">Impossibile: ogni ordine richiede una sessione manuale separata sull'ERP</td>
        <td class="pwa-col">Accumula tutti gli ordini della giornata, poi invia tutto con 1 tap — il bot esegue in sequenza automatica</td>
      </tr>
    </tbody>
  </table>

  <div class="callout">
    <p><strong>Scenario reale:</strong> l'agente visita 8 clienti in giornata. Compila ogni ordine sul momento in Formicanera. A fine giornata preme "Invia tutto" — il bot piazza tutti gli ordini su Archibald in sequenza. Zero interruzioni durante le visite. Zero lavoro manuale serale.</p>
  </div>
</div>

<!-- ══════════════════ SEZ 4 — FUNZIONALITÀ CHIAVE ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">4.</span>Funzionalità Chiave</h1>
  <p class="lead">Sei aree operative che coprono l'intero ciclo di lavoro dell'agente sul campo — dalla visita al cliente alla chiusura dell'ordine, dalla fattura al tracking.</p>

  <div class="feature-grid">
    <div class="feature-card">
      <div class="feature-card-icon">📋</div>
      <div class="feature-card-title">Ordini intelligenti</div>
      <ul class="feature-card-list">
        <li>Creazione ordine rapida con autocomplete articoli e clienti</li>
        <li>Invio asincrono via bot — l'agente non tocca mai l'ERP</li>
        <li>Pending orders: accumula tutto il giorno, invia in batch con 1 tap</li>
        <li>Modifica ordini in attesa — parità funzionale con la creazione</li>
        <li>Ricerca e copia istantanea dallo storico — zero riscrittura</li>
        <li>Comandi vocali per la ricerca articoli</li>
        <li>Gestione note di credito con stacking visivo automatico</li>
      </ul>
    </div>
    <div class="feature-card">
      <div class="feature-card-icon">👥</div>
      <div class="feature-card-title">Clienti e documenti</div>
      <ul class="feature-card-list">
        <li>Schede clienti complete e interattive con storico ordini inline</li>
        <li>DDT, fatture e note di credito scaricabili con un tap</li>
        <li>Preventivi PDF in 3 secondi — condivisibili via WhatsApp</li>
        <li>Tracking spedizioni FedEx in tempo reale nella scheda ordine</li>
        <li>Creazione cliente con validazione P.IVA automatica e auto-fill</li>
        <li>Indirizzi alternativi di consegna gestibili direttamente</li>
      </ul>
    </div>
    <div class="feature-card">
      <div class="feature-card-icon">🔍</div>
      <div class="feature-card-title">Catalogo e prezzi</div>
      <ul class="feature-card-list">
        <li>Ricerca full-text sul catalogo completo Komet — risultati istantanei</li>
        <li>Stock in tempo reale: badge verde/arancio/rosso per ogni articolo</li>
        <li>Prezzi cliente specifici — non il listino generico</li>
        <li>Alert automatici su nuovi articoli, variazioni prezzo e listino</li>
        <li>Guardrail scontistiche — protezione da errori su sconti fuori range</li>
        <li>Suggerimento articoli top sold per quel cliente specifico</li>
      </ul>
    </div>
    <div class="feature-card">
      <div class="feature-card-icon">📊</div>
      <div class="feature-card-title">Dashboard e intelligence</div>
      <ul class="feature-card-list">
        <li>Widget fatturato/commissioni/bonus/forecast in tempo reale</li>
        <li>Wizard provvigionale con obiettivi, soglie e premi visualizzati</li>
        <li>Monitoring clienti dormienti con alert preventivo a 4 mesi</li>
        <li>Report fatturato con confronto temporale anno precedente</li>
        <li>Breakdown fatturato per cliente e per periodo</li>
        <li>Variazioni prezzi e prodotti monitorate automaticamente</li>
      </ul>
    </div>
    <div class="feature-card">
      <div class="feature-card-icon">🔔</div>
      <div class="feature-card-title">Sistema notifiche</div>
      <ul class="feature-card-list">
        <li>11 tipi di notifica proattiva — ordini, documenti, spedizioni</li>
        <li>Clienti inattivi: alert quando un cliente si avvicina alla soglia critica</li>
        <li>Variazioni catalogo: nuovi articoli e variazioni prezzo istantanee</li>
        <li>Ordine confermato / errore piazzamento con dettaglio operativo</li>
        <li>Documento disponibile: DDT e fatture notificati non appena emessi</li>
        <li>Agenda con appuntamenti e promemoria integrati</li>
      </ul>
    </div>
    <div class="feature-card">
      <div class="feature-card-icon">🏢</div>
      <div class="feature-card-title">Piattaforma enterprise</div>
      <ul class="feature-card-list">
        <li>Cross-device universale: iPhone, iPad, Android, laptop, desktop</li>
        <li>Offline mode — l'app rimane navigabile senza connessione</li>
        <li>Autenticazione biometrica Face ID e impronta digitale</li>
        <li>MFA e sessioni JWT con scadenza e refresh automatico</li>
        <li>Privacy mode: oscuramento dati sensibili a schermo</li>
        <li>GDPR compliant · Hosting Germania UE · Crittografia AES-256-GCM</li>
      </ul>
    </div>
  </div>
</div>

<!-- ══════════════════ SEZ 5 — ARCHITETTURA MODULARE ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">5.</span>Architettura Modulare</h1>
  <p class="lead">Ogni rete commerciale ha esigenze diverse. Formicanera è costruita con un'architettura modulare: un nucleo operativo comune per tutti, con moduli opzionali attivabili su richiesta per reti con esigenze specifiche.</p>

  <div class="callout callout-navy">
    <p>"Ogni concessionario attiva solo i moduli che gli servono. La piattaforma si adatta alla rete — non il contrario."</p>
  </div>

  <div class="module-row">
    <div class="module-base">
      <div class="module-base-title">Nucleo operativo — incluso per tutti</div>
      <ul class="module-base-list">
        <li>Gestione ordini completa (creazione, modifica, invio, storico)</li>
        <li>Pending orders con invio in batch asincrono</li>
        <li>Schede clienti complete e interattive</li>
        <li>DDT, fatture e documenti scaricabili in un tap</li>
        <li>Catalogo prodotti con stock in tempo reale</li>
        <li>Prezzi cliente specifici aggiornati automaticamente</li>
        <li>Tracking spedizioni FedEx integrato</li>
        <li>Preventivi PDF in 3 secondi con condivisione WhatsApp/Gmail</li>
        <li>Sistema notifiche proattive — 11 tipi di evento</li>
        <li>Dashboard fatturato, commissioni e budget</li>
        <li>Sincronizzazione automatica con ERP Archibald</li>
      </ul>
    </div>
    <div class="module-opt">
      <div class="module-opt-title">Moduli opzionali attivabili</div>
      <ul class="module-opt-list">
        <li>Wizard provvigionale avanzato con obiettivi e soglie premio</li>
        <li>Monitoring clienti dormienti con soglie configurabili</li>
        <li>Gestione workflow specifici per reti con processi custom</li>
        <li>Pannello admin avanzato per management regionale</li>
        <li>Report aggregati multi-agente per responsabili area</li>
        <li>Integrazione sistemi ERP alternativi (Dynamics, SAP)</li>
        <li>Export automatico verso Google Drive e Dropbox</li>
        <li>Agenda visite con ottimizzazione percorso</li>
        <li>Kit prodotti personalizzati con configuratore</li>
        <li>Accesso CRM AI-oriented (roadmap 2026 Q3)</li>
      </ul>
    </div>
  </div>

  <p style="font-size:8.5pt;color:var(--text-light);margin-top:10px;">La scelta dei moduli viene definita in fase di onboarding con il responsabile commerciale della rete. Nuovi moduli possono essere attivati in qualsiasi momento senza impatto sulla piattaforma esistente.</p>
</div>

<!-- ══════════════════ SEZ 6 — VALIDAZIONE SUL CAMPO ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">6.</span>Validazione sul Campo</h1>
  <p class="lead">Questo non è un pitch di vendita. È un prodotto già funzionante, costruito dall'interno del settore, collaudato ogni giorno su ordini e clienti reali.</p>

  <div class="callout callout-navy">
    <p style="font-size:11.5pt;font-weight:300;line-height:1.7;">"Un agente che usa Formicanera non compete con un agente che usa l'ERP. È come confrontare uno smartphone con un fax."</p>
  </div>

  <h2>La storia in tre passaggi</h2>

  <div class="security-grid">
    <div class="security-item">
      <div class="security-item-icon">🌱</div>
      <div class="security-item-title">Passo 1 — Necessità reale</div>
      <div class="security-item-desc">Formicanera nasce dall'esigenza reale di un agente Komet con quarant'anni di esperienza nel settore dental. Non da una software house che ha studiato il settore su un brief — da chi il mestiere lo fa davvero, ogni giorno, sul campo.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">⚙️</div>
      <div class="security-item-title">Passo 2 — Sviluppo e messa in produzione</div>
      <div class="security-item-desc">La piattaforma viene sviluppata, testata e messa in produzione su ordini reali con clienti reali. Ogni funzionalità è progettata, discussa e validata da chi conosce il ciclo commerciale Komet dall'interno. Nessuna funzionalità viene rilasciata senza validazione operativa.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">📣</div>
      <div class="security-item-title">Passo 3 — Interesse spontaneo della rete</div>
      <div class="security-item-desc">I colleghi agenti vedono lo strumento in uso e rimangono colpiti. L'interesse si diffonde spontaneamente nella rete. Il management di Komet Italia viene coinvolto e mostra interesse concreto all'adozione estesa.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🌍</div>
      <div class="security-item-title">Oggi — Proposta alla rete europea</div>
      <div class="security-item-desc">La piattaforma è progettata per il multi-tenant e il multi-lingua. L'architettura consente l'estensione a reti commerciali di dimensioni europee senza riprogettazione. Komet Germania è il passo naturale.</div>
    </div>
  </div>

  <div class="callout" style="margin-top:16px;">
    <p><strong>La differenza che non si compra altrove:</strong> nessuna soluzione sul mercato è stata progettata per interagire con l'ERP Archibald. Costruire questa integrazione richiede a qualsiasi software house un reverse engineering profondo del gestionale, con tempi minimi di 12–18 mesi e nessuna garanzia di stabilità. Formicanera ha già risolto questo problema — in produzione, certificata nel tempo.</p>
  </div>
</div>

<!-- ══════════════════ SEZ 7 — SICUREZZA E CONFORMITÀ ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">7.</span>Sicurezza e Conformità</h1>
  <p class="lead">Una sintesi per il board. Il dettaglio tecnico completo è disponibile nel documento separato "Security &amp; Compliance Whitepaper" per il responsabile IT e il DPO di Komet.</p>

  <div class="security-grid">
    <div class="security-item">
      <div class="security-item-icon">🔐</div>
      <div class="security-item-title">Non interferisce con l'ERP</div>
      <div class="security-item-desc">Formicanera utilizza esclusivamente le credenziali già assegnate a ciascun agente. Vede solo ciò che l'agente vede normalmente. Nessun accesso privilegiato, nessuna modifica alle configurazioni ERP, nessuna porta di accesso aggiuntiva al sistema.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🇩🇪</div>
      <div class="security-item-title">Hosting Germania — Dati in UE</div>
      <div class="security-item-desc">Server dedicato Hetzner, data center Falkenstein (Germania). Nessun dato esce dall'Unione Europea. Nessun trasferimento extra-UE ai sensi dell'Art. 44 GDPR. Isolamento completo: macchina virtuale dedicata, non condivisa con altri clienti.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🔒</div>
      <div class="security-item-title">Crittografia standard bancario</div>
      <div class="security-item-desc">AES-256-GCM per tutte le credenziali conservate — lo stesso standard usato nel settore bancario. Comunicazioni HTTPS/TLS 1.2+ su tutti gli endpoint. Nessuna credenziale mai conservata o loggata in chiaro.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">⚖️</div>
      <div class="security-item-title">Modello GDPR — Processor standard</div>
      <div class="security-item-desc">Formicanera agisce come Responsabile del Trattamento (Processor) per conto di Komet (Controller) — lo stesso modello di Salesforce, HubSpot e Microsoft 365. Il rapporto è formalizzato tramite DPA (Art. 28 GDPR), firmato prima del go-live.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">📝</div>
      <div class="security-item-title">Audit log immutabile</div>
      <div class="security-item-desc">Ogni operazione eseguita sulla piattaforma è tracciata in modo immutabile. Log conservati 90 giorni con rotazione automatica. Procedure documentate per data breach: notifica al Controller entro 24 ore.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🛡</div>
      <div class="security-item-title">Accesso biometrico e MFA</div>
      <div class="security-item-desc">Autenticazione biometrica (Face ID, impronta) elaborata localmente sul dispositivo — nessun dato biometrico trasmesso al server. Multi-factor authentication disponibile. Rate limiting su tutti gli endpoint contro attacchi di forza bruta.</div>
    </div>
  </div>

  <div class="callout" style="margin-top:4px;">
    <p><strong>Per il dettaglio tecnico completo</strong> — architettura, test di penetrazione, politiche di conservazione dati, sub-responsabili, clausole DPA — si rimanda al documento separato <em>"Security &amp; Compliance Whitepaper"</em>, disponibile per Alexander Lange e il team legale/IT di Komet.</p>
  </div>
</div>

<!-- ══════════════════ SEZ 8 — ROI ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">8.</span>ROI: I Numeri</h1>
  <p style="font-size:9.5pt;color:var(--text-mid);line-height:1.6;margin-bottom:0;">Calcolo conservativo su 70 agenti attivi — basato su dati misurati in produzione nel ciclo commerciale Komet.</p>

  <div class="roi-grid">
    <div class="roi-card">
      <div class="roi-card-icon">⏱</div>
      <div class="roi-card-value">−<span>75%</span></div>
      <div class="roi-card-label">Tempo per piazzare un ordine</div>
      <div class="roi-card-desc">Da 15–20 minuti a 3–5. Il bot inserisce su Archibald in modo asincrono. Su 70 agenti × 3 ordini/giorno × 250 giorni: <strong>13.125 ore/anno recuperate</strong> solo sull'inserimento ordini.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">📄</div>
      <div class="roi-card-value">−<span>7.000 h</span></div>
      <div class="roi-card-label">Documenti e coordinamento</div>
      <div class="roi-card-desc">DDT e fatture reperibili in 1–2 minuti da qualsiasi dispositivo. Chiamate a Verona per status ordini quasi eliminate. 70 ag × 2 doc/gg × 250 gg × 7,5 min + 70 ag × 1,5 chiam/gg × 250 gg × 6 min = <strong>7.000 ore/anno</strong>.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">🛡</div>
      <div class="roi-card-value">3.500 <span style="font-size:13pt;">rel.</span></div>
      <div class="roi-card-label">Protezione esclusività territoriale</div>
      <div class="roi-card-desc">70 agenti × ~50 clienti attivi = ~3.500 relazioni monitorate ogni giorno in automatico. Alert preventivo a 4 mesi dalla soglia critica. Perdere anche 1 sola esclusività può valere <strong>€20.000–50.000/anno</strong> in commissioni.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">📊</div>
      <div class="roi-card-value">−€<span>30.000</span></div>
      <div class="roi-card-label">Costo errori ERP eliminati</div>
      <div class="roi-card-desc">Tasso errore inserimento manuale: 2% su codice articolo, quantità, dati cliente. Su 52.500 ordini/anno: ~1.050 errori evitati × €30 di gestione = <strong>€31.500/anno</strong>. Il bot copia l'ordine senza margine di errore umano.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">📋</div>
      <div class="roi-card-value"><span>Storico</span> istantaneo</div>
      <div class="roi-card-label">Più ordini chiusi sul momento</div>
      <div class="roi-card-desc">Storico ordini, prezzi e DDT sempre a portata di mano. L'agente risponde sul momento a "cosa avevamo preso l'ultima volta?" senza richiamare Verona. Meno esitazioni, più fiducia, più ordini chiusi durante la visita.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">💡</div>
      <div class="roi-card-value"><span style="font-size:13pt;">Preventivo</span> in visita</div>
      <div class="roi-card-label">Meno "ci risentiremo"</div>
      <div class="roi-card-desc">Preventivo PDF professionale generato in 3 secondi durante l'appuntamento. Prezzi aggiornati e sconti personalizzati visibili in tempo reale. Chi decide sul momento acquista — chi deve "risentirsi" spesso no.</div>
    </div>
  </div>

  <div style="break-inside:avoid-page;page-break-inside:avoid;">
    <div class="roi-total">
      <div>
        <div class="roi-total-label">Stima produttività recuperata — anno (calcolo conservativo)</div>
        <div class="roi-total-sub">~20.000 ore totali × €35 costo orario medio agente · 70 agenti attivi<br>13.125 ordini + 7.000 documenti/coordinamento = 20.125 ore per difetto</div>
      </div>
      <div style="text-align:right;">
        <div class="roi-total-value">€700.000/anno</div>
        <div class="roi-total-sub" style="color:rgba(255,255,255,.35);">Dal 2° anno, Formicanera costa meno dell'<strong style="color:var(--gold);">8%</strong> del valore che genera</div>
      </div>
    </div>
  </div>
</div>

<!-- ══════════════════ SEZ 9 — ROADMAP 2026 ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">9.</span>Roadmap 2026</h1>
  <p class="lead">Le sei funzionalità più impattanti in arrivo — progettate per trasformare Formicanera da strumento operativo a piattaforma di intelligenza commerciale.</p>

  <div class="roadmap-grid">
    <div class="roadmap-card">
      <div class="roadmap-card-icon">🤖</div>
      <div class="roadmap-card-title">CRM AI-oriented</div>
      <div class="roadmap-card-desc">Assistente intelligente che suggerisce le priorità di contatto, identifica opportunità di upsell, gestisce il giro visite in automatico basandosi su storico acquisti e comportamento del cliente. L'agente sa sempre chi contattare e perché.</div>
    </div>
    <div class="roadmap-card">
      <div class="roadmap-card-icon">🎙</div>
      <div class="roadmap-card-title">Segretario AI virtuale</div>
      <div class="roadmap-card-desc">Risponde a domande cliniche in tempo reale durante le visite. Gestisce operazioni dalla voce: "Aggiungi 5 unità di articolo X all'ordine", "Mostrami l'ultimo ordine di questo cliente". Zero mani occupate durante la visita.</div>
    </div>
    <div class="roadmap-card">
      <div class="roadmap-card-icon">📷</div>
      <div class="roadmap-card-title">Riconoscimento strumento da fotocamera</div>
      <div class="roadmap-card-desc">L'agente inquadra uno strumento concorrente con la fotocamera. La PWA identifica il prodotto Komet equivalente con prezzo aggiornato, disponibilità in stock e scheda tecnica. La risposta alla concorrenza diventa immediata.</div>
    </div>
    <div class="roadmap-card">
      <div class="roadmap-card-icon">💰</div>
      <div class="roadmap-card-title">Gestione scaduti automatizzata</div>
      <div class="roadmap-card-desc">Monitoring automatico delle fatture non saldate. Invio automatico di solleciti graduati — primo reminder, secondo reminder, escalation — con log completo delle comunicazioni inviate per ogni cliente.</div>
    </div>
    <div class="roadmap-card">
      <div class="roadmap-card-icon">🌐</div>
      <div class="roadmap-card-title">Integrazione Mighty + Academy</div>
      <div class="roadmap-card-desc">Dati della community Komet (Mighty) e contenuti formativi (Komet Academy) accessibili direttamente dalla PWA. Un unico punto di accesso a tutto l'ecosistema Komet — prodotti, formazione, community — senza app separate.</div>
    </div>
    <div class="roadmap-card">
      <div class="roadmap-card-icon">🎨</div>
      <div class="roadmap-card-title">Kit personalizzati</div>
      <div class="roadmap-card-desc">Creazione di kit prodotti su misura per il cliente con personalizzazioni grafiche e incisioni. L'agente configura il kit direttamente dalla visita, con anteprima visiva e conferma d'ordine immediata.</div>
    </div>
  </div>

  <div class="callout" style="margin-top:8px;">
    <p><strong>Principio della roadmap:</strong> ogni funzionalità viene sviluppata con validazione diretta da parte degli agenti che la usano ogni giorno. Nessuna feature viene rilasciata senza aver dimostrato un impatto misurabile sul ciclo commerciale reale.</p>
  </div>
</div>

<!-- ══════════════════ SEZ 10 — PROSSIMI PASSI ══════════════════ -->
<div style="min-height:297mm;display:flex;flex-direction:column;background:var(--bg);">
  <div style="flex:1;padding:38px 68px 30px;">

    <h1><span class="n">10.</span>Prossimi Passi</h1>
    <p class="lead">Formicanera è pronta oggi. Non è un progetto da costruire — è un sistema in produzione, su dati reali, con utenti reali, ogni giorno. Il percorso verso il go-live per la rete Komet è definito in 4 step.</p>

    <div class="steps">
      <div class="step">
        <div class="step-num">Step 1</div>
        <div class="step-title">Accettazione proposta</div>
        <div class="step-desc">Conferma scritta da parte di Gebr. Brasseler GmbH &amp; Co. KG — avvio formale del processo di adozione.</div>
      </div>
      <div class="step">
        <div class="step-num">Step 2</div>
        <div class="step-title">Firma DPA GDPR</div>
        <div class="step-desc">Incontro con il DPO e il team legale Komet per allineamento e firma del Data Processing Agreement (Art. 28 GDPR).</div>
      </div>
      <div class="step">
        <div class="step-num">Step 3</div>
        <div class="step-title">Firma contratto 24 mesi</div>
        <div class="step-desc">Definizione del perimetro, numero utenti, SLA e termini di assistenza. Contratto 24 mesi con rinnovo automatico annuale.</div>
      </div>
      <div class="step">
        <div class="step-num">Step 4</div>
        <div class="step-title">Kick-off → go-live</div>
        <div class="step-desc">Setup infrastruttura, configurazione profili, import dati, test integrazione ERP, formazione agenti pilota. Go-live completo in 8 settimane.</div>
      </div>
    </div>

    <div class="callout callout-navy" style="margin-top:24px;">
      <p style="font-size:10.5pt;line-height:1.75;font-weight:300;">"La rete commerciale Komet merita uno strumento costruito per il modo in cui lavora davvero — non un ERP aperto su uno smartphone. <strong>Formicanera esiste già. Funziona già. Il passo successivo è portarlo a tutta la rete.</strong>"</p>
    </div>

    <div style="margin-top:24px;padding:18px 22px;background:#fff;border:1px solid var(--border);border-radius:10px;">
      <p style="font-size:8.5pt;color:var(--text-mid);margin:0;line-height:1.7;"><strong style="color:var(--navy);display:block;margin-bottom:6px;">Contatto</strong>
      Francesco Formicola — Formicanera<br>
      Preparato per Philipp Rovina, Head Global Commercial Regions EMEA-LATAMAPAC<br>
      Gebr. Brasseler GmbH &amp; Co. KG · Maggio 2026<br>
      <span style="color:var(--text-light);font-size:7.5pt;">Documento riservato — Per uso esclusivo di Gebr. Brasseler GmbH &amp; Co. KG. Ogni riproduzione o distribuzione non autorizzata è vietata.</span></p>
    </div>
  </div>

  <div class="doc-footer" style="margin-top:auto;">
    <div class="footer-left">
      <img src="${logoSrc}" class="footer-logo" alt="Formicanera">
      <div>
        <div class="footer-brand">Formicanera</div>
        <div class="footer-sub">Il vantaggio competitivo per gli agenti Komet</div>
      </div>
    </div>
    <div class="footer-meta">
      Presentazione della soluzione — Maggio 2026<br>
      Riservato — Per uso esclusivo di Gebr. Brasseler GmbH &amp; Co. KG<br>
      Preparato da Francesco Formicola · Formicanera
    </div>
  </div>
</div>

</body>
</html>`;

async function generatePDF() {
  console.log('Avvio Puppeteer...');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-web-security'],
  });
  const page = await browser.newPage();
  console.log('Rendering HTML...');
  await page.emulateMediaType('print');
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  console.log('Generazione PDF...');
  await page.pdf({
    path: join(__dirname, 'doc1-presentazione-IT.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  await browser.close();
  console.log('✅ PDF generato: doc1-presentazione-IT.pdf');
}

generatePDF().catch(err => { console.error('Errore:', err); process.exit(1); });
