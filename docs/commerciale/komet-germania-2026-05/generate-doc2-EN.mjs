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
<title>Formicanera — Security &amp; Compliance Whitepaper</title>
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
    <div class="cover-conf">CONFIDENTIAL — Gebr. Brasseler GmbH &amp; Co. KG</div>
  </div>
  <div class="cover-main">
    <div class="cover-eyebrow">
      <div class="cover-eyebrow-line"></div>
      <div class="cover-eyebrow-text">Technical Documentation</div>
    </div>
    <div class="cover-title">Security &amp;<br><em>Compliance</em><br>Whitepaper</div>
    <div class="cover-desc">Formicanera Agent Management System — Architecture, data protection measures, GDPR and NIS2 compliance documentation addressed to the IT and Legal/Compliance teams of Gebr. Brasseler GmbH &amp; Co. KG.</div>
    <div class="cover-scope">
      <div class="cover-scope-item">Non-Interference Principle with the Komet ERP — RPA methodology explained</div>
      <div class="cover-scope-item">Technical security measures: MFA, AES-256-GCM, immutable audit trail, RBAC</div>
      <div class="cover-scope-item">GDPR compliance: roles, legal basis, data subjects' rights implementation</div>
      <div class="cover-scope-item">NIS2 (Directive 2022/2555) control mapping — Article 21 compliance</div>
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-meta-grid">
      <div class="cover-meta-item"><label>Document Date</label><span>May 2026</span></div>
      <div class="cover-meta-item"><label>Version</label><span>2.0 — Final</span></div>
      <div class="cover-meta-item"><label>Addressed to</label><span>Alexander Lange, IT<br>Gebr. Brasseler GmbH &amp; Co. KG</span></div>
      <div class="cover-meta-item"><label>Prepared by</label><span>Francesco Formicola<br>Developer — Formicanera</span></div>
    </div>
  </div>
</div>

<!-- ══════════════════ SECTION 1 — CONTRACTUAL CONTEXT ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">1.</span>Contractual Context and GDPR Roles</h1>
  <p class="lead">Before addressing technical measures, it is important to establish the legal framework that governs all data processing performed by Formicanera — and the precise roles of each party under GDPR.</p>

  <div class="security-grid">
    <div class="security-item">
      <h3>Gebr. Brasseler GmbH &amp; Co. KG / Komet Italia S.r.l. — Data Controller</h3>
      <p>As defined under <strong>Art. 4(7) GDPR</strong>, Komet Italia S.r.l. determines the purposes and means of processing personal data of agents and customers within the Komet commercial network. Gebr. Brasseler, as parent company, exercises oversight over compliance practices of entities within the Komet group.</p>
    </div>
    <div class="security-item">
      <h3>Formicanera — Data Processor</h3>
      <p>As defined under <strong>Art. 28 GDPR</strong>, Formicanera processes personal data exclusively on behalf of, and under documented instructions from, Komet Italia S.r.l. This is the same standard model used by Salesforce, Microsoft 365, Google Workspace, and every major enterprise SaaS provider operating in Europe.</p>
    </div>
  </div>

  <h2>Key Structural Points</h2>
  <ul class="check-list">
    <li>A <strong>Data Processing Agreement (DPA)</strong> compliant with Art. 28 GDPR will be formally signed before the system goes live — exactly as required by the Regulation and as standard practice across the SaaS industry.</li>
    <li>The commercial agent's ERP credentials are <strong>assigned by Komet Italia S.r.l.</strong> — all automated operations performed by Formicanera remain strictly within the agent's authorized scope as defined by Komet Italia.</li>
    <li>Formicanera processes <strong>no data outside the scope of the agency relationship</strong>. Customer data, order history, and financial documents are processed solely to fulfil the agent's contractual commercial activities.</li>
    <li>All data remains within the <strong>European Union</strong> at all times. No international transfers take place outside the framework of EU Standard Contractual Clauses.</li>
    <li>The <strong>Komet ERP remains the authoritative record</strong> of all transactions. Formicanera does not create a parallel data authority — it synchronizes a read-optimized view for field use.</li>
  </ul>

  <div class="callout">
    <p><strong>Industry context:</strong> The Controller/Processor model is not a legal construct unique to Formicanera — it is the standard architecture underlying every B2B SaaS deployment in Europe. Salesforce, SAP, and Microsoft operate under identical GDPR frameworks when processing data on behalf of their enterprise customers. What distinguishes Formicanera is the narrow, well-defined scope of processing: a single agent's commercial data, never aggregated across agents, never shared with third parties outside the documented sub-processor list.</p>
  </div>
</div>

<!-- ══════════════════ SECTION 2 — NON-INTERFERENCE ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">2.</span>The Non-Interference Principle with the Komet ERP</h1>
  <p class="lead">This is the most operationally significant section of this document. The question of ERP integrity is at the core of any responsible IT review, and it deserves a precise, verifiable answer.</p>

  <h2>What Formicanera Actually Does</h2>
  <p><strong>Formicanera does not bypass the ERP. It automates exactly what the agent already does manually.</strong></p>
  <p>Concretely: a standard Chromium browser authenticates into the Komet ERP Archibald using <strong>Mr. Formicola's personal agent credentials</strong> — the same credentials Komet Italia assigned to him for his commercial work. The system then navigates the same interface screens the agent would navigate manually, reading order data, customer records, and official documents such as invoices and delivery notes. When the agent submits an order through the Formicanera PWA, the browser fills in the ERP order form using those same credentials and submits it through the standard ERP interface.</p>

  <div class="security-grid">
    <div class="security-item">
      <h3>No elevated permissions</h3>
      <p>The system uses only the standard agent role within the ERP. It has no administrative access, no access to configuration screens, and no ability to modify ERP settings or access other agents' data.</p>
    </div>
    <div class="security-item">
      <h3>No shared credentials</h3>
      <p>Each agent's ERP credentials are used exclusively by that agent's automated session. There is no pooled or shared credential set. Cross-agent access is architecturally impossible.</p>
    </div>
    <div class="security-item">
      <h3>No data outside authorized scope</h3>
      <p>The system sees exactly what the agent sees — not a byte more. It cannot access territories, customers, or documents that the agent cannot access manually through the standard ERP interface.</p>
    </div>
    <div class="security-item">
      <h3>ERP as the record of truth</h3>
      <p>All order submissions flow into the Komet ERP as the authoritative system. Formicanera does not create a parallel transaction record — it provides a read-optimized mobile interface over the ERP's own data.</p>
    </div>
  </div>

  <h2>What This Technique Is — and What It Is Not</h2>
  <p>This is <strong>RPA — Robotic Process Automation</strong>: an industry-standard technique used by enterprises worldwide, equivalent in nature to a user operating software via keyboard shortcuts, scripting, or an accessibility tool. RPA is explicitly recognized by leading industry frameworks (ISO/IEC, ENISA) as a legitimate automation technique that operates entirely within the bounds of existing user authorization.</p>
  <p><strong>This does not constitute unauthorized computer access</strong> under Directive 2013/40/EU on attacks against information systems, nor under §202a StGB (German Criminal Code on unauthorized data access). The underlying access authorization — Mr. Formicola's agent credentials and his contractual right to use the Komet ERP, as granted by Komet Italia S.r.l. — is valid, current, and formally documented in the agency agreement dated January 1, 2026.</p>

  <div class="callout callout-navy">
    <p>"Think of Formicanera as an experienced, disciplined version of the agent himself — one that accesses the ERP at predictable intervals, never forgets to log out, and generates <strong>no more load than a human working at their desk</strong>. It does not introduce new access; it makes existing, authorized access more consistent and reliable."</p>
  </div>

  <h2>ERP Load and Performance Protection</h2>
  <ul class="check-list">
    <li><strong>Less erratic than a human user:</strong> automated interactions are spaced with mandatory intervals, preventing any burst of requests that a busy human agent might inadvertently generate.</li>
    <li><strong>Automatic suspension on ERP unavailability:</strong> if the ERP is unresponsive, under maintenance, or experiencing issues, the system detects this immediately and suspends all interaction without aggressive retry loops.</li>
    <li><strong>Activity-aware synchronization:</strong> when the agent is inactive (evenings, weekends), synchronization frequency automatically decreases, further reducing ERP interaction during off-hours.</li>
    <li><strong>No ERP performance degradation observed:</strong> during the entire operational period, no performance impact attributable to the Formicanera system has been recorded on the Komet ERP.</li>
    <li><strong>Data integrity protection:</strong> if an ERP query returns no results for any reason (including transient network conditions), existing local data is preserved — the system never overwrites valid records with empty responses.</li>
  </ul>
</div>

<!-- ══════════════════ SECTION 3 — DATA FLOW ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">3.</span>Data Flow Architecture</h1>
  <p class="lead">The following describes the complete end-to-end data flow, from the agent's mobile device to the Komet ERP and back, with all security controls at each boundary.</p>

  <h2>Step-by-Step Data Flow</h2>
  <div class="data-flow">
    <div class="data-flow-row">
      <div class="df-node">1. Agent Mobile Device</div>
      <div class="df-arrow">→</div>
      <div class="df-node">Formicanera PWA</div>
      <div class="df-label">&nbsp;· Biometric authentication (Face ID / Touch ID) + JWT + optional TOTP MFA</div>
    </div>
    <div class="data-flow-row">
      <div class="df-node">2. PWA</div>
      <div class="df-arrow">→</div>
      <div class="df-node">Backend API (HTTPS / TLS 1.2+)</div>
      <div class="df-label">&nbsp;· All traffic encrypted, HSTS enforced, CORS whitelist-based</div>
    </div>
    <div class="data-flow-row">
      <div class="df-node">3. Backend</div>
      <div class="df-arrow">→</div>
      <div class="df-node">BullMQ Job Queue (Redis)</div>
      <div class="df-label">&nbsp;· Operations queued with rate control, no direct synchronous ERP calls from mobile</div>
    </div>
    <div class="data-flow-row">
      <div class="df-node">4. Job Queue</div>
      <div class="df-arrow">→</div>
      <div class="df-node">Chromium Browser Pool</div>
      <div class="df-label">&nbsp;· Max 3 browsers, controlled concurrency, agent credentials decrypted on-demand only</div>
    </div>
    <div class="data-flow-row">
      <div class="df-node">5. Chromium</div>
      <div class="df-arrow">→</div>
      <div class="df-node">Komet ERP Archibald</div>
      <div class="df-label">&nbsp;· Agent's own personal credentials only — standard ERP session, no elevated access</div>
    </div>
    <div class="data-flow-row">
      <div class="df-node">6. ERP Data</div>
      <div class="df-arrow">→</div>
      <div class="df-node">PostgreSQL (Hetzner, Germany)</div>
      <div class="df-label">&nbsp;· Per-agent isolated schema, encrypted at rest, immutable audit log</div>
    </div>
    <div class="data-flow-row">
      <div class="df-node">7. Agent Orders</div>
      <div class="df-arrow">→</div>
      <div class="df-node">Komet ERP (via agent session)</div>
      <div class="df-label">&nbsp;· Orders submitted back into ERP — Komet ERP remains the record of truth</div>
    </div>
  </div>

  <h2>Key Architectural Properties</h2>
  <div class="security-grid">
    <div class="security-item">
      <h3>All data stored in Germany (EU)</h3>
      <p>The production server is a Hetzner CPX32 VPS located in Falkenstein, Germany. Object Storage backups use Hetzner's fsn1 region (Frankfurt, Germany). No data is stored outside the European Union.</p>
    </div>
    <div class="security-item">
      <h3>Per-agent data isolation</h3>
      <p>Each agent's data is stored in an isolated schema. There is no shared data layer between agents — a bug, misconfiguration, or compromised session for one agent cannot expose another agent's data.</p>
    </div>
    <div class="security-item">
      <h3>No mobile-to-ERP direct path</h3>
      <p>The agent's mobile device never communicates directly with the ERP. All ERP interactions are mediated through the backend server, providing a clean security boundary and complete audit trail.</p>
    </div>
    <div class="security-item">
      <h3>ERP as authoritative source</h3>
      <p>Agent-initiated orders flow back into the Komet ERP through the standard submission interface. Komet Italia retains full authority over order acceptance or rejection, consistent with Article 2(g) of the agency agreement.</p>
    </div>
  </div>
</div>

<!-- ══════════════════ SECTION 4 — TECHNICAL SECURITY ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">4.</span>Technical Security Measures Implemented</h1>
  <p class="lead">The following security measures are currently implemented in production, operative since April 2026, and documented in the Technical Conformity Declaration (n. 2026-001).</p>

  <h2>4.1 — Authentication &amp; Session Management</h2>

  <p><strong>JWT with Active Revocation (Redis blacklist):</strong> The system implements JWT access tokens with a cryptographically unique identifier (jti, UUID v4) per token. At logout, the jti is inserted into a Redis revocation list with dynamic TTL calculated from token expiry. The authentication middleware verifies revocation on every request. Stolen tokens are invalidated the moment the agent logs out.</p>

  <p><strong>MFA TOTP (RFC 6238):</strong> Multi-factor authentication is implemented using Time-based One-Time Passwords. The TOTP secret is encrypted with AES-256-GCM before database persistence — it is never accessible in plaintext, never transmitted in API responses. Eight single-use recovery codes are provided, bcrypt-hashed in storage. The MFA setup endpoint is rate-limited (5 requests / 15 minutes per IP).</p>

  <p><strong>MFA Device Trust (30-day exemption):</strong> To reduce friction while maintaining security, a trusted-device token (SHA-256 hash stored in database) allows skipping OTP for up to 30 days on a verified device. The trust relationship is device-specific and revocable from the admin panel.</p>

  <p><strong>Biometric Authentication (WebAuthn):</strong> The PWA integrates Face ID and Touch ID via the native OS WebAuthn API. Biometric data is processed exclusively by the device's secure enclave — it is never transmitted to the server, never stored server-side, and never accessible to the application layer. The server receives only a cryptographic attestation of successful local biometric verification.</p>

  <h2>4.2 — Rate Limiting on All Sensitive Endpoints</h2>
  <table class="rate-table">
    <thead>
      <tr>
        <th>Endpoint</th>
        <th>Window</th>
        <th>Limit</th>
        <th>Response on Breach</th>
      </tr>
    </thead>
    <tbody>
      <tr><td><code>POST /api/auth/login</code></td><td>15 minutes</td><td>5 attempts</td><td>HTTP 429 + audit log entry</td></tr>
      <tr><td><code>POST /api/auth/refresh</code></td><td>60 minutes</td><td>20 requests</td><td>HTTP 429</td></tr>
      <tr><td><code>POST /api/auth/mfa-verify</code></td><td>15 minutes</td><td>10 attempts</td><td>HTTP 429</td></tr>
      <tr><td><code>POST /api/auth/mfa-setup</code></td><td>15 minutes</td><td>5 requests</td><td>HTTP 429</td></tr>
      <tr><td><code>POST /api/auth/mfa-confirm</code></td><td>15 minutes</td><td>5 requests</td><td>HTTP 429</td></tr>
    </tbody>
  </table>
  <p style="font-size:8pt;color:var(--text-light);margin-top:-6px;">Every login threshold breach is recorded in the immutable audit log with actor IP, user agent, and timestamp.</p>

  <h2>4.3 — Encryption</h2>
  <ul class="check-list">
    <li><strong>AES-256-GCM at rest</strong> for ERP credentials and MFA secrets — the same encryption standard used in financial services applications. Key derivation uses PBKDF2-HMAC-SHA256. The encryption key is stored exclusively as an environment variable, never in source code, never in logs, never transmitted in any API response.</li>
    <li><strong>TLS 1.2+ in transit</strong> for all communications between mobile client and backend server — managed by Nginx with automatically renewed Let's Encrypt certificates. There is no unencrypted data path.</li>
    <li><strong>HSTS enforcement</strong> prevents protocol downgrade attacks. All HTTPS connections are mandated at the transport layer.</li>
    <li><strong>No secrets in source code</strong> — all cryptographic keys, database credentials, and API tokens are managed as environment variables in the production container environment.</li>
  </ul>

  <h2>4.4 — Access Control (RBAC)</h2>
  <p>The system implements four role levels with per-user module permissions:</p>
  <table>
    <thead>
      <tr><th>Role</th><th>Scope</th><th>MFA</th></tr>
    </thead>
    <tbody>
      <tr><td><span class="role-badge">admin</span></td><td>Full access including admin panel, audit log, user management</td><td>Optional</td></tr>
      <tr><td><span class="role-badge">office</span></td><td>Advanced operational access (invoices, DDT, full history)</td><td>Optional</td></tr>
      <tr><td><span class="role-badge">agent</span></td><td>Standard agent access: own customers, own orders, products</td><td>Optional</td></tr>
      <tr><td><span class="role-badge">dealer</span></td><td>Dealer access: Fresis order history and customer subset</td><td>Optional</td></tr>
    </tbody>
  </table>
  <p style="font-size:8.5pt;color:var(--text-mid);margin-top:4px;">Each user additionally holds a per-user module array (<code>modules JSONB</code>) that restricts access to specific functional areas. Module assignment is managed exclusively by administrators. An admin cannot accidentally lock themselves out (self-role guard).</p>

  <h2>4.5 — HTTP Security Headers</h2>
  <ul class="check-list">
    <li><strong>Strict-Transport-Security (HSTS)</strong> with long max-age</li>
    <li><strong>Content-Security-Policy (strict):</strong> default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' wss:; object-src 'none'; frame-src 'none'</li>
    <li><strong>X-Frame-Options: DENY</strong> — prevents clickjacking attacks</li>
    <li><strong>X-Content-Type-Options: nosniff</strong> — prevents MIME-type sniffing</li>
    <li><strong>CORS whitelist:</strong> cross-origin requests accepted only from <code>https://formicanera.com</code> — all other origins are rejected at the middleware level</li>
  </ul>

  <h2>4.6 — Immutable Audit Trail</h2>
  <p>The system maintains a persistent, append-only audit log in <code>system.audit_log</code> (PostgreSQL). Database-level immutability is guaranteed by:</p>
  <div class="callout">
    <p><code>REVOKE UPDATE, DELETE ON system.audit_log FROM archibald</code> — the application database user is structurally prevented from modifying or deleting any audit record. Removal of records would require direct superuser access with separate credentials not used by the application.</p>
  </div>
  <p>Events tracked in the audit log:</p>
  <ul class="check-list">
    <li>All login attempts (successful and failed), logouts, token revocations</li>
    <li>Order creation, modification, deletion (individual and batch)</li>
    <li>GDPR erasure (Art. 17) and data export (Art. 20) operations — with actor ID and timestamp</li>
    <li>User management operations (role assignment, module changes, MFA configuration)</li>
    <li>Security alerts: repeated failed logins, circuit breaker activation, rate limit breaches, high-rate system errors</li>
  </ul>

  <h2>4.7 — CI/CD Security Gate</h2>
  <p>The continuous integration pipeline (GitHub Actions) executes <code>npm audit --audit-level=critical</code> on every push to the repository. Critical vulnerabilities block both the build and the automatic deployment. The software cannot be distributed to production with known critical vulnerabilities in its dependencies.</p>
</div>

<!-- ══════════════════ SECTION 5 — GDPR ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">5.</span>GDPR Compliance</h1>
  <p class="lead">Formicanera processes personal data as a Data Processor under Art. 28 GDPR. The following documents the categories of data processed, the legal bases, and the implementation of data subjects' rights.</p>

  <h2>5.1 — Categories of Personal Data Processed</h2>
  <div class="security-grid">
    <div class="security-item">
      <h3>Agent data</h3>
      <p>Full name, login credentials (bcrypt-hashed password), encrypted ERP credentials, MFA configuration (encrypted TOTP secret), assigned role and modules, activity logs (rolling 90-day retention). No special category data under Art. 9 GDPR.</p>
    </div>
    <div class="security-item">
      <h3>Customer data</h3>
      <p>Business name, VAT number, fiscal code, registered address, email address, telephone numbers, order history, invoice records, delivery note records. All data originates from the Komet ERP — Formicanera does not collect customer data independently.</p>
    </div>
  </div>
  <p style="font-size:8.5pt;color:var(--text-mid);">No health data, biometric data (server-side), genetic data, or any other special category data under Art. 9 GDPR is processed. Biometric authentication (Face ID/Touch ID) is processed entirely on-device — no biometric data reaches the server.</p>

  <h2>5.2 — Legal Bases for Processing</h2>
  <table>
    <thead>
      <tr><th>Processing Activity</th><th>Legal Basis</th><th>GDPR Article</th></tr>
    </thead>
    <tbody>
      <tr><td>Order management and customer relationship operations</td><td>Performance of a contract</td><td>Art. 6(1)(b)</td></tr>
      <tr><td>Authentication, session management, security monitoring</td><td>Legitimate interest (IT security)</td><td>Art. 6(1)(f)</td></tr>
      <tr><td>VAT number validation</td><td>Legal obligation (fiscal compliance)</td><td>Art. 6(1)(c)</td></tr>
      <tr><td>Audit log retention</td><td>Legitimate interest + legal obligation</td><td>Art. 6(1)(c)(f)</td></tr>
    </tbody>
  </table>

  <h2>5.3 — Data Subjects' Rights — Implementation</h2>
  <table class="rights-table">
    <thead>
      <tr><th>Right</th><th>Implementation</th><th>Response Time</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Access (Art. 15)</strong></td>
        <td>Full data export available via admin panel; audit log of all operations is inspectable</td>
        <td>Within 30 days</td>
      </tr>
      <tr>
        <td><strong>Erasure (Art. 17)</strong></td>
        <td><code>POST /api/admin/customers/:id/gdpr-erase</code> — anonymizes 19 personal data fields across <code>agents.customers</code> and <code>shared.sub_clients</code> tables. Fields replaced with traceable marker <code>[GDPR_ERASED_&lt;timestamp ISO&gt;]</code>. Structural records (orders, history) retained for fiscal compliance, stripped of identifying references. Operation blocked if active orders exist. Every erasure recorded in audit log with actor ID.</td>
        <td>Within 30 days</td>
      </tr>
      <tr>
        <td><strong>Portability (Art. 20)</strong></td>
        <td><code>GET /api/admin/customers/:id/export</code> — produces a structured JSON archive containing all customer data: profile, orders, order articles, linked sub-clients. Returned with <code>Content-Disposition: attachment</code>. Every export recorded in audit log.</td>
        <td>Within 30 days</td>
      </tr>
      <tr>
        <td><strong>Rectification (Art. 16)</strong></td>
        <td>Customer records editable by authorized admin/office roles via standard admin interface</td>
        <td>Within 30 days</td>
      </tr>
      <tr>
        <td><strong>Restriction (Art. 18)</strong></td>
        <td>Account deactivation and module restriction available via admin panel; agent data access revocable immediately</td>
        <td>Immediately on request</td>
      </tr>
    </tbody>
  </table>

  <h2>5.4 — Retention Policy</h2>
  <ul class="check-list">
    <li><strong>Operational data:</strong> retained for the duration of the contract plus 12 months post-termination (fiscal obligation compliance)</li>
    <li><strong>System and application logs:</strong> 90-day rolling retention with automatic size-based rotation</li>
    <li><strong>Post-contract erasure:</strong> all agent-related personal data erased within 60 days of contract termination; a structured export is available prior to deletion in accordance with Art. 20 GDPR</li>
    <li><strong>Automated retention monitoring:</strong> weekly scan identifies customers inactive for more than 24 months; responsible agent is notified for review (no automatic deletion — deletion remains a deliberate human act)</li>
  </ul>

  <h2>5.5 — Data Processing Agreement</h2>
  <p>A Data Processing Agreement fully compliant with Art. 28 GDPR — including all mandatory clauses (subject matter, duration, nature and purpose, categories of data, obligations and rights of the Controller) — will be formally executed before the system goes live. The DPA will be signed concurrently with the commercial contract as a prerequisite for processing activation.</p>
</div>

<!-- ══════════════════ SECTION 6 — NIS2 ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">6.</span>NIS2 Compliance</h1>
  <p class="lead">Directive (EU) 2022/2555 (NIS2), transposed in Italy by D.Lgs. 138/2024, requires that suppliers of digital services implement appropriate technical and organizational security measures. The following maps Formicanera's implemented controls against Art. 21 NIS2 requirements.</p>

  <table class="nis2-table">
    <thead>
      <tr>
        <th style="width:38%">NIS2 Art. 21 Requirement</th>
        <th>Formicanera Implementation</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Policies for risk analysis and information system security</strong></td>
        <td>Security measures documented in this whitepaper and in Technical Conformity Declaration n. 2026-001. DPIA (Data Protection Impact Assessment) screening completed. Threat model covers authentication, data-in-transit, data-at-rest, and ERP interaction boundaries.</td>
      </tr>
      <tr>
        <td><strong>Incident handling</strong></td>
        <td>Formal incident response procedure with P1/P2/P3 severity classification. Data Controller notification within 24 hours of P1 incidents. Supervisory authority (Garante/BSI) notification within 72 hours per Art. 33 GDPR. Automatic security alerts for failed logins, circuit breaker, rate limit breaches.</td>
      </tr>
      <tr>
        <td><strong>Business continuity and crisis management</strong></td>
        <td>Daily automated backups (nightly, 02:00 CET). RPO &lt; 24 hours. RTO 30–60 minutes (database restore + redeploy from GitHub). Backup verification logged on every execution. Full recovery procedure documented.</td>
      </tr>
      <tr>
        <td><strong>Supply chain security</strong></td>
        <td>Hetzner Online GmbH (ISO 27001 certified, DPA signed) as primary infrastructure provider. FedEx International (Standard Contractual Clauses, EU-compliant) for shipment tracking integration only. Full sub-processor register maintained and available for audit.</td>
      </tr>
      <tr>
        <td><strong>Security in acquisition, development and maintenance</strong></td>
        <td><code>npm audit --audit-level=critical</code> runs on every CI/CD push — critical vulnerabilities block deployment. All database queries parameterized (no SQL injection risk). Input validation via Zod on all security-critical API routes. Dependencies reviewed before inclusion.</td>
      </tr>
      <tr>
        <td><strong>Policies to assess effectiveness of security measures</strong></td>
        <td>Immutable audit log provides continuous operational visibility. Penetration test planned as per SLA agreement with Komet Italia prior to full network rollout. Security review incorporated into deployment workflow.</td>
      </tr>
      <tr>
        <td><strong>Cryptography and encryption</strong></td>
        <td>AES-256-GCM at rest for all sensitive credentials. TLS 1.2+ in transit with HSTS enforcement. PBKDF2-HMAC-SHA256 for key derivation. bcrypt for password hashing. No deprecated algorithms in use.</td>
      </tr>
      <tr>
        <td><strong>Human resources security, access control</strong></td>
        <td>RBAC with four roles (admin/office/agent/dealer) + per-user module restrictions. MFA (TOTP) available for all roles. Audit log of all user management operations. Account deactivation immediate on request.</td>
      </tr>
      <tr>
        <td><strong>Use of multi-factor authentication</strong></td>
        <td>TOTP MFA (RFC 6238) implemented for all system access. Backup recovery codes provided (bcrypt-hashed). Device trust mechanism to reduce friction while maintaining security posture.</td>
      </tr>
    </tbody>
  </table>

  <div class="callout">
    <p><strong>Applicability note:</strong> As a Data Processor under Art. 28 GDPR supporting a commercial agent's operational activities, Formicanera is committed to maintaining security measures proportionate to the risk profile of the data processed. The controls documented above exceed the baseline requirements for a system of this scale and data sensitivity, reflecting a deliberate architectural commitment to security-by-design rather than compliance-by-checklist.</p>
  </div>
</div>

<!-- ══════════════════ SECTION 7 — BACKUP ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">7.</span>Backup and Business Continuity</h1>
  <p class="lead">Data availability and recoverability are treated as security properties, not operational conveniences. The backup architecture is designed for verifiable, EU-resident resilience.</p>

  <div class="terms-list">
    <div class="term">
      <h3>Backup Frequency</h3>
      <p>Nightly automated backup executed at 02:00 CET via cron job on the production VPS. Every backup execution is logged and verifiable in the container logs.</p>
    </div>
    <div class="term">
      <h3>Backup Process</h3>
      <p><code>pg_dump</code> → gzip compression → encrypted upload to Hetzner Object Storage. Region: fsn1 (Frankfurt, Germany). Storage remains within the EU at all times.</p>
    </div>
    <div class="term">
      <h3>Retention</h3>
      <p>30-day rolling rotation. Backups older than 30 days are automatically purged. The most recent 30 daily snapshots are always retained.</p>
    </div>
    <div class="term">
      <h3>RPO — Recovery Point Objective</h3>
      <p>Less than 24 hours. In the event of a catastrophic server failure, data loss is bounded to the last completed backup cycle.</p>
    </div>
    <div class="term">
      <h3>RTO — Recovery Time Objective</h3>
      <p>30–60 minutes. Database restore from the last backup + fresh application deployment from the GitHub repository. The source code repository is the authoritative deployment source.</p>
    </div>
    <div class="term">
      <h3>Verification</h3>
      <p>Every backup execution result is logged. Backup integrity can be independently verified by the Controller at any time upon request. Restore drills can be conducted under NDA in a staging environment.</p>
    </div>
  </div>

  <div class="callout callout-navy">
    <p>"Backup is not meaningful unless it is tested. We maintain a documented restore procedure and are prepared to demonstrate a full database recovery in a staging environment as part of any technical audit requested by Gebr. Brasseler GmbH &amp; Co. KG."</p>
  </div>
</div>

<!-- ══════════════════ SECTION 8 — INCIDENT RESPONSE ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">8.</span>Incident Response</h1>
  <p class="lead">A formal incident response procedure is documented and operative. All incidents are classified by severity, with defined response windows and mandatory notification obligations.</p>

  <div class="incident-grid">
    <div class="incident-card incident-p1">
      <div class="incident-label">P1 — Critical</div>
      <div class="incident-title">Data breach or service unavailability &gt; 4 hours</div>
      <div class="incident-detail">
        <strong>Response:</strong> &lt; 4 business hours<br>
        <strong>Controller notification:</strong> within 24 hours<br>
        <strong>Supervisory authority (Garante / BSI):</strong> within 72 hours (Art. 33 GDPR)<br>
        <strong>Post-mortem:</strong> documented within 5 business days
      </div>
    </div>
    <div class="incident-card incident-p2">
      <div class="incident-label">P2 — High</div>
      <div class="incident-title">Service degradation or unauthorized access attempt</div>
      <div class="incident-detail">
        <strong>Response:</strong> &lt; 8 business hours<br>
        <strong>Controller notification:</strong> within 48 hours if personal data risk exists<br>
        <strong>Scope:</strong> authentication failures, circuit breaker activation, unusual ERP patterns
      </div>
    </div>
    <div class="incident-card incident-p3">
      <div class="incident-label">P3 — Medium</div>
      <div class="incident-title">Non-critical service issues or anomalies</div>
      <div class="incident-detail">
        <strong>Response:</strong> 1 business day<br>
        <strong>Controller notification:</strong> at next scheduled status update<br>
        <strong>Scope:</strong> sync delays, minor performance degradation, non-security functional issues
      </div>
    </div>
  </div>

  <h2>Automatic Security Alerts</h2>
  <p>The system generates automatic <code>security.alert</code> events recorded in the immutable audit log for the following conditions:</p>
  <ul class="check-list">
    <li><strong>Repeated failed login attempts</strong> — threshold breach triggers rate limiting and alert generation</li>
    <li><strong>Circuit breaker activation</strong> — after 3 consecutive ERP operation failures, all ERP interactions pause automatically pending investigation</li>
    <li><strong>Rate limit exceeded</strong> — all rate limit breaches on authentication endpoints are logged with IP address and user agent</li>
    <li><strong>High-rate system errors</strong> — unusual error frequency patterns trigger alerts for operational review</li>
    <li><strong>ERP unavailability detection</strong> — system suspension events are logged with start time, duration, and recovery confirmation</li>
  </ul>
</div>

<!-- ══════════════════ SECTION 9 — SUB-PROCESSORS ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">9.</span>Sub-Processors</h1>
  <p class="lead">Formicanera maintains a complete and current register of all third-party providers that process personal data on behalf of the system. As of the date of this document, the sub-processor list is as follows.</p>

  <table class="sp-table">
    <thead>
      <tr>
        <th style="width:22%">Sub-Processor</th>
        <th style="width:20%">Role</th>
        <th style="width:18%">Data Processed</th>
        <th style="width:16%">Location</th>
        <th>Guarantees</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Hetzner Online GmbH</strong></td>
        <td>VPS hosting + Object Storage (backups)</td>
        <td>All system data (at rest)</td>
        <td>Falkenstein / Frankfurt, Germany (EU)</td>
        <td>ISO 27001 certified. DPA signed. GDPR-compliant data centre operations. No data leaves Germany.</td>
      </tr>
      <tr>
        <td><strong>FedEx International</strong></td>
        <td>Shipment tracking integration</td>
        <td>Tracking numbers only — no personal customer data transmitted</td>
        <td>EU / USA</td>
        <td>Standard Contractual Clauses (SCCs) — EU Commission approved transfer mechanism. Limited to non-identifying logistics reference data.</td>
      </tr>
    </tbody>
  </table>

  <div class="callout">
    <p><strong>No external email service</strong> is used for security notifications. All alerts and security events are managed via the internal audit log system. Notifications to the Controller are delivered via documented channels — no personal data transits through third-party email providers for this purpose.</p>
  </div>

  <h2>Sub-Processor Governance</h2>
  <ul class="check-list">
    <li>The full sub-processor register is maintained and available for audit at any time upon request</li>
    <li>Any addition of a new sub-processor will be notified to Komet Italia S.r.l. (as Data Controller) with a minimum 30-day advance notice, per standard DPA terms</li>
    <li>Each sub-processor is evaluated against GDPR Art. 28(3) requirements before engagement</li>
    <li>Hetzner's ISO 27001 certification provides an independently audited baseline for infrastructure security</li>
  </ul>
</div>

<!-- ══════════════════ SECTION 10 — TECHNICAL FAQ ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">10.</span>Technical FAQ for IT</h1>
  <p class="lead">The following addresses the questions most commonly raised by IT departments during technical review of RPA-based systems interfacing with enterprise ERPs.</p>

  <div class="faq-item">
    <div class="faq-q">Q1: Does Formicanera have access to administrative or elevated ERP functions?</div>
    <div class="faq-a">No. The system uses exclusively the commercial agent's standard ERP credentials — the same credentials Komet Italia assigned to Mr. Formicola for his standard agent work. It can only access the same screens, functions, and data the agent can access manually. It has no access to ERP configuration, no access to other agents' territories or data, and no administrative functions within the ERP. Elevated permissions are not requested, not obtained, and not technically possible with the agent's credential level.</div>
  </div>

  <div class="faq-item">
    <div class="faq-q">Q2: Can Formicanera affect ERP performance or stability?</div>
    <div class="faq-a">No ERP performance degradation attributable to the system has been observed during the entire operational period. The system is architecturally designed to protect the ERP: it automatically suspends all interaction if the ERP is unresponsive or under maintenance; it spaces data retrieval operations with mandatory intervals; it reduces synchronization frequency automatically when the agent is inactive. The interaction pattern generates less erratic load than a human user — it is predictable, controlled, and never sends aggressive retry loops. The ERP experiences Formicanera as a disciplined, well-behaved user session.</div>
  </div>

  <div class="faq-item">
    <div class="faq-q">Q3: What happens to the data if the contract is terminated?</div>
    <div class="faq-a">All agent-related personal data is erased within 60 days of contract termination. Prior to deletion, a complete structured data export (JSON/CSV) is available to the Controller in accordance with Art. 20 GDPR. Source code access, ERP credentials, and all authentication materials are removed from all Formicanera systems. The DPA will specify the exact post-termination data handling obligations in binding legal form.</div>
  </div>

  <div class="faq-item">
    <div class="faq-q">Q4: Is the source code auditable?</div>
    <div class="faq-a">Yes. A full source code audit can be arranged under NDA at any time. The CI/CD pipeline (GitHub Actions), deployment configuration, and security implementation are all available for review by the Gebr. Brasseler IT team. We consider source code auditability a standard expectation for any responsible enterprise supplier and welcome this level of scrutiny.</div>
  </div>

  <div class="faq-item">
    <div class="faq-q">Q5: How are ERP credentials protected at rest?</div>
    <div class="faq-a">Agent ERP credentials are encrypted using AES-256-GCM with a random IV generated per encryption operation and an authentication tag for tamper detection. The cryptographic material (IV, authentication tag, ciphertext) is serialized separately and stored in the database. The encryption key is derived via PBKDF2-HMAC-SHA256 from an environment variable (ENCRYPTION_KEY) that exists exclusively in the production server environment — it is never present in source code, never in the repository, never in logs, and never transmitted in any API response. Credentials are decrypted on-demand only, in memory, for the duration of the ERP session.</div>
  </div>

  <div class="faq-item">
    <div class="faq-q">Q6: Does Formicanera generate or modify invoices?</div>
    <div class="faq-a">No. The Formicanera system does not generate invoices and applies no financial calculations to invoice data. This is a fundamental architectural principle consistent with the agency contract, under which invoices are issued exclusively by Komet Italia S.r.l. (as the Preponente), not by the agent. All invoices displayed in the application originate exclusively from the Komet ERP — they are downloaded as official PDFs exported by the ERP through the agent's authenticated session and displayed read-only, with no modification possible.</div>
  </div>

  <div class="faq-item">
    <div class="faq-q">Q7: How is the system monitored for security events?</div>
    <div class="faq-a">The system maintains an immutable append-only audit log (PostgreSQL, with application-level write access revoked for UPDATE and DELETE operations). All authentication events, data operations, GDPR actions, and security alerts are recorded with actor ID, IP address, user agent, and timestamp. Automatic alert generation occurs for repeated failed logins, circuit breaker activation, rate limit breaches, and high-error-rate conditions. The audit log is inspectable by authorized administrators and available for external audit at any time.</div>
  </div>
</div>

<!-- ══════════════════ SECTION 11 — CLOSING STATEMENT ══════════════════ -->
<div style="min-height:297mm;display:flex;flex-direction:column;">
  <div style="flex:1;padding:38px 68px 30px;">

    <h1><span class="n">11.</span>Closing Statement</h1>
    <p class="lead">This document provides a complete and verifiable account of the Formicanera system's security architecture, data protection practices, and regulatory compliance posture as of May 2026.</p>

    <div class="closing-box">
      <div class="closing-text">"The Formicanera system was built to fill a genuine operational gap — enabling a field agent to perform his contractual duties more effectively and accurately — while maintaining full consistency with the Komet ERP as the authoritative source of truth. Security and data protection are not features added after the fact: they are <strong style="color:var(--gold);">architectural properties of the system</strong>, documented, implemented, and verifiable."</div>
      <div class="closing-sub">Every security measure documented in this whitepaper is operative in production. Source code, CI/CD pipeline, audit logs, and backup procedures are all available for independent verification under NDA. We do not ask for trust based on assertions — we offer it based on evidence.</div>
    </div>

    <p>We remain fully available for a technical discussion, a live system demonstration, a source code review under NDA, or any additional documentation required by the Gebr. Brasseler GmbH &amp; Co. KG IT and Legal/Compliance teams.</p>

    <div style="margin-top:32px;padding:24px 0;border-top:2px solid var(--gold);">
      <p style="font-size:9pt;color:var(--text-light);margin-bottom:16px;">Prepared and signed by:</p>
      <p style="font-size:13pt;font-weight:800;color:var(--navy);margin-bottom:4px;">Francesco Formicola</p>
      <p style="font-size:9pt;color:var(--text-mid);margin-bottom:2px;">Developer — Formicanera Agent Management System</p>
      <p style="font-size:9pt;color:var(--text-mid);margin-bottom:16px;">On behalf of: Formicola Biagio, Commercial Agent — Komet Italia S.r.l., Cluster 83</p>
      <p style="font-size:8.5pt;color:var(--text-light);">Naples, Italy — May 2026</p>
      <p style="font-size:8.5pt;color:var(--text-light);">Contact: <span style="color:var(--navy);">francesco.formicola@live.it</span> · <span style="color:var(--navy);">formicanera.com</span></p>
    </div>
  </div>

  <div class="doc-footer" style="margin-top:auto;">
    <div class="footer-left">
      <img src="${logoSrc}" class="footer-logo" alt="Formicanera">
      <div>
        <div class="footer-brand">Formicanera</div>
        <div class="footer-sub">Agent Management System — Security &amp; Compliance Whitepaper</div>
      </div>
    </div>
    <div class="footer-meta">
      Security &amp; Compliance Whitepaper — Version 2.0 — May 2026<br>
      CONFIDENTIAL — For exclusive use of Gebr. Brasseler GmbH &amp; Co. KG<br>
      Prepared by Francesco Formicola · formicanera.com
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
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });
  const page = await browser.newPage();
  console.log('Rendering HTML...');
  await page.emulateMediaType('print');
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  console.log('Generating PDF...');
  await page.pdf({
    path: join(__dirname, 'doc2-security-EN.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    preferCSSPageSize: false,
  });
  await browser.close();
  console.log('PDF generated: doc2-security-EN.pdf');
}

generatePDF().catch(err => { console.error('Error:', err); process.exit(1); });
