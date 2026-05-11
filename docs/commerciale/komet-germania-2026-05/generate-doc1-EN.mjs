import puppeteer from '/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logoB64 = readFileSync('/Users/hatholdir/Downloads/Archibald/archibald-web-app/frontend/dist/formicaneralogo.png').toString('base64');
const logoSrc = `data:image/png;base64,${logoB64}`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Formicanera — Presentation for Komet Germany</title>
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
    <div class="cover-conf">CONFIDENTIAL — Gebr. Brasseler GmbH &amp; Co. KG</div>
  </div>
  <div class="cover-main">
    <div class="cover-eyebrow">
      <div class="cover-eyebrow-line"></div>
      <div class="cover-eyebrow-text">Solution Overview</div>
    </div>
    <div class="cover-title">Built from the<br><em>inside</em>.<br>Designed for those<br>who work in the field.</div>
    <div class="cover-desc">The competitive advantage for Komet agents — a tool born from direct experience, already live in production, already proven on real orders and real customers every day.</div>
    <div class="cover-scope">
      <div class="cover-scope-item">Installable PWA on any device — no app store, no configuration required</div>
      <div class="cover-scope-item">Automatic synchronisation with ERP Archibald — agents never need to open the back-office system</div>
      <div class="cover-scope-item">Live in production — not a prototype, not a demo</div>
      <div class="cover-scope-item">GDPR compliant · Germany hosting · Bank-grade encryption</div>
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-meta-grid">
      <div class="cover-meta-item"><label>Prepared by</label><span>Francesco Formicola<br>Formicanera</span></div>
      <div class="cover-meta-item"><label>Addressed to</label><span>Philipp Rovina<br>Gebr. Brasseler GmbH &amp; Co. KG</span></div>
      <div class="cover-meta-item"><label>Date</label><span>May 2026</span></div>
      <div class="cover-meta-item"><label>Status</label><span>Live in production</span></div>
    </div>
  </div>
</div>

<!-- ══════════════════ SEC 1 — THE GAP ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">1.</span>The Gap: The ERP in 2026 Was Not Built for Field Work</h1>
  <p class="lead">The Archibald ERP is a functional tool — but it was designed to be used from a desk, with a fixed PC and a stable connection. The world of commercial agents does not work that way.</p>

  <p>A Komet agent works in the field. They walk into a dental practice, a dental laboratory, a clinic. They need to answer questions in real time: <em>"When will my order arrive? Do you still carry that bur? Can I get the March invoice?"</em></p>

  <div class="callout callout-navy">
    <p>Every operation that should take <strong>thirty seconds</strong> takes <strong>ten minutes</strong>. Every piece of information that should be immediate requires a process. The time lost is not measured only in minutes — it is measured in waiting customers, missed opportunities, and professionalism that cannot be demonstrated.</p>
  </div>

  <h2>The 8 structural pain points of the current ERP</h2>
  <div class="security-grid">
    <div class="security-item">
      <div class="security-item-icon">📵</div>
      <div class="security-item-title">Not accessible from mobile</div>
      <div class="security-item-desc">No app, no responsive version. The agent must return to the office or open a laptop to access any information.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🔕</div>
      <div class="security-item-title">No proactive notifications</div>
      <div class="security-item-desc">The agent must actively search for every piece of information. No alerts for confirmed orders, available documents, or updated shipment status.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🔁</div>
      <div class="security-item-title">Manual, repetitive operations</div>
      <div class="security-item-desc">Every order requires identical click sequences in the ERP. No automation. Frequent human errors with measurable handling costs.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🧩</div>
      <div class="security-item-title">No aggregated view</div>
      <div class="security-item-desc">Data is scattered across different screens. No single dashboard exists. Reviewing a customer's revenue requires manual navigation across multiple sections.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">📎</div>
      <div class="security-item-title">Documents not integrated</div>
      <div class="security-item-desc">Delivery notes and invoices require separate operations to retrieve. The agent cannot share a document from the field in under 10 minutes.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">📦</div>
      <div class="security-item-title">No shipment tracking</div>
      <div class="security-item-desc">The agent has no visibility of where a delivery physically is. They must call the warehouse or access the carrier portal separately.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">📴</div>
      <div class="security-item-title">No offline support</div>
      <div class="security-item-desc">Without a connection, the agent is completely blind. In areas with weak signal — hospitals, basements, rural areas — the system becomes unusable.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🖥</div>
      <div class="security-item-title">UI designed only for desktop</div>
      <div class="security-item-desc">Interface built for mouse and keyboard. On a tablet or smartphone the experience is unusable. Field work demands a touch-first interface.</div>
    </div>
  </div>
</div>

<!-- ══════════════════ SEC 2 — WHAT IS FORMICANERA ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">2.</span>What Is Formicanera (in 90 Seconds)</h1>
  <p class="lead">Formicanera is a Progressive Web App (PWA) — a web application installable on any device that behaves like a native app but updates automatically, without going through any app store.</p>

  <div class="stat-hero">
    <div class="stat-box">
      <div class="stat-value">3 sec</div>
      <div class="stat-label">Installation time on any device — iPhone, iPad, Android, laptop, desktop</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">0</div>
      <div class="stat-label">Steps required on the App Store or Google Play — automatic, transparent updates</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">100%</div>
      <div class="stat-label">Automatic synchronisation with ERP Archibald — agents always see up-to-date data</div>
    </div>
  </div>

  <div class="callout callout-navy">
    <p style="font-size:12pt;font-weight:300;line-height:1.65;"><strong>The core principle of Formicanera:</strong><br>"The agent should never need to open the ERP to do their job."</p>
  </div>

  <h2>How it works</h2>
  <p>Formicanera synchronises with Archibald automatically and transparently. A dedicated bot — linked to each agent's personal credentials — connects to the ERP, retrieves updated data, and makes it available in the PWA. The agent sees orders, customers, documents, and shipments without ever opening the back-office system.</p>
  <p>When an agent creates a new order in Formicanera, the bot places it on Archibald asynchronously — the agent can continue working while the bot operates in the background. Progress is visible in real time. Confirmation arrives as a push notification.</p>

  <div class="callout">
    <p><strong>Already live in production.</strong> Formicanera is not a prototype and is not a demo. It is a system operating every day on real orders with real customers. Every feature has been designed, tested, and validated in the daily commercial cycle before being released.</p>
  </div>
</div>

<!-- ══════════════════ SEC 3 — BEFORE/AFTER ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">3.</span>What Changes in Practice</h1>
  <p class="lead">An operation-by-operation comparison between the current ERP workflow and the new Formicanera workflow.</p>

  <table class="before-after">
    <thead>
      <tr>
        <th style="width:22%">Operation</th>
        <th style="width:37%">With ERP Archibald</th>
        <th style="width:41%">With Formicanera</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Look up an order</td>
        <td class="erp-col">Log in to the PC, open the ERP, navigate through screens, search for the customer, filter by date</td>
        <td class="pwa-col">Open the app, search for the customer — results in 5 seconds from any device</td>
      </tr>
      <tr>
        <td>Place a new order</td>
        <td class="erp-col">15–20 minutes of manual data entry in the ERP form, risk of errors on item codes and customer details</td>
        <td class="pwa-col">3–5 minutes: fill in the mobile form with autocomplete, the bot submits to Archibald asynchronously</td>
      </tr>
      <tr>
        <td>Download a delivery note or invoice</td>
        <td class="erp-col">5–10 minutes: log in to ERP, navigate to the documents section, search and download the PDF, send by email</td>
        <td class="pwa-col">1 tap on the order card — immediate download, shareable via WhatsApp or Gmail on the spot</td>
      </tr>
      <tr>
        <td>Track a shipment</td>
        <td class="erp-col">Call the warehouse in Verona or log in separately to the FedEx portal with the tracking number</td>
        <td class="pwa-col">FedEx tracking integrated in the order card — updated in real time, events with time and city</td>
      </tr>
      <tr>
        <td>Check customer status</td>
        <td class="erp-col">Navigate across multiple ERP screens to find order history, addresses, notes — impossible on mobile</td>
        <td class="pwa-col">Full customer profile in one tap: order history, documents, alternative addresses, VAT number, notes</td>
      </tr>
      <tr>
        <td>Generate a quote</td>
        <td class="erp-col">10–15 minutes of manual entry, formatting, saving, and sending by email</td>
        <td class="pwa-col">Under 3 seconds — one tap from order history, professional PDF ready to show the customer</td>
      </tr>
      <tr>
        <td>Check item stock</td>
        <td class="erp-col">5–10 minutes between the ERP and calls to the warehouse, answer often inconclusive</td>
        <td class="pwa-col">Under 2 seconds — real-time availability badge with customer-specific pricing visible</td>
      </tr>
      <tr>
        <td>Send multiple orders in batch</td>
        <td class="erp-col">Not possible: every order requires a separate manual session in the ERP</td>
        <td class="pwa-col">Accumulate all orders throughout the day, then submit everything with 1 tap — the bot executes them in automatic sequence</td>
      </tr>
    </tbody>
  </table>

  <div class="callout">
    <p><strong>Real-world scenario:</strong> the agent visits 8 customers in a day. They fill in each order on the spot in Formicanera. At the end of the day they press "Submit all" — the bot places all orders on Archibald in sequence. Zero interruptions during visits. Zero manual work in the evening.</p>
  </div>
</div>

<!-- ══════════════════ SEC 4 — KEY FEATURES ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">4.</span>Key Features</h1>
  <p class="lead">Six operational areas covering the agent's entire field workflow — from customer visit to order close, from invoice to tracking.</p>

  <div class="feature-grid">
    <div class="feature-card">
      <div class="feature-card-icon">📋</div>
      <div class="feature-card-title">Intelligent orders</div>
      <ul class="feature-card-list">
        <li>Fast order creation with item and customer autocomplete</li>
        <li>Asynchronous submission via bot — the agent never touches the ERP</li>
        <li>Pending orders: accumulate throughout the day, submit in batch with 1 tap</li>
        <li>Edit pending orders — full functional parity with order creation</li>
        <li>Instant search and copy from order history — zero re-entry</li>
        <li>Voice commands for item search</li>
        <li>Credit note management with automatic visual stacking</li>
      </ul>
    </div>
    <div class="feature-card">
      <div class="feature-card-icon">👥</div>
      <div class="feature-card-title">Customers and documents</div>
      <ul class="feature-card-list">
        <li>Complete, interactive customer profiles with inline order history</li>
        <li>Delivery notes, invoices, and credit notes downloadable with one tap</li>
        <li>PDF quotes in 3 seconds — shareable via WhatsApp</li>
        <li>Real-time FedEx shipment tracking within the order card</li>
        <li>New customer creation with automatic VAT validation and auto-fill</li>
        <li>Alternative delivery addresses manageable directly</li>
      </ul>
    </div>
    <div class="feature-card">
      <div class="feature-card-icon">🔍</div>
      <div class="feature-card-title">Catalogue and pricing</div>
      <ul class="feature-card-list">
        <li>Full-text search across the complete Komet catalogue — instant results</li>
        <li>Real-time stock: green/amber/red badge for every item</li>
        <li>Customer-specific prices — not the generic price list</li>
        <li>Automatic alerts on new items, price changes, and catalogue updates</li>
        <li>Discount guardrails — protection against out-of-range discount errors</li>
        <li>Top-selling item suggestions for that specific customer</li>
      </ul>
    </div>
    <div class="feature-card">
      <div class="feature-card-icon">📊</div>
      <div class="feature-card-title">Dashboard and intelligence</div>
      <ul class="feature-card-list">
        <li>Real-time revenue, commission, bonus, and forecast widgets</li>
        <li>Commission wizard with goals, thresholds, and bonus targets visualised</li>
        <li>Dormant customer monitoring with proactive 4-month alert</li>
        <li>Revenue report with year-on-year comparison</li>
        <li>Revenue breakdown by customer and by period</li>
        <li>Price and product changes monitored automatically</li>
      </ul>
    </div>
    <div class="feature-card">
      <div class="feature-card-icon">🔔</div>
      <div class="feature-card-title">Notification system</div>
      <ul class="feature-card-list">
        <li>11 types of proactive notification — orders, documents, shipments</li>
        <li>Inactive customers: alert when a customer approaches the critical threshold</li>
        <li>Catalogue changes: new items and price updates delivered instantly</li>
        <li>Order confirmed / placement error with full operational detail</li>
        <li>Document available: delivery notes and invoices notified as soon as issued</li>
        <li>Calendar with integrated appointments and reminders</li>
      </ul>
    </div>
    <div class="feature-card">
      <div class="feature-card-icon">🏢</div>
      <div class="feature-card-title">Enterprise platform</div>
      <ul class="feature-card-list">
        <li>Universal cross-device: iPhone, iPad, Android, laptop, desktop</li>
        <li>Offline mode — the app remains navigable without a connection</li>
        <li>Biometric authentication: Face ID and fingerprint</li>
        <li>MFA and JWT sessions with automatic expiry and refresh</li>
        <li>Privacy mode: on-screen masking of sensitive data</li>
        <li>GDPR compliant · Germany EU hosting · AES-256-GCM encryption</li>
      </ul>
    </div>
  </div>
</div>

<!-- ══════════════════ SEC 5 — MODULAR ARCHITECTURE ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">5.</span>Modular Architecture</h1>
  <p class="lead">Every sales network has different needs. Formicanera is built with a modular architecture: a shared operational core for everyone, with optional modules that can be activated on demand for networks with specific requirements.</p>

  <div class="callout callout-navy">
    <p>"Each dealer activates only the modules they need. The platform adapts to the network — not the other way around."</p>
  </div>

  <div class="module-row">
    <div class="module-base">
      <div class="module-base-title">Operational core — included for all</div>
      <ul class="module-base-list">
        <li>Full order management (creation, editing, submission, history)</li>
        <li>Pending orders with asynchronous batch submission</li>
        <li>Complete, interactive customer profiles</li>
        <li>Delivery notes, invoices, and documents downloadable in one tap</li>
        <li>Product catalogue with real-time stock</li>
        <li>Customer-specific prices updated automatically</li>
        <li>Integrated FedEx shipment tracking</li>
        <li>PDF quotes in 3 seconds with WhatsApp/Gmail sharing</li>
        <li>Proactive notification system — 11 event types</li>
        <li>Revenue, commission, and budget dashboard</li>
        <li>Automatic synchronisation with ERP Archibald</li>
      </ul>
    </div>
    <div class="module-opt">
      <div class="module-opt-title">Optional activatable modules</div>
      <ul class="module-opt-list">
        <li>Advanced commission wizard with goals and bonus thresholds</li>
        <li>Dormant customer monitoring with configurable thresholds</li>
        <li>Custom workflow management for networks with bespoke processes</li>
        <li>Advanced admin panel for regional management</li>
        <li>Aggregated multi-agent reports for area managers</li>
        <li>Integration with alternative ERP systems (Dynamics, SAP)</li>
        <li>Automatic export to Google Drive and Dropbox</li>
        <li>Visit schedule with route optimisation</li>
        <li>Custom product kits with configurator</li>
        <li>AI-oriented CRM access (2026 Q3 roadmap)</li>
      </ul>
    </div>
  </div>

  <p style="font-size:8.5pt;color:var(--text-light);margin-top:10px;">The choice of modules is defined during onboarding with the network's commercial manager. New modules can be activated at any time with no impact on the existing platform.</p>
</div>

<!-- ══════════════════ SEC 6 — FIELD VALIDATION ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">6.</span>Field Validation</h1>
  <p class="lead">This is not a sales pitch. It is a fully working product, built from inside the industry, tested every day on real orders with real customers.</p>

  <div class="callout callout-navy">
    <p style="font-size:11.5pt;font-weight:300;line-height:1.7;">"An agent using Formicanera does not compete with an agent using the ERP. It is like comparing a smartphone with a fax machine."</p>
  </div>

  <h2>The story in three steps</h2>

  <div class="security-grid">
    <div class="security-item">
      <div class="security-item-icon">🌱</div>
      <div class="security-item-title">Step 1 — A real need</div>
      <div class="security-item-desc">Formicanera was born from the genuine need of a Komet agent with forty years of experience in the dental sector. Not from a software house that studied the industry from a brief — but from someone who actually does the job, every day, in the field.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">⚙️</div>
      <div class="security-item-title">Step 2 — Development and go-live</div>
      <div class="security-item-desc">The platform is developed, tested, and put into production on real orders with real customers. Every feature is designed, discussed, and validated by people who know the Komet commercial cycle from the inside. No feature is released without operational validation.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">📣</div>
      <div class="security-item-title">Step 3 — Organic interest from the network</div>
      <div class="security-item-desc">Fellow agents see the tool in use and are impressed. Interest spreads organically through the network. Komet Italy management is brought in and shows concrete interest in broader adoption.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🌍</div>
      <div class="security-item-title">Today — Proposal to the European network</div>
      <div class="security-item-desc">The platform is designed for multi-tenant and multi-language operation. The architecture allows extension to European-scale sales networks without redesign. Komet Germany is the natural next step.</div>
    </div>
  </div>

  <div class="callout" style="margin-top:16px;">
    <p><strong>The advantage that cannot be bought elsewhere:</strong> no solution on the market has been designed to interface with the Archibald ERP. Building this integration requires any software house to perform a deep reverse engineering of the back-office system, with a minimum lead time of 12–18 months and no guarantee of stability. Formicanera has already solved this problem — in production, proven over time.</p>
  </div>
</div>

<!-- ══════════════════ SEC 7 — SECURITY AND COMPLIANCE ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">7.</span>Security and Compliance</h1>
  <p class="lead">An executive summary for the board. The full technical detail is available in the separate "Security &amp; Compliance Whitepaper" document for Komet's IT manager and DPO.</p>

  <div class="security-grid">
    <div class="security-item">
      <div class="security-item-icon">🔐</div>
      <div class="security-item-title">Does not interfere with the ERP</div>
      <div class="security-item-desc">Formicanera uses exclusively the credentials already assigned to each agent. It sees only what the agent normally sees. No privileged access, no changes to ERP configurations, no additional entry points to the system.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🇩🇪</div>
      <div class="security-item-title">Germany hosting — Data within the EU</div>
      <div class="security-item-desc">Dedicated Hetzner server, Falkenstein data centre (Germany). No data leaves the European Union. No extra-EU transfer under Art. 44 GDPR. Complete isolation: dedicated virtual machine, not shared with other customers.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🔒</div>
      <div class="security-item-title">Bank-grade encryption</div>
      <div class="security-item-desc">AES-256-GCM for all stored credentials — the same standard used in banking. HTTPS/TLS 1.2+ communications on all endpoints. No credentials ever stored or logged in plain text.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">⚖️</div>
      <div class="security-item-title">GDPR model — Standard Processor</div>
      <div class="security-item-desc">Formicanera acts as Data Processor on behalf of Komet (Controller) — the same model used by Salesforce, HubSpot, and Microsoft 365. The relationship is formalised via a DPA (Art. 28 GDPR), signed before go-live.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">📝</div>
      <div class="security-item-title">Immutable audit log</div>
      <div class="security-item-desc">Every operation performed on the platform is traced in an immutable log. Logs retained for 90 days with automatic rotation. Documented procedures for data breaches: notification to the Controller within 24 hours.</div>
    </div>
    <div class="security-item">
      <div class="security-item-icon">🛡</div>
      <div class="security-item-title">Biometric access and MFA</div>
      <div class="security-item-desc">Biometric authentication (Face ID, fingerprint) processed locally on the device — no biometric data transmitted to the server. Multi-factor authentication available. Rate limiting on all endpoints against brute-force attacks.</div>
    </div>
  </div>

  <div class="callout" style="margin-top:4px;">
    <p><strong>For the full technical detail</strong> — architecture, penetration tests, data retention policies, sub-processors, DPA clauses — please refer to the separate <em>"Security &amp; Compliance Whitepaper"</em> document, available for Alexander Lange and the Komet legal/IT team.</p>
  </div>
</div>

<!-- ══════════════════ SEC 8 — ROI ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">8.</span>ROI: The Numbers</h1>
  <p style="font-size:9.5pt;color:var(--text-mid);line-height:1.6;margin-bottom:0;">Conservative estimate based on 70 active agents — derived from data measured in production within the Komet commercial cycle.</p>

  <div class="roi-grid">
    <div class="roi-card">
      <div class="roi-card-icon">⏱</div>
      <div class="roi-card-value">−<span>75%</span></div>
      <div class="roi-card-label">Time to place an order</div>
      <div class="roi-card-desc">From 15–20 minutes to 3–5. The bot submits to Archibald asynchronously. Across 70 agents × 3 orders/day × 250 days: <strong>13,125 hours/year recovered</strong> on order entry alone.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">📄</div>
      <div class="roi-card-value">−<span>7,000 h</span></div>
      <div class="roi-card-label">Documents and coordination</div>
      <div class="roi-card-desc">Delivery notes and invoices retrievable in 1–2 minutes from any device. Calls to Verona for order status virtually eliminated. 70 ag × 2 docs/day × 250 days × 7.5 min + 70 ag × 1.5 calls/day × 250 days × 6 min = <strong>7,000 hours/year</strong>.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">🛡</div>
      <div class="roi-card-value">3,500 <span style="font-size:13pt;">rel.</span></div>
      <div class="roi-card-label">Exclusive territory protection</div>
      <div class="roi-card-desc">70 agents × ~50 active customers = ~3,500 relationships monitored every day automatically. Proactive alert at 4 months from the critical threshold. Losing even 1 exclusive territory can be worth <strong>€20,000–50,000/year</strong> in commissions.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">📊</div>
      <div class="roi-card-value">−€<span>30,000</span></div>
      <div class="roi-card-label">ERP error costs eliminated</div>
      <div class="roi-card-desc">Manual entry error rate: 2% on item codes, quantities, and customer data. Across 52,500 orders/year: ~1,050 errors avoided × €30 handling cost = <strong>€31,500/year</strong>. The bot copies the order with zero human error margin.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">📋</div>
      <div class="roi-card-value"><span>Instant</span> history</div>
      <div class="roi-card-label">More orders closed on the spot</div>
      <div class="roi-card-desc">Order history, pricing, and delivery notes always at hand. The agent answers "what did we order last time?" on the spot without calling Verona. Less hesitation, more confidence, more orders closed during the visit.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">💡</div>
      <div class="roi-card-value"><span style="font-size:13pt;">Quote</span> on the visit</div>
      <div class="roi-card-label">Fewer "we'll be in touch"</div>
      <div class="roi-card-desc">Professional PDF quote generated in 3 seconds during the appointment. Updated prices and personalised discounts visible in real time. Those who decide on the spot buy — those who need to "be in touch" often don't.</div>
    </div>
  </div>

  <div style="break-inside:avoid-page;page-break-inside:avoid;">
    <div class="roi-total">
      <div>
        <div class="roi-total-label">Estimated productivity recovered — per year (conservative estimate)</div>
        <div class="roi-total-sub">~20,000 total hours × €35 average agent hourly cost · 70 active agents<br>13,125 orders + 7,000 documents/coordination = 20,125 hours (conservative)</div>
      </div>
      <div style="text-align:right;">
        <div class="roi-total-value">€700,000/year</div>
        <div class="roi-total-sub" style="color:rgba(255,255,255,.35);">From year 2, Formicanera costs less than <strong style="color:var(--gold);">8%</strong> of the value it generates</div>
      </div>
    </div>
  </div>
</div>

<!-- ══════════════════ SEC 9 — ROADMAP 2026 ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">9.</span>Roadmap 2026</h1>
  <p class="lead">The six most impactful features on the way — designed to transform Formicanera from an operational tool into a commercial intelligence platform.</p>

  <div class="roadmap-grid">
    <div class="roadmap-card">
      <div class="roadmap-card-icon">🤖</div>
      <div class="roadmap-card-title">AI-oriented CRM</div>
      <div class="roadmap-card-desc">An intelligent assistant that suggests contact priorities, identifies upsell opportunities, and manages the visit schedule automatically based on purchase history and customer behaviour. The agent always knows who to contact and why.</div>
    </div>
    <div class="roadmap-card">
      <div class="roadmap-card-icon">🎙</div>
      <div class="roadmap-card-title">Virtual AI assistant</div>
      <div class="roadmap-card-desc">Answers clinical questions in real time during visits. Handles operations by voice: "Add 5 units of item X to the order", "Show me this customer's last order". Hands completely free during the visit.</div>
    </div>
    <div class="roadmap-card">
      <div class="roadmap-card-icon">📷</div>
      <div class="roadmap-card-title">Camera instrument recognition</div>
      <div class="roadmap-card-desc">The agent points the camera at a competitor's instrument. The PWA identifies the equivalent Komet product with updated price, stock availability, and product sheet. The response to competition becomes instant.</div>
    </div>
    <div class="roadmap-card">
      <div class="roadmap-card-icon">💰</div>
      <div class="roadmap-card-title">Automated overdue management</div>
      <div class="roadmap-card-desc">Automatic monitoring of unpaid invoices. Automated graded reminders — first reminder, second reminder, escalation — with a complete log of communications sent for each customer.</div>
    </div>
    <div class="roadmap-card">
      <div class="roadmap-card-icon">🌐</div>
      <div class="roadmap-card-title">Mighty + Academy integration</div>
      <div class="roadmap-card-desc">Komet community data (Mighty) and training content (Komet Academy) accessible directly from the PWA. A single point of access to the entire Komet ecosystem — products, training, community — without separate apps.</div>
    </div>
    <div class="roadmap-card">
      <div class="roadmap-card-icon">🎨</div>
      <div class="roadmap-card-title">Custom kits</div>
      <div class="roadmap-card-desc">Creation of bespoke product kits for the customer with graphic customisations and engravings. The agent configures the kit directly during the visit, with a visual preview and immediate order confirmation.</div>
    </div>
  </div>

  <div class="callout" style="margin-top:8px;">
    <p><strong>Roadmap principle:</strong> every feature is developed with direct validation from the agents who use it every day. No feature is released without having demonstrated a measurable impact on the real commercial cycle.</p>
  </div>
</div>

<!-- ══════════════════ SEC 10 — NEXT STEPS ══════════════════ -->
<div style="min-height:297mm;display:flex;flex-direction:column;background:var(--bg);">
  <div style="flex:1;padding:38px 68px 30px;">

    <h1><span class="n">10.</span>Next Steps</h1>
    <p class="lead">Formicanera is ready today. It is not a project to be built — it is a system in production, on real data, with real users, every day. The path to go-live for the Komet network is defined in 4 steps.</p>

    <div class="steps">
      <div class="step">
        <div class="step-num">Step 1</div>
        <div class="step-title">Proposal acceptance</div>
        <div class="step-desc">Written confirmation from Gebr. Brasseler GmbH &amp; Co. KG — formal start of the adoption process.</div>
      </div>
      <div class="step">
        <div class="step-num">Step 2</div>
        <div class="step-title">GDPR DPA signing</div>
        <div class="step-desc">Meeting with the DPO and Komet legal team for alignment and signature of the Data Processing Agreement (Art. 28 GDPR).</div>
      </div>
      <div class="step">
        <div class="step-num">Step 3</div>
        <div class="step-title">24-month contract signing</div>
        <div class="step-desc">Definition of scope, number of users, SLA, and support terms. 24-month contract with automatic annual renewal.</div>
      </div>
      <div class="step">
        <div class="step-num">Step 4</div>
        <div class="step-title">Kick-off → go-live</div>
        <div class="step-desc">Infrastructure setup, profile configuration, data import, ERP integration testing, pilot agent training. Full go-live in 8 weeks.</div>
      </div>
    </div>

    <div class="callout callout-navy" style="margin-top:24px;">
      <p style="font-size:10.5pt;line-height:1.75;font-weight:300;">"The Komet sales network deserves a tool built for the way it actually works — not an ERP opened on a smartphone. <strong>Formicanera already exists. It already works. The next step is bringing it to the entire network.</strong>"</p>
    </div>

    <div style="margin-top:24px;padding:18px 22px;background:#fff;border:1px solid var(--border);border-radius:10px;">
      <p style="font-size:8.5pt;color:var(--text-mid);margin:0;line-height:1.7;"><strong style="color:var(--navy);display:block;margin-bottom:6px;">Contact</strong>
      Francesco Formicola — Formicanera<br>
      Prepared for Philipp Rovina, Head Global Commercial Regions EMEA-LATAMAPAC<br>
      Gebr. Brasseler GmbH &amp; Co. KG · May 2026<br>
      <span style="color:var(--text-light);font-size:7.5pt;">Confidential document — For the exclusive use of Gebr. Brasseler GmbH &amp; Co. KG. Any unauthorised reproduction or distribution is prohibited.</span></p>
    </div>
  </div>

  <div class="doc-footer" style="margin-top:auto;">
    <div class="footer-left">
      <img src="${logoSrc}" class="footer-logo" alt="Formicanera">
      <div>
        <div class="footer-brand">Formicanera</div>
        <div class="footer-sub">The competitive advantage for Komet agents</div>
      </div>
    </div>
    <div class="footer-meta">
      Solution Overview — May 2026<br>
      CONFIDENTIAL — For the exclusive use of Gebr. Brasseler GmbH &amp; Co. KG<br>
      Prepared by Francesco Formicola · Formicanera
    </div>
  </div>
</div>

</body>
</html>`;

async function generatePDF() {
  console.log('Launching Puppeteer...');
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
  console.log('Generating PDF...');
  await page.pdf({
    path: join(__dirname, 'doc1-presentation-EN.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  await browser.close();
  console.log('PDF generated: doc1-presentation-EN.pdf');
}

generatePDF().catch(err => { console.error('Error:', err); process.exit(1); });
