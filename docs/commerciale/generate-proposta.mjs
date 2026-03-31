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
<title>Formicanera — Analisi di Mercato & Proposta Commerciale</title>
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
.cover-title{font-family:'Playfair Display',Georgia,serif;font-size:44pt;font-weight:800;color:#fff;line-height:1.07;margin-bottom:20px;}
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

/* ── MARKET TABLE ── */
table{width:100%;border-collapse:collapse;font-size:8.5pt;margin:16px 0;}
thead tr{background:var(--navy);}
thead th{padding:11px 13px;text-align:left;font-weight:600;color:rgba(255,255,255,.9);font-size:8pt;letter-spacing:.3px;}
tbody tr{border-bottom:1px solid var(--border);}
tbody tr:nth-child(even){background:var(--bg);}
tbody tr.highlight{background:#fffdf5;border-left:3px solid var(--gold);}
td{padding:10px 13px;vertical-align:middle;line-height:1.5;}
td.check{color:var(--green);font-weight:700;text-align:center;font-size:10pt;}
td.cross{color:var(--red);font-weight:700;text-align:center;font-size:10pt;}
td.partial{color:var(--gold);font-weight:600;text-align:center;font-size:8.5pt;}
td.bold-gold{font-weight:800;color:var(--navy);}
.market-note{font-size:7.5pt;color:var(--text-light);margin-top:8px;font-style:italic;line-height:1.55;}

/* ── PRICE BLOCK ── */
.price-hero{background:var(--navy);border-radius:14px;padding:26px 36px;margin:14px 0;position:relative;overflow:hidden;}
.price-hero::before{content:'';position:absolute;top:-60px;right:-60px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(200,169,110,.1) 0%,transparent 65%);}
.price-hero-label{font-size:7.5pt;font-weight:700;color:var(--gold);letter-spacing:3px;text-transform:uppercase;margin-bottom:10px;}
.price-hero-main{display:flex;align-items:flex-end;gap:28px;margin-bottom:16px;flex-wrap:wrap;}
.price-block{text-align:center;}
.price-block-label{font-size:7pt;color:rgba(255,255,255,.38);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;}
.price-amount{font-size:30pt;font-weight:900;color:#fff;line-height:1;}
.price-amount .currency{font-size:14pt;font-weight:600;color:rgba(255,255,255,.65);vertical-align:top;margin-top:6px;display:inline-block;}
.price-amount .period{font-size:9pt;font-weight:400;color:rgba(255,255,255,.4);}
.price-amount .strike{text-decoration:line-through;color:rgba(255,255,255,.3);font-size:14pt;margin-right:4px;}
.price-divider{width:1px;background:rgba(255,255,255,.1);height:56px;align-self:center;}
.price-discount-badge{background:rgba(200,169,110,.18);border:1px solid rgba(200,169,110,.35);border-radius:20px;padding:3px 10px;font-size:7.5pt;font-weight:700;color:var(--gold);margin-top:5px;display:inline-block;}
.price-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:4px;}
.price-sum-item{background:rgba(255,255,255,.05);border-radius:8px;padding:10px 12px;text-align:center;}
.price-sum-value{font-size:12pt;font-weight:800;color:#fff;line-height:1;margin-bottom:3px;}
.price-sum-label{font-size:7pt;color:rgba(255,255,255,.38);line-height:1.4;}
.price-hero-note{font-size:8pt;color:rgba(255,255,255,.45);line-height:1.6;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);margin-top:12px;}
.price-hero-note strong{color:rgba(255,255,255,.7);}

/* ── DEDICA / CONSULENTE ── */
.consulente-box{border:2px solid var(--gold);border-radius:12px;padding:26px 28px;margin:20px 0;background:var(--gold-light);position:relative;}
.consulente-box::before{content:'★';position:absolute;top:-13px;left:24px;background:var(--gold-light);padding:0 8px;font-size:14pt;color:var(--gold);}
.consulente-title{font-size:11.5pt;font-weight:800;color:var(--navy);margin-bottom:10px;}
.consulente-body{font-size:9.5pt;color:var(--text-mid);line-height:1.7;margin-bottom:14px;}
.consulente-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;}
.consulente-item{background:#fff;border-radius:6px;padding:10px 14px;display:flex;gap:10px;align-items:flex-start;}
.consulente-item-icon{font-size:14pt;flex-shrink:0;margin-top:1px;}
.consulente-item-text{font-size:8.5pt;color:var(--text-mid);line-height:1.5;}
.consulente-item-text strong{color:var(--navy);display:block;margin-bottom:2px;font-size:9pt;}

/* ── INCLUDE LIST ── */
.include-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0;break-inside:avoid-page;}
.include-col{border-radius:10px;padding:12px 15px;}
.include-col.col-yes{background:var(--navy);}
.include-col.col-extra{background:var(--bg);border:1px solid var(--border);}
.include-col h3{font-size:8.5pt;font-weight:700;margin-bottom:7px;padding-bottom:5px;display:flex;align-items:center;gap:6px;}
.include-col.col-yes h3{color:var(--gold);border-bottom:1px solid rgba(255,255,255,.1);}
.include-col.col-extra h3{color:var(--navy);border-bottom:1px solid var(--border);}
.include-col ul{list-style:none;margin:0;}
.include-col li{font-size:7.5pt;padding:2.5px 0;display:flex;gap:7px;line-height:1.4;}
.include-col.col-yes li{color:rgba(255,255,255,.82);border-bottom:1px solid rgba(255,255,255,.06);}
.include-col.col-extra li{color:var(--text);border-bottom:1px solid rgba(0,0,0,.05);}
.include-col li:last-child{border-bottom:none !important;}
.inc-y::before{content:'✓';color:#4ade80;font-weight:700;flex-shrink:0;}
.inc-n::before{content:'→';color:var(--gold);flex-shrink:0;}

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

/* ── TERMS ── */
.terms-list{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0;}
.term{background:var(--bg);border-radius:8px;padding:15px 18px;border-left:3px solid var(--gold);}
.term h3{font-size:9.5pt;font-weight:700;color:var(--navy);margin-bottom:5px;margin-top:0;}
.term p{font-size:9pt;color:var(--text-mid);margin:0;line-height:1.55;}

/* ── TIMELINE ── */
.timeline{display:flex;gap:0;margin:16px 0;position:relative;}
.timeline::before{content:'';position:absolute;top:18px;left:18px;right:0;height:2px;background:var(--border);z-index:0;}
.tl-step{flex:1;position:relative;z-index:1;padding-right:12px;}
.tl-step:last-child{padding-right:0;}
.tl-dot{width:36px;height:36px;border-radius:50%;background:var(--navy);border:3px solid var(--gold);display:flex;align-items:center;justify-content:center;font-size:10pt;font-weight:800;color:var(--gold);margin-bottom:10px;}
.tl-time{font-size:7pt;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;}
.tl-label{font-size:9.5pt;font-weight:700;color:var(--navy);margin-bottom:3px;}
.tl-desc{font-size:8pt;color:var(--text-light);line-height:1.5;}

/* ── STEPS ── */
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0;}
.step{background:#fff;border:1px solid var(--border);border-radius:8px;padding:15px;}
.step-num{font-size:7.5pt;font-weight:700;color:var(--gold);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px;}
.step-title{font-size:9.5pt;font-weight:700;color:var(--navy);margin-bottom:4px;}
.step-desc{font-size:8pt;color:var(--text-light);line-height:1.5;}

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
    <div class="cover-conf">Riservato — Komet Italia S.r.l.</div>
  </div>
  <div class="cover-main">
    <div class="cover-eyebrow">
      <div class="cover-eyebrow-line"></div>
      <div class="cover-eyebrow-text">Analisi di Mercato & Proposta Commerciale</div>
    </div>
    <div class="cover-title">Una piattaforma<br>costruita <em>dall'interno</em>.<br>Prezzata dal mercato.</div>
    <div class="cover-desc">Un'analisi comparativa del mercato SaaS per reti commerciali e la proposta economica per l'adozione di Formicanera da parte della rete Komet Italia.</div>
    <div class="cover-scope">
      <div class="cover-scope-item">Analisi comparativa: SaaS generico, ERP enterprise, sviluppo custom</div>
      <div class="cover-scope-item">Proposta economica unica — tariffa di mercato giustificata</div>
      <div class="cover-scope-item">Figura informatica dedicata inclusa nel pacchetto</div>
      <div class="cover-scope-item">ROI documentato, termini contrattuali e garanzie GDPR</div>
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-meta-grid">
      <div class="cover-meta-item"><label>Preparata da</label><span>Francesco Formicola<br>Fondatore, Formicanera</span></div>
      <div class="cover-meta-item"><label>Destinatario</label><span>Komet Italia S.r.l.<br>Management Team</span></div>
      <div class="cover-meta-item"><label>Data</label><span>Marzo 2026</span></div>
      <div class="cover-meta-item"><label>Validità offerta</label><span>30 Aprile 2026</span></div>
    </div>
  </div>
</div>

<!-- ══════════════════ 1. IL MERCATO ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">1.</span>Il Mercato: Cosa Esiste e Quanto Costa</h1>
  <p class="lead">Prima della proposta, è utile inquadrare il contesto. Esiste una varietà di soluzioni per le reti commerciali — ognuna con costi, tempi e limiti ben precisi. Questa analisi è basata su listini pubblici e stime di progetto aggiornate al primo trimestre 2026.</p>

  <table>
    <thead>
      <tr>
        <th style="width:17%">Categoria</th>
        <th style="width:20%">Riferimenti</th>
        <th style="width:13%">Mobile agenti</th>
        <th style="width:17%">Integrazione Archibald ERP</th>
        <th style="width:13%">Time to go-live</th>
        <th style="width:20%">Costo anno 1 (70 utenti)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>CRM / SaaS generico</strong></td>
        <td>Salesforce Sales Cloud, HubSpot Enterprise, Pipedrive</td>
        <td class="partial">Parziale</td>
        <td class="cross">✗</td>
        <td>3–6 mesi</td>
        <td>€63.000–176.000</td>
      </tr>
      <tr>
        <td><strong>ERP esteso</strong></td>
        <td>MS Dynamics 365, SAP Business One, Oracle Field Service</td>
        <td class="partial">Limitata</td>
        <td class="cross">✗ Richiede sviluppo</td>
        <td>12–24 mesi</td>
        <td>€150.000–320.000</td>
      </tr>
      <tr>
        <td><strong>Sviluppo custom</strong></td>
        <td>Software house italiana — analisi, sviluppo, deploy, test</td>
        <td class="check">✓</td>
        <td class="partial">18+ mesi</td>
        <td>18–36 mesi</td>
        <td>€220.000–420.000</td>
      </tr>
      <tr class="highlight">
        <td><strong>Formicanera</strong></td>
        <td>PWA mobile-first, bot ERP, sync documenti, notifiche, dashboard, consulente dedicato</td>
        <td class="check">✓ Nativa</td>
        <td class="check">✓ Certificata</td>
        <td class="bold-gold">6 settimane</td>
        <td class="bold-gold">€84.000 (prepagato)</td>
      </tr>
    </tbody>
  </table>
  <p class="market-note">* Costi indicativi per 70 utenti attivi. ERP e sviluppo custom includono implementazione, licenze e primo anno di manutenzione. Dati basati su listini pubblici Salesforce, HubSpot, Microsoft AppSource e benchmark di software house italiane di riferimento — Q1 2026.</p>

  <h2>Il Differenziale che Non Si Compra Altrove</h2>
  <p>Nessuna delle soluzioni sopra è stata progettata per interagire con l'ERP Archibald. Costruire questa integrazione richiede a qualsiasi software house un reverse engineering profondo del gestionale, con tempi minimi di 12–18 mesi e nessuna garanzia di stabilità a lungo termine.</p>
  <p>Formicanera ha già risolto questo problema — in produzione, su ordini e clienti reali, con una stabilità certificata nel tempo. Non è un'integrazione che si costruisce: è una integrazione che già funziona.</p>

  <div class="callout">
    <p><strong>Nota metodologica:</strong> i range di costo sono elaborati da listini pubblici verificati (Salesforce.com/pricing, HubSpot.com/pricing, Microsoft AppSource), preventivi di mercato per software house italiane con team 10–30 sviluppatori, e benchmark SaaS B2B per forza vendita. Le stime anno 1 comprendono licenze, implementazione e manutenzione.</p>
  </div>
</div>

<!-- ══════════════════ 2. LA PROPOSTA ══════════════════ -->
<div class="section pb-before" style="padding-top:28px;padding-bottom:20px;">
  <h1><span class="n">2.</span>La Proposta</h1>
  <p style="font-size:9.5pt;color:var(--text-mid);line-height:1.65;margin-bottom:0;">La tariffa include piattaforma, infrastruttura, supporto e una figura informatica dedicata — tariffa di mercato giustificata dall'analisi comparativa al §1.</p>

  <div class="price-hero">
    <div class="price-hero-label">Tariffa — Piano Rete Komet Italia · Fino a 80 utenti attivi</div>
    <div class="price-hero-main">
      <div class="price-block">
        <div class="price-block-label">Setup una tantum</div>
        <div class="price-amount"><span class="currency">€</span>30.000</div>
      </div>
      <div class="price-divider"></div>
      <div class="price-block">
        <div class="price-block-label">Canone mensile (listino)</div>
        <div class="price-amount"><span class="currency">€</span>5.000<span class="period">/mese</span></div>
        <div class="price-discount-badge">→ €4.500/mese con prepagato annuale (−10%)</div>
      </div>
      <div class="price-divider"></div>
      <div class="price-block">
        <div class="price-block-label">Utente extra oltre 80</div>
        <div class="price-amount" style="font-size:22pt;"><span class="currency" style="font-size:12pt;">€</span>35<span class="period">/mese</span></div>
      </div>
    </div>
    <div class="price-summary">
      <div class="price-sum-item">
        <div class="price-sum-value">€84.000</div>
        <div class="price-sum-label">Anno 1 con prepagato annuale</div>
      </div>
      <div class="price-sum-item">
        <div class="price-sum-value">€54.000</div>
        <div class="price-sum-label">Canone annuale prepagato<br>dal 2° anno</div>
      </div>
      <div class="price-sum-item">
        <div class="price-sum-value">€64</div>
        <div class="price-sum-label">Per utente al mese<br>(su 70 utenti, prepagato)</div>
      </div>
      <div class="price-sum-item">
        <div class="price-sum-value">€75/h</div>
        <div class="price-sum-label">Sviluppo evolutivo<br>extra contratto</div>
      </div>
    </div>
    <div class="price-hero-note">Contratto <strong>24 mesi</strong> · Rinnovo automatico annuale · Pagamento a <strong>30 giorni</strong> · Sconto <strong>−10%</strong> su prepagato annuale (canone effettivo €4.500/mese) · Tutti i prezzi IVA esclusa · Mora ai sensi D.Lgs. 231/2002</div>
  </div>

  <div class="include-cols">
    <div class="include-col col-yes">
      <h3>✅ Incluso nel canone mensile</h3>
      <ul>
        <li class="inc-y">Accesso PWA per tutti gli utenti (fino a 80)</li>
        <li class="inc-y">Hosting VPS dedicato — Germania, UE (Hetzner)</li>
        <li class="inc-y">Database PostgreSQL + backup giornalieri automatici</li>
        <li class="inc-y">Bot ERP Archibald — operatività e aggiornamenti</li>
        <li class="inc-y">Sync ordini, clienti, DDT, fatture con ERP</li>
        <li class="inc-y">Sistema real-time, notifiche proattive, dashboard</li>
        <li class="inc-y">Aggiornamenti sicurezza e stabilità piattaforma</li>
        <li class="inc-y">Monitoraggio uptime 24/7</li>
        <li class="inc-y">Supporto tecnico entro i tempi SLA</li>
        <li class="inc-y">Onboarding: setup, formazione, import dati</li>
        <li class="inc-y"><strong>Consulente informatico dedicato Komet Italia</strong></li>
      </ul>
    </div>
    <div class="include-col col-extra">
      <h3>→ Sviluppo evolutivo (extra, €75/ora)</h3>
      <ul>
        <li class="inc-n">Nuove feature da roadmap (backorder, AI, promozioni)</li>
        <li class="inc-n">Integrazione Microsoft Dynamics AX / D365</li>
        <li class="inc-n">Moduli personalizzati back-office Verona</li>
        <li class="inc-n">Automazioni processi interni Komet</li>
        <li class="inc-n">Sviluppo espansione rete europea Komet</li>
        <li class="inc-n">Formazione aggiuntiva oltre onboarding</li>
        <li class="inc-n">Change request fuori perimetro</li>
      </ul>
    </div>
  </div>
</div>

<div style="break-before:page;page-break-before:always;height:0;overflow:hidden;"></div>
<!-- ══════════════════ 3. IL CONSULENTE DEDICATO ══════════════════ -->
<div class="section">
  <h1><span class="n">3.</span>La Figura Inclusa: Consulente Informatico Dedicato</h1>
  <p class="lead">Il canone mensile include qualcosa che non si trova in un catalogo SaaS: una persona concreta che gestisce questo sistema ogni giorno, che conosce il vostro settore dall'interno, e che è disponibile come punto di riferimento tecnico per Komet Italia.</p>

  <div class="consulente-box">
    <div class="consulente-title">Incluso nel canone: una persona concreta, con oltre 20 anni in questo specifico settore</div>
    <div class="consulente-body">Il canone mensile non include solo la piattaforma — include l'accesso diretto alla persona che l'ha costruita e la fa girare ogni giorno. Non un consulente che ha studiato il vostro settore su un brief: dal 2005 collaboro con la rete Komet, conosco il ciclo commerciale, l'ERP Archibald e le sue inefficienze dall'interno. Formicanera è nata esattamente da quella conoscenza, e quella conoscenza rimane disponibile per Komet.</div>
    <div class="consulente-grid">
      <div class="consulente-item">
        <div class="consulente-item-icon">🔧</div>
        <div class="consulente-item-text">
          <strong>Supporto IT operativo</strong>
          Punto di riferimento per qualsiasi problema informatico interno Komet — dalla PWA agli strumenti di lavoro quotidiani degli agenti e del back-office.
        </div>
      </div>
      <div class="consulente-item">
        <div class="consulente-item-icon">🔗</div>
        <div class="consulente-item-text">
          <strong>Integrazioni con sistemi Komet</strong>
          Roadmap di connessione con Microsoft Dynamics AX/D365, flussi EDI, strumenti interni — con un interlocutore che conosce già l'architettura.
        </div>
      </div>
      <div class="consulente-item">
        <div class="consulente-item-icon">⚙️</div>
        <div class="consulente-item-text">
          <strong>Automazione processi interni</strong>
          Identificazione e automazione di processi ripetitivi nel back-office Verona — riduzione costi operativi e miglioramento qualità dei dati lungo tutta la filiera.
        </div>
      </div>
      <div class="consulente-item">
        <div class="consulente-item-icon">🌱</div>
        <div class="consulente-item-text">
          <strong>Partner tecnologico a lungo termine</strong>
          Non un fornitore che sparisce dopo il deploy — una presenza strutturata nel tempo, che cresce insieme a Komet e presidia ogni evoluzione tecnologica della rete.
        </div>
      </div>
    </div>
  </div>

  <div class="callout callout-navy">
    <p>"Non è la soluzione più grande sul mercato — è quella costruita su misura per questa rete, da qualcuno che la conosce da vent'anni. <strong>Questo tipo di contesto non si compra su nessun listino: o ce l'hai o non ce l'hai.</strong>"</p>
  </div>
</div>

<!-- ══════════════════ 4. IL VALORE ECONOMICO ══════════════════ -->
<div class="section pb-before" style="padding-top:28px;padding-bottom:20px;">
  <h1><span class="n">4.</span>Il Valore Economico: il ROI in Numeri</h1>
  <p style="font-size:9.5pt;color:var(--text-mid);line-height:1.6;margin-bottom:0;">Calcolo conservativo su 70 agenti attivi — dati misurati in produzione sul ciclo commerciale Komet.</p>

  <div class="roi-grid">
    <div class="roi-card">
      <div class="roi-card-icon">⏱</div>
      <div class="roi-card-value">−<span>75%</span></div>
      <div class="roi-card-label">Tempo per piazzare un ordine</div>
      <div class="roi-card-desc">Da 15–20 minuti a 3–5. Il bot inserisce in Archibald in modo asincrono. Su 70 agenti × 3 ordini/giorno × 250 giorni: <strong>13.125 ore/anno recuperate</strong> solo sull'inserimento ordini.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">📄</div>
      <div class="roi-card-value">−<span>7.000 h</span></div>
      <div class="roi-card-label">Documenti e coordinamento</div>
      <div class="roi-card-desc">DDT/fatture già sincronizzati: reperibili in <strong>1–2 minuti</strong> da qualsiasi dispositivo, senza aprire l'ERP e senza chiamare Verona (70 ag × 2/gg × 250 gg × 7,5 min = <strong>4.375 ore</strong>). Chiamate a Verona per status ordini quasi eliminate (70 ag × 1,5/gg × 250 gg × 6 min = <strong>2.625 ore</strong>).</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">🛡</div>
      <div class="roi-card-value">3.500 <span style="font-size:13pt;">relazioni</span></div>
      <div class="roi-card-label">Protezione esclusività territoriale</div>
      <div class="roi-card-desc">70 agenti × ~50 clienti attivi = ~3.500 relazioni monitorate ogni giorno in automatico. La PWA notifica l'agente quando un cliente è a 4 mesi dalla soglia critica Komet. Perdere anche 1 sola esclusività territoriale può valere <strong>€20.000–50.000/anno</strong> in commissioni.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">📊</div>
      <div class="roi-card-value">−€<span>30.000</span></div>
      <div class="roi-card-label">Costo errori ERP eliminati</div>
      <div class="roi-card-desc">Inserimento manuale: tasso errore tipico 2% su codice articolo, quantità, cliente. Su 52.500 ordini/anno: ~1.050 errori evitati × €30 di gestione (correzione + comunicazione + eventuale reso) = <strong>€31.500/anno eliminati</strong>. Il bot copia l'ordine dell'agente senza margine di errore.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">📋</div>
      <div class="roi-card-value"><span>Storico</span> istantaneo</div>
      <div class="roi-card-label">Risposta immediata al cliente</div>
      <div class="roi-card-desc">Storico ordini, prezzi e DDT sempre a portata di mano. L'agente risponde sul momento a <em>"cosa avevamo preso l'ultima volta?"</em> o <em>"quanto pagavo questo articolo?"</em> — senza richiamare Verona, senza aspettare. Meno esitazioni = più fiducia = più ordini chiusi.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">💡</div>
      <div class="roi-card-value"><span style="font-size:13pt;">Preventivo</span> in visita</div>
      <div class="roi-card-label">Chiudi la vendita durante l'appuntamento</div>
      <div class="roi-card-desc">Prezzi aggiornati e sconti personalizzati visibili in tempo reale. L'agente può costruire e mostrare un preventivo reale mentre è ancora dal cliente. Chi decide sul momento compra — chi deve "risentirsi" spesso no. <em>(In roadmap prioritaria)</em></div>
    </div>
  </div>

  <div style="break-inside:avoid-page;page-break-inside:avoid;">
    <div class="roi-total">
      <div>
        <div class="roi-total-label">Stima produttività recuperata — Anno 1 (calcolo conservativo)</div>
        <div class="roi-total-sub">~20.000 ore totali × €35 costo orario medio agente · 70 agenti attivi<br>13.125 ordini + 7.000 documenti/coordinamento = 20.125 ore (calcolo per difetto)</div>
      </div>
      <div style="text-align:right;">
        <div class="roi-total-value">€700.000</div>
        <div class="roi-total-sub" style="color:rgba(255,255,255,.35);">Dal 2° anno, Formicanera costa meno dell'<strong style="color:var(--gold);">8%</strong> del valore che genera (€54k su €700k)</div>
      </div>
    </div>
    <div class="callout" style="margin-top:10px;">
      <p>A titolo di confronto: Salesforce Sales Cloud Enterprise per 70 utenti costa <strong>circa €120.000/anno</strong> (listino pubblico Q1 2026, solo licenze) — senza integrazione Archibald, nessun bot, nessuna conoscenza del settore. Formicanera dal secondo anno costa <strong>€54.000 prepagato — meno della metà</strong>, con un perimetro funzionale costruito esattamente per la rete Komet.</p>
    </div>
  </div>

</div>

<!-- ══════════════════ 4.5 FUNZIONALITÀ IN EVIDENZA ══════════════════ -->
<div class="section pb-before" style="padding-top:28px;padding-bottom:20px;">
  <h1><span class="n">4.5</span>Funzionalità in Evidenza</h1>
  <p style="font-size:9.5pt;color:var(--text-mid);line-height:1.65;margin-bottom:16px;">Tre aree di prodotto introdotte nell'ultima fase di sviluppo — particolarmente rilevanti per il ciclo commerciale Komet.</p>

  <h2>Pending Orders — Immagazzina e Invia Quando Vuoi</h2>
  <ul>
    <li>Salva ordini durante tutta la giornata senza doverli inviare subito</li>
    <li>Accumulo illimitato di ordini in stato "in attesa"</li>
    <li>Invio differito: invia tutto insieme quando e dove vuoi (es. al rientro in ufficio, in Wi-Fi, a fine giornata)</li>
    <li>Barra di avanzamento globale non bloccante: l'agente può navigare nell'app mentre il bot invia in sequenza automatica</li>
  </ul>

  <div class="callout" style="margin:12px 0 20px;">
    <p><strong>Scenario tipico:</strong> l'agente visita 8 clienti in giornata, compila ogni ordine sul momento, poi a fine giornata preme "Invia tutto" — il bot li piazza tutti su Archibald in sequenza automatica. Zero interruzioni durante le visite, zero lavoro manuale serale.</p>
  </div>

  <h2>Catalogo, Check Magazzino in Tempo Reale e Preventivi</h2>
  <ul>
    <li>Ricerca full-text sul catalogo completo Komet — risultati istantanei</li>
    <li>Disponibilità stock in tempo reale per ogni articolo (badge verde/arancio/rosso) — nessuna telefonata a Verona</li>
    <li>Prezzo cliente specifico visibile immediatamente — non il listino generico, ma il prezzo contrattualizzato</li>
    <li>Check istantaneo: disponibilità confermata in meno di 2 secondi</li>
    <li><strong>Preventivo in un tap:</strong> da qualsiasi ordine storico, genera un PDF professionale in meno di 3 secondi, condivisibile via WhatsApp, Gmail, Dropbox o link diretto</li>
    <li>Numerazione automatica, intestazione Formicanera, totali IVA inclusi — pronto da mostrare al cliente durante la visita</li>
  </ul>

  <div class="callout" style="margin:12px 0 20px;">
    <p><strong>Scenario tipico:</strong> il cliente chiede <em>"avete ancora quella fresa?"</em> — l'agente apre Formicanera, cerca l'articolo, vede stock e prezzo in 2 secondi, e genera il preventivo mentre è ancora seduto dal cliente. Chi decide sul momento acquista. Chi deve "risentirsi" spesso no.</p>
  </div>

  <h2>Integrazioni — Connesso agli Strumenti di Lavoro</h2>
  <p>Formicanera si connette nativamente agli strumenti che l'agente usa ogni giorno:</p>
  <table style="margin:10px 0 0;">
    <thead>
      <tr>
        <th style="width:20%">Integrazione</th>
        <th>Funzionalità disponibili</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>WhatsApp</strong></td>
        <td>Condivisione ordini, preventivi e documenti direttamente in chat — in un tap dalla scheda ordine</td>
      </tr>
      <tr>
        <td><strong>Gmail</strong></td>
        <td>Invio automatico preventivi e notifiche documenti ai clienti, con intestazione professionale</td>
      </tr>
      <tr>
        <td><strong>Dropbox</strong></td>
        <td>Archiviazione automatica DDT, fatture e preventivi — tutto organizzato per cliente e data</td>
      </tr>
      <tr>
        <td><strong>Google Drive</strong></td>
        <td>Sync e backup automatico di tutti i documenti commerciali su Drive aziendale</td>
      </tr>
    </tbody>
  </table>
</div>

<div style="break-before:page;page-break-before:always;height:0;overflow:hidden;"></div>
<!-- ══════════════════ 5. TERMINI + 6. TIMELINE + FOOTER ══════════════════ -->
<div style="min-height:297mm;display:flex;flex-direction:column;background:var(--bg);">
  <div style="flex:1;padding:38px 68px 30px;">

    <h1><span class="n">5.</span>Termini Contrattuali e Garanzie</h1>
    <div class="terms-list">
      <div class="term">
        <h3>Durata e rinnovo</h3>
        <p>24 mesi dalla data di go-live. Rinnovo automatico annuale. Disdetta con <strong>90 giorni</strong> di preavviso scritto.</p>
      </div>
      <div class="term">
        <h3>Pagamento e fatturazione</h3>
        <p>Setup in due tranche: 50% alla firma, 50% al go-live. Canone mensile posticipato a <strong>30 giorni</strong>. Sconto −10% su prepagato annuale anticipato.</p>
      </div>
      <div class="term">
        <h3>Proprietà intellettuale</h3>
        <p>Piattaforma di proprietà del fornitore. Komet riceve <strong>licenza d'uso</strong> esclusiva per la propria rete. I dati di Komet restano di Komet in ogni circostanza.</p>
      </div>
      <div class="term">
        <h3>Portabilità e uscita</h3>
        <p>Dati esportabili in formato standard (CSV/JSON) entro 30 giorni dalla cessazione. Nessuna retention oltre <strong>60 giorni</strong> post-contratto.</p>
      </div>
      <div class="term">
        <h3>SLA — Uptime e supporto</h3>
        <p>Uptime garantito <strong>99,5%</strong> mensile. Incidente critico: risposta entro <strong>4 ore lavorative</strong>. Assistenza standard: <strong>1 giorno lavorativo</strong>. Penale proporzionale per mancato SLA.</p>
      </div>
      <div class="term">
        <h3>GDPR e sicurezza</h3>
        <p>DPA (Art. 28 GDPR) firmato pre go-live. Hosting Germania (UE) — <strong>zero trasferimenti extra-UE</strong>. Notifica breach al Titolare entro 24 ore. Clausole Contrattuali Tipo CE.</p>
      </div>
    </div>

    <h1 style="margin-top:26px;"><span class="n">6.</span>Dalla Firma al Go-Live: 8 Settimane</h1>
    <div class="timeline">
      <div class="tl-step">
        <div class="tl-dot">1</div>
        <div class="tl-time">Sett. 1–2</div>
        <div class="tl-label">Setup & Configurazione</div>
        <div class="tl-desc">Infrastruttura dedicata, profili agenti, credenziali ERP, import anagrafica clienti.</div>
      </div>
      <div class="tl-step">
        <div class="tl-dot">2</div>
        <div class="tl-time">Sett. 3–4</div>
        <div class="tl-label">Test & Integrazione ERP</div>
        <div class="tl-desc">Validazione bot su ordini reali, verifica sync documenti, accessi e permessi su tutta la rete.</div>
      </div>
      <div class="tl-step">
        <div class="tl-dot">3</div>
        <div class="tl-time">Sett. 5–6</div>
        <div class="tl-label">Formazione + Pilota</div>
        <div class="tl-desc">Sessioni formazione team Verona e 10–15 agenti pilota. Raccolta feedback, aggiustamenti.</div>
      </div>
      <div class="tl-step">
        <div class="tl-dot">4</div>
        <div class="tl-time">Sett. 7–8</div>
        <div class="tl-label">Rollout Completo</div>
        <div class="tl-desc">Tutta la rete attiva. Supporto intensivo nella prima settimana di piena operatività.</div>
      </div>
    </div>

    <h1 style="margin-top:26px;">Prossimi Passi</h1>
    <div class="steps">
      <div class="step">
        <div class="step-num">Step 1</div>
        <div class="step-title">Accettazione proposta</div>
        <div class="step-desc">Conferma scritta entro il 30 Aprile 2026</div>
      </div>
      <div class="step">
        <div class="step-num">Step 2</div>
        <div class="step-title">Firma DPA GDPR</div>
        <div class="step-desc">Incontro con DPO / legale Komet per allineamento</div>
      </div>
      <div class="step">
        <div class="step-num">Step 3</div>
        <div class="step-title">Firma contratto</div>
        <div class="step-desc">24 mesi + prima tranche setup €15.000</div>
      </div>
      <div class="step">
        <div class="step-num">Step 4</div>
        <div class="step-title">Kick-off</div>
        <div class="step-desc">Avvio 8 settimane verso go-live completo</div>
      </div>
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
      Analisi di Mercato & Proposta Commerciale — Marzo 2026<br>
      Riservata — Per uso esclusivo di Komet Italia S.r.l.<br>
      Valida fino al 30 Aprile 2026 · Tutti i prezzi IVA esclusa
    </div>
  </div>
</div>

</body>
</html>`;

const outputPath = join(__dirname, 'formicanera-proposta-commerciale.pdf');

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
