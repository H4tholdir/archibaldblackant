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
<title>Formicanera — Market Analysis &amp; Commercial Proposal</title>
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
    <div class="cover-conf">CONFIDENTIAL — Komet Italia S.r.l.</div>
  </div>
  <div class="cover-main">
    <div class="cover-eyebrow">
      <div class="cover-eyebrow-line"></div>
      <div class="cover-eyebrow-text">Market Analysis &amp; Commercial Proposal</div>
    </div>
    <div class="cover-title">Built from<br>the <em>inside</em>.<br>Priced by the market.</div>
    <div class="cover-desc">A comparative analysis of the SaaS market for commercial networks and the commercial proposal for the adoption of Formicanera by the Komet Italia sales network.</div>
    <div class="cover-scope">
      <div class="cover-scope-item">Comparative analysis: generic SaaS, enterprise ERP, custom development</div>
      <div class="cover-scope-item">Single commercial offer — market-justified pricing</div>
      <div class="cover-scope-item">Dedicated IT consultant included in the package</div>
      <div class="cover-scope-item">Documented ROI, contractual terms and GDPR guarantees</div>
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-meta-grid">
      <div class="cover-meta-item"><label>Prepared by</label><span>Francesco Formicola<br>Founder, Formicanera</span></div>
      <div class="cover-meta-item"><label>Addressed to</label><span>Komet Italia S.r.l.<br>Gebr. Brasseler GmbH &amp; Co. KG</span></div>
      <div class="cover-meta-item"><label>Date</label><span>May 2026</span></div>
      <div class="cover-meta-item"><label>Offer Valid Until</label><span>31 July 2026</span></div>
    </div>
  </div>
</div>

<!-- ══════════════════ 0. FOREWORD ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n"></span>Foreword</h1>
  <p class="lead">This document has been prepared at the request of Philipp Rovina (Gebr. Brasseler GmbH &amp; Co. KG) and Marcello Sabatino (Komet Italia S.r.l.) to formally present the Formicanera platform in view of a potential adoption by the Komet Italia sales network.</p>
  <p>Formicanera is a <strong>vertical sales operations platform</strong> for B2B commercial networks, developed and proven in production by a Komet agent with forty years of experience in the sector. It is not an academic project or a prototype: it is an active tool, used every day on real orders and real customers, with time-certified stability.</p>
  <p>The following document presents the market analysis, the commercial proposal and the contractual terms. For technical documentation relating to security, GDPR and NIS2 compliance, please refer to the separate document <em>"Formicanera Security &amp; Compliance Whitepaper"</em> addressed to the Gebr. Brasseler IT team.</p>
  <div class="callout callout-navy">
    <p><strong>Product status:</strong> In production since 2025 on real data. Archibald ERP integration certified and operational. Ready for rollout across the Komet Italia network within 6–8 weeks of signing.</p>
  </div>
</div>

<!-- ══════════════════ 1. THE MARKET ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">1.</span>The Market: What Exists and What It Costs</h1>
  <p class="lead">Before the proposal, it is useful to frame the context. A variety of solutions exist for commercial networks — each with well-defined costs, timelines and limitations. This analysis is based on public pricing lists and project estimates updated to Q1 2026.</p>

  <table>
    <thead>
      <tr>
        <th style="width:17%">Category</th>
        <th style="width:20%">References</th>
        <th style="width:13%">Mobile for agents</th>
        <th style="width:17%">Archibald ERP integration</th>
        <th style="width:13%">Time to go-live</th>
        <th style="width:20%">Year 1 cost (60–80 users)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>CRM / Generic SaaS</strong></td>
        <td>Salesforce Sales Cloud, HubSpot Enterprise, Pipedrive</td>
        <td class="partial">Partial</td>
        <td class="cross">✗</td>
        <td>3–6 months</td>
        <td>€63,000–176,000</td>
      </tr>
      <tr>
        <td><strong>Extended ERP</strong></td>
        <td>MS Dynamics 365, SAP Business One, Oracle Field Service</td>
        <td class="partial">Limited</td>
        <td class="cross">✗ Requires development</td>
        <td>12–24 months</td>
        <td>€150,000–320,000</td>
      </tr>
      <tr>
        <td><strong>Custom development</strong></td>
        <td>Software house — analysis, development, deployment, testing</td>
        <td class="check">✓</td>
        <td class="partial">18+ months</td>
        <td>18–36 months</td>
        <td>€220,000–420,000</td>
      </tr>
      <tr class="highlight">
        <td><strong>Formicanera</strong></td>
        <td>Mobile-first PWA, ERP bot, document sync, notifications, dashboard, dedicated consultant</td>
        <td class="check">✓ Native</td>
        <td class="check">✓ Certified</td>
        <td class="bold-gold">6 weeks</td>
        <td class="bold-gold">€84,000 (prepaid)</td>
      </tr>
    </tbody>
  </table>
  <p class="market-note">* Indicative costs for 60–80 active users. ERP and custom development include implementation, licences and first-year maintenance. Data based on public pricing pages of Salesforce, HubSpot, Microsoft AppSource and benchmark figures from established software houses — Q1 2026.</p>

  <h2>The Differentiator That Cannot Be Bought Elsewhere</h2>
  <p>None of the solutions above was designed to interact with the Archibald ERP. Building this integration requires any software house to perform a deep reverse engineering of the management system, with minimum timelines of 12–18 months and no guarantee of long-term stability.</p>
  <p>Formicanera has already solved this problem — in production, on real orders and real customers, with time-certified stability. This is not an integration to be built: it is an integration that already works.</p>

  <div class="callout">
    <p><strong>Methodological note:</strong> cost ranges are derived from verified public pricing pages (Salesforce.com/pricing, HubSpot.com/pricing, Microsoft AppSource), market quotations from software houses with teams of 10–30 developers, and B2B SaaS field sales benchmarks. Year 1 estimates include licences, implementation and maintenance.</p>
  </div>
</div>

<!-- ══════════════════ 2. THE PROPOSAL ══════════════════ -->
<div class="section pb-before" style="padding-top:28px;padding-bottom:20px;">
  <h1><span class="n">2.</span>The Proposal</h1>
  <p style="font-size:9.5pt;color:var(--text-mid);line-height:1.65;margin-bottom:0;">The fee includes platform, infrastructure, support and a dedicated IT consultant — market-justified pricing as demonstrated by the comparative analysis in §1.</p>

  <div class="price-hero">
    <div class="price-hero-label">Pricing — Komet Italia Network Plan · Up to 80 active users</div>
    <div class="price-hero-main">
      <div class="price-block">
        <div class="price-block-label">One-time setup fee</div>
        <div class="price-amount"><span class="currency">€</span>30,000</div>
      </div>
      <div class="price-divider"></div>
      <div class="price-block">
        <div class="price-block-label">Monthly fee (list price)</div>
        <div class="price-amount"><span class="currency">€</span>5,000<span class="period">/month</span></div>
        <div class="price-discount-badge">→ €4,500/month with annual prepayment (−10%)</div>
      </div>
      <div class="price-divider"></div>
      <div class="price-block">
        <div class="price-block-label">Additional user beyond 80</div>
        <div class="price-amount" style="font-size:22pt;"><span class="currency" style="font-size:12pt;">€</span>35<span class="period">/month</span></div>
      </div>
    </div>
    <div class="price-summary">
      <div class="price-sum-item">
        <div class="price-sum-value">€84,000</div>
        <div class="price-sum-label">Year 1 with annual prepayment</div>
      </div>
      <div class="price-sum-item">
        <div class="price-sum-value">€54,000</div>
        <div class="price-sum-label">Annual prepaid fee<br>from year 2 onwards</div>
      </div>
      <div class="price-sum-item">
        <div class="price-sum-value">€64</div>
        <div class="price-sum-label">Per user per month<br>(at 70 users, prepaid)</div>
      </div>
      <div class="price-sum-item">
        <div class="price-sum-value">€75/h</div>
        <div class="price-sum-label">Evolutionary development<br>outside contract scope</div>
      </div>
    </div>
    <div class="price-hero-note"><strong>24-month contract</strong> · Automatic annual renewal · Payment within <strong>30 days</strong> · <strong>−10%</strong> discount on annual prepayment (effective fee €4,500/month) · All prices VAT (exclusive) · Late payment interest applies</div>
  </div>

  <div class="include-cols">
    <div class="include-col col-yes">
      <h3>✅ Included in the monthly fee</h3>
      <ul>
        <li class="inc-y">PWA access for all users (up to 80)</li>
        <li class="inc-y">Dedicated VPS hosting — Germany, EU (Hetzner)</li>
        <li class="inc-y">PostgreSQL database + automated daily backups</li>
        <li class="inc-y">Archibald ERP bot — operations and updates</li>
        <li class="inc-y">Orders, customers, delivery notes and invoices sync with ERP</li>
        <li class="inc-y">Real-time system, proactive notifications, dashboard</li>
        <li class="inc-y">Security and platform stability updates</li>
        <li class="inc-y">24/7 uptime monitoring</li>
        <li class="inc-y">Technical support within SLA timeframes</li>
        <li class="inc-y">Onboarding: setup, training, data import</li>
        <li class="inc-y"><strong>Dedicated technical consultant — single point of reference for the entire network</strong></li>
      </ul>
    </div>
    <div class="include-col col-extra">
      <h3>→ Evolutionary development (extra, €75/hour)</h3>
      <ul>
        <li class="inc-n">New roadmap features (backorders, AI, promotions)</li>
        <li class="inc-n">Microsoft Dynamics AX / D365 integration</li>
        <li class="inc-n">Custom back-office modules for Verona</li>
        <li class="inc-n">Internal Komet process automation</li>
        <li class="inc-n">Development for Komet European network expansion</li>
        <li class="inc-n">Additional training beyond onboarding</li>
        <li class="inc-n">Change requests outside agreed scope</li>
      </ul>
    </div>
  </div>
</div>

<div style="break-before:page;page-break-before:always;height:0;overflow:hidden;"></div>
<!-- ══════════════════ 3. THE DEDICATED CONSULTANT ══════════════════ -->
<div class="section">
  <h1><span class="n">3.</span>What's Included: Dedicated IT Consultant</h1>
  <p class="lead">The monthly fee includes something that cannot be found in any SaaS catalogue: a real person who manages this system every day, who knows your sector from the inside, and who is available as the technical point of reference for Komet Italia.</p>

  <div class="consulente-box">
    <div class="consulente-title">Included in the fee: a real person, with over 20 years in this specific sector</div>
    <div class="consulente-body">The monthly fee does not include just the platform — it includes direct access to the person who built it and runs it every day. Not a consultant who studied your sector from a brief: with deep roots in the Komet network and the dental sector, I know the commercial cycle, the Archibald ERP and its inefficiencies from the inside. Formicanera was built from exactly that knowledge, and that knowledge remains available to Komet.</div>
    <div class="consulente-grid">
      <div class="consulente-item">
        <div class="consulente-item-icon">🔧</div>
        <div class="consulente-item-text">
          <strong>Operational IT support</strong>
          Single point of reference for any internal Komet IT issue — from the PWA to the daily working tools of agents and back-office staff.
        </div>
      </div>
      <div class="consulente-item">
        <div class="consulente-item-icon">🔗</div>
        <div class="consulente-item-text">
          <strong>Komet systems integration</strong>
          Integration roadmap with Microsoft Dynamics AX/D365, EDI flows, internal tools — with a counterpart who already knows the architecture.
        </div>
      </div>
      <div class="consulente-item">
        <div class="consulente-item-icon">⚙️</div>
        <div class="consulente-item-text">
          <strong>Internal process automation</strong>
          Identification and automation of repetitive back-office processes in Verona — reducing operational costs and improving data quality throughout the supply chain.
        </div>
      </div>
      <div class="consulente-item">
        <div class="consulente-item-icon">🌱</div>
        <div class="consulente-item-text">
          <strong>Long-term technology partner</strong>
          Not a vendor who disappears after deployment — a structured long-term presence that grows with Komet and oversees every technological evolution of the network.
        </div>
      </div>
    </div>
  </div>

  <div class="callout callout-navy">
    <p>"This is not the largest solution on the market — it is the one built specifically for this network, by someone who has known it for twenty years. <strong>This level of contextual knowledge cannot be purchased on any price list: you either have it or you don't.</strong>"</p>
  </div>
</div>

<!-- ══════════════════ 4. ECONOMIC VALUE ══════════════════ -->
<div class="section pb-before" style="padding-top:28px;padding-bottom:20px;">
  <h1><span class="n">4.</span>The Economic Value: ROI in Numbers</h1>
  <p style="font-size:9.5pt;color:var(--text-mid);line-height:1.6;margin-bottom:0;">Conservative calculation for 60–80 active agents — data measured in production on the Komet commercial cycle.</p>

  <div class="roi-grid">
    <div class="roi-card">
      <div class="roi-card-icon">⏱</div>
      <div class="roi-card-value">−<span>75%</span></div>
      <div class="roi-card-label">Time to place an order</div>
      <div class="roi-card-desc">From 15–20 minutes down to 3–5. The bot submits to Archibald asynchronously. For 60–80 agents × 3 orders/day × 250 days: <strong>13,125 hours/year recovered</strong> on order entry alone.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">📄</div>
      <div class="roi-card-value">−<span>7,000 h</span></div>
      <div class="roi-card-label">Documents and coordination</div>
      <div class="roi-card-desc">Delivery notes/invoices already synchronised: retrievable in <strong>1–2 minutes</strong> from any device, without opening the ERP or calling Verona (60–80 ag × 2/day × 250 days × 7.5 min = <strong>4,375 hours</strong>). Calls to Verona for order status virtually eliminated (60–80 ag × 1.5/day × 250 days × 6 min = <strong>2,625 hours</strong>).</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">🛡</div>
      <div class="roi-card-value">3,500 <span style="font-size:13pt;">relationships</span></div>
      <div class="roi-card-label">Territorial exclusivity protection</div>
      <div class="roi-card-desc">60–80 agents × ~50 active customers = ~3,500 relationships monitored every day automatically. The PWA notifies the agent when a customer is 4 months from Komet's critical threshold. Losing even a single territorial exclusivity can be worth <strong>€20,000–50,000/year</strong> in commissions.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">📊</div>
      <div class="roi-card-value">−€<span>30,000</span></div>
      <div class="roi-card-label">ERP error costs eliminated</div>
      <div class="roi-card-desc">Manual entry: typical error rate of 2% on item code, quantity, customer. Over 52,500 orders/year: ~1,050 errors avoided × €30 handling cost (correction + communication + potential return) = <strong>€31,500/year eliminated</strong>. The bot copies the agent's order without any margin of error.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">📋</div>
      <div class="roi-card-value"><span>Instant</span> history</div>
      <div class="roi-card-label">Immediate response to the customer</div>
      <div class="roi-card-desc">Order history, prices and delivery notes always at hand. The agent answers on the spot to <em>"what did we order last time?"</em> or <em>"what price was I paying for this item?"</em> — without calling Verona, without waiting. Less hesitation = more trust = more orders closed.</div>
    </div>
    <div class="roi-card">
      <div class="roi-card-icon">💡</div>
      <div class="roi-card-value"><span style="font-size:13pt;">Quote</span> on visit</div>
      <div class="roi-card-label">Close the sale during the appointment</div>
      <div class="roi-card-desc">Up-to-date prices and personalised discounts visible in real time. The agent can build and present a real quotation while still at the customer's premises. Those who decide on the spot buy — those who need to "follow up" often don't. <em>(Priority roadmap item)</em></div>
    </div>
  </div>

  <div style="break-inside:avoid-page;page-break-inside:avoid;">
    <div class="roi-total">
      <div>
        <div class="roi-total-label">Estimated productivity recovered — Year 1 (conservative calculation)</div>
        <div class="roi-total-sub">~20,000 total hours × €35 average agent hourly cost · 60–80 active agents<br>13,125 orders + 7,000 documents/coordination = 20,125 hours (understated calculation)</div>
      </div>
      <div style="text-align:right;">
        <div class="roi-total-value">€700,000</div>
        <div class="roi-total-sub" style="color:rgba(255,255,255,.35);">From year 2, Formicanera costs less than <strong style="color:var(--gold);">8%</strong> of the value it generates (€54k on €700k)</div>
      </div>
    </div>
    <div class="callout" style="margin-top:10px;">
      <p>For comparison: Salesforce Sales Cloud Enterprise for 70 users costs <strong>approximately €120,000/year</strong> (public list price Q1 2026, licences only) — with no Archibald integration, no bot, no sector knowledge. From year two, Formicanera costs <strong>€54,000 prepaid — less than half</strong>, with a functional scope built precisely for the Komet network.</p>
    </div>
  </div>

</div>

<!-- ══════════════════ 4.2 COMPETITIVE BENCHMARK ══════════════════ -->
<div class="section pb-before">
  <h1><span class="n">4.2</span>Market Positioning — May 2026</h1>
  <p class="lead">Formicanera is positioned in the premium tier of field sales platforms with native ERP integration — at the price of mid-range competitors, with the exclusive advantage of being the only solution built specifically for the Archibald ERP and Italian regulatory requirements.</p>

  <table>
    <thead>
      <tr>
        <th style="width:22%">Vendor / Plan</th>
        <th style="width:18%">€/user/month<br>(year 2+)</th>
        <th style="width:12%">Native ERP</th>
        <th style="width:48%">Critical notes for Komet</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Delta Sales App Advanced</strong></td>
        <td>~€23</td>
        <td class="cross">✗</td>
        <td>No native ERP integration. Emerging market player, no Italian adaptation.</td>
      </tr>
      <tr>
        <td><strong>Badger Maps Business</strong></td>
        <td>~€53</td>
        <td class="cross">✗</td>
        <td>Route optimisation, but no order management or ERP integration.</td>
      </tr>
      <tr>
        <td><strong>Skynamo Advanced</strong></td>
        <td>~€63</td>
        <td class="partial">Partial</td>
        <td>Opaque pricing (requires sales call). Separate, paid ERP implementation. No Italian adaptation.</td>
      </tr>
      <tr class="highlight">
        <td><strong>Formicanera</strong></td>
        <td class="bold-gold">€64</td>
        <td class="check">✓ Native</td>
        <td><strong>Only platform with Archibald ERP integration already operational.</strong> Full Italian regulatory compliance (VAT, credit notes, SDI). Zero opaque costs.</td>
      </tr>
      <tr>
        <td><strong>Pepperi Corporate</strong></td>
        <td>~€72</td>
        <td class="partial">Plugin</td>
        <td>Local partner required. Additional onboarding: €5,000–€46,000. No Archibald integration.</td>
      </tr>
      <tr>
        <td><strong>MS Dynamics 365 Enterprise</strong></td>
        <td>~€97</td>
        <td class="partial">BC native</td>
        <td>Licence is only the starting point. Power Platform additional. Customisation required for Italian workflows.</td>
      </tr>
      <tr>
        <td><strong>Salesforce Enterprise</strong></td>
        <td>~€152</td>
        <td class="cross">✗ (MuleSoft)</td>
        <td>ERP integration via MuleSoft: +€50,000/year. 3-year TCO: €465,000.</td>
      </tr>
    </tbody>
  </table>
  <p class="market-note">* Prices verified May 2026 from public sources (Pepperi, Delta Sales App, RepMove, Badger Maps, Microsoft, Salesforce). Skynamo from third-party sources (G2, FieldSalesTools). Source: public pricing pages, ECB exchange rate April 16, 2026: 1 EUR = 1.1782 USD.</p>

  <div class="callout callout-navy" style="margin-top:16px;">
    <p><strong>Comparative 3-year TCO (60–80 users):</strong> Formicanera ~€187,000 · Skynamo ~€175,000–210,000 (+ implementation) · Pepperi ~€206,000–241,000 · Dynamics 365 ~€283,000 · Salesforce ~€465,000.<br><strong>The price is not negotiable because it is already the market price — it is competitive, not preferential.</strong></p>
  </div>
</div>

<!-- ══════════════════ 4.5 FEATURE HIGHLIGHTS ══════════════════ -->
<div class="section pb-before" style="padding-top:28px;padding-bottom:20px;">
  <h1><span class="n">4.5</span>Feature Highlights</h1>
  <p style="font-size:9.5pt;color:var(--text-mid);line-height:1.65;margin-bottom:16px;">Three product areas introduced in the latest development phase — particularly relevant to the Komet commercial cycle.</p>

  <h2>Pending Orders — Save and Submit Whenever You Choose</h2>
  <ul>
    <li>Save orders throughout the day without having to submit them immediately</li>
    <li>Unlimited accumulation of orders in "pending" status</li>
    <li>Deferred submission: send everything together at the time and place of your choice (e.g. on returning to the office, on Wi-Fi, at end of day)</li>
    <li>Non-blocking global progress bar: the agent can navigate the app while the bot submits orders in automatic sequence</li>
  </ul>

  <div class="callout" style="margin:12px 0 20px;">
    <p><strong>Typical scenario:</strong> the agent visits 8 customers during the day, fills in each order on the spot, then at day's end presses "Submit all" — the bot places them all in Archibald in automatic sequence. Zero interruptions during visits, zero manual work in the evening.</p>
  </div>

  <h2>Catalogue, Real-Time Stock Check and Quotations</h2>
  <ul>
    <li>Full-text search across the complete Komet catalogue — instant results</li>
    <li>Real-time stock availability for every item (green/amber/red badge) — no phone calls to Verona</li>
    <li>Customer-specific price visible immediately — not the generic list price, but the contracted price</li>
    <li>Instant check: availability confirmed in under 2 seconds</li>
    <li><strong>Quote in one tap:</strong> from any historical order, generate a professional PDF in under 3 seconds, shareable via WhatsApp, Gmail, Dropbox or direct link</li>
    <li>Automatic numbering, Formicanera header, VAT-inclusive totals — ready to show the customer during the visit</li>
  </ul>

  <div class="callout" style="margin:12px 0 20px;">
    <p><strong>Typical scenario:</strong> the customer asks <em>"do you still have that bur?"</em> — the agent opens Formicanera, searches the item, sees stock and price in 2 seconds, and generates the quotation while still seated at the customer's table. Those who decide on the spot buy. Those who need to "follow up" often don't.</p>
  </div>

  <h2>Integrations — Connected to Daily Work Tools</h2>
  <p>Formicanera connects natively to the tools agents use every day:</p>
  <table style="margin:10px 0 0;">
    <thead>
      <tr>
        <th style="width:20%">Integration</th>
        <th>Available functionality</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>WhatsApp</strong></td>
        <td>Share orders, quotations and documents directly in chat — in one tap from the order screen</td>
      </tr>
      <tr>
        <td><strong>Gmail</strong></td>
        <td>Automatic sending of quotations and document notifications to customers, with professional header</td>
      </tr>
      <tr>
        <td><strong>Dropbox</strong></td>
        <td>Automatic archiving of delivery notes, invoices and quotations — organised by customer and date</td>
      </tr>
      <tr>
        <td><strong>Google Drive</strong></td>
        <td>Automatic sync and backup of all commercial documents to company Drive</td>
      </tr>
    </tbody>
  </table>
</div>

<div style="break-before:page;page-break-before:always;height:0;overflow:hidden;"></div>
<!-- ══════════════════ 5. TERMS + 6. TIMELINE + FOOTER ══════════════════ -->
<div style="min-height:297mm;display:flex;flex-direction:column;background:var(--bg);">
  <div style="flex:1;padding:38px 68px 30px;">

    <h1><span class="n">5.</span>Contractual Terms and Guarantees</h1>
    <div class="terms-list">
      <div class="term">
        <h3>Duration and renewal</h3>
        <p>24 months from the go-live date. Automatic annual renewal. Termination with <strong>90 days</strong> written notice.</p>
      </div>
      <div class="term">
        <h3>Payment and invoicing</h3>
        <p>Setup fee in two instalments: 50% on signing, 50% at go-live. Monthly fee invoiced in arrears at <strong>30 days</strong>. −10% discount on advance annual prepayment.</p>
      </div>
      <div class="term">
        <h3>Intellectual property</h3>
        <p>Platform owned by the provider. Komet receives an exclusive <strong>licence to use</strong> for its own network. Komet's data remains Komet's data under all circumstances.</p>
      </div>
      <div class="term">
        <h3>Portability and exit</h3>
        <p>Data exportable in standard format (CSV/JSON) within 30 days of termination. No retention beyond <strong>60 days</strong> post-contract.</p>
      </div>
      <div class="term">
        <h3>SLA — Uptime and support</h3>
        <p>Guaranteed uptime <strong>99.5%</strong> monthly. Critical incident: response within <strong>4 business hours</strong>. Standard support: <strong>1 business day</strong>. Proportional penalty for SLA breach.</p>
      </div>
      <div class="term">
        <h3>GDPR and security</h3>
        <p>DPA (Art. 28 GDPR) signed before go-live. Hosting in Germany (EU) — <strong>zero extra-EU transfers</strong>. Breach notification to the Controller within 24 hours. EU Standard Contractual Clauses.</p>
      </div>
    </div>

    <h1 style="margin-top:26px;"><span class="n">6.</span>From Signing to Go-Live: 8 Weeks</h1>
    <div class="timeline">
      <div class="tl-step">
        <div class="tl-dot">1</div>
        <div class="tl-time">Week 1–2</div>
        <div class="tl-label">Setup &amp; Configuration</div>
        <div class="tl-desc">Dedicated infrastructure, agent profiles, ERP credentials, customer data import.</div>
      </div>
      <div class="tl-step">
        <div class="tl-dot">2</div>
        <div class="tl-time">Week 3–4</div>
        <div class="tl-label">Testing &amp; ERP Integration</div>
        <div class="tl-desc">Bot validation on real orders, document sync verification, access and permissions across the entire network.</div>
      </div>
      <div class="tl-step">
        <div class="tl-dot">3</div>
        <div class="tl-time">Week 5–6</div>
        <div class="tl-label">Training + Pilot</div>
        <div class="tl-desc">Training sessions for the Verona team and 10–15 pilot agents. Feedback collection and adjustments.</div>
      </div>
      <div class="tl-step">
        <div class="tl-dot">4</div>
        <div class="tl-time">Week 7–8</div>
        <div class="tl-label">Full Rollout</div>
        <div class="tl-desc">Entire network active. Intensive support during the first week of full operations.</div>
      </div>
    </div>

    <h1 style="margin-top:26px;">Next Steps</h1>
    <div class="steps">
      <div class="step">
        <div class="step-num">Step 1</div>
        <div class="step-title">Proposal acceptance</div>
        <div class="step-desc">Written confirmation by 31 July 2026</div>
      </div>
      <div class="step">
        <div class="step-num">Step 2</div>
        <div class="step-title">GDPR DPA signing</div>
        <div class="step-desc">Meeting with Komet DPO / legal team for alignment</div>
      </div>
      <div class="step">
        <div class="step-num">Step 3</div>
        <div class="step-title">Contract signing</div>
        <div class="step-desc">24 months + first setup instalment €15,000</div>
      </div>
      <div class="step">
        <div class="step-num">Step 4</div>
        <div class="step-title">Kick-off</div>
        <div class="step-desc">Start of 8-week journey to full go-live</div>
      </div>
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
      Market Analysis &amp; Commercial Proposal — May 2026<br>
      Confidential — Komet Italia S.r.l. / Gebr. Brasseler GmbH &amp; Co. KG<br>
      Valid until 31 July 2026 · All prices VAT exclusive
    </div>
  </div>
</div>

</body>
</html>`;

const outputPath = join(dirname(fileURLToPath(import.meta.url)), 'doc3-proposal-EN.pdf');

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
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    preferCSSPageSize: false,
  });
  await browser.close();
  console.log('PDF generated:', outputPath);
}

generatePDF().catch(err => { console.error('Error:', err); process.exit(1); });
