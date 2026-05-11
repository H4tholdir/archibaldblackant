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
<title>Formicanera — Whitepaper Sicurezza e Conformità</title>
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
.cover-title{font-family:'Playfair Display',Georgia,serif;font-size:40pt;font-weight:800;color:#fff;line-height:1.07;margin-bottom:20px;}
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
td{padding:10px 13px;vertical-align:top;line-height:1.5;}
td.check{color:var(--green);font-weight:700;text-align:center;font-size:10pt;vertical-align:middle;}
td.cross{color:var(--red);font-weight:700;text-align:center;font-size:10pt;vertical-align:middle;}

/* ── TERMS ── */
.terms-list{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0;}
.term{background:var(--bg);border-radius:8px;padding:15px 18px;border-left:3px solid var(--gold);}
.term h3{font-size:9.5pt;font-weight:700;color:var(--navy);margin-bottom:5px;margin-top:0;}
.term p{font-size:9pt;color:var(--text-mid);margin:0;line-height:1.55;}

/* ── FAQ ── */
.faq-item{margin:14px 0;border-left:3px solid var(--gold);padding-left:16px;}
.faq-q{font-size:9.5pt;font-weight:700;color:var(--navy);margin-bottom:4px;}
.faq-a{font-size:9pt;color:var(--text-mid);line-height:1.65;}

/* ── FLOW DIAGRAM ── */
.flow-box{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px 20px;font-family:monospace;font-size:8.5pt;color:var(--navy);line-height:1.8;margin:14px 0;}

/* ── SECURITY GRID ── */
.security-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0;}
.security-item{background:var(--bg);border-radius:8px;padding:12px 15px;border-left:3px solid var(--gold);}
.security-item h3{font-size:9pt;font-weight:700;color:var(--navy);margin-bottom:5px;margin-top:0;}
.security-item p{font-size:8pt;color:var(--text-mid);margin:0;line-height:1.55;}

/* ── CHECK LIST ── */
.check-list{list-style:none;margin:8px 0 0 0;padding:0;}
.check-list li{font-size:8.5pt;padding:3px 0;color:var(--text-mid);display:flex;gap:8px;align-items:flex-start;}
.check-list li::before{content:'✓';color:var(--green);font-weight:700;flex-shrink:0;}

/* ── NIS2 TABLE ── */
.nis2-table{width:100%;border-collapse:collapse;font-size:8pt;margin:12px 0;}
.nis2-table thead tr{background:var(--navy);}
.nis2-table thead th{padding:9px 11px;text-align:left;color:rgba(255,255,255,.9);font-size:7.5pt;}
.nis2-table tbody tr{border-bottom:1px solid var(--border);}
.nis2-table tbody tr:nth-child(even){background:var(--bg);}
.nis2-table td{padding:8px 11px;vertical-align:top;line-height:1.45;}

/* ── RATE LIMIT TABLE ── */
.rate-table{width:100%;border-collapse:collapse;font-size:8pt;margin:10px 0;}
.rate-table thead tr{background:var(--navy2);}
.rate-table thead th{padding:8px 11px;text-align:left;color:rgba(255,255,255,.88);font-size:7.5pt;}
.rate-table tbody tr{border-bottom:1px solid var(--border);}
.rate-table tbody tr:nth-child(even){background:var(--bg);}
.rate-table td{padding:7px 11px;vertical-align:middle;font-size:8pt;line-height:1.4;}
.rate-table td code{background:#f0f0f0;padding:1px 5px;border-radius:3px;font-size:7.5pt;}

/* ── INCIDENT SEVERITY ── */
.incident-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0;}
.incident-card{border-radius:8px;padding:14px 16px;border-top:4px solid;}
.incident-p1{background:#fff5f5;border-top-color:#dc2626;}
.incident-p2{background:#fffbeb;border-top-color:#d97706;}
.incident-p3{background:#f0fdf4;border-top-color:#059669;}
.incident-label{font-size:7.5pt;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;}
.incident-p1 .incident-label{color:#dc2626;}
.incident-p2 .incident-label{color:#d97706;}
.incident-p3 .incident-label{color:#059669;}
.incident-title{font-size:9pt;font-weight:700;color:var(--navy);margin-bottom:6px;}
.incident-detail{font-size:8pt;color:var(--text-mid);line-height:1.5;}

/* ── ROLE TABLE ── */
.role-badge{display:inline-block;padding:2px 8px;border-radius:3px;font-size:7pt;font-weight:700;font-family:monospace;background:var(--navy);color:var(--gold);letter-spacing:.5px;}

/* ── SUB-PROCESSOR TABLE ── */
.sp-table{width:100%;border-collapse:collapse;font-size:8pt;margin:12px 0;}
.sp-table thead tr{background:var(--navy);}
.sp-table thead th{padding:9px 11px;text-align:left;color:rgba(255,255,255,.9);font-size:7.5pt;}
.sp-table tbody tr{border-bottom:1px solid var(--border);}
.sp-table tbody tr:nth-child(even){background:var(--bg);}
.sp-table td{padding:9px 11px;vertical-align:top;line-height:1.45;}

/* ── CLOSING STATEMENT ── */
.closing-box{background:var(--navy);border-radius:14px;padding:32px 40px;margin:20px 0;position:relative;overflow:hidden;}
.closing-box::before{content:'';position:absolute;top:-60px;right:-60px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(200,169,110,.1) 0%,transparent 65%);}
.closing-text{font-size:11pt;color:rgba(255,255,255,.85);line-height:1.75;margin-bottom:18px;position:relative;z-index:1;}
.closing-sub{font-size:9pt;color:rgba(255,255,255,.5);line-height:1.6;position:relative;z-index:1;}

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

/* ── DATA FLOW ── */
.data-flow{background:var(--navy);border-radius:10px;padding:20px 28px;margin:14px 0;}
.data-flow-row{display:flex;align-items:center;gap:10px;padding:5px 0;}
.data-flow-row:not(:last-child){border-bottom:1px solid rgba(255,255,255,.08);}
.df-node{background:rgba(255,255,255,.08);border:1px solid rgba(200,169,110,.3);border-radius:6px;padding:6px 14px;font-size:8.5pt;color:rgba(255,255,255,.88);font-weight:500;white-space:nowrap;}
.df-arrow{color:var(--gold);font-size:12pt;font-weight:700;}
.df-label{font-size:7.5pt;color:rgba(255,255,255,.45);font-style:italic;}

/* ── GDPR RIGHTS TABLE ── */
.rights-table{width:100%;border-collapse:collapse;font-size:8pt;margin:12px 0;}
.rights-table thead tr{background:var(--navy);}
.rights-table thead th{padding:9px 12px;text-align:left;color:rgba(255,255,255,.9);font-size:7.5pt;}
.rights-table tbody tr{border-bottom:1px solid var(--border);}
.rights-table tbody tr:nth-child(even){background:var(--bg);}
.rights-table td{padding:9px 12px;vertical-align:top;line-height:1.45;}
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
    <div class="cover-conf">RISERVATO — Gebr. Brasseler GmbH &amp; Co. KG</div>
  </div>
  <div class="cover-main">
    <div class="cover-eyebrow">
      <div class="cover-eyebrow-line"></div>
      <div class="cover-eyebrow-text">Documentazione Tecnica</div>
    </div>
    <div class="cover-title">Whitepaper<br>Sicurezza e<br><em>Conformità</em></div>
    <div class="cover-desc">Formicanera Agent Management System — Architettura, misure di protezione dei dati, documentazione di conformità GDPR e NIS2 indirizzata ai team IT e Legale/Compliance di Gebr. Brasseler GmbH &amp; Co. KG.</div>
    <div class="cover-scope">
      <div class="cover-scope-item">Principio di Non-Interferenza con l'ERP Komet — metodologia RPA illustrata</div>
      <div class="cover-scope-item">Misure di sicurezza tecnica: MFA, AES-256-GCM, audit trail immutabile, RBAC</div>
      <div class="cover-scope-item">Conformità GDPR: ruoli, basi giuridiche, implementazione dei diritti degli interessati</div>
      <div class="cover-scope-item">Mappatura dei controlli NIS2 (Direttiva 2022/2555) — conformità all'Art. 21</div>
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-meta-grid">
      <div class="cover-meta-item"><label>Data Documento</label><span>Maggio 2026</span></div>
      <div class="cover-meta-item"><label>Versione</label><span>2.0 — Definitiva</span></div>
      <div class="cover-meta-item"><label>Destinatario</label><span>Alexander Lange, IT<br>Gebr. Brasseler GmbH &amp; Co. KG</span></div>
      <div class="cover-meta-item"><label>Preparato da</label><span>Francesco Formicola<br>Developer — Formicanera</span></div>
    </div>
  </div>
</div>

<!-- ══════════════════ SEZIONE 1 — CONTESTO CONTRATTUALE ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">1.</span>Contesto Contrattuale e Ruoli GDPR</h1>
  <p class="lead">Prima di affrontare le misure tecniche, è essenziale definire il quadro giuridico che disciplina tutti i trattamenti di dati personali effettuati da Formicanera — e i ruoli precisi di ciascuna parte ai sensi del GDPR.</p>

  <div class="security-grid">
    <div class="security-item">
      <h3>Gebr. Brasseler GmbH &amp; Co. KG / Komet Italia S.r.l. — Titolare del Trattamento</h3>
      <p>Ai sensi dell'<strong>Art. 4(7) GDPR</strong>, Komet Italia S.r.l. determina le finalità e i mezzi del trattamento dei dati personali degli agenti e dei clienti nell'ambito della rete commerciale Komet. Gebr. Brasseler, in qualità di società capogruppo, esercita la vigilanza sulle pratiche di conformità delle entità del gruppo Komet.</p>
    </div>
    <div class="security-item">
      <h3>Formicanera — Responsabile del Trattamento</h3>
      <p>Ai sensi dell'<strong>Art. 28 GDPR</strong>, Formicanera tratta dati personali esclusivamente per conto di Komet Italia S.r.l. e in conformità alle istruzioni documentate da quest'ultima. Si tratta dello stesso modello standard adottato da Salesforce, Microsoft 365, Google Workspace e da ogni grande fornitore SaaS enterprise operante in Europa.</p>
    </div>
  </div>

  <h2>Elementi Strutturali Fondamentali</h2>
  <ul class="check-list">
    <li>Un <strong>Accordo per il Trattamento dei Dati (DPA ex Art. 28 GDPR)</strong> pienamente conforme al Regolamento sarà formalmente sottoscritto prima dell'avvio del sistema — esattamente come previsto dal Regolamento e come prassi consolidata nell'intero settore SaaS.</li>
    <li>Le credenziali ERP dell'agente commerciale sono <strong>assegnate da Komet Italia S.r.l.</strong> — tutte le operazioni automatizzate eseguite da Formicanera rimangono rigorosamente entro il perimetro di autorizzazione dell'agente come definito da Komet Italia.</li>
    <li>Formicanera non tratta <strong>alcun dato al di fuori del perimetro del rapporto di agenzia</strong>. I dati dei clienti, lo storico ordini e i documenti contabili sono trattati esclusivamente per l'esecuzione delle attività commerciali contrattuali dell'agente.</li>
    <li>Tutti i dati rimangono in ogni momento all'interno dell'<strong>Unione Europea</strong>. Non vengono effettuati trasferimenti internazionali al di fuori del quadro delle Clausole Contrattuali Standard dell'UE.</li>
    <li>L'<strong>ERP Komet rimane il registro autoritativo</strong> di tutte le transazioni. Formicanera non costituisce un'autorità parallela sui dati — sincronizza una vista ottimizzata per la consultazione sul campo.</li>
  </ul>

  <div class="callout">
    <p><strong>Contesto di settore:</strong> Il modello Titolare/Responsabile del Trattamento non è una costruzione giuridica esclusiva di Formicanera — è l'architettura standard alla base di ogni deployment SaaS B2B in Europa. Salesforce, SAP e Microsoft operano nell'ambito di identici framework GDPR quando trattano dati per conto dei propri clienti enterprise. Ciò che distingue Formicanera è il perimetro di trattamento ristretto e ben definito: i dati commerciali di un singolo agente, mai aggregati tra agenti, mai condivisi con terze parti al di fuori dell'elenco documentato dei sub-responsabili del trattamento.</p>
  </div>
</div>

<!-- ══════════════════ SEZIONE 2 — NON-INTERFERENZA ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">2.</span>Il Principio di Non-Interferenza con l'ERP Komet</h1>
  <p class="lead">Questa è la sezione operativamente più significativa del presente documento. La questione dell'integrità dell'ERP è al centro di qualsiasi revisione IT responsabile e merita una risposta precisa e verificabile.</p>

  <h2>Cosa Fa Concretamente Formicanera</h2>
  <p><strong>Formicanera non aggira l'ERP. Automatizza esattamente ciò che l'agente già compie manualmente.</strong></p>
  <p>In concreto: un browser Chromium standard si autentica nell'ERP Komet Archibald utilizzando <strong>le credenziali personali d'agente del Sig. Formicola</strong> — le stesse credenziali assegnate da Komet Italia per la sua attività commerciale. Il sistema naviga quindi le stesse schermate dell'interfaccia che l'agente navigherebbe manualmente, leggendo dati di ordini, anagrafiche clienti e documenti ufficiali quali fatture e documenti di trasporto. Quando l'agente invia un ordine tramite la PWA Formicanera, il browser compila il modulo d'ordine nell'ERP usando le stesse credenziali e lo invia attraverso l'interfaccia ERP standard.</p>

  <div class="security-grid">
    <div class="security-item">
      <h3>Nessun permesso elevato</h3>
      <p>Il sistema utilizza esclusivamente il ruolo agente standard all'interno dell'ERP. Non dispone di accesso amministrativo, non accede a schermate di configurazione e non ha possibilità di modificare le impostazioni dell'ERP né di accedere ai dati di altri agenti.</p>
    </div>
    <div class="security-item">
      <h3>Nessuna credenziale condivisa</h3>
      <p>Le credenziali ERP di ciascun agente sono utilizzate esclusivamente dalla sessione automatizzata di quell'agente. Non esiste un insieme di credenziali condiviso o in pool. L'accesso incrociato tra agenti è architetturalmente impossibile.</p>
    </div>
    <div class="security-item">
      <h3>Nessun dato al di fuori del perimetro autorizzato</h3>
      <p>Il sistema vede esattamente ciò che vede l'agente — non un byte in più. Non può accedere a territori, clienti o documenti che l'agente non possa accedere manualmente attraverso l'interfaccia ERP standard.</p>
    </div>
    <div class="security-item">
      <h3>L'ERP come registro della verità</h3>
      <p>Tutti gli ordini inviati confluiscono nell'ERP Komet come sistema autoritativo. Formicanera non crea un registro parallelo delle transazioni — fornisce un'interfaccia mobile ottimizzata per la lettura sui dati propri dell'ERP.</p>
    </div>
  </div>

  <h2>Di Cosa Si Tratta — e di Cosa Non Si Tratta</h2>
  <p>Si tratta di <strong>RPA — Robotic Process Automation</strong>: una tecnica standard di settore utilizzata da imprese di tutto il mondo, equivalente per natura a un utente che opera il software tramite scorciatoie da tastiera, script o strumenti di accessibilità. L'RPA è esplicitamente riconosciuta dai principali framework di settore (ISO/IEC, ENISA) come tecnica di automazione legittima che opera interamente entro i limiti dell'autorizzazione utente esistente.</p>
  <p><strong>Ciò non configura accesso informatico non autorizzato</strong> ai sensi della Direttiva 2013/40/UE relativa agli attacchi contro i sistemi informatici, né ai sensi del §202a StGB (Codice Penale tedesco sull'accesso non autorizzato ai dati). L'autorizzazione di accesso sottostante — le credenziali d'agente del Sig. Formicola e il suo diritto contrattuale di utilizzo dell'ERP Komet, concesso da Komet Italia S.r.l. — è valida, attuale e formalmente documentata nel contratto di agenzia datato 1° gennaio 2026.</p>

  <div class="callout callout-navy">
    <p>"Pensate a Formicanera come a una versione esperta e disciplinata dell'agente stesso — una versione che accede all'ERP a intervalli prevedibili, non dimentica mai di effettuare il logout e genera <strong>un carico non superiore a quello di un umano al lavoro alla propria scrivania</strong>. Non introduce nuovi accessi; rende l'accesso esistente e autorizzato più coerente e affidabile."</p>
  </div>

  <h2>Carico sull'ERP e Protezione delle Prestazioni</h2>
  <ul class="check-list">
    <li><strong>Meno erratico di un utente umano:</strong> le interazioni automatizzate sono distanziate da intervalli obbligatori, impedendo qualsiasi picco di richieste che un agente impegnato potrebbe inavvertitamente generare.</li>
    <li><strong>Sospensione automatica in caso di indisponibilità dell'ERP:</strong> se l'ERP non risponde, è in manutenzione o presenta anomalie, il sistema lo rileva immediatamente e sospende ogni interazione senza cicli aggressivi di ritentativi.</li>
    <li><strong>Sincronizzazione consapevole dell'attività:</strong> quando l'agente è inattivo (serate, fine settimana), la frequenza di sincronizzazione si riduce automaticamente, diminuendo ulteriormente l'interazione con l'ERP nelle ore di inattività.</li>
    <li><strong>Nessuna degradazione delle prestazioni ERP osservata:</strong> durante l'intero periodo operativo, nessun impatto sulle prestazioni dell'ERP Komet attribuibile al sistema Formicanera è stato registrato.</li>
    <li><strong>Protezione dell'integrità dei dati:</strong> se una interrogazione all'ERP restituisce risultati vuoti per qualsiasi motivo (incluse condizioni di rete transitorie), i dati locali esistenti vengono preservati — il sistema non sovrascrive mai record validi con risposte vuote.</li>
  </ul>
</div>

<!-- ══════════════════ SEZIONE 3 — FLUSSO DEI DATI ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">3.</span>Architettura del Flusso dei Dati</h1>
  <p class="lead">Di seguito è descritto il flusso dei dati end-to-end completo, dal dispositivo mobile dell'agente all'ERP Komet e ritorno, con tutti i controlli di sicurezza applicati ad ogni confine.</p>

  <h2>Flusso dei Dati — Passo per Passo</h2>
  <div class="data-flow">
    <div class="data-flow-row">
      <div class="df-node">1. Dispositivo Mobile Agente</div>
      <div class="df-arrow">→</div>
      <div class="df-node">Formicanera PWA</div>
      <div class="df-label">&nbsp;· Autenticazione biometrica (Face ID / Touch ID) + JWT + MFA TOTP opzionale</div>
    </div>
    <div class="data-flow-row">
      <div class="df-node">2. PWA</div>
      <div class="df-arrow">→</div>
      <div class="df-node">Backend API (HTTPS / TLS 1.2+)</div>
      <div class="df-label">&nbsp;· Tutto il traffico cifrato, HSTS applicato, CORS basato su whitelist</div>
    </div>
    <div class="data-flow-row">
      <div class="df-node">3. Backend</div>
      <div class="df-arrow">→</div>
      <div class="df-node">Coda Job BullMQ (Redis)</div>
      <div class="df-label">&nbsp;· Operazioni in coda con controllo della frequenza, nessuna chiamata sincrona diretta all'ERP dal mobile</div>
    </div>
    <div class="data-flow-row">
      <div class="df-node">4. Coda Job</div>
      <div class="df-arrow">→</div>
      <div class="df-node">Pool Browser Chromium</div>
      <div class="df-label">&nbsp;· Max 3 browser, concorrenza controllata, credenziali agente decifrate on-demand</div>
    </div>
    <div class="data-flow-row">
      <div class="df-node">5. Chromium</div>
      <div class="df-arrow">→</div>
      <div class="df-node">ERP Komet Archibald</div>
      <div class="df-label">&nbsp;· Solo credenziali personali dell'agente — sessione ERP standard, nessun accesso elevato</div>
    </div>
    <div class="data-flow-row">
      <div class="df-node">6. Dati ERP</div>
      <div class="df-arrow">→</div>
      <div class="df-node">PostgreSQL (Hetzner, Germania)</div>
      <div class="df-label">&nbsp;· Schema isolato per agente, cifrato a riposo, audit log immutabile</div>
    </div>
    <div class="data-flow-row">
      <div class="df-node">7. Ordini Agente</div>
      <div class="df-arrow">→</div>
      <div class="df-node">ERP Komet (via sessione agente)</div>
      <div class="df-label">&nbsp;· Ordini reinseriti nell'ERP — l'ERP Komet rimane il registro autoritativo</div>
    </div>
  </div>

  <h2>Proprietà Architetturali Fondamentali</h2>
  <div class="security-grid">
    <div class="security-item">
      <h3>Tutti i dati conservati in Germania (UE)</h3>
      <p>Il server di produzione è un VPS Hetzner CPX32 situato a Falkenstein, Germania. I backup su Object Storage utilizzano la region fsn1 di Hetzner (Francoforte, Germania). Nessun dato viene conservato al di fuori dell'Unione Europea.</p>
    </div>
    <div class="security-item">
      <h3>Isolamento dei dati per agente</h3>
      <p>I dati di ciascun agente sono conservati in uno schema isolato. Non esiste uno strato di dati condiviso tra agenti — un bug, una configurazione errata o una sessione compromessa relativa a un agente non può esporre i dati di un altro agente.</p>
    </div>
    <div class="security-item">
      <h3>Nessun percorso diretto mobile-ERP</h3>
      <p>Il dispositivo mobile dell'agente non comunica mai direttamente con l'ERP. Tutte le interazioni con l'ERP sono mediate attraverso il server backend, garantendo un confine di sicurezza netto e un audit trail completo.</p>
    </div>
    <div class="security-item">
      <h3>L'ERP come fonte autoritativa</h3>
      <p>Gli ordini inviati dall'agente confluiscono nell'ERP Komet attraverso l'interfaccia di invio standard. Komet Italia mantiene piena autorità sull'accettazione o il rifiuto degli ordini, coerentemente con l'Art. 2(g) del contratto di agenzia.</p>
    </div>
  </div>
</div>

<!-- ══════════════════ SEZIONE 4 — SICUREZZA TECNICA ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">4.</span>Misure di Sicurezza Tecnica Implementate</h1>
  <p class="lead">Le seguenti misure di sicurezza sono attualmente implementate in produzione, operative dall'aprile 2026 e documentate nella Dichiarazione di Conformità Tecnica (n. 2026-001).</p>

  <h2>4.1 — Autenticazione e Gestione delle Sessioni</h2>

  <p><strong>JWT con Revoca Attiva (blacklist Redis):</strong> Il sistema implementa token di accesso JWT con un identificatore crittograficamente univoco (jti, UUID v4) per token. Al logout, il jti viene inserito in un elenco di revoca Redis con TTL dinamico calcolato dalla scadenza del token. Il middleware di autenticazione verifica la revoca ad ogni richiesta. I token sottratti vengono invalidati nel momento in cui l'agente effettua il logout.</p>

  <p><strong>MFA TOTP (RFC 6238):</strong> L'autenticazione a più fattori è implementata tramite password monouso basate sul tempo. Il segreto TOTP è cifrato con AES-256-GCM prima della persistenza in database — non è mai accessibile in chiaro, non viene mai trasmesso nelle risposte API. Vengono forniti otto codici di recupero monouso, memorizzati con hash bcrypt. L'endpoint di configurazione MFA è soggetto a limitazione della frequenza delle richieste (rate limiting: 5 richieste / 15 minuti per IP).</p>

  <p><strong>Device Trust MFA (esenzione 30 giorni):</strong> Per ridurre l'attrito mantenendo la sicurezza, un token di dispositivo attendibile (hash SHA-256 memorizzato in database) consente di omettere l'OTP per un massimo di 30 giorni su un dispositivo verificato. La relazione di fiducia è specifica del dispositivo e revocabile dal pannello di amministrazione.</p>

  <p><strong>Autenticazione Biometrica (WebAuthn):</strong> La PWA integra Face ID e Touch ID tramite l'API WebAuthn nativa del sistema operativo. I dati biometrici sono elaborati esclusivamente dall'enclave sicura del dispositivo — non vengono mai trasmessi al server, mai memorizzati lato server e mai accessibili allo strato applicativo. Il server riceve esclusivamente un'attestazione crittografica del completamento con successo della verifica biometrica locale.</p>

  <h2>4.2 — Limitazione della Frequenza delle Richieste (Rate Limiting) su Tutti gli Endpoint Sensibili</h2>
  <table class="rate-table">
    <thead>
      <tr>
        <th>Endpoint</th>
        <th>Finestra</th>
        <th>Limite</th>
        <th>Risposta al Superamento</th>
      </tr>
    </thead>
    <tbody>
      <tr><td><code>POST /api/auth/login</code></td><td>15 minuti</td><td>5 tentativi</td><td>HTTP 429 + registrazione audit log</td></tr>
      <tr><td><code>POST /api/auth/refresh</code></td><td>60 minuti</td><td>20 richieste</td><td>HTTP 429</td></tr>
      <tr><td><code>POST /api/auth/mfa-verify</code></td><td>15 minuti</td><td>10 tentativi</td><td>HTTP 429</td></tr>
      <tr><td><code>POST /api/auth/mfa-setup</code></td><td>15 minuti</td><td>5 richieste</td><td>HTTP 429</td></tr>
      <tr><td><code>POST /api/auth/mfa-confirm</code></td><td>15 minuti</td><td>5 richieste</td><td>HTTP 429</td></tr>
    </tbody>
  </table>
  <p style="font-size:8pt;color:var(--text-light);margin-top:-6px;">Ogni superamento della soglia di login viene registrato nell'audit log immutabile con IP dell'attore, user agent e timestamp.</p>

  <h2>4.3 — Cifratura</h2>
  <ul class="check-list">
    <li><strong>AES-256-GCM a riposo</strong> per le credenziali ERP e i segreti MFA — lo stesso standard di cifratura utilizzato nelle applicazioni di servizi finanziari. La derivazione della chiave utilizza PBKDF2-HMAC-SHA256. La chiave di cifratura è conservata esclusivamente come variabile d'ambiente, mai nel codice sorgente, mai nei log, mai trasmessa in alcuna risposta API.</li>
    <li><strong>TLS 1.2+ in transito</strong> per tutte le comunicazioni tra client mobile e server backend — gestito da Nginx con certificati Let's Encrypt rinnovati automaticamente. Non esiste alcun percorso dati non cifrato.</li>
    <li><strong>Applicazione HSTS</strong> previene gli attacchi di downgrade del protocollo. Tutte le connessioni HTTPS sono imposte a livello di trasporto.</li>
    <li><strong>Nessun segreto nel codice sorgente</strong> — tutte le chiavi crittografiche, le credenziali database e i token API sono gestiti come variabili d'ambiente nell'ambiente container di produzione.</li>
  </ul>

  <h2>4.4 — Controllo degli Accessi (RBAC)</h2>
  <p>Il sistema implementa quattro livelli di ruolo con permessi per modulo a livello utente:</p>
  <table>
    <thead>
      <tr><th>Ruolo</th><th>Perimetro</th><th>MFA</th></tr>
    </thead>
    <tbody>
      <tr><td><span class="role-badge">admin</span></td><td>Accesso completo inclusi pannello admin, audit log, gestione utenti</td><td>Opzionale</td></tr>
      <tr><td><span class="role-badge">office</span></td><td>Accesso operativo avanzato (fatture, DDT, storico completo)</td><td>Opzionale</td></tr>
      <tr><td><span class="role-badge">agent</span></td><td>Accesso agente standard: propri clienti, propri ordini, prodotti</td><td>Opzionale</td></tr>
      <tr><td><span class="role-badge">dealer</span></td><td>Accesso dealer: storico ordini Fresis e sottoinsieme clienti</td><td>Opzionale</td></tr>
    </tbody>
  </table>
  <p style="font-size:8.5pt;color:var(--text-mid);margin-top:4px;">Ogni utente dispone inoltre di un array di moduli per utente (<code>modules JSONB</code>) che limita l'accesso ad aree funzionali specifiche. L'assegnazione dei moduli è gestita esclusivamente dagli amministratori. Un amministratore non può accidentalmente bloccare se stesso (self-role guard).</p>

  <h2>4.5 — Header HTTP di Sicurezza</h2>
  <ul class="check-list">
    <li><strong>Strict-Transport-Security (HSTS)</strong> con max-age elevato</li>
    <li><strong>Content-Security-Policy (CSP) restrittiva:</strong> default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' wss:; object-src 'none'; frame-src 'none'</li>
    <li><strong>X-Frame-Options: DENY</strong> — previene gli attacchi di clickjacking</li>
    <li><strong>X-Content-Type-Options: nosniff</strong> — previene il MIME-type sniffing</li>
    <li><strong>Whitelist CORS:</strong> le richieste cross-origin sono accettate esclusivamente da <code>https://formicanera.com</code> — tutte le altre origini vengono respinte a livello middleware</li>
  </ul>

  <h2>4.6 — Audit Trail Immutabile</h2>
  <p>Il sistema mantiene un audit log persistente e append-only in <code>system.audit_log</code> (PostgreSQL). L'immutabilità a livello database è garantita da:</p>
  <div class="callout">
    <p><code>REVOKE UPDATE, DELETE ON system.audit_log FROM archibald</code> — l'utente database applicativo è strutturalmente impedito dal modificare o cancellare qualsiasi record di audit. La rimozione di record richiederebbe accesso superuser diretto con credenziali separate non utilizzate dall'applicazione.</p>
  </div>
  <p>Eventi tracciati nell'audit log:</p>
  <ul class="check-list">
    <li>Tutti i tentativi di login (riusciti e falliti), logout, revoche di token</li>
    <li>Creazione, modifica, cancellazione di ordini (singoli e in batch)</li>
    <li>Operazioni di cancellazione GDPR (Art. 17) ed esportazione dati (Art. 20) — con ID attore e timestamp</li>
    <li>Operazioni di gestione utenti (assegnazione ruoli, modifiche moduli, configurazione MFA)</li>
    <li>Alert di sicurezza: login falliti ripetuti, attivazione circuit breaker, superamento rate limit, errori di sistema ad alta frequenza</li>
  </ul>

  <h2>4.7 — Gate di Sicurezza CI/CD</h2>
  <p>La pipeline di integrazione continua (GitHub Actions) esegue <code>npm audit --audit-level=critical</code> ad ogni push nel repository. Le vulnerabilità critiche bloccano sia la build sia il deployment automatico. Il software non può essere distribuito in produzione con vulnerabilità critiche note nelle proprie dipendenze.</p>
</div>

<!-- ══════════════════ SEZIONE 5 — GDPR ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">5.</span>Conformità GDPR</h1>
  <p class="lead">Formicanera tratta dati personali in qualità di Responsabile del Trattamento ai sensi dell'Art. 28 GDPR. Di seguito sono documentate le categorie di dati trattati, le basi giuridiche e l'implementazione dei diritti degli interessati.</p>

  <h2>5.1 — Categorie di Dati Personali Trattati</h2>
  <div class="security-grid">
    <div class="security-item">
      <h3>Dati degli agenti</h3>
      <p>Nome e cognome, credenziali di accesso (password con hash bcrypt), credenziali ERP cifrate, configurazione MFA (segreto TOTP cifrato), ruolo e moduli assegnati, log di attività (conservazione rolling 90 giorni). Nessun dato di categoria particolare ai sensi dell'Art. 9 GDPR.</p>
    </div>
    <div class="security-item">
      <h3>Dati dei clienti</h3>
      <p>Ragione sociale, partita IVA, codice fiscale, sede legale, indirizzo e-mail, numeri di telefono, storico ordini, documenti fatture, documenti di trasporto. Tutti i dati hanno origine dall'ERP Komet — Formicanera non raccoglie dati dei clienti in modo indipendente.</p>
    </div>
  </div>
  <p style="font-size:8.5pt;color:var(--text-mid);">Non vengono trattati dati sanitari, dati biometrici (lato server), dati genetici né alcun altro dato di categoria particolare ai sensi dell'Art. 9 GDPR. L'autenticazione biometrica (Face ID/Touch ID) è elaborata interamente sul dispositivo — nessun dato biometrico raggiunge il server.</p>

  <h2>5.2 — Basi Giuridiche del Trattamento</h2>
  <table>
    <thead>
      <tr><th>Attività di Trattamento</th><th>Base Giuridica</th><th>Articolo GDPR</th></tr>
    </thead>
    <tbody>
      <tr><td>Gestione ordini e operazioni sulla relazione con i clienti</td><td>Esecuzione di un contratto</td><td>Art. 6(1)(b)</td></tr>
      <tr><td>Autenticazione, gestione sessioni, monitoraggio della sicurezza</td><td>Legittimo interesse (sicurezza informatica)</td><td>Art. 6(1)(f)</td></tr>
      <tr><td>Validazione partita IVA</td><td>Obbligo legale (adempimento fiscale)</td><td>Art. 6(1)(c)</td></tr>
      <tr><td>Conservazione audit log</td><td>Legittimo interesse + obbligo legale</td><td>Art. 6(1)(c)(f)</td></tr>
    </tbody>
  </table>

  <h2>5.3 — Diritti degli Interessati — Implementazione</h2>
  <table class="rights-table">
    <thead>
      <tr><th>Diritto</th><th>Implementazione</th><th>Tempi di Risposta</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Accesso (Art. 15)</strong></td>
        <td>Esportazione completa dei dati disponibile tramite pannello admin; audit log di tutte le operazioni ispezionabile</td>
        <td>Entro 30 giorni</td>
      </tr>
      <tr>
        <td><strong>Cancellazione (Art. 17)</strong></td>
        <td><code>POST /api/admin/customers/:id/gdpr-erase</code> — anonimizza 19 campi di dati personali nelle tabelle <code>agents.customers</code> e <code>shared.sub_clients</code>. Campi sostituiti con marker tracciabile <code>[GDPR_ERASED_&lt;timestamp ISO&gt;]</code>. I record strutturali (ordini, storico) sono conservati per obblighi fiscali, privati dei riferimenti identificativi. Operazione bloccata in presenza di ordini attivi. Ogni cancellazione registrata in audit log con ID attore.</td>
        <td>Entro 30 giorni</td>
      </tr>
      <tr>
        <td><strong>Portabilità (Art. 20)</strong></td>
        <td><code>GET /api/admin/customers/:id/export</code> — produce un archivio JSON strutturato contenente tutti i dati del cliente: profilo, ordini, articoli degli ordini, sub-clienti collegati. Restituito con <code>Content-Disposition: attachment</code>. Ogni esportazione registrata in audit log.</td>
        <td>Entro 30 giorni</td>
      </tr>
      <tr>
        <td><strong>Rettifica (Art. 16)</strong></td>
        <td>Record clienti modificabili da ruoli admin/office autorizzati tramite interfaccia admin standard</td>
        <td>Entro 30 giorni</td>
      </tr>
      <tr>
        <td><strong>Limitazione (Art. 18)</strong></td>
        <td>Disattivazione account e restrizione moduli disponibili tramite pannello admin; accesso ai dati agente revocabile immediatamente su richiesta</td>
        <td>Immediatamente su richiesta</td>
      </tr>
    </tbody>
  </table>

  <h2>5.4 — Politica di Conservazione</h2>
  <ul class="check-list">
    <li><strong>Dati operativi:</strong> conservati per la durata del contratto più 12 mesi dalla cessazione (adempimento obblighi fiscali)</li>
    <li><strong>Log di sistema e applicativi:</strong> conservazione rolling 90 giorni con rotazione automatica basata sulla dimensione</li>
    <li><strong>Cancellazione post-contrattuale:</strong> tutti i dati personali relativi agli agenti vengono cancellati entro 60 giorni dalla cessazione del contratto; un'esportazione strutturata è disponibile prima della cancellazione in conformità all'Art. 20 GDPR</li>
    <li><strong>Monitoraggio automatico della conservazione:</strong> scansione settimanale che identifica i clienti inattivi da oltre 24 mesi; l'agente responsabile viene notificato per revisione (nessuna cancellazione automatica — la cancellazione rimane un atto umano deliberato)</li>
  </ul>

  <h2>5.5 — Accordo per il Trattamento dei Dati</h2>
  <p>Un Accordo per il Trattamento dei Dati (DPA ex Art. 28 GDPR) pienamente conforme al Regolamento — comprensivo di tutte le clausole obbligatorie (oggetto, durata, natura e finalità del trattamento, categorie di dati, obblighi e diritti del Titolare del Trattamento) — sarà formalmente sottoscritto prima dell'avvio del sistema. Il DPA sarà firmato contestualmente al contratto commerciale come condizione preliminare all'attivazione del trattamento.</p>
</div>

<!-- ══════════════════ SEZIONE 6 — NIS2 ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">6.</span>Conformità NIS2</h1>
  <p class="lead">La Direttiva (UE) 2022/2555 (NIS2), recepita in Italia con D.Lgs. 138/2024, impone ai fornitori di servizi digitali l'adozione di misure di sicurezza tecniche e organizzative adeguate. Di seguito viene effettuata la mappatura dei controlli implementati da Formicanera rispetto ai requisiti dell'Art. 21 NIS2.</p>

  <table class="nis2-table">
    <thead>
      <tr>
        <th style="width:38%">Requisito Art. 21 NIS2</th>
        <th>Implementazione Formicanera</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Politiche per l'analisi del rischio e la sicurezza dei sistemi informativi</strong></td>
        <td>Misure di sicurezza documentate nel presente whitepaper e nella Dichiarazione di Conformità Tecnica n. 2026-001. Screening DPIA (Valutazione d'Impatto sulla Protezione dei Dati) completato. Il modello di minaccia copre autenticazione, dati in transito, dati a riposo e i confini di interazione con l'ERP.</td>
      </tr>
      <tr>
        <td><strong>Gestione degli incidenti</strong></td>
        <td>Procedura formale di risposta agli incidenti con classificazione della gravità P1/P2/P3. Notifica al Titolare del Trattamento entro 24 ore dagli incidenti P1. Notifica all'autorità di controllo (Garante per la Protezione dei Dati Personali / BSI) entro 72 ore ai sensi dell'Art. 33 GDPR. Alert di sicurezza automatici per login falliti, circuit breaker e superamento rate limit.</td>
      </tr>
      <tr>
        <td><strong>Continuità operativa e gestione delle crisi</strong></td>
        <td>Backup automatici giornalieri (notturni, ore 02:00 CET). RPO &lt; 24 ore. RTO 30–60 minuti (ripristino database + rideploy da GitHub). Verifica dei backup registrata ad ogni esecuzione. Procedura di recupero completa documentata.</td>
      </tr>
      <tr>
        <td><strong>Sicurezza della catena di approvvigionamento</strong></td>
        <td>Hetzner Online GmbH (certificata ISO 27001, DPA firmato) come fornitore di infrastruttura principale. FedEx International (Clausole Contrattuali Standard, conforme UE) esclusivamente per l'integrazione del tracking delle spedizioni. Registro completo dei sub-responsabili del trattamento mantenuto e disponibile per audit.</td>
      </tr>
      <tr>
        <td><strong>Sicurezza nell'acquisizione, nello sviluppo e nella manutenzione</strong></td>
        <td><code>npm audit --audit-level=critical</code> eseguito ad ogni push CI/CD — le vulnerabilità critiche bloccano il deployment. Tutte le query database sono parametrizzate (nessun rischio SQL injection). Validazione degli input tramite Zod su tutte le route API critiche per la sicurezza. Dipendenze esaminate prima dell'inclusione.</td>
      </tr>
      <tr>
        <td><strong>Politiche per la valutazione dell'efficacia delle misure di sicurezza</strong></td>
        <td>L'audit log immutabile garantisce visibilità operativa continua. Penetration test pianificato in conformità all'accordo SLA con Komet Italia prima del rollout completo sulla rete. Revisione della sicurezza integrata nel workflow di deployment.</td>
      </tr>
      <tr>
        <td><strong>Crittografia e cifratura</strong></td>
        <td>AES-256-GCM a riposo per tutte le credenziali sensibili. TLS 1.2+ in transito con applicazione HSTS. PBKDF2-HMAC-SHA256 per la derivazione delle chiavi. bcrypt per l'hashing delle password. Nessun algoritmo deprecato in uso.</td>
      </tr>
      <tr>
        <td><strong>Sicurezza delle risorse umane, controllo degli accessi</strong></td>
        <td>RBAC con quattro ruoli (admin/office/agent/dealer) + restrizioni per modulo per utente. MFA (TOTP) disponibile per tutti i ruoli. Audit log di tutte le operazioni di gestione utenti. Disattivazione account immediata su richiesta.</td>
      </tr>
      <tr>
        <td><strong>Utilizzo dell'autenticazione a più fattori</strong></td>
        <td>MFA TOTP (RFC 6238) implementato per tutti gli accessi al sistema. Codici di recupero di riserva forniti (con hash bcrypt). Meccanismo di device trust per ridurre l'attrito mantenendo il livello di sicurezza.</td>
      </tr>
    </tbody>
  </table>

  <div class="callout">
    <p><strong>Nota sull'applicabilità:</strong> In qualità di Responsabile del Trattamento ai sensi dell'Art. 28 GDPR a supporto delle attività operative di un agente commerciale, Formicanera si impegna a mantenere misure di sicurezza proporzionate al profilo di rischio dei dati trattati. I controlli documentati sopra superano i requisiti di base per un sistema di questa scala e sensibilità dei dati, riflettendo un impegno architetturale deliberato alla security-by-design piuttosto che alla compliance-by-checklist.</p>
  </div>
</div>

<!-- ══════════════════ SEZIONE 7 — BACKUP ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">7.</span>Backup e Continuità Operativa</h1>
  <p class="lead">La disponibilità e la recuperabilità dei dati sono trattate come proprietà di sicurezza, non come mere convenienze operative. L'architettura di backup è progettata per una resilienza verificabile e residente nell'UE.</p>

  <div class="terms-list">
    <div class="term">
      <h3>Frequenza dei Backup</h3>
      <p>Backup automatico notturno eseguito alle 02:00 CET tramite cron job sul VPS di produzione. Ogni esecuzione di backup è registrata e verificabile nei log del container.</p>
    </div>
    <div class="term">
      <h3>Processo di Backup</h3>
      <p><code>pg_dump</code> → compressione gzip → upload cifrato su Hetzner Object Storage. Region: fsn1 (Francoforte, Germania). Lo storage rimane in ogni momento all'interno dell'UE.</p>
    </div>
    <div class="term">
      <h3>Conservazione</h3>
      <p>Rotazione rolling a 30 giorni. I backup con più di 30 giorni vengono automaticamente eliminati. Gli ultimi 30 snapshot giornalieri sono sempre conservati.</p>
    </div>
    <div class="term">
      <h3>RPO — Recovery Point Objective</h3>
      <p>Inferiore a 24 ore. In caso di guasto catastrofico del server, la perdita di dati è limitata all'ultimo ciclo di backup completato.</p>
    </div>
    <div class="term">
      <h3>RTO — Recovery Time Objective</h3>
      <p>30–60 minuti. Ripristino del database dall'ultimo backup + nuovo deployment dell'applicazione dal repository GitHub. Il repository del codice sorgente è la fonte autoritativa di deployment.</p>
    </div>
    <div class="term">
      <h3>Verifica</h3>
      <p>Il risultato di ogni esecuzione di backup è registrato. L'integrità dei backup può essere verificata in modo indipendente dal Titolare del Trattamento in qualsiasi momento su richiesta. Le prove di ripristino possono essere condotte sotto NDA in un ambiente di staging.</p>
    </div>
  </div>

  <div class="callout callout-navy">
    <p>"Il backup non ha significato se non viene testato. Manteniamo una procedura di ripristino documentata e siamo pronti a dimostrare un recupero completo del database in un ambiente di staging nell'ambito di qualsiasi audit tecnico richiesto da Gebr. Brasseler GmbH &amp; Co. KG."</p>
  </div>
</div>

<!-- ══════════════════ SEZIONE 8 — RISPOSTA AGLI INCIDENTI ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">8.</span>Risposta agli Incidenti</h1>
  <p class="lead">Una procedura formale di risposta agli incidenti è documentata e operativa. Tutti gli incidenti sono classificati per gravità, con finestre di risposta definite e obblighi di notifica obbligatori.</p>

  <div class="incident-grid">
    <div class="incident-card incident-p1">
      <div class="incident-label">P1 — Critico</div>
      <div class="incident-title">Violazione dei dati o indisponibilità del servizio &gt; 4 ore</div>
      <div class="incident-detail">
        <strong>Risposta:</strong> &lt; 4 ore lavorative<br>
        <strong>Notifica al Titolare del Trattamento:</strong> entro 24 ore<br>
        <strong>Garante per la Protezione dei Dati Personali / BSI:</strong> entro 72 ore (Art. 33 GDPR)<br>
        <strong>Post-mortem:</strong> documentato entro 5 giorni lavorativi
      </div>
    </div>
    <div class="incident-card incident-p2">
      <div class="incident-label">P2 — Alto</div>
      <div class="incident-title">Degradazione del servizio o tentativo di accesso non autorizzato</div>
      <div class="incident-detail">
        <strong>Risposta:</strong> &lt; 8 ore lavorative<br>
        <strong>Notifica al Titolare del Trattamento:</strong> entro 48 ore se sussiste rischio per i dati personali<br>
        <strong>Perimetro:</strong> fallimenti di autenticazione, attivazione circuit breaker, pattern ERP anomali
      </div>
    </div>
    <div class="incident-card incident-p3">
      <div class="incident-label">P3 — Medio</div>
      <div class="incident-title">Anomalie o problemi non critici del servizio</div>
      <div class="incident-detail">
        <strong>Risposta:</strong> 1 giorno lavorativo<br>
        <strong>Notifica al Titolare del Trattamento:</strong> al successivo aggiornamento di stato pianificato<br>
        <strong>Perimetro:</strong> ritardi di sincronizzazione, degrado minore delle prestazioni, problemi funzionali non legati alla sicurezza
      </div>
    </div>
  </div>

  <h2>Alert di Sicurezza Automatici</h2>
  <p>Il sistema genera eventi <code>security.alert</code> automatici registrati nell'audit log immutabile per le seguenti condizioni:</p>
  <ul class="check-list">
    <li><strong>Tentativi di login falliti ripetuti</strong> — il superamento della soglia attiva la limitazione della frequenza delle richieste (rate limiting) e la generazione di alert</li>
    <li><strong>Attivazione del circuit breaker</strong> — dopo 3 fallimenti consecutivi di operazioni ERP, tutte le interazioni con l'ERP vengono automaticamente sospese in attesa di indagine</li>
    <li><strong>Superamento rate limit</strong> — tutti i superamenti del rate limit sugli endpoint di autenticazione vengono registrati con indirizzo IP e user agent</li>
    <li><strong>Errori di sistema ad alta frequenza</strong> — pattern anomali di frequenza degli errori generano alert per revisione operativa</li>
    <li><strong>Rilevamento indisponibilità ERP</strong> — gli eventi di sospensione del sistema vengono registrati con ora di inizio, durata e conferma di ripristino</li>
  </ul>
</div>

<!-- ══════════════════ SEZIONE 9 — SUB-RESPONSABILI ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">9.</span>Sub-Responsabili del Trattamento</h1>
  <p class="lead">Formicanera mantiene un registro completo e aggiornato di tutti i fornitori terzi che trattano dati personali per conto del sistema. Alla data del presente documento, l'elenco dei sub-responsabili del trattamento è il seguente.</p>

  <table class="sp-table">
    <thead>
      <tr>
        <th style="width:22%">Sub-Responsabile</th>
        <th style="width:20%">Ruolo</th>
        <th style="width:18%">Dati Trattati</th>
        <th style="width:16%">Ubicazione</th>
        <th>Garanzie</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Hetzner Online GmbH</strong></td>
        <td>Hosting VPS + Object Storage (backup)</td>
        <td>Tutti i dati di sistema (a riposo)</td>
        <td>Falkenstein / Francoforte, Germania (UE)</td>
        <td>Certificata ISO 27001. DPA firmato. Operazioni data center conformi al GDPR. Nessun dato lascia la Germania.</td>
      </tr>
      <tr>
        <td><strong>FedEx International</strong></td>
        <td>Integrazione tracking spedizioni</td>
        <td>Solo numeri di tracking — nessun dato personale del cliente trasmesso</td>
        <td>UE / USA</td>
        <td>Clausole Contrattuali Standard (SCC) — meccanismo di trasferimento approvato dalla Commissione europea. Limitato a dati logistici di riferimento non identificativi.</td>
      </tr>
    </tbody>
  </table>

  <div class="callout">
    <p><strong>Nessun servizio e-mail esterno</strong> è utilizzato per le notifiche di sicurezza. Tutti gli alert e gli eventi di sicurezza sono gestiti tramite il sistema interno di audit log. Le notifiche al Titolare del Trattamento vengono consegnate attraverso canali documentati — nessun dato personale transita attraverso fornitori di posta elettronica terzi a tale scopo.</p>
  </div>

  <h2>Governance dei Sub-Responsabili del Trattamento</h2>
  <ul class="check-list">
    <li>Il registro completo dei sub-responsabili del trattamento è mantenuto e disponibile per audit in qualsiasi momento su richiesta</li>
    <li>Qualsiasi aggiunta di un nuovo sub-responsabile del trattamento sarà notificata a Komet Italia S.r.l. (in qualità di Titolare del Trattamento) con un preavviso minimo di 30 giorni, secondo i termini standard del DPA</li>
    <li>Ogni sub-responsabile del trattamento viene valutato rispetto ai requisiti dell'Art. 28(3) GDPR prima dell'ingaggio</li>
    <li>La certificazione ISO 27001 di Hetzner fornisce una baseline di sicurezza dell'infrastruttura verificata in modo indipendente</li>
  </ul>
</div>

<!-- ══════════════════ SEZIONE 10 — FAQ TECNICA ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">10.</span>FAQ Tecnica per il Team IT</h1>
  <p class="lead">Di seguito vengono affrontate le domande più frequentemente sollevate dai team IT durante la revisione tecnica di sistemi basati su RPA che si interfacciano con ERP aziendali.</p>

  <div class="faq-item">
    <div class="faq-q">D1: Formicanera ha accesso a funzioni ERP amministrative o con privilegi elevati?</div>
    <div class="faq-a">No. Il sistema utilizza esclusivamente le credenziali ERP standard dell'agente commerciale — le stesse credenziali assegnate da Komet Italia al Sig. Formicola per la sua ordinaria attività d'agente. Può accedere unicamente alle stesse schermate, funzioni e dati a cui l'agente può accedere manualmente. Non dispone di accesso alla configurazione ERP, non accede ai territori o ai dati di altri agenti e non dispone di funzioni amministrative all'interno dell'ERP. Permessi elevati non sono richiesti, non sono stati ottenuti e non sono tecnicamente possibili con il livello di credenziali dell'agente.</div>
  </div>

  <div class="faq-item">
    <div class="faq-q">D2: Formicanera può influire sulle prestazioni o sulla stabilità dell'ERP?</div>
    <div class="faq-a">Nessuna degradazione delle prestazioni ERP attribuibile al sistema è stata osservata durante l'intero periodo operativo. Il sistema è architetturalmente progettato per proteggere l'ERP: sospende automaticamente ogni interazione in caso di mancata risposta o manutenzione dell'ERP; distanzia le operazioni di recupero dati con intervalli obbligatori; riduce automaticamente la frequenza di sincronizzazione quando l'agente è inattivo. Il pattern di interazione genera un carico meno erratico di quello di un utente umano — è prevedibile, controllato e non invia mai cicli aggressivi di ritentativi. L'ERP percepisce Formicanera come una sessione utente disciplinata e ben comportata.</div>
  </div>

  <div class="faq-item">
    <div class="faq-q">D3: Cosa accade ai dati in caso di cessazione del contratto?</div>
    <div class="faq-a">Tutti i dati personali relativi agli agenti vengono cancellati entro 60 giorni dalla cessazione del contratto. Prima della cancellazione, un'esportazione completa e strutturata dei dati (JSON/CSV) è disponibile per il Titolare del Trattamento in conformità all'Art. 20 GDPR. L'accesso al codice sorgente, le credenziali ERP e tutti i materiali di autenticazione vengono rimossi da tutti i sistemi Formicanera. Il DPA specificherà in forma giuridicamente vincolante gli esatti obblighi di gestione dei dati post-cessazione.</div>
  </div>

  <div class="faq-item">
    <div class="faq-q">D4: Il codice sorgente è verificabile tramite audit?</div>
    <div class="faq-a">Sì. Un audit completo del codice sorgente può essere organizzato sotto NDA in qualsiasi momento. La pipeline CI/CD (GitHub Actions), la configurazione del deployment e l'implementazione della sicurezza sono tutti disponibili per revisione da parte del team IT di Gebr. Brasseler. Consideriamo la verificabilità del codice sorgente un'aspettativa standard per qualsiasi fornitore enterprise responsabile e accogliamo favorevolmente questo livello di scrutinio.</div>
  </div>

  <div class="faq-item">
    <div class="faq-q">D5: Come vengono protette le credenziali ERP a riposo?</div>
    <div class="faq-a">Le credenziali ERP degli agenti sono cifrate con AES-256-GCM con un IV casuale generato per ogni operazione di cifratura e un tag di autenticazione per il rilevamento delle manomissioni. Il materiale crittografico (IV, tag di autenticazione, testo cifrato) è serializzato separatamente e memorizzato nel database. La chiave di cifratura è derivata tramite PBKDF2-HMAC-SHA256 da una variabile d'ambiente (ENCRYPTION_KEY) che esiste esclusivamente nell'ambiente del server di produzione — non è mai presente nel codice sorgente, mai nel repository, mai nei log e mai trasmessa in alcuna risposta API. Le credenziali vengono decifrate on-demand unicamente in memoria, per la durata della sessione ERP.</div>
  </div>

  <div class="faq-item">
    <div class="faq-q">D6: Formicanera genera o modifica fatture?</div>
    <div class="faq-a">No. Il sistema Formicanera non genera fatture e non applica alcun calcolo finanziario ai dati fattura. Si tratta di un principio architetturale fondamentale coerente con il contratto di agenzia, in base al quale le fatture sono emesse esclusivamente da Komet Italia S.r.l. (in qualità di Preponente), non dall'agente. Tutte le fatture visualizzate nell'applicazione provengono esclusivamente dall'ERP Komet — vengono scaricate come PDF ufficiali esportati dall'ERP attraverso la sessione autenticata dell'agente e visualizzate in sola lettura, senza possibilità di modifica.</div>
  </div>

  <div class="faq-item">
    <div class="faq-q">D7: Come viene monitorato il sistema per gli eventi di sicurezza?</div>
    <div class="faq-a">Il sistema mantiene un audit log immutabile e append-only (PostgreSQL, con revoca dell'accesso in scrittura per le operazioni UPDATE e DELETE a livello applicativo). Tutti gli eventi di autenticazione, le operazioni sui dati, le azioni GDPR e gli alert di sicurezza vengono registrati con ID attore, indirizzo IP, user agent e timestamp. La generazione automatica di alert avviene per login falliti ripetuti, attivazione del circuit breaker, superamenti del rate limit e condizioni di alta frequenza degli errori. L'audit log è ispezionabile dagli amministratori autorizzati e disponibile per audit esterno in qualsiasi momento.</div>
  </div>
</div>

<!-- ══════════════════ SEZIONE 11 — DICHIARAZIONE CONCLUSIVA ══════════════════ -->
<div style="min-height:297mm;display:flex;flex-direction:column;">
  <div style="flex:1;padding:38px 68px 30px;">

    <h1><span class="n">11.</span>Dichiarazione Conclusiva</h1>
    <p class="lead">Il presente documento fornisce una descrizione completa e verificabile dell'architettura di sicurezza del sistema Formicanera, delle pratiche di protezione dei dati e del posizionamento di conformità normativa alla data di maggio 2026.</p>

    <div class="closing-box">
      <div class="closing-text">"Il sistema Formicanera è stato costruito per colmare una reale lacuna operativa — consentire a un agente sul campo di svolgere le proprie attività contrattuali in modo più efficace e accurato — mantenendo piena coerenza con l'ERP Komet quale fonte autorevole della verità. La sicurezza e la protezione dei dati non sono funzionalità aggiunte a posteriori: sono <strong style="color:var(--gold);">proprietà architetturali del sistema</strong>, documentate, implementate e verificabili."</div>
      <div class="closing-sub">Ogni misura di sicurezza documentata in questo whitepaper è operativa in produzione. Il codice sorgente, la pipeline CI/CD, gli audit log e le procedure di backup sono tutti disponibili per verifica indipendente sotto NDA. Non chiediamo fiducia sulla base di dichiarazioni — la offriamo sulla base delle evidenze.</div>
    </div>

    <p>Restiamo pienamente disponibili per un confronto tecnico, una dimostrazione dal vivo del sistema, una revisione del codice sorgente sotto NDA o qualsiasi documentazione aggiuntiva richiesta dai team IT e Legale/Compliance di Gebr. Brasseler GmbH &amp; Co. KG.</p>

    <div style="margin-top:32px;padding:24px 0;border-top:2px solid var(--gold);">
      <p style="font-size:9pt;color:var(--text-light);margin-bottom:16px;">Preparato e sottoscritto da:</p>
      <p style="font-size:13pt;font-weight:800;color:var(--navy);margin-bottom:4px;">Francesco Formicola</p>
      <p style="font-size:9pt;color:var(--text-mid);margin-bottom:2px;">Developer — Formicanera Agent Management System</p>
      <p style="font-size:9pt;color:var(--text-mid);margin-bottom:16px;">Per conto di: Formicola Biagio, Agente Commerciale — Komet Italia S.r.l., Cluster 83</p>
      <p style="font-size:8.5pt;color:var(--text-light);">Napoli, Italia — Maggio 2026</p>
      <p style="font-size:8.5pt;color:var(--text-light);">Contatti: <span style="color:var(--navy);">francesco.formicola@live.it</span> · <span style="color:var(--navy);">formicanera.com</span></p>
    </div>
  </div>

  <div class="doc-footer" style="margin-top:auto;">
    <div class="footer-left">
      <img src="${logoSrc}" class="footer-logo" alt="Formicanera">
      <div>
        <div class="footer-brand">Formicanera</div>
        <div class="footer-sub">Agent Management System — Whitepaper Sicurezza e Conformità</div>
      </div>
    </div>
    <div class="footer-meta">
      Whitepaper Sicurezza e Conformità — Versione 2.0 — Maggio 2026<br>
      RISERVATO — Ad esclusivo uso di Gebr. Brasseler GmbH &amp; Co. KG<br>
      Preparato da Francesco Formicola · formicanera.com
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
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });
  const page = await browser.newPage();
  console.log('Rendering HTML...');
  await page.emulateMediaType('print');
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  console.log('Generazione PDF...');
  await page.pdf({
    path: join(__dirname, 'doc2-sicurezza-IT.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    preferCSSPageSize: false,
  });
  await browser.close();
  console.log('PDF generato: doc2-sicurezza-IT.pdf');
}

generatePDF().catch(err => { console.error('Errore:', err); process.exit(1); });
