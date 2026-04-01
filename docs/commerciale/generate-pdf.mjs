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
<title>Formicanera — Presentazione Komet Italia</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
:root{
  --navy:#1a1a2e;--navy2:#16213e;--navy3:#0f3460;
  --gold:#c8a96e;--gold-light:#f5edd8;--gold-mid:#e8d5a3;
  --text:#2d2d2d;--text-mid:#4b5563;--text-light:#6b7280;
  --border:#e5e7eb;--bg:#f9fafb;
  --green:#059669;--red:#dc2626;--blue:#3b82f6;
}
@page{margin:0;}html,body{font-family:'Inter',-apple-system,sans-serif;color:var(--text);background:#fff;font-size:10pt;line-height:1.65;}

/* ── PRINT ── */
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}

/* ── PAGE BREAK CONTROL ── */
.pb-before{break-before:page;page-break-before:always;}
.pb-after{break-after:page;page-break-after:always;}
.pb-avoid{break-inside:avoid-page;page-break-inside:avoid-page;}
.pb-avoid-all *{break-inside:avoid-page;page-break-inside:avoid-page;}
h1,h2,h3{break-after:avoid;page-break-after:avoid;}

/* ── COVER ── */
.cover{
  width:100%;min-height:297mm;
  background:linear-gradient(150deg,var(--navy) 0%,var(--navy2) 55%,var(--navy3) 100%);
  display:flex;flex-direction:column;justify-content:space-between;
  padding:52px 64px;position:relative;overflow:hidden;
  break-after:page;page-break-after:always;
}
.cover::before{content:'';position:absolute;top:-120px;right:-120px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(200,169,110,.13) 0%,transparent 68%);}
.cover::after{content:'';position:absolute;bottom:-100px;left:-100px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(200,169,110,.08) 0%,transparent 68%);}
.cover-top{position:relative;z-index:1;display:flex;align-items:center;gap:18px;}
.cover-logo-img{width:70px;height:70px;object-fit:contain;filter:drop-shadow(0 4px 12px rgba(0,0,0,.4));}
.cover-brand{font-size:11pt;font-weight:300;color:rgba(255,255,255,.5);letter-spacing:4px;text-transform:uppercase;}
.cover-main{position:relative;z-index:1;flex:1;display:flex;flex-direction:column;justify-content:center;padding:50px 0 40px;}
.cover-pretitle{font-size:8pt;font-weight:600;color:var(--gold);letter-spacing:3px;text-transform:uppercase;margin-bottom:14px;}
.cover-title{font-family:'Playfair Display',Georgia,serif;font-size:56pt;font-weight:800;color:#fff;line-height:1.05;margin-bottom:18px;}
.cover-tagline{font-size:13pt;font-weight:300;color:rgba(255,255,255,.75);max-width:500px;line-height:1.55;margin-bottom:36px;}
.cover-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(200,169,110,.15);border:1px solid rgba(200,169,110,.4);border-radius:4px;padding:8px 18px;font-size:8.5pt;color:var(--gold);letter-spacing:.5px;}
.cover-bottom{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-end;}
.cover-meta{font-size:8.5pt;color:rgba(255,255,255,.4);line-height:1.9;}
.cover-meta strong{color:rgba(255,255,255,.65);}
.cover-conf{font-size:7.5pt;color:rgba(255,255,255,.28);letter-spacing:2px;text-transform:uppercase;border:1px solid rgba(255,255,255,.14);padding:5px 10px;border-radius:3px;}

/* ── QUOTE ── */
.quote-page{
  width:100%;min-height:297mm;
  background:var(--navy);
  padding:64px;display:flex;align-items:center;
  break-before:page;page-break-before:always;
  break-after:page;page-break-after:always;
}
.quote-mark{font-size:64pt;color:var(--gold);line-height:.55;font-family:Georgia,serif;margin-bottom:16px;}
.quote-text{font-size:16pt;font-weight:300;color:#fff;line-height:1.6;font-style:italic;max-width:580px;}

/* ── EXEC SUMMARY ── */
.exec-page{break-before:page;page-break-before:always;min-height:297mm;display:flex;flex-direction:column;}
.exec-hero{background:var(--gold-light);padding:48px 64px 36px;border-bottom:3px solid var(--gold);}
.exec-pre{font-size:7.5pt;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:10px;}
.exec-title{font-size:19pt;font-weight:800;color:var(--navy);line-height:1.25;margin-bottom:16px;}
.exec-body{font-size:10.5pt;color:var(--text);line-height:1.7;max-width:680px;}
.exec-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:28px 64px;margin-top:auto;}
.metric-card{background:var(--navy);color:#fff;border-radius:8px;padding:20px 16px;text-align:center;break-inside:avoid-page;}
.metric-value{font-size:24pt;font-weight:900;color:var(--gold);line-height:1;margin-bottom:5px;}
.metric-label{font-size:7.5pt;color:rgba(255,255,255,.6);letter-spacing:.5px;line-height:1.4;}

/* ── PART HEADER ── */
.part-header{
  background:linear-gradient(135deg,var(--navy) 0%,var(--navy2) 100%);
  padding:56px 64px;min-height:297mm;
  display:flex;flex-direction:column;justify-content:flex-end;
  break-before:page;page-break-before:always;
  break-after:page;page-break-after:always;
}
.part-label{font-size:7.5pt;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:var(--gold);margin-bottom:10px;}
.part-title{font-family:'Playfair Display',Georgia,serif;font-size:30pt;color:#fff;line-height:1.2;}
.part-subtitle{font-size:11pt;color:rgba(255,255,255,.55);margin-top:10px;font-weight:300;}

/* ── CONTENT ── */
.section{padding:36px 64px 28px;}
.section-sm{padding:28px 64px;}
.section-cont{padding:12px 64px 32px;}

/* ── TYPOGRAPHY ── */
h1{font-size:20pt;font-weight:800;color:var(--navy);padding-bottom:10px;border-bottom:2.5px solid var(--gold);margin-bottom:4px;}
h1 .n{color:var(--gold);margin-right:7px;}
h2{font-size:13pt;font-weight:700;color:var(--navy);margin-top:28px;margin-bottom:10px;display:flex;align-items:center;gap:8px;}
h2::before{content:'';display:inline-block;width:4px;height:13px;background:var(--gold);border-radius:2px;flex-shrink:0;}
h3{font-size:11pt;font-weight:600;color:var(--navy);margin-top:18px;margin-bottom:7px;}
p{margin-bottom:10px;}
ul,ol{margin-left:20px;margin-bottom:10px;}
li{margin-bottom:4px;line-height:1.6;}
strong{font-weight:600;color:var(--navy);}
em{color:var(--text-light);font-style:italic;}

/* ── CALLOUT ── */
.callout{background:var(--gold-light);border-left:4px solid var(--gold);padding:14px 18px;margin:16px 0;border-radius:0 6px 6px 0;break-inside:avoid-page;}
.callout-blue{background:#eff6ff;border-left-color:var(--blue);}
.callout-green{background:#ecfdf5;border-left-color:var(--green);}
.callout-navy{background:var(--navy);border-left-color:var(--gold);color:#fff;}
.callout-navy p,.callout-navy strong{color:#fff;}
.callout-navy strong{color:var(--gold);}
.callout p{margin-bottom:0;}

/* ── TABLES ── */
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:9pt;}
thead tr{background:var(--navy);color:#fff;}
thead th{padding:9px 13px;text-align:left;font-weight:600;font-size:8pt;letter-spacing:.3px;}
tbody tr:nth-child(even){background:var(--bg);}
td{padding:8px 13px;border-bottom:1px solid var(--border);vertical-align:top;}
.check{color:var(--green);font-weight:700;}
.cross{color:var(--red);font-weight:700;}
.col-before{background:#fff5f5!important;color:#7f1d1d;}
.col-after{background:#f0fdf4!important;color:#14532d;}

/* ── GRIDS ── */
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0;}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin:14px 0;}
.card{border:1px solid var(--border);border-radius:8px;padding:16px;background:#fff;break-inside:avoid-page;}
.card h3{margin-top:0;font-size:10.5pt;margin-bottom:5px;}
.card p{font-size:9pt;color:var(--text-light);margin-bottom:0;}
.card-gold{border-top:3px solid var(--gold);}
.card-blue{border-top:3px solid var(--blue);}
.card-green{border-top:3px solid var(--green);}
.card-red{border-top:3px solid var(--red);}
.card-icon{font-size:20pt;margin-bottom:8px;}

/* ── NOTIF ── */
.notif-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:14px 0;}
.notif-item{display:flex;align-items:center;gap:9px;background:var(--bg);padding:9px 12px;border-radius:5px;font-size:9pt;break-inside:avoid-page;}
.notif-dot{width:7px;height:7px;border-radius:50%;background:var(--gold);flex-shrink:0;}

/* ── STORY ── */
.story{display:flex;flex-direction:column;gap:0;margin:18px 0;}
.story-item{display:flex;gap:18px;align-items:flex-start;padding:18px 0;border-bottom:1px solid var(--border);break-inside:avoid-page;}
.story-item:last-child{border-bottom:none;}
.story-num{width:34px;height:34px;border-radius:50%;background:var(--navy);color:var(--gold);font-weight:800;font-size:12pt;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.story-content h3{margin-top:0;}

/* ── ROADMAP ── */
.roadmap{position:relative;padding-left:38px;margin:18px 0;}
.roadmap::before{content:'';position:absolute;left:10px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom,var(--gold),transparent);}
.rm-item{position:relative;margin-bottom:20px;break-inside:avoid-page;}
.rm-dot{position:absolute;left:-32px;top:2px;width:20px;height:20px;border-radius:50%;background:var(--gold);color:var(--navy);font-weight:800;font-size:8.5pt;display:flex;align-items:center;justify-content:center;}
.rm-title{font-weight:700;font-size:10.5pt;color:var(--navy);margin-bottom:3px;}
.rm-desc{font-size:9pt;color:var(--text-light);}

/* ── VERSIONS ── */
.versions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:16px 0;}
.version-card{border-radius:10px;padding:20px;break-inside:avoid-page;}
.version-card h3{margin-top:0;font-size:11pt;margin-bottom:8px;}
.version-card ul{font-size:9pt;margin-left:16px;}
.v-agent{background:linear-gradient(135deg,var(--navy) 0%,var(--navy2) 100%);color:#fff;}
.v-agent h3,.v-agent li{color:#fff;}
.v-agent h3{color:var(--gold);}
.v-dealer{background:var(--gold-light);border:1.5px solid var(--gold);}
.v-verona{background:var(--bg);border:1.5px solid var(--border);}

/* ── GDPR STATUS ── */
.gdpr-ok td:last-child{font-weight:700;color:var(--green);}

/* ── INTEGRATIONS ── */
.int-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0;}
.int-card{background:var(--bg);border-radius:8px;padding:16px 12px;text-align:center;border:1px solid var(--border);break-inside:avoid-page;}
.int-icon{font-size:22pt;margin-bottom:8px;}
.int-name{font-weight:700;font-size:9.5pt;color:var(--navy);margin-bottom:4px;}
.int-desc{font-size:8.5pt;color:var(--text-light);}

/* ── FOOTER ── */
.doc-footer{
  background:var(--navy);padding:26px 64px;
  display:flex;justify-content:space-between;align-items:center;
  margin-bottom:0;
}
.footer-left{display:flex;align-items:center;gap:14px;}
.footer-logo{width:46px;height:46px;object-fit:contain;}
.footer-brand{color:var(--gold);font-weight:700;font-size:13pt;}
.footer-sub{font-size:8.5pt;color:rgba(255,255,255,.45);margin-top:2px;}
.footer-meta{font-size:7.5pt;color:rgba(255,255,255,.35);text-align:right;line-height:1.8;}

.sp{height:16px;}
.sp-sm{height:8px;}
</style>
</head>
<body>

<!-- ══════════════════ COVER ══════════════════ -->
<div class="cover">
  <div class="cover-top">
    <img src="${logoSrc}" class="cover-logo-img" alt="Formicanera">
    <span class="cover-brand">Formicanera</span>
  </div>
  <div class="cover-main">
    <div class="cover-pretitle">Presentazione della soluzione</div>
    <div class="cover-title">Formicanera</div>
    <div class="cover-tagline">Il vantaggio competitivo per gli agenti Komet.<br>Ovunque. In tempo reale. Sempre aggiornato.</div>
    <div class="cover-badge"><span style="color:var(--green)">●</span> &nbsp;In produzione — collaudato sul campo ogni giorno</div>
  </div>
  <div class="cover-bottom">
    <div class="cover-meta">
      <strong>Destinatario</strong><br>
      Komet Italia S.r.l. — Verona<br>
      <strong>Data</strong> — Marzo 2026
    </div>
    <div class="cover-conf">Riservato</div>
  </div>
</div>

<!-- ══════════════════ QUOTE ══════════════════ -->
<div class="quote-page">
  <div>
    <div class="quote-mark">"</div>
    <div class="quote-text">Un agente che usa Formicanera non compete con un agente che usa l'ERP.<br>È come confrontare uno smartphone con un fax.</div>
  </div>
</div>

<!-- ══════════════════ SOMMARIO ESECUTIVO ══════════════════ -->
<div class="exec-page">
  <div class="exec-hero">
    <div class="exec-pre">Sommario Esecutivo</div>
    <div class="exec-title">Una soluzione nata dall'interno.<br>Collaudata sul campo. In evoluzione continua.</div>
    <p class="exec-body">Formicanera è una piattaforma gestionale mobile-first sviluppata da un agente Komet con quarant'anni di esperienza nel settore — non da una software house esterna che non conosce il mestiere. È già operativa, in uso quotidiano su ordini reali con clienti reali. Ogni funzionalità è stata progettata e validata direttamente sul campo.</p>
    <p class="exec-body" style="margin-bottom:0">Il sistema <strong>elimina il lavoro manuale ripetitivo</strong>, automatizza l'interazione con l'ERP, e fornisce all'agente — da mobile, ovunque si trovi — tutto quello che serve per vendere meglio e servire meglio i propri clienti. La roadmap verso il rollout completo sulla rete Komet Italia è già definita e in corso.</p>
  </div>
  <div class="exec-metrics">
    <div class="metric-card">
      <div class="metric-value">−75%</div>
      <div class="metric-label">Tempo medio per piazzare un ordine</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">−95%</div>
      <div class="metric-label">Tempo per recuperare DDT e fatture</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">11</div>
      <div class="metric-label">Tipi di notifica proattiva automatica</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">3</div>
      <div class="metric-label">Versioni dedicate: agente, concessionario, operatore</div>
    </div>
  </div>
</div>

<!-- ══════════════════ PARTE I ══════════════════ -->
<div class="part-header">
  <div class="part-label">Parte Prima</div>
  <div class="part-title">Proposta di Valore</div>
  <div class="part-subtitle">Il problema, la soluzione, la storia e le funzionalità complete</div>
</div>

<!-- ══════════════════ SEZ 1: PROBLEMA ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">1.</span>Il Problema: Lavorare con l'ERP nel 2026</h1>
  <div class="sp-sm"></div>
  <p>L'ERP Archibald è uno strumento funzionale. Ma è stato progettato per essere usato <strong>da una scrivania, da un PC fisso, con una connessione stabile</strong> — e il mondo degli agenti commerciali non funziona così.</p>
  <p>Un agente Komet lavora sul campo. Entra in uno studio dentistico, in un laboratorio odontotecnico, in una clinica. Ha bisogno di rispondere a domande in tempo reale: <em>"Quando arriva il mio ordine? Ho ancora a listino quella fresa? Posso avere la fattura di marzo?"</em></p>
  <div class="sp-sm"></div>
  <div class="grid-2">
    <div class="card card-red"><div style="font-size:8.5pt;font-weight:700;color:var(--red);letter-spacing:1px;text-transform:uppercase;margin-bottom:7px;">❌ Non accessibile da mobile</div><p>Nessuna app, nessuna versione responsive. Sul campo l'agente è operativamente cieco.</p></div>
    <div class="card card-red"><div style="font-size:8.5pt;font-weight:700;color:var(--red);letter-spacing:1px;text-transform:uppercase;margin-bottom:7px;">❌ Zero notifiche proattive</div><p>L'agente deve cercare ogni informazione. Nessun sistema di allerta automatica.</p></div>
    <div class="card card-red"><div style="font-size:8.5pt;font-weight:700;color:var(--red);letter-spacing:1px;text-transform:uppercase;margin-bottom:7px;">❌ Operazioni manuali ripetitive</div><p>Ogni ordine richiede sequenze identiche di click sull'ERP. Nessuna automazione.</p></div>
    <div class="card card-red"><div style="font-size:8.5pt;font-weight:700;color:var(--red);letter-spacing:1px;text-transform:uppercase;margin-bottom:7px;">❌ Nessun cruscotto business</div><p>Dati dispersi in schermate diverse. Nessuna visione aggregata di fatturato, premi, budget.</p></div>
    <div class="card card-red"><div style="font-size:8.5pt;font-weight:700;color:var(--red);letter-spacing:1px;text-transform:uppercase;margin-bottom:7px;">❌ Documenti non integrati</div><p>DDT e fatture richiedono operazioni separate e manuali per essere recuperati.</p></div>
    <div class="card card-red"><div style="font-size:8.5pt;font-weight:700;color:var(--red);letter-spacing:1px;text-transform:uppercase;margin-bottom:7px;">❌ Nessun tracking spedizioni</div><p>L'agente non sa dove si trova fisicamente una consegna senza uscire dall'ERP.</p></div>
  </div>
  <div class="callout">
    <p>Ogni operazione che dovrebbe richiedere <strong>30 secondi</strong> ne richiede <strong>10 minuti</strong>. Il tempo perso non è misurabile solo in minuti — è misurato in clienti che aspettano, opportunità che si perdono, professionalità che non si riesce a dimostrare.</p>
  </div>
</div>

<!-- ══════════════════ SEZ 2: SOLUZIONE ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">2.</span>La Soluzione: Formicanera</h1>
  <div class="sp-sm"></div>
  <p>Formicanera è una <strong>Progressive Web App (PWA)</strong> — installabile su qualsiasi dispositivo (smartphone iOS/Android, tablet, laptop, desktop) come un'app nativa, che si aggiorna automaticamente senza store. Si installa in tre secondi. Non richiede manutenzione da parte dell'utente.</p>
  <div class="callout-green callout">
    <p><strong>Il principio fondamentale:</strong> l'agente non dovrebbe mai dover aprire l'ERP per fare il suo lavoro. Formicanera si sincronizza con Archibald in modo automatico e trasparente.</p>
  </div>
  <div class="sp-sm"></div>
  <h2>Confronto operativo diretto</h2>
  <div>
  <table>
    <thead><tr><th style="width:26%">Operazione</th><th style="width:37%">Con l'ERP</th><th style="width:37%">Con Formicanera</th></tr></thead>
    <tbody>
      <tr><td><strong>Consultare un ordine</strong></td><td class="col-before">PC, login ERP, ricerca manuale</td><td class="col-after">Apri l'app, cerca il cliente — 5 secondi ✓</td></tr>
      <tr><td><strong>Piazzare un ordine</strong></td><td class="col-before">15–20 minuti, form ERP manuali</td><td class="col-after">Form mobile + bot automatico ✓</td></tr>
      <tr><td><strong>Preventivo al volo</strong></td><td class="col-before">Impossibile sul campo</td><td class="col-after">Generazione preventivo con IVA in pochi secondi ✓</td></tr>
      <tr><td><strong>Scaricare un DDT</strong></td><td class="col-before">ERP → ricerca → download PDF</td><td class="col-after">Tap sul documento nella scheda ordine ✓</td></tr>
      <tr><td><strong>Tracking spedizione</strong></td><td class="col-before">Chiamata al magazzino o FedEx separato</td><td class="col-after">Integrato nella scheda ordine, real-time ✓</td></tr>
      <tr><td><strong>Creare un cliente</strong></td><td class="col-before">Form manuale ERP, nessuna validazione</td><td class="col-after">Wizard guidato + validazione P.IVA + bot ✓</td></tr>
      <tr><td><strong>Verificare provvigioni</strong></td><td class="col-before">Non disponibile</td><td class="col-after">Dashboard dedicata, aggiornata in real-time ✓</td></tr>
    </tbody>
  </table>
  </div>
</div>

<!-- ══════════════════ SEZ 3: GENESI ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">3.</span>Genesi e Validazione sul Campo</h1>
  <div class="sp-sm"></div>
  <p>Formicanera non è un progetto accademico né un prototipo. È uno strumento nato dalla necessità reale di un agente Komet con <strong>quarant'anni di esperienza nel settore odontoiatrico</strong>.</p>
  <div class="story">
    <div class="story-item">
      <div class="story-num">1</div>
      <div class="story-content">
        <h3>Necessità reale</h3>
        <p>Un agente diretto Komet, nonché da sempre tra i principali protagonisti del settore nel panorama dei concessionari italiani, aveva bisogno di uno strumento all'altezza del 2026. L'ERP non bastava più per il ritmo e le aspettative del lavoro quotidiano sul campo. Nasce Formicanera — non come prodotto commerciale, ma come risposta concreta e urgente a una necessità reale.</p>
      </div>
    </div>
    <div class="story-item">
      <div class="story-num">2</div>
      <div class="story-content">
        <h3>Sviluppo e produzione</h3>
        <p>Formicanera viene testata e messa in produzione. È usata ogni giorno, in scenari reali, su ordini reali. Ogni funzionalità è stata progettata e validata da chi il lavoro sul campo lo fa davvero — non da UX designer che non hanno mai visitato uno studio dentistico.</p>
      </div>
    </div>
    <div class="story-item">
      <div class="story-num">3</div>
      <div class="story-content">
        <h3>Interesse spontaneo della rete</h3>
        <p>La visibilità dello strumento nella rete agenti genera un effetto naturale: i colleghi che lo vedono in uso rimangono colpiti dalla sua efficacia operativa. L'interesse raggiunge spontaneamente il management di Komet Italia, che manifesta attenzione concreta per una possibile adozione su scala, sull'intera rete commerciale.</p>
      </div>
    </div>
  </div>
  <div class="callout">
    <p><strong>Questo non è un pitch di vendita.</strong> È un prodotto già funzionante, già collaudato, già amato da chi lo usa — proposto da chi conosce Komet dall'interno da decenni.</p>
  </div>

  <div class="pb-avoid" style="background:var(--navy);border-radius:10px;padding:24px 28px;display:flex;gap:22px;align-items:flex-start;">
    <div style="font-size:36pt;line-height:1;flex-shrink:0;">🐜</div>
    <div>
      <div style="font-size:8pt;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:8px;">Perché Formicanera</div>
      <p style="color:#fff;font-size:10pt;line-height:1.7;margin-bottom:8px;">
        Le formiche sono tra le creature più organizzate, laboriose e precise della natura. Lavorano in squadra senza sosta, portano carichi enormi rispetto alla loro dimensione, e non sbagliano mai un passo. È esattamente quello che fa questo sistema: lavora instancabilmente in background, gestisce il peso burocratico al posto dell'agente, e lo fa con la precisione di un meccanismo collaudato.
      </p>
    </div>
  </div>
</div>

<!-- ══════════════════ SEZ 4: FUNZIONALITÀ ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">4.</span>Funzionalità Complete</h1>
  <div class="sp-sm"></div>

  <h2>4.1 Gestione Ordini — Asincrona e Automatizzata</h2>
  <p>La gestione ordini in Formicanera è progettata attorno a un flusso di lavoro reale: <strong>l'agente carica i pending durante la giornata</strong> (in ufficio, dal cliente, in trasferta), poi <strong>li invia a Verona quando vuole</strong> — la sera, tra un appuntamento e l'altro, quando più comodo. L'invio è completamente asincrono.</p>

  <div class="grid-2">
    <div class="card card-gold">
      <h3>📋 Form di creazione guidato</h3>
      <p>Selezione cliente, articoli dal catalogo, quantità, sconti riga e testata. Suggerimento automatico articoli più venduti per quel cliente (top sold).</p>
    </div>
    <div class="card card-gold">
      <h3>📦 Confezionamento e disponibilità</h3>
      <p>Sistema guidato per il confezionamento degli ordini con verifica disponibilità di magazzino in tempo reale prima della conferma.</p>
    </div>
    <div class="card card-gold">
      <h3>🧾 IVA e preventivi al volo</h3>
      <p>Gestione completa IVA: definisci il totale con IVA o come imponibile — calcolo automatico immediato. Genera preventivi professionali direttamente dal campo.</p>
    </div>
    <div class="card card-gold">
      <h3>🤖 Bot di invio automatico</h3>
      <p>Il bot apre l'ERP, inserisce tutti i dati e conferma l'ordine senza che l'agente tocchi l'ERP. Progressione in tempo reale, notifica alla conferma.</p>
    </div>
    <div class="card card-gold">
      <h3>⚡ Operazioni batch</h3>
      <p>Selezione multipla ordini. Invio multiplo a Verona in sequenza automatica. Banner non bloccante: l'agente continua a usare l'app mentre il bot lavora.</p>
    </div>
    <div class="card card-gold">
      <h3>📊 Storico e stato completo</h3>
      <p>Avanzamento dettagliato degli stati ordine, tracking real-time, controllo documenti (DDT, fatture) e notifiche attive — tutto in una scheda unica.</p>
    </div>
  </div>
</div>

<div style="break-before:page;page-break-before:always;height:0;overflow:hidden;"></div>
<div class="section-cont">
  <h2 style="margin-top:0">4.2 Scontistica Avanzata per Agente e per Cliente</h2>
  <p>Formicanera gestisce <strong>livelli di scontistica completamente personalizzati</strong>: ogni agente può avere sconti differenziati per ogni cliente, configurabili e applicabili automaticamente in fase di creazione ordine. Il calcolo è sempre preciso e immediato.</p>

  <div class="callout-blue callout">
    <p>L'agente imposta il totale desiderato (con o senza IVA) e Formicanera <strong>calcola e distribuisce automaticamente lo sconto</strong> sugli articoli per ottimizzare il risultato — con possibilità di intervenire manualmente su singoli articoli.</p>
  </div>

  <div class="pb-avoid" style="break-inside:avoid;">
  <h2>4.3 Provvigioni, Premi e Budget</h2>
  <p>Una delle funzionalità più richieste dagli agenti: <strong>visibilità completa e in tempo reale</strong> sulle proprie performance economiche.</p>
  </div>

  <div class="grid-2">
    <div class="card card-blue">
      <h3>💰 Dashboard Provvigioni</h3>
      <p>Visibilità istantanea sulle provvigioni maturate, per periodo e per cliente. Aggiornata in sync con i dati ERP.</p>
    </div>
    <div class="card card-blue">
      <h3>🏆 Premi Produzione e Speciali</h3>
      <p>Monitoraggio dei premi di produzione e premi speciali con stato di avanzamento verso il raggiungimento degli obiettivi.</p>
    </div>
    <div class="card card-blue">
      <h3>🎯 Target Annui Personalizzati</h3>
      <p>Ogni agente imposta i propri target annui durante il wizard di configurazione iniziale. Il sistema traccia il delta in tempo reale.</p>
    </div>
    <div class="card card-blue">
      <h3>📈 Situazione Budget</h3>
      <p>Widget budget con avanzamento verso gli obiettivi commerciali, confronto con lo stesso periodo dell'anno precedente.</p>
    </div>
  </div>
</div>

<div style="break-before:page;page-break-before:always;height:0;overflow:hidden;"></div>
<div class="section-cont">
  <h2 style="margin-top:0">4.4 Gestione Clienti</h2>
  <div>
  <table>
    <thead><tr><th>Funzione</th><th>Dettaglio</th></tr></thead>
    <tbody>
      <tr><td><strong>Scheda cliente completa</strong></td><td>Anagrafica, P.IVA, CF, indirizzi multipli, storico ordini, note, badge completezza</td></tr>
      <tr><td><strong>Wizard creazione cliente</strong></td><td>6 step guidati. Validazione P.IVA in tempo reale con auto-fill CF, PEC e indirizzo legale</td></tr>
      <tr><td><strong>Bot su ERP</strong></td><td>Il bot crea/aggiorna il cliente su Archibald in automatico — 28 campi ERP gestiti senza errori</td></tr>
      <tr><td><strong>Indirizzi multipli</strong></td><td>Gestione completa indirizzi di consegna alternativi — aggiunta, modifica, selezione per ordine</td></tr>
      <tr><td><strong>Ricerca multi-parola</strong></td><td>AND implicito, risultati istantanei con evidenziazione del termine cercato</td></tr>
    </tbody>
  </table>
  </div>
</div>

<div class="section-cont">
  <h2 style="margin-top:0">4.5 Ricerca Avanzata nello Storico</h2>
  <p>Una delle funzionalità più potenti per l'agente veterano: accesso intelligente alla propria storia commerciale per velocizzare la creazione di nuovi ordini.</p>
  <div>
  <table>
    <thead><tr><th>Funzione</th><th>Dettaglio</th></tr></thead>
    <tbody>
      <tr><td><strong>Ricerca completa storico cliente</strong></td><td>Ricerca full-text negli ordini passati di un cliente specifico — per articolo, codice, descrizione, data o importo</td></tr>
      <tr><td><strong>Selezione automatica da storico</strong></td><td>Dall'ordine storico, l'agente può selezionare articoli singoli o in batch e aggiungerli direttamente al nuovo ordine in creazione</td></tr>
      <tr><td><strong>Copia intero ordine</strong></td><td>Funzione one-tap per replicare un ordine precedente integralmente, con mantenimento automatico delle scontistiche personalizzate per quel cliente</td></tr>
      <tr><td><strong>Ricerca globale storico agente</strong></td><td>Ricerca trasversale su tutti gli ordini dell'agente — non solo per cliente, ma per articolo, codice prodotto, periodo o importo tra tutti gli ordini dell'intera rete</td></tr>
      <tr><td><strong>Ricerca globale articoli</strong></td><td>Trova rapidamente in quali ordini e per quali clienti è stato venduto un determinato articolo — utile per gestire promozioni, discontinuità di prodotto e upsell</td></tr>
    </tbody>
  </table>
  </div>
</div>

<div style="break-before:page;page-break-before:always;height:0;overflow:hidden;"></div>
<div class="section-cont">
  <h2 style="margin-top:0">4.6 Documenti: DDT e Fatture</h2>
  <ul>
    <li>Elenco DDT e fatture per ogni ordine, accessibili con un tap</li>
    <li>Download PDF immediato direttamente nell'app</li>
    <li>Notifica automatica quando un documento è disponibile o mancante</li>
    <li>Sincronizzazione automatica dal sistema documentale ERP</li>
  </ul>

  <h2>4.7 Tracking Spedizioni FedEx</h2>
  <ul>
    <li>Integrazione nativa con <strong>FedEx Track API</strong> — stato spedizione real-time per ogni ordine</li>
    <li>Notifica push ad ogni cambio di stato della spedizione</li>
    <li>Storico eventi con dettaglio città e orario</li>
    <li>Batch tracking fino a 30 spedizioni simultanee</li>
  </ul>

  <h2>4.8 Sistema di Notifiche Intelligente — 11 Tipi</h2>
  <p>Formicanera notifica proattivamente l'agente senza che debba cercare nulla:</p>
  <div class="notif-grid">
    <div class="notif-item"><div class="notif-dot"></div>Ordine confermato e registrato su ERP</div>
    <div class="notif-item"><div class="notif-dot"></div>Aggiornamento in tempo reale sullo stato ordine</div>
    <div class="notif-item"><div class="notif-dot"></div>Nuovo DDT disponibile</div>
    <div class="notif-item"><div class="notif-dot"></div>Nuova fattura disponibile</div>
    <div class="notif-item"><div class="notif-dot"></div>Documento in attesa di disponibilità</div>
    <div class="notif-item"><div class="notif-dot"></div>Cambio stato spedizione FedEx</div>
    <div class="notif-item"><div class="notif-dot"></div>Cliente inattivo (rischio esclusività 8 mesi)</div>
    <div class="notif-item"><div class="notif-dot"></div>Cliente con dati da completare</div>
    <div class="notif-item"><div class="notif-dot"></div>Nuovo articolo rilevato fuori catalogo standard</div>
    <div class="notif-item"><div class="notif-dot"></div>Variazione prezzo su articolo frequente</div>
    <div class="notif-item"><div class="notif-dot"></div>Promozione attiva su articoli del tuo catalogo</div>
  </div>
</div>

<div style="break-before:page;page-break-before:always;height:0;overflow:hidden;"></div>
<div class="section-cont">
  <h2 style="margin-top:0">4.9 Integrazioni con Ecosistema Professionale</h2>
  <p>Formicanera non è un'isola. Si integra con gli strumenti che l'agente già usa quotidianamente:</p>
  <div class="int-row">
    <div class="int-card">
      <div class="int-icon">💬</div>
      <div class="int-name">WhatsApp</div>
      <div class="int-desc">Condivisione preventivi e documenti direttamente ai clienti</div>
    </div>
    <div class="int-card">
      <div class="int-icon">📁</div>
      <div class="int-name">Dropbox</div>
      <div class="int-desc">Archiviazione automatica di DDT, fatture e documenti</div>
    </div>
    <div class="int-card">
      <div class="int-icon">📍</div>
      <div class="int-name">Google Maps</div>
      <div class="int-desc">Navigazione all'indirizzo del cliente con un tap dalla scheda</div>
    </div>
    <div class="int-card">
      <div class="int-icon">🚚</div>
      <div class="int-name">FedEx API</div>
      <div class="int-desc">Tracking ufficiale integrato, 100.000 chiamate/giorno</div>
    </div>
  </div>

  <div style="break-inside:avoid-page;page-break-inside:avoid;">
    <h2 style="break-before:avoid;page-break-before:avoid;">4.10 Sicurezza, Accesso e Privacy</h2>
    <div class="grid-2">
      <div class="card">
        <h3>🔐 Autenticazione biometrica</h3>
        <p>Face ID e impronta digitale — i dati biometrici non vengono mai trasmessi al server.</p>
      </div>
      <div class="card">
        <h3>🕶️ Modalità privacy</h3>
        <p>Oscuramento dati sensibili a schermo durante presentazioni in presenza del cliente.</p>
      </div>
      <div class="card">
        <h3>👥 Multi-ruolo</h3>
        <p>Agente, amministratore, operatore Verona — permessi separati e non sovrapponibili.</p>
      </div>
      <div class="card">
        <h3>🔄 Real-time multi-dispositivo</h3>
        <p>Tutte le operazioni sincronizzate in tempo reale su tutti i dispositivi via WebSocket.</p>
      </div>
    </div>
  </div>
</div>

<!-- ══════════════════ SEZ 5: VERSIONI ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">5.</span>Tre Versioni della Piattaforma</h1>
  <p>Formicanera non è pensata solo per gli agenti diretti Komet. È una piattaforma con <strong>versioni dedicate per ogni figura della filiera</strong>, ognuna con il proprio set di funzionalità ottimizzate.</p>
  <div class="sp-sm"></div>
  <div class="versions">
    <div class="version-card v-agent">
      <h3>🐜 Versione Agenti</h3>
      <p style="color:rgba(255,255,255,.65);font-size:9pt;margin-bottom:10px;">Per gli agenti diretti Komet sul campo</p>
      <ul>
        <li>Gestione ordini completa (create, edit, batch)</li>
        <li>Gestione clienti + wizard + VAT lookup</li>
        <li>Dashboard provvigioni, premi, budget</li>
        <li>Tracking FedEx integrato</li>
        <li>Preventivi al volo con IVA</li>
        <li>Notifiche proattive 11 tipi</li>
        <li>Integrazioni WhatsApp, Dropbox, Maps</li>
      </ul>
    </div>
    <div class="version-card v-dealer">
      <h3>🏢 Versione Concessionari</h3>
      <p style="color:var(--text-light);font-size:9pt;margin-bottom:10px;">Moduli dedicati — personalizzabili a pagamento</p>
      <ul>
        <li>Gestione sottoclienti e filiali</li>
        <li>Listino prezzi dedicato concessionario</li>
        <li>Importazione storico ordini da gestionali proprietari</li>
        <li>Sconti personalizzati per sottocliente</li>
        <li>Moduli aggiuntivi su misura</li>
        <li>Accesso multi-agente gestito</li>
      </ul>
    </div>
    <div class="version-card v-verona">
      <h3>🏭 Versione Operatori Verona</h3>
      <p style="color:var(--text-light);font-size:9pt;margin-bottom:10px;">Per il back-office e la gestione interna</p>
      <ul>
        <li>Vista aggregata di tutti gli ordini</li>
        <li>Monitoring stato operazioni bot</li>
        <li>Gestione utenti e agenti</li>
        <li>Report e analytics centrali</li>
        <li>Impersonazione agenti per supporto</li>
        <li>Log completi e audit trail</li>
      </ul>
    </div>
  </div>
  <div class="callout">
    <p>La versione Concessionari è <strong>modulare e personalizzabile a pagamento</strong> — ogni concessionario Komet può scegliere i moduli di cui ha bisogno, creando un ecosistema scalabile per tutta la rete distributiva europea.</p>
  </div>
</div>

<!-- ══════════════════ SEZ 6: VANTAGGI ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">6.</span>Vantaggi Concreti e Misurabili</h1>
  <h2>Per l'Agente</h2>
  <div>
  <table>
    <thead><tr><th>Metrica</th><th>Prima (ERP)</th><th>Con Formicanera</th><th>Risparmio</th></tr></thead>
    <tbody>
      <tr><td>Piazzare un ordine</td><td>15–20 min</td><td>3–5 min (bot asincrono)</td><td class="check">~75%</td></tr>
      <tr><td>Recupero DDT / fattura</td><td>5–10 min</td><td>&lt;30 secondi</td><td class="check">~95%</td></tr>
      <tr><td>Generare un preventivo</td><td>Impossibile sul campo</td><td>In pochi secondi, con IVA</td><td class="check">∞</td></tr>
      <tr><td>Info cliente in trasferta</td><td>Impossibile o difficile</td><td>Immediato da mobile</td><td class="check">∞</td></tr>
      <tr><td>Tempo admin settimanale</td><td>Elevato</td><td>Ridotto drasticamente</td><td class="check">3–5 ore/sett.</td></tr>
    </tbody>
  </table>
  </div>
  <h2>Per Komet Italia</h2>
  <ul>
    <li><strong>Standardizzazione dei processi</strong>: tutti gli agenti lavorano allo stesso modo, con gli stessi controlli e validazioni</li>
    <li><strong>Qualità dei dati</strong>: validazione P.IVA automatica, completezza anagrafica obbligatoria prima dell'invio ordine</li>
    <li><strong>Protezione esclusività</strong>: allerta automatica per clienti senza ordini da 8 mesi — protezione attiva dell'esclusività territoriale degli agenti</li>
    <li><strong>Riduzione errori ERP</strong>: il bot elimina gli errori di digitazione — ordini sempre inseriti correttamente</li>
    <li><strong>Onboarding veloce</strong>: un nuovo agente impara Formicanera in un'ora, non in settimane</li>
    <li><strong>Visibilità real-time</strong>: il management ha visibilità immediata sullo stato di tutti gli ordini in transito</li>
  </ul>
</div>

<!-- ══════════════════ SEZ 7: ROADMAP ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">7.</span>Roadmap e Visione Futura</h1>
  <p>Formicanera è costruita per crescere. Le funzionalità in roadmap sono già progettate e in fase di sviluppo:</p>
  <div class="sp-sm"></div>
  <div class="roadmap">
    <div class="rm-item">
      <div class="rm-dot">1</div>
      <div class="rm-title">Controllo Backorder in Fase di Ordine</div>
      <div class="rm-desc">Durante la creazione dell'ordine, il sistema verifica attivamente la disponibilità degli articoli e segnala in tempo reale i backorder — evitando sorprese post-invio.</div>
    </div>
    <div class="rm-item">
      <div class="rm-dot">2</div>
      <div class="rm-title">Generazione Ordine con Comandi Vocali</div>
      <div class="rm-desc">L'agente potrà dettare un ordine a voce — Formicanera interpreta il comando, seleziona articolo, quantità e cliente, e prepara il pending per la revisione.</div>
    </div>
    <div class="rm-item">
      <div class="rm-dot">3</div>
      <div class="rm-title">Hub Informazioni Articoli — Mighty + Komet.it</div>
      <div class="rm-desc">Un hub centralizzato che unifica le schede prodotto di Komet Mighty (community ufficiale) e il catalogo komet.it con i dati di ordine — l'agente trova tutto in un unico posto durante la creazione dell'ordine.</div>
    </div>
    <div class="rm-item">
      <div class="rm-dot">4</div>
      <div class="rm-title">Promozioni Attive in Fase di Ordine</div>
      <div class="rm-desc">Durante la creazione di un ordine, Formicanera segnala automaticamente le promozioni attive sugli articoli selezionati o suggerisce articoli in promozione — fondamentale per massimizzare ogni visita al cliente.</div>
    </div>
    <div class="rm-item">
      <div class="rm-dot">5</div>
      <div class="rm-title">Agenti AI per CRM e Comunicazione</div>
      <div class="rm-desc">Agenti AI per ricerca dati anagrafici mancanti, gestione intelligente del giro clienti, risposta automatica a email, invio proattivo fatture scadute e avvisi tracking personalizzati.</div>
    </div>
    <div class="rm-item">
      <div class="rm-dot">6</div>
      <div class="rm-title">Espansione Rete Europea Komet</div>
      <div class="rm-desc">L'architettura è già progettata per il multi-tenant e multi-lingua. Komet Italia è il punto di partenza — Komet Germania e la rete europea sono l'orizzonte naturale.</div>
    </div>
  </div>
</div>

<!-- ══════════════════ SEZ 8: CONSULENZA IT ══════════════════ -->
<div class="section">
  <h1><span class="n">8.</span>Oltre la Piattaforma: Consulenza e Integrazione IT</h1>
  <div class="sp-sm"></div>
  <div class="callout-navy callout">
    <p>Formicanera non è solo un software. È la proposta di <strong>una figura dedicata all'ecosistema informatico di Komet</strong> — qualcuno che conosce il settore dall'interno e può essere il punto di riferimento per ogni esigenza tecnologica.</p>
  </div>
  <div class="sp-sm"></div>
  <div class="grid-2">
    <div class="card card-blue">
      <h3>🛠️ Supporto IT Dedicato</h3>
      <p>Una figura dedicata e disponibile per gestire qualsiasi esigenza informatica nell'ambiente Komet — dalla PWA agli strumenti interni, dagli agenti al back-office.</p>
    </div>
    <div class="card card-blue">
      <h3>🔗 Integrazione Microsoft Dynamics AX</h3>
      <p>Roadmap di integrazione con i software gestionali interni Komet (AX/D365) per una sincronizzazione bidirezionale completa e l'eliminazione di qualsiasi lavoro manuale residuo.</p>
    </div>
    <div class="card card-blue">
      <h3>📡 Automazione Processi Interni</h3>
      <p>Identificazione e automazione di processi ripetitivi nell'operatività Komet — riduzione dei costi operativi e miglioramento della qualità dei dati lungo tutta la filiera.</p>
    </div>
    <div class="card card-blue">
      <h3>🌱 Evoluzione Continua</h3>
      <p>Un partner tecnico che cresce insieme a Komet — non un fornitore esterno che sparisce dopo la consegna, ma una presenza strutturata nel tempo.</p>
    </div>
  </div>
</div>

<!-- ══════════════════ SEZ 9: ARCHITETTURA ══════════════════ -->
<div class="section">
  <h1><span class="n">9.</span>Architettura e Affidabilità</h1>
  <div>
  <table>
    <thead><tr><th>Componente</th><th>Tecnologia</th><th>Note</th></tr></thead>
    <tbody>
      <tr><td>Frontend PWA</td><td>React 19, TypeScript, Vite</td><td>Installabile su iOS/Android/Desktop, offline-first</td></tr>
      <tr><td>Backend</td><td>Node.js, Express, TypeScript</td><td>API REST + WebSocket real-time su tutti i dispositivi</td></tr>
      <tr><td>Database</td><td>PostgreSQL</td><td>Transazionale, ACID-compliant, backup giornalieri</td></tr>
      <tr><td>Job Queue</td><td>BullMQ + Redis</td><td>Operazioni bot asincrone, retry automatici</td></tr>
      <tr><td>Bot ERP</td><td>Puppeteer (Chromium headless)</td><td>Automazione Archibald ERP certificata e stabile</td></tr>
      <tr><td>Infrastruttura</td><td>Hetzner VPS — Germania (UE)</td><td>4 vCPU, 8 GB RAM, SSD 160 GB, scalabile</td></tr>
      <tr><td>CI/CD</td><td>GitHub Actions + Docker</td><td>Deploy automatico, zero downtime durante aggiornamenti</td></tr>
      <tr><td>SSL/TLS</td><td>Let's Encrypt</td><td>HTTPS su tutti gli endpoint, rinnovo automatico 90 gg</td></tr>
    </tbody>
  </table>
  </div>
  <div class="sp-sm"></div>
  <div class="grid-3">
    <div class="metric-card"><div class="metric-value">99.5%</div><div class="metric-label">Uptime target annuale</div></div>
    <div class="metric-card"><div class="metric-value">0</div><div class="metric-label">Downtime durante aggiornamenti</div></div>
    <div class="metric-card"><div class="metric-value">UE</div><div class="metric-label">Hosting Germania — nessun dato extra-UE</div></div>
  </div>
</div>

<!-- ══════════════════ PARTE II ══════════════════ -->
<div class="part-header">
  <div class="part-label">Parte Seconda</div>
  <div class="part-title">Sicurezza e Conformità GDPR</div>
  <div class="part-subtitle">Nota informativa ai sensi del Regolamento (UE) 2016/679</div>
</div>

<!-- ══════════════════ GDPR 1 ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">1.</span>Ruoli ai sensi del GDPR</h1>
  <div>
  <table>
    <thead><tr><th style="width:28%">Ruolo GDPR</th><th style="width:24%">Soggetto</th><th>Responsabilità</th></tr></thead>
    <tbody>
      <tr><td><strong>Titolare del Trattamento</strong> (Data Controller)</td><td>Komet Italia S.r.l.</td><td>Determina finalità e mezzi del trattamento. Responsabile verso interessati e Garante Privacy.</td></tr>
      <tr><td><strong>Responsabile del Trattamento</strong> (Data Processor)</td><td>Formicanera</td><td>Tratta i dati per conto del Titolare secondo le istruzioni del DPA. Garantisce misure tecniche e organizzative adeguate.</td></tr>
      <tr><td><strong>Interessati</strong> (Data Subjects)</td><td>Clienti e Agenti Komet</td><td>Studi dentistici, laboratori odontotecnici, agenti commerciali — titolari di tutti i diritti GDPR (Art. 15–22).</td></tr>
    </tbody>
  </table>
  </div>
  <div class="callout-green callout" style="margin-top:16px;">
    <p>Questo assetto è lo stesso di <strong>Salesforce, HubSpot, Microsoft 365, Google Workspace</strong> — il modello standard per i servizi SaaS B2B, riconosciuto e normalmente accettato. Il rapporto verrà formalizzato tramite un <strong>Data Processing Agreement (DPA)</strong> ai sensi dell'Art. 28 GDPR, firmato prima del go-live.</p>
  </div>
</div>

<!-- ══════════════════ GDPR 2 ══════════════════ -->
<div style="break-before:page;page-break-before:always;height:0;overflow:hidden;"></div>
<div class="section">
  <h1><span class="n">2.</span>Dati Trattati e Basi Giuridiche</h1>
  <div>
  <table>
    <thead><tr><th style="width:30%">Dato</th><th style="width:35%">Finalità</th><th>Base giuridica (Art. 6 GDPR)</th></tr></thead>
    <tbody>
      <tr><td>Ragione sociale, nome</td><td>Gestione anagrafica, fatturazione</td><td>Art. 6.1.b — esecuzione contratto</td></tr>
      <tr><td>Partita IVA e Codice Fiscale</td><td>Validazione, fatturazione, obblighi fiscali</td><td>Art. 6.1.c — obbligo legale</td></tr>
      <tr><td>Indirizzo sede e consegna</td><td>Logistica ordini</td><td>Art. 6.1.b — esecuzione contratto</td></tr>
      <tr><td>Email e telefono</td><td>Comunicazioni operative</td><td>Art. 6.1.b — esecuzione contratto</td></tr>
      <tr><td>Storico ordini e importi</td><td>Gestione commerciale, reportistica</td><td>Art. 6.1.b — esecuzione contratto</td></tr>
      <tr><td>Dati documenti (DDT, fatture)</td><td>Archiviazione fiscale e commerciale</td><td>Art. 6.1.c — obbligo legale</td></tr>
      <tr><td>Dati tracking spedizioni</td><td>Verifica consegna (numero tracking — nessun dato personale verso FedEx)</td><td>Art. 6.1.b — esecuzione contratto</td></tr>
      <tr><td>Credenziali agenti ERP</td><td>Automazione bot su Archibald ERP</td><td>Art. 6.1.b — contratto di servizio</td></tr>
      <tr><td>Log attività</td><td>Audit, sicurezza, supporto tecnico</td><td>Art. 6.1.f — legittimo interesse</td></tr>
    </tbody>
  </table>
  </div>
  <div class="callout" style="margin-top:14px;">
    <p><strong>Nessuna categoria particolare di dati</strong> (Art. 9 GDPR) viene trattata. I dati biometrici degli agenti (Face ID, impronta) sono elaborati <em>esclusivamente sul dispositivo locale</em> e non vengono mai trasmessi al server.</p>
  </div>
</div>

<!-- ══════════════════ GDPR 3 ══════════════════ -->
<div style="break-before:page;page-break-before:always;height:0;overflow:hidden;"></div>
<div class="section">
  <h1><span class="n">3.</span>Misure Tecniche di Sicurezza</h1>
  <div>
  <table>
    <thead><tr><th style="width:25%">Livello</th><th style="width:25%">Tecnologia</th><th>Dettaglio</th></tr></thead>
    <tbody>
      <tr><td>Dati in transito</td><td>HTTPS / TLS 1.2+</td><td>Tutte le comunicazioni client↔server cifrate. Certificato Let's Encrypt, rinnovo automatico 90 gg.</td></tr>
      <tr><td>Dati a riposo</td><td>AES-256 (Hetzner)</td><td>Volume del server cifrato a livello di infrastruttura dal provider.</td></tr>
      <tr><td>Password agenti ERP</td><td>AES-256-GCM</td><td>Cifrate individualmente con chiavi da variabili d'ambiente. Mai in chiaro, mai nei log.</td></tr>
      <tr><td>Token di sessione</td><td>JWT firmato</td><td>Chiave privata dedicata, scadenza configurabile, refresh automatico.</td></tr>
      <tr><td>Hosting</td><td>Hetzner Cloud — Germania</td><td>Data center UE. Nessun trasferimento extra-UE (Art. 44 GDPR). VM dedicata.</td></tr>
    </tbody>
  </table>
  </div>
  <div class="sp-sm"></div>
  <h2>Misure Organizzative</h2>
  <ul>
    <li><strong>Minimizzazione</strong>: trattati solo i dati strettamente necessari alle finalità operative</li>
    <li><strong>Conservazione limitata</strong>: dati operativi per durata contratto +12 mesi; log di sistema: 90 giorni rolling</li>
    <li><strong>Gestione breach</strong>: notifica al Titolare entro <strong>24 ore</strong>; supporto notifica Garante entro 72 ore (Art. 33 GDPR)</li>
    <li><strong>Sub-responsabili documentati</strong>: Hetzner Cloud GmbH (Germania, ISO 27001) e FedEx (solo numero tracking)</li>
    <li><strong>Diritti degli interessati</strong>: accesso, rettifica, cancellazione, portabilità, limitazione — tutti coperti, risposta entro 30 giorni</li>
  </ul>
</div>

<!-- ══════════════════ GDPR SINTESI ══════════════════ -->
<div style="break-before:page;page-break-before:always;height:0;overflow:hidden;"></div>
<div class="section">
  <h1><span class="n">4.</span>Sintesi Conformità GDPR</h1>
  <div>
  <table class="gdpr-ok">
    <thead><tr><th>Requisito GDPR</th><th style="width:35%">Stato Formicanera</th></tr></thead>
    <tbody>
      <tr><td>Hosting UE — nessun trasferimento extra-UE</td><td class="check">✅ Hetzner, Germania</td></tr>
      <tr><td>Crittografia dati in transito</td><td class="check">✅ HTTPS/TLS 1.2+</td></tr>
      <tr><td>Crittografia dati a riposo</td><td class="check">✅ AES-256 (volume cifrato)</td></tr>
      <tr><td>Password mai in chiaro</td><td class="check">✅ AES-256-GCM individuale</td></tr>
      <tr><td>Minimizzazione dei dati</td><td class="check">✅ Solo dati operativi necessari</td></tr>
      <tr><td>Limitazione della conservazione</td><td class="check">✅ Politiche documentate</td></tr>
      <tr><td>Controllo accessi (RBAC + JWT)</td><td class="check">✅ Multi-ruolo + biometrica locale</td></tr>
      <tr><td>Notifica data breach (24h al Titolare)</td><td class="check">✅ Procedura documentata</td></tr>
      <tr><td>Supporto diritti interessati (Art. 15–22)</td><td class="check">✅ Tutte le procedure coperte</td></tr>
      <tr><td>Sub-responsabili documentati</td><td class="check">✅ Hetzner + FedEx (dati minimi)</td></tr>
      <tr><td>DPA disponibile (Art. 28 GDPR)</td><td class="check">✅ Da stipulare pre go-live</td></tr>
    </tbody>
  </table>
  </div>
</div>

<!-- ══════════════════ LAST PAGE: PROSSIMI PASSI + FOOTER ══════════════════ -->
<div style="break-before:page;page-break-before:always;height:0;overflow:hidden;"></div>
<div style="min-height:297mm;display:flex;flex-direction:column;background:var(--bg);">
  <div style="flex:1;padding:46px 64px 32px;">
    <div style="font-size:7.5pt;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:10px;">Conclusione</div>
    <h1 style="font-size:22pt;">Prossimi Passi</h1>
    <p style="font-size:11.5pt;max-width:600px;margin-top:14px;line-height:1.7;color:var(--text);">Formicanera è <strong>già operativa</strong>. Non è un progetto da costruire da zero — è un sistema in produzione, in uso quotidiano, con ordini reali su dati reali. Il ciclo di sviluppo in corso è mirato a completare e perfezionare le funzionalità specifiche per una rete commerciale della dimensione di Komet Italia.</p>
    <div style="background:var(--gold-light);border-left:3px solid var(--gold);border-radius:0 6px 6px 0;padding:14px 20px;margin:18px 0 20px;max-width:640px;">
      <p style="font-size:9pt;color:var(--navy);line-height:1.6;margin:0;"><strong>Stato attuale:</strong> la piattaforma è in uso operativo dalla rete Fresis. L'espansione alla rete Komet Italia richiede un periodo di adattamento e completamento — un percorso già avviato, con milestone chiare e tempi definibili insieme in sede di incontro tecnico.</p>
    </div>
    <div class="roadmap">
      <div class="rm-item"><div class="rm-dot">1</div><div class="rm-title">Incontro tecnico-commerciale</div><div class="rm-desc">Definizione della configurazione per la rete agenti Komet Italia e allineamento sulle aspettative di entrambe le parti</div></div>
      <div class="rm-item"><div class="rm-dot">2</div><div class="rm-title">Definizione del perimetro contrattuale</div><div class="rm-desc">Numero di utenti, livelli di servizio (SLA), termini di assistenza e manutenzione evolutiva</div></div>
      <div class="rm-item"><div class="rm-dot">3</div><div class="rm-title">Firma del DPA GDPR</div><div class="rm-desc">Allineamento con ufficio legale e/o DPO di Komet Italia. Il DPA è basato sulle Clausole Contrattuali Tipo della Commissione Europea</div></div>
      <div class="rm-item"><div class="rm-dot">4</div><div class="rm-title">Onboarding pilota (5–10 agenti)</div><div class="rm-desc">Validazione sul campo con un gruppo ristretto prima del rollout completo sulla rete commerciale italiana</div></div>
      <div class="rm-item"><div class="rm-dot">5</div><div class="rm-title">Rollout rete commerciale italiana</div><div class="rm-desc">Estensione progressiva a tutti gli agenti Komet Italia con supporto dedicato all'onboarding</div></div>
    </div>
  </div>
  <!-- footer DENTRO il flex container, margin-top:auto lo ancora al fondo -->
  <div class="doc-footer" style="margin-top:auto;">
    <div class="footer-left">
      <img src="${logoSrc}" class="footer-logo" alt="Formicanera">
      <div>
        <div class="footer-brand">Formicanera</div>
        <div class="footer-sub">Il vantaggio competitivo per gli agenti Komet</div>
      </div>
    </div>
    <div class="footer-meta">
      Documento preparato da Formicanera — Marzo 2026<br>
      Riservato — Per uso esclusivo di Komet Italia S.r.l.<br>
      Ogni riproduzione o distribuzione non autorizzata è vietata
    </div>
  </div>
</div><!-- end last-page -->

</body>
</html>`;

const outputPath = join(__dirname, 'formicanera-komet-presentazione.pdf');

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
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    preferCSSPageSize: false,
  });
  await browser.close();
  console.log('✅ PDF generato:', outputPath);
}

generatePDF().catch(err => { console.error('Errore:', err); process.exit(1); });
