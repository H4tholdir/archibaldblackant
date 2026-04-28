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
<title>Formicanera — Benchmark Competitor Komet</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
:root{
  --navy:#1a1a2e;--navy2:#16213e;--navy3:#0f3460;
  --gold:#c8a96e;--gold-light:#f5edd8;--gold-soft:#fbf8f1;
  --text:#2d2d2d;--text-mid:#4b5563;--text-light:#6b7280;
  --border:#e5e7eb;--bg:#f8fafc;
  --green:#059669;--green-soft:#ecfdf5;
  --red:#dc2626;--red-soft:#fef2f2;
  --blue:#2563eb;--blue-soft:#eff6ff;
}
@page{margin:0;}
html,body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:var(--text);background:#fff;font-size:10pt;line-height:1.6;
}
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
}
.page-break{break-before:page;page-break-before:always;}
h1,h2,h3{break-after:avoid;page-break-after:avoid;}

/* cover */
.cover{
  min-height:297mm;
  background:linear-gradient(160deg,var(--navy) 0%,var(--navy2) 58%,var(--navy3) 100%);
  color:#fff;
  padding:56px 66px;
  position:relative;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  justify-content:space-between;
  break-after:page;
  page-break-after:always;
}
.cover:before{
  content:'';
  position:absolute;
  top:-140px;right:-130px;
  width:520px;height:520px;border-radius:50%;
  background:radial-gradient(circle,rgba(200,169,110,.16) 0%,transparent 66%);
}
.cover:after{
  content:'';
  position:absolute;
  left:-90px;bottom:-110px;
  width:380px;height:380px;border-radius:50%;
  background:radial-gradient(circle,rgba(200,169,110,.09) 0%,transparent 66%);
}
.cover-top,.cover-main,.cover-bottom{position:relative;z-index:1;}
.cover-top{display:flex;justify-content:space-between;align-items:center;}
.brand{display:flex;align-items:center;gap:15px;}
.brand img{width:62px;height:62px;object-fit:contain;filter:drop-shadow(0 6px 16px rgba(0,0,0,.35));}
.brand-word{font-size:11pt;font-weight:300;letter-spacing:4px;text-transform:uppercase;color:rgba(255,255,255,.52);}
.conf{font-size:7.5pt;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.32);border:1px solid rgba(255,255,255,.16);padding:5px 12px;border-radius:3px;}
.cover-main{padding:58px 0 34px;}
.eyebrow{font-size:8pt;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:16px;}
.cover h1{
  font-family:Georgia,"Times New Roman",serif;
  font-size:41pt;line-height:1.08;font-weight:800;
  color:#fff;border:none;padding:0;margin:0 0 18px 0;
}
.cover h1 em{font-style:normal;color:var(--gold);}
.cover-sub{
  max-width:560px;font-size:12.5pt;line-height:1.62;
  color:rgba(255,255,255,.73);font-weight:300;margin-bottom:28px;
}
.cover-pills{display:flex;flex-wrap:wrap;gap:10px 12px;max-width:640px;}
.pill{
  display:inline-flex;align-items:center;gap:8px;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
  border-radius:999px;padding:8px 14px;font-size:8.3pt;color:rgba(255,255,255,.83);
}
.pill:before{content:'';width:7px;height:7px;border-radius:50%;background:var(--gold);flex-shrink:0;}
.cover-bottom{border-top:1px solid rgba(255,255,255,.1);padding-top:20px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;}
.meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;}
.meta label{display:block;font-size:7pt;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:5px;}
.meta span{font-size:9pt;color:rgba(255,255,255,.78);line-height:1.45;}

/* common layout */
.section{padding:34px 66px 26px;}
.section-tight{padding:24px 66px;}
.kicker{font-size:7.5pt;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:10px;}
h2{
  font-size:21pt;font-weight:800;color:var(--navy);
  border-bottom:2.5px solid var(--gold);padding-bottom:10px;margin-bottom:18px;
}
h3{
  font-size:12pt;font-weight:800;color:var(--navy);margin:20px 0 10px;
}
p{margin-bottom:11px;}
.lead{font-size:11pt;color:var(--text-mid);line-height:1.72;max-width:720px;}
.callout{
  background:var(--gold-light);border-left:4px solid var(--gold);
  border-radius:0 7px 7px 0;padding:14px 18px;margin:16px 0;
}
.callout p{margin:0;font-size:9.4pt;line-height:1.6;}
.callout.navy{background:var(--navy);border-left-color:var(--gold);}
.callout.navy p,.callout.navy strong{color:#fff;}
.callout.navy strong{color:var(--gold);}
.banner{
  border-radius:12px;padding:18px 22px;margin:16px 0 8px;
  background:linear-gradient(135deg,var(--navy) 0%,var(--navy2) 100%);
  color:#fff;
}
.banner-title{font-size:8pt;letter-spacing:2.5px;text-transform:uppercase;color:var(--gold);font-weight:700;margin-bottom:10px;}
.banner-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
.banner-item{background:rgba(255,255,255,.05);border-radius:10px;padding:14px 14px 12px;text-align:center;}
.banner-value{font-size:24pt;font-weight:900;color:#fff;line-height:1;margin-bottom:4px;}
.banner-label{font-size:8pt;line-height:1.45;color:rgba(255,255,255,.62);}

table{width:100%;border-collapse:collapse;font-size:8.7pt;margin:14px 0;}
thead tr{background:var(--navy);}
thead th{
  text-align:left;color:#fff;font-weight:700;
  padding:10px 12px;font-size:7.9pt;letter-spacing:.3px;
}
tbody tr:nth-child(even){background:var(--bg);}
tbody tr.highlight{background:#fffdf6;}
td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:top;line-height:1.48;}
.note{font-size:7.7pt;color:var(--text-light);line-height:1.55;margin-top:6px;}
.ok{color:var(--green);font-weight:800;}
.warn{color:#b45309;font-weight:800;}
.bad{color:var(--red);font-weight:800;}

.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0;}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:14px 0;}
.card{
  border:1px solid var(--border);border-radius:12px;background:#fff;
  padding:16px 18px;break-inside:avoid-page;page-break-inside:avoid;
}
.card h4{font-size:10.5pt;color:var(--navy);margin-bottom:6px;}
.card p{font-size:8.9pt;color:var(--text-mid);margin-bottom:0;line-height:1.58;}
.card ul{margin:8px 0 0 18px;}
.card li{font-size:8.9pt;color:var(--text-mid);margin-bottom:4px;line-height:1.52;}
.card.gold{border-top:3px solid var(--gold);}
.card.green{border-top:3px solid var(--green);}
.card.blue{border-top:3px solid var(--blue);}
.card.red{border-top:3px solid var(--red);}
.card-title-line{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;}
.tag{
  display:inline-flex;align-items:center;border-radius:999px;padding:4px 10px;
  font-size:7.2pt;font-weight:800;letter-spacing:.4px;text-transform:uppercase;
}
.tag.direct{background:var(--green-soft);color:var(--green);}
.tag.anchor{background:var(--blue-soft);color:var(--blue);}
.tag.risk{background:var(--red-soft);color:var(--red);}

.quote{
  background:var(--gold-soft);border:1px solid #eadcb8;border-radius:12px;
  padding:20px 24px;margin:18px 0;
}
.quote-mark{font-size:34pt;line-height:.8;color:var(--gold);font-family:Georgia,serif;margin-bottom:8px;}
.quote-text{font-size:15pt;line-height:1.55;color:var(--navy);font-weight:300;font-style:italic;}

.footer{
  margin-top:auto;
  background:var(--navy);
  color:#fff;
  padding:24px 66px;
  display:flex;justify-content:space-between;align-items:center;gap:20px;
}
.footer-left{display:flex;align-items:center;gap:14px;}
.footer img{width:44px;height:44px;object-fit:contain;}
.footer-brand{font-size:13pt;font-weight:800;color:var(--gold);}
.footer-sub{font-size:7.8pt;color:rgba(255,255,255,.42);}
.footer-meta{font-size:7.5pt;line-height:1.75;color:rgba(255,255,255,.36);text-align:right;}

.last-page{
  min-height:297mm;display:flex;flex-direction:column;background:#fff;
}

ul.tight{margin:8px 0 0 18px;}
ul.tight li{margin-bottom:4px;}
.small{font-size:8.4pt;color:var(--text-light);}
</style>
</head>
<body>

<div class="cover">
  <div class="cover-top">
    <div class="brand">
      <img src="${logoSrc}" alt="Formicanera">
      <div class="brand-word">Formicanera</div>
    </div>
    <div class="conf">Riservato · Uso interno</div>
  </div>

  <div class="cover-main">
    <div class="eyebrow">Benchmark Competitor Diretto · Komet Italia</div>
    <h1>Una lettura <em>di mercato</em><br>per difendere il prezzo<br>di Formicanera.</h1>
    <div class="cover-sub">
      Confronto tra i competitor oggi più credibili per la PWA Formicanera,
      con posizionamento economico su 70 utenti e messaggio commerciale da usare
      in trattativa con Komet Italia.
    </div>
    <div class="cover-pills">
      <div class="pill">Sales rep ordering / B2B sales operations</div>
      <div class="pill">ERP-connected field sales</div>
      <div class="pill">Prezzi pubblici verificati al 17 aprile 2026</div>
      <div class="pill">Lettura pronta per la trattativa</div>
    </div>
  </div>

  <div class="cover-bottom">
    <div class="meta-grid">
      <div class="meta">
        <label>Cliente di riferimento</label>
        <span>Komet Italia S.r.l.</span>
      </div>
      <div class="meta">
        <label>Perimetro di confronto</label>
        <span>Piattaforma sales operations verticale<br>per rete vendita B2B</span>
      </div>
      <div class="meta">
        <label>Data benchmark</label>
        <span>17 aprile 2026</span>
      </div>
    </div>
    <div class="small" style="color:rgba(255,255,255,.34);max-width:220px;text-align:right;">
      Documento preparato per uso commerciale interno.
    </div>
  </div>
</div>

<div class="section page-break">
  <div class="kicker">Sintesi</div>
  <h2>Formicanera Non È Più Una Semplice App Ordini</h2>
  <p class="lead">
    Allo stato attuale della PWA, il confronto corretto non è con un semplice CRM
    o con un portale ordini leggero. Formicanera oggi copre un perimetro di
    <strong>sales operations platform verticale</strong> per rete vendita B2B.
  </p>

  <div class="grid-3">
    <div class="card gold">
      <h4>Ordini & flusso operativo</h4>
      <p>Ordini mobile-first, invio asincrono verso Archibald, pending orders, storico e gestione operativa dell’ultimo miglio.</p>
    </div>
    <div class="card gold">
      <h4>Dati commerciali</h4>
      <p>Clienti con profilo completo, articoli, listini, variazioni prezzo, disponibilità e storico documentale sempre accessibile.</p>
    </div>
    <div class="card gold">
      <h4>Controllo & notifiche</h4>
      <p>Dashboard KPI, reminder, tracking, notifiche proattive, supporto magazzino e automazioni operative.</p>
    </div>
  </div>

  <div class="banner">
    <div class="banner-title">Il prezzo Formicanera su 70 utenti</div>
    <div class="banner-grid">
      <div class="banner-item">
        <div class="banner-value">€84.000</div>
        <div class="banner-label">Anno 1<br>setup + piattaforma</div>
      </div>
      <div class="banner-item">
        <div class="banner-value">€54.000</div>
        <div class="banner-label">Anno 2+<br>canone ricorrente</div>
      </div>
      <div class="banner-item">
        <div class="banner-value">€64,29</div>
        <div class="banner-label">Utente / mese<br>dal secondo anno</div>
      </div>
    </div>
  </div>

  <div class="callout navy">
    <p><strong>Verdetto rapido:</strong> €84k anno 1 è difendibile se raccontato come piattaforma verticale con integrazione Archibald già risolta; €54k anno 2+ è allineato.</p>
  </div>

  <h3>Chi Sono I Competitor Davvero Credibili</h3>
  <table>
    <thead>
      <tr>
        <th style="width:18%">Vendor</th>
        <th style="width:30%">Perché è diretto</th>
        <th style="width:18%">Prezzo pubblico</th>
        <th style="width:34%">Lettura commerciale</th>
      </tr>
    </thead>
    <tbody>
      <tr class="highlight">
        <td><strong>Pepperi</strong></td>
        <td>Rep app, offline, price lists, promotions, tracking, multiple warehouses, B2B ordering.</td>
        <td>da <strong>$500/mese</strong><br>Pro<br>da <strong>$1.500/mese</strong><br>Corporate</td>
        <td>Uno dei confronti più solidi. Prezzo pubblico solo base, mentre l’integrazione reale resta su quotazione.</td>
      </tr>
      <tr class="highlight">
        <td><strong>Skynamo</strong></td>
        <td>Field sales B2B, ordering offline, catalogo, trade portal, rollout ERP-integrated per sistemi legacy/on-prem.</td>
        <td><strong>Su quotazione</strong></td>
        <td>Molto vicino al posizionamento Formicanera. Ottimo benchmark di fascia alta.</td>
      </tr>
      <tr class="highlight">
        <td><strong>OrderEase</strong></td>
        <td>Order capture, pricing complesso, inventory, ERP sync, sales rep app.</td>
        <td>da <strong>$17/giorno</strong></td>
        <td>Molto diretto sul flusso ordini e integrazione, meno completo come cockpit commerciale end-to-end.</td>
      </tr>
      <tr>
        <td><strong>Delta Sales App</strong></td>
        <td>Ordini, pricing cliente, inventory, resi, stock taking.</td>
        <td><strong>$25/user/mese</strong><br>Advanced</td>
        <td>Benchmark low-cost utile come lower bound, ma non come comparabile pieno.</td>
      </tr>
      <tr>
        <td><strong>RepMove</strong></td>
        <td>Mobile field sales CRM, onboarding, integrations.</td>
        <td><strong>$80/user/mese</strong><br>Accelerate</td>
        <td>Più CRM field-sales che sales-ops platform verticale.</td>
      </tr>
      <tr>
        <td><strong>Sage Sales Management</strong></td>
        <td>Rete vendita, ERP integration, quotes & orders.</td>
        <td><strong>Su quotazione</strong></td>
        <td>Buon benchmark di categoria, ma con poca trasparenza sul prezzo finale.</td>
      </tr>
    </tbody>
  </table>
  <div class="note">
    Komet ha già un proprio shop e-commerce. Quindi il confronto corretto per Formicanera non è quello di uno storefront B2B puro, ma di una piattaforma operativa per rete vendita già connessa all’ERP.
  </div>
</div>

<div class="section page-break">
  <div class="kicker">Confronto economico</div>
  <h2>Prezzi Annualizzati Su 70 Utenti</h2>
  <p class="lead">
    Dove il vendor pubblica un listino per utente, il valore è stato annualizzato su 70 utenti.
    Le conversioni USD/EUR usano il cambio ECB del <strong>16 aprile 2026</strong>:
    <strong>1 EUR = 1,1782 USD</strong>.
  </p>

  <table>
    <thead>
      <tr>
        <th style="width:36%">Vendor / piano</th>
        <th style="width:20%">Annuale stimato</th>
        <th style="width:44%">Lettura</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Delta Sales App Standard</strong></td>
        <td>€10.694</td>
        <td>Troppo leggero rispetto al perimetro Formicanera.</td>
      </tr>
      <tr>
        <td><strong>Delta Sales App Advanced</strong></td>
        <td>€17.824</td>
        <td>Lower bound utile, non benchmark pieno.</td>
      </tr>
      <tr>
        <td><strong>RepMove Sales Pro</strong></td>
        <td>€38.492</td>
        <td>Ancora più CRM che sales-ops.</td>
      </tr>
      <tr>
        <td><strong>Badger Maps Business</strong></td>
        <td>€41.351</td>
        <td>Field enablement forte, ma meno verticale su ordini e back office.</td>
      </tr>
      <tr>
        <td><strong>Dynamics 365 Sales Professional</strong></td>
        <td>€46.342</td>
        <td>Licenza-only, senza vero progetto Komet.</td>
      </tr>
      <tr class="highlight">
        <td><strong>Formicanera · anno 2+</strong></td>
        <td><strong>€54.000</strong></td>
        <td><strong>In linea con il mercato serio, con Archibald già integrato.</strong></td>
      </tr>
      <tr>
        <td><strong>RepMove Accelerate</strong></td>
        <td>€57.036</td>
        <td>Valore vicino al tuo ricorrente, ma con perimetro meno profondo.</td>
      </tr>
      <tr>
        <td><strong>Business Central Essentials</strong></td>
        <td>€57.036</td>
        <td>ERP-only, non progetto completo.</td>
      </tr>
      <tr>
        <td><strong>Badger Maps Enterprise</strong></td>
        <td>€67.730</td>
        <td>Ottimo lato field, ma non copre il tuo perimetro operativo.</td>
      </tr>
      <tr>
        <td><strong>Dynamics 365 Sales Enterprise</strong></td>
        <td>€74.860</td>
        <td>Ancora licenza-only, più setup e integrazione a parte.</td>
      </tr>
      <tr>
        <td><strong>Business Central Premium</strong></td>
        <td>€78.425</td>
        <td>ERP-only, più alto del tuo ricorrente.</td>
      </tr>
      <tr class="highlight">
        <td><strong>Formicanera · anno 1</strong></td>
        <td><strong>€84.000</strong></td>
        <td><strong>Difendibile come anno di setup + piattaforma pronta.</strong></td>
      </tr>
      <tr>
        <td><strong>Salesforce Pro Suite</strong></td>
        <td>€84.000</td>
        <td>Coincide con il tuo anno 1, ma è ancora licenza-only.</td>
      </tr>
      <tr>
        <td><strong>Salesforce Enterprise</strong></td>
        <td>€147.000</td>
        <td>Upper bound netto.</td>
      </tr>
    </tbody>
  </table>

  <div class="grid-2">
    <div class="card blue">
      <div class="card-title-line">
        <h4>Competitor da usare davvero</h4>
        <span class="tag direct">Diretti</span>
      </div>
      <ul>
        <li>Pepperi</li>
        <li>Skynamo</li>
        <li>OrderEase</li>
      </ul>
    </div>
    <div class="card blue">
      <div class="card-title-line">
        <h4>Competitor da usare come ancore</h4>
        <span class="tag anchor">Parziali</span>
      </div>
      <ul>
        <li>Delta Sales App</li>
        <li>RepMove</li>
        <li>Badger Maps</li>
        <li>Dynamics 365 Sales</li>
        <li>Salesforce</li>
      </ul>
    </div>
  </div>

  <div class="callout">
    <p><strong>Punto metodologico:</strong> Pepperi e OrderEase pubblicano prezzi di ingresso o base. Skynamo e ForceManager vanno su quotazione. Microsoft e Salesforce hanno listini leggibili, ma il loro costo reale per Komet cresce molto quando aggiungi progetto, parametrizzazione, rollout e integrazione ERP.</p>
  </div>
</div>

<div class="section page-break">
  <div class="kicker">Verdetto commerciale</div>
  <h2>Come Difendere Il Prezzo In Trattativa</h2>

  <div class="grid-2">
    <div class="card green">
      <div class="card-title-line">
        <h4>Cosa dire sul prezzo anno 1</h4>
        <span class="tag direct">Difendibile</span>
      </div>
      <ul class="tight">
        <li>Piattaforma verticale già pronta</li>
        <li>Integrazione Archibald già risolta</li>
        <li>Go-live rapido rispetto a un progetto da zero</li>
        <li>Supporto operativo incluso</li>
      </ul>
    </div>
    <div class="card red">
      <div class="card-title-line">
        <h4>Cosa non devi far passare</h4>
        <span class="tag risk">Rischio</span>
      </div>
      <ul class="tight">
        <li>“È solo un’app ordini”</li>
        <li>“È solo un frontend sopra l’ERP”</li>
        <li>“Possiamo confrontarla con un tool entry-level”</li>
      </ul>
    </div>
  </div>

  <div class="quote">
    <div class="quote-mark">“</div>
    <div class="quote-text">
      Komet non sta acquistando una semplice app ordini.
      Sta acquistando una piattaforma operativa già connessa ad Archibald,
      già pronta per la rete vendita, con costi e tempi che un terzo
      dovrebbe sostenere da zero.
    </div>
  </div>

  <h3>Dove Sta Il Vantaggio Vero</h3>
  <p class="lead" style="max-width:none;">
    Il differenziale principale di Formicanera non è il catalogo funzionale in sé.
    È il fatto che Komet non deve finanziare il reverse engineering di Archibald,
    non deve aspettare 12-18 mesi di progetto ad alto rischio, e non deve scoprire
    dopo l’acquisto che l’ultimo miglio ERP è la parte più costosa e fragile.
  </p>

  <div class="grid-3">
    <div class="card gold">
      <h4>Prezzo di mercato</h4>
      <p>Formicanera non è prezzata “da favore interno”, ma dentro il mercato delle piattaforme B2B integrate per field sales.</p>
    </div>
    <div class="card gold">
      <h4>Rischio evitato</h4>
      <p>Il costo evitato non è solo sulle licenze, ma sul progetto di integrazione Archibald che altri dovrebbero ancora costruire.</p>
    </div>
    <div class="card gold">
      <h4>TCO più basso</h4>
      <p>Anche quando un vendor parte più basso, il costo totale tende a salire con setup, customizzazioni, rollout e supporto.</p>
    </div>
  </div>

  <div class="callout navy">
    <p><strong>Formula finale da usare con Komet:</strong> se confrontate Formicanera con una semplice app ordini, il prezzo può sembrare alto. Se la confrontate con una piattaforma sales-ops realmente connessa al vostro ERP, il prezzo è allineato. Se aggiungete il fatto che l’integrazione Archibald è già pronta, il prezzo diventa competitivo.</p>
  </div>
</div>

<div class="last-page page-break">
  <div class="section">
    <div class="kicker">Fonti e uso</div>
    <h2>Fonti Pubbliche Verificate</h2>
    <p class="lead">Le fonti sotto sono quelle usate per costruire il benchmark e difendere il posizionamento prezzo in modo documentabile.</p>

    <div class="grid-2">
      <div class="card blue">
        <h4>Vendor / listini</h4>
        <ul class="tight">
          <li>Pepperi pricing</li>
          <li>Skynamo pricing</li>
          <li>OrderEase pricing</li>
          <li>OrderEase sales rep app</li>
          <li>Delta Sales App pricing</li>
          <li>RepMove pricing</li>
          <li>Sage Sales Management / ForceManager pricing</li>
          <li>Badger Maps pricing</li>
          <li>Microsoft Dynamics 365 Sales pricing</li>
          <li>Microsoft Dynamics 365 Business Central pricing update</li>
          <li>Salesforce Sales pricing</li>
        </ul>
      </div>
      <div class="card blue">
        <h4>Riferimenti di contesto</h4>
        <ul class="tight">
          <li>Komet shop ufficiale</li>
          <li>ECB reference exchange rates, 16 April 2026</li>
        </ul>
        <p style="margin-top:10px;">
          Cambio usato per le conversioni: <strong>1 EUR = 1,1782 USD</strong>.
        </p>
      </div>
    </div>

    <div class="callout">
      <p><strong>Uso consigliato:</strong> questo documento serve come allegato interno di preparazione commerciale o come base per una pagina comparativa dentro la proposta economica principale. Non va usato come listino ufficiale di terzi, ma come benchmark ragionato di mercato.</p>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:28%">Messaggio</th>
          <th style="width:72%">Formula pronta</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Posizionamento</strong></td>
          <td>Formicanera è una sales operations platform verticale per rete Komet, non una semplice app ordini.</td>
        </tr>
        <tr>
          <td><strong>Confronto corretto</strong></td>
          <td>I benchmark più vicini sono Pepperi, Skynamo e OrderEase; gli altri servono soprattutto come ancore di prezzo.</td>
        </tr>
        <tr>
          <td><strong>Difesa del prezzo</strong></td>
          <td>Il valore vero è che Archibald è già integrato: il software è pronto dove altri dovrebbero ancora aprire un progetto.</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="footer">
    <div class="footer-left">
      <img src="${logoSrc}" alt="Formicanera">
      <div>
        <div class="footer-brand">Formicanera</div>
        <div class="footer-sub">Benchmark competitor diretto e posizionamento prezzo · Komet Italia</div>
      </div>
    </div>
    <div class="footer-meta">
      Documento riservato · 17 aprile 2026<br>
      Preparato per uso commerciale interno<br>
      Tutti i prezzi terzi sono basati su fonti pubbliche verificate
    </div>
  </div>
</div>

</body>
</html>`;

const outputPath = join(__dirname, 'formicanera-benchmark-competitor-komet-2026-04-17.pdf');

async function generatePDF() {
  console.log('Avvio Puppeteer...');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    userDataDir: '/tmp/formicanera-benchmark-chrome-profile',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const page = await browser.newPage();
  console.log('Rendering HTML...');
  await page.emulateMediaType('print');
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 800));

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

generatePDF().catch((err) => {
  console.error('Errore:', err);
  process.exit(1);
});
