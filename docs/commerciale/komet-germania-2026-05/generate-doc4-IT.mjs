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
<title>Formicanera — Checklist Pre-Firma Contratto Komet</title>
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

/* ── CHECKLIST ── */
.phase{margin:24px 0;}
.phase-header{background:var(--navy);color:#fff;padding:12px 20px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;}
.phase-header .phase-icon{font-size:16pt;}
.phase-header .phase-title{font-size:11pt;font-weight:700;}
.phase-header .phase-subtitle{font-size:8.5pt;color:rgba(255,255,255,.55);margin-top:2px;}
.phase-body{border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;padding:16px 20px;}
.checklist-item{display:flex;align-items:flex-start;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);}
.checklist-item:last-child{border-bottom:none;}
.checkbox{width:18px;height:18px;border:2px solid var(--border);border-radius:3px;flex-shrink:0;margin-top:2px;}
.item-content{flex:1;}
.item-title{font-size:9.5pt;font-weight:600;color:var(--navy);margin-bottom:2px;}
.item-detail{font-size:8.5pt;color:var(--text-mid);line-height:1.5;}
.item-tag{display:inline-block;font-size:7pt;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:6px;vertical-align:middle;}
.tag-urgente{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;}
.tag-dipende{background:var(--gold-light);color:var(--navy);border:1px solid var(--gold-mid);}
.tag-medio{background:var(--green-light);color:var(--green);border:1px solid #a7f3d0;}
.alert-box{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 16px;margin:14px 0;}
.alert-box p{margin:0;font-size:8.5pt;color:#92400e;line-height:1.6;}

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
    <div class="cover-conf">Documento Personale — Riservato</div>
  </div>
  <div class="cover-main">
    <div class="cover-eyebrow">
      <div class="cover-eyebrow-line"></div>
      <div class="cover-eyebrow-text">Documento Personale — Riservato</div>
    </div>
    <div class="cover-title">Checklist<br>Pre-Firma<br><em>Contratto Komet</em></div>
    <div class="cover-desc">Tutto quello che devo fare prima, durante e dopo la firma del contratto con Komet Italia S.r.l. / Gebr. Brasseler GmbH &amp; Co. KG per la commercializzazione del software Formicanera.</div>
    <div class="cover-scope">
      <div class="cover-scope-item">Fase A — Prima dell'accettazione (già adesso, zero costi)</div>
      <div class="cover-scope-item">Fase B — Entro 48 ore dal "sì" formale</div>
      <div class="cover-scope-item">Fase C — Pre go-live (entro 8 settimane dalla firma)</div>
      <div class="cover-scope-item">Fase D — Medio termine (Q3 2026)</div>
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-meta-grid">
      <div class="cover-meta-item"><label>Preparato da</label><span>Francesco Formicola<br>Sviluppatore Formicanera</span></div>
      <div class="cover-meta-item"><label>Uso</label><span>Personale — Non distribuire</span></div>
      <div class="cover-meta-item"><label>Data</label><span>Maggio 2026</span></div>
      <div class="cover-meta-item"><label>Stato P.IVA</label><span>Non ancora aperta<br>(solo dopo conferma Komet)</span></div>
    </div>
  </div>
</div>

<!-- ══════════════════ FASE A ══════════════════ -->
<div class="section pb-before">
  <div class="alert-box">
    <p>⚠️ <strong>Stato attuale:</strong> Philipp Rovina (Gebr. Brasseler) è favorevole. Marcello Sabatino (Komet Italia) ha confermato interesse. Il contratto Fresis è stato verificato: attività autonoma con Komet è compatibile. Partita IVA da aprire SOLO dopo il "sì" formale — non prima.</p>
  </div>

  <div class="phase">
    <div class="phase-header">
      <div class="phase-icon">🔵</div>
      <div>
        <div class="phase-title">Fase A — Prima dell'accettazione <span class="item-tag tag-dipende">Puoi fare già adesso</span></div>
        <div class="phase-subtitle">Nessun costo, nessun impegno legale — preparazione e chiarimenti con Komet</div>
      </div>
    </div>
    <div class="phase-body">
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Concordare il canone mensile con Marcello <span class="item-tag tag-urgente">Bloccante</span></div>
          <div class="item-detail">Senza canone definito il contratto MSA non può essere firmato. Proposta attuale: €5.000/mese (€4.500 prepagato annuale). Discutere con Marcello e ottenere conferma scritta via email prima di procedere.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Chiarire chi firma il contratto: solo Komet Italia o anche Gebr. Brasseler?</div>
          <div class="item-detail">Se firma solo Komet Italia → foro competente italiano, nessun problema. Se firma anche Gebr. Brasseler → potrebbe servire addendum in diritto tedesco e il foro cambia. Da chiarire con Marcello via email prima di stampare i contratti.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Ottenere dati legali completi di Komet Italia</div>
          <div class="item-detail">Necessari per compilare MSA e DPA: P.IVA, ragione sociale completa, indirizzo sede legale, email DPO (se nominato). Mandare email a Marcello chiedendo i dati ufficiali.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Richiedere autorizzazione scritta Komet Italia per uso sistema Formicanera</div>
          <div class="item-detail">Art. 2 lett. m) del contratto di agenzia di Biagio dice che l'agente non può avvalersi di collaboratori senza consenso scritto. Francesco è il figlio di Biagio e ha sviluppato il sistema. Serve una email/lettera da Komet Italia che autorizzi esplicitamente l'uso del sistema e la collaborazione di Francesco.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Verificare chi gestisce l'ERP Archibald: Komet Italia o Gebr. Brasseler?</div>
          <div class="item-detail">Nel contratto di agenzia l'ERP è descritto come "sistema fornito dalla Preponente". Devo sapere se è gestito direttamente da Komet Italia o è un sistema del gruppo tedesco — questo impatta un paragrafo del DPA in cui descrivo come interagiamo con il sistema.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Proporre e concordare foro competente</div>
          <div class="item-detail">Opzioni: Napoli (mia sede), arbitrato CAM Milano (neutrale). Proposta: arbitrato CAM Milano — più neutrale e accettabile per entrambe le parti. Da concordare con Komet prima della firma.</div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ══════════════════ FASE B ══════════════════ -->
<div class="section pb-before">
  <div class="phase">
    <div class="phase-header">
      <div class="phase-icon">🟠</div>
      <div>
        <div class="phase-title">Fase B — Entro 48 ore dal "sì" formale <span class="item-tag tag-urgente">Solo dopo conferma Komet</span></div>
        <div class="phase-subtitle">Apertura P.IVA e preparazione contratti — da fare immediatamente dopo l'accettazione</div>
      </div>
    </div>
    <div class="phase-body">
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Aprire Partita IVA individuale <span class="item-tag tag-urgente">Primo step assoluto</span></div>
          <div class="item-detail"><strong>Come:</strong> Fisconline.agenziaentrate.gov.it con SPID → modello AA9/12 → ATECO 62.01.09 (Produzione di software non connesso all'editoria) → Regime forfettario (25% di imposta sostitutiva su 40% del reddito = effettiva al 10% del fatturato). Tempo: 1–3 giorni lavorativi. <strong>NON aprire prima del sì formale.</strong></div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Compilare tutti i placeholder nei contratti (MSA, DPA, SLA)</div>
          <div class="item-detail">I 3 contratti in docs/contracts/ hanno placeholder da compilare. Sessione stimata: 2 ore. Aprire ogni file, cercare [DA INSERIRE] o [PLACEHOLDER] e compilare con i dati di Komet ottenuti nella Fase A.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Definire data decorrenza contratto</div>
          <div class="item-detail">Proposta: 1° giugno 2026 o 1° luglio 2026 (dipende dalla velocità di firma). La data decorrenza determina l'inizio della fatturazione. Concordare con Marcello.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Inviare bozze MSA + DPA a Komet per revisione legale</div>
          <div class="item-detail">Mandare i documenti compilati al referente Komet (Marcello + ufficio legale) almeno 5 giorni lavorativi prima della firma. Attendere eventuali richieste di modifica.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Stampare 2 copie di MSA + DPA in versione finale</div>
          <div class="item-detail">Stampare dopo l'approvazione di Komet, non prima. Portare entrambe le copie alla firma. Ogni parte firma entrambe le copie.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Consultare commercialista per gestione P.IVA forfettaria</div>
          <div class="item-detail">Chiedere: come fatturare a Komet Italia (ritenuta d'acconto 20% se committente italiano), registrazione fatture, versamenti INPS gestione separata, obblighi dichiarativi. Entro fine mese dopo apertura P.IVA.</div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ══════════════════ FASE C + D ══════════════════ -->
<div class="section pb-before">
  <div class="phase">
    <div class="phase-header">
      <div class="phase-icon">🟡</div>
      <div>
        <div class="phase-title">Fase C — Pre go-live <span class="item-tag tag-dipende">Entro 8 settimane dalla firma</span></div>
        <div class="phase-subtitle">Adempimenti tecnici e legali obbligatori prima dell'attivazione del servizio</div>
      </div>
    </div>
    <div class="phase-body">
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">DPIA screening (10 domande) <span class="item-tag tag-urgente">Obbligatorio GDPR</span></div>
          <div class="item-detail">Template già disponibile in docs/plans/. Stima: 30 minuti. Conclusione probabile: DPIA non obbligatoria (trattamento B2B, nessuna categoria particolare di dati). Ma il processo va comunque documentato.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Redigere Registro dei Trattamenti come Responsabile (Art. 30.2 GDPR)</div>
          <div class="item-detail">Template già disponibile. Stima: 1 ora. Documento di 1 pagina che descrive cosa trattiamo per conto di Komet. Obbligatorio come Responsabile del Trattamento.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Distribuire informativa privacy agli agenti Komet (Art. 13 GDPR)</div>
          <div class="item-detail">Già pronta in docs/contracts/informativa-privacy-utenti.md. Inviare via email a tutti gli agenti che accedono alla piattaforma prima del go-live. Conservare prova di invio.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Configurare infrastruttura dedicata rete Komet</div>
          <div class="item-detail">Provisioning VPS dedicato (o namespace separato), configurazione dominio/subdomain, import anagrafica clienti Komet, test credenziali ERP agenti, verifica backup automatico verso Hetzner Object Storage.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Setup MFA per tutti gli account amministratori</div>
          <div class="item-detail">Account admin Komet deve avere MFA TOTP attivo prima del go-live. Verificare funzionamento con test su staging.</div>
        </div>
      </div>
    </div>
  </div>

  <div class="phase" style="margin-top:24px;">
    <div class="phase-header">
      <div class="phase-icon">🟢</div>
      <div>
        <div class="phase-title">Fase D — Medio termine <span class="item-tag tag-medio">Q3 2026</span></div>
        <div class="phase-subtitle">Consolidamento legale, assicurativo e tecnico post go-live</div>
      </div>
    </div>
    <div class="phase-body">
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Valutare apertura SRLS per housing del software</div>
          <div class="item-detail">La SRLS dà: liability protection (la responsabilità è della società, non personale), credibilità corporate verso clienti futuri, ottimizzazione fiscale a lungo termine. Costo: ~€500–1.000 notaio + commercialista. Valutare entro Q3 2026 con consulente.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Pianificare penetration test (concordato nel SLA con Komet)</div>
          <div class="item-detail">Il SLA include un placeholder per penetration test. Concordare con Komet: è obbligatorio o raccomandazione? Se obbligatorio, pianificare per Q3 2026 con un provider specializzato.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Valutare polizza cyber risk</div>
          <div class="item-detail">Copertura per responsabilità contrattuale verso Komet in caso di data breach. Importo minimo consigliato: €500.000. Verificare con broker assicurativo specializzato in IT.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Verifica NIS2: rientro come "soggetto importante"?</div>
          <div class="item-detail">D.Lgs. 138/2024 (recepimento NIS2). Verificare con consulente specializzato se come fornitore ICT di Komet rientro nella categoria "soggetto importante". Probabilmente non applicabile come persona fisica con un solo cliente, ma meglio verificare formalmente.</div>
        </div>
      </div>
      <div class="checklist-item">
        <div class="checkbox"></div>
        <div class="item-content">
          <div class="item-title">Analisi del rischio NIS2 formale</div>
          <div class="item-detail">Documento separato dal DPIA screening. Da fare post-go-live quando il servizio è operativo. Template e istruzioni già in docs/compliance/.</div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ══════════════════ FOOTER ══════════════════ -->
<div class="doc-footer">
  <div class="footer-left">
    <img src="${logoSrc}" class="footer-logo" alt="Formicanera">
    <div>
      <div class="footer-brand">Formicanera</div>
      <div class="footer-sub">Checklist personale pre-firma contratto Komet</div>
    </div>
  </div>
  <div class="footer-meta">
    Documento personale — Non distribuire<br>
    Formicola Francesco — Maggio 2026<br>
    Riservato
  </div>
</div>

</body>
</html>`;

async function generatePDF() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-web-security'],
  });
  const page = await browser.newPage();
  await page.emulateMediaType('print');
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.pdf({
    path: join(__dirname, 'doc4-checklist-personale-IT.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  await browser.close();
  console.log('✅ PDF generato: doc4-checklist-personale-IT.pdf');
}

generatePDF().catch(err => { console.error('Errore:', err); process.exit(1); });
