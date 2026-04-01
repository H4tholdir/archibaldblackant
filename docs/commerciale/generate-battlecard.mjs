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
<title>Formicanera — Battle Card Komet</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
:root{
  --navy:#1a1a2e;--navy2:#16213e;--navy3:#0f3460;
  --gold:#c8a96e;--gold-light:#f5edd8;
  --text:#2d2d2d;--text-mid:#4b5563;--text-light:#6b7280;
  --border:#e5e7eb;--bg:#f9fafb;
  --green:#059669;--green-light:#ecfdf5;
  --red:#dc2626;--red-light:#fef2f2;--red-border:#fca5a5;
  --yellow:#d97706;--yellow-light:#fffbeb;
}
@page{margin:0;}
html,body{font-family:'Inter',-apple-system,sans-serif;color:var(--text);background:#fff;font-size:10pt;line-height:1.65;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
.pb-before{break-before:page;page-break-before:always;}
h1,h2,h3{break-after:avoid;page-break-after:avoid;}
h1{font-size:16pt;font-weight:800;color:var(--navy);padding-bottom:9px;border-bottom:2.5px solid var(--gold);margin-bottom:16px;}
h2{font-size:11.5pt;font-weight:700;color:var(--navy);margin-top:20px;margin-bottom:10px;}
p{margin-bottom:10px;line-height:1.7;}
ul{margin-left:18px;margin-bottom:10px;}
li{margin-bottom:4px;line-height:1.6;}
strong{font-weight:700;color:var(--navy);}

/* ── COVER ── */
.cover{
  width:100%;min-height:297mm;
  background:linear-gradient(150deg,#1a0a0a 0%,#3d0f0f 50%,#1a1a2e 100%);
  display:flex;flex-direction:column;justify-content:space-between;
  padding:52px 64px;position:relative;overflow:hidden;
  break-after:page;page-break-after:always;
}
.cover::before{content:'';position:absolute;top:-100px;right:-100px;width:480px;height:480px;border-radius:50%;background:radial-gradient(circle,rgba(220,38,38,.15) 0%,transparent 68%);}
.cover::after{content:'';position:absolute;bottom:-80px;left:-80px;width:380px;height:380px;border-radius:50%;background:radial-gradient(circle,rgba(200,169,110,.07) 0%,transparent 68%);}
.cover-top{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;}
.cover-logo-wrap{display:flex;align-items:center;gap:14px;}
.cover-logo-img{width:56px;height:56px;object-fit:contain;filter:drop-shadow(0 4px 12px rgba(0,0,0,.5));}
.cover-brand{font-size:10pt;font-weight:300;color:rgba(255,255,255,.4);letter-spacing:4px;text-transform:uppercase;}
.cover-int-badge{background:rgba(220,38,38,.25);border:1px solid rgba(220,38,38,.5);color:#fca5a5;font-size:7.5pt;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:5px 14px;border-radius:3px;}
.cover-main{position:relative;z-index:1;flex:1;display:flex;flex-direction:column;justify-content:center;padding:60px 0 40px;}
.cover-pretitle{font-size:8pt;font-weight:700;color:var(--red);letter-spacing:3px;text-transform:uppercase;margin-bottom:16px;}
.cover-divider{width:48px;height:3px;background:var(--red);margin-bottom:24px;border-radius:2px;}
.cover-title{font-family:'Playfair Display',Georgia,serif;font-size:44pt;font-weight:800;color:#fff;line-height:1.1;margin-bottom:10px;}
.cover-subtitle{font-size:13pt;font-weight:300;color:rgba(255,255,255,.55);margin-bottom:32px;}
.cover-warn{background:rgba(220,38,38,.12);border:1px solid rgba(220,38,38,.3);border-radius:6px;padding:14px 18px;max-width:520px;}
.cover-warn p{font-size:8.5pt;color:rgba(255,255,255,.65);margin:0;line-height:1.6;}
.cover-warn strong{color:#fca5a5;}
.cover-bottom{position:relative;z-index:1;border-top:1px solid rgba(255,255,255,.1);padding-top:22px;}
.cover-meta-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;}
.cover-meta-item label{font-size:7pt;color:rgba(255,255,255,.3);letter-spacing:2px;text-transform:uppercase;display:block;margin-bottom:4px;}
.cover-meta-item span{font-size:9.5pt;color:rgba(255,255,255,.7);font-weight:500;}

/* ── SECTION ── */
.section{padding:36px 64px 28px;}

/* ── PROFILE CARDS ── */
.profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0;}
.profile-card{border-radius:10px;padding:18px 20px;}
.profile-card.ceo{background:var(--navy);color:#fff;border-left:4px solid var(--gold);}
.profile-card.cfo{background:var(--bg);border:1px solid var(--border);border-left:4px solid var(--blue, #3b82f6);}
.profile-role{font-size:7.5pt;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;}
.profile-card.ceo .profile-role{color:var(--gold);}
.profile-card.cfo .profile-role{color:#3b82f6;}
.profile-title{font-size:11pt;font-weight:800;margin-bottom:10px;}
.profile-card.ceo .profile-title{color:#fff;}
.profile-card.cfo .profile-title{color:var(--navy);}
.profile-focus{font-size:8.5pt;margin-bottom:8px;line-height:1.5;}
.profile-card.ceo .profile-focus{color:rgba(255,255,255,.7);}
.profile-card.cfo .profile-focus{color:var(--text-mid);}
.profile-msg{background:rgba(255,255,255,.08);border-radius:5px;padding:10px 12px;font-size:8.5pt;font-style:italic;line-height:1.5;}
.profile-card.ceo .profile-msg{color:rgba(255,255,255,.85);}
.profile-card.cfo .profile-msg{background:rgba(59,130,246,.07);color:var(--text);}

/* ── SCRIPT BOX ── */
.script-box{background:var(--navy);border-radius:8px;padding:20px 24px;margin:16px 0;}
.script-label{font-size:7pt;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:10px;display:flex;align-items:center;gap:8px;}
.script-label::before{content:'🎙';font-size:10pt;}
.script-text{font-size:10pt;color:rgba(255,255,255,.9);line-height:1.75;font-style:italic;}
.script-text strong{color:var(--gold);font-style:normal;}
.script-pause{display:inline-block;background:rgba(200,169,110,.2);border-radius:3px;padding:1px 7px;font-size:7.5pt;font-style:normal;color:var(--gold);margin:0 4px;vertical-align:middle;}

/* ── WALKTHROUGH ── */
.wt-item{border:1px solid var(--border);border-radius:8px;padding:14px 18px;margin-bottom:10px;border-left:3px solid var(--gold);}
.wt-section{font-size:7.5pt;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;}
.wt-say{font-size:9.5pt;color:var(--text);line-height:1.6;}
.wt-note{font-size:8.5pt;color:var(--text-light);margin-top:6px;padding-top:6px;border-top:1px solid var(--border);line-height:1.5;}

/* ── OBIEZIONI ── */
.obj-item{margin-bottom:14px;break-inside:avoid-page;}
.obj-q{background:var(--red-light);border-left:4px solid var(--red);border-radius:0 6px 0 0;padding:11px 16px;}
.obj-q p{font-size:9.5pt;font-weight:600;color:var(--red);margin:0;}
.obj-a{background:var(--green-light);border-left:4px solid var(--green);border-radius:0 0 6px 0;padding:11px 16px;}
.obj-a p{font-size:9.5pt;color:var(--text);margin:0;line-height:1.6;}
.obj-a strong{color:var(--green);}

/* ── MAPPA NEGOZIALE ── */
.nego-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:16px 0;}
.nego-box{border-radius:8px;padding:16px 18px;}
.nego-box.green{background:var(--green-light);border:1px solid #86efac;}
.nego-box.red{background:var(--red-light);border:1px solid var(--red-border);}
.nego-box.yellow{background:var(--yellow-light);border:1px solid #fde68a;}
.nego-label{font-size:7.5pt;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:6px;}
.nego-box.green .nego-label{color:var(--green);}
.nego-box.red .nego-label{color:var(--red);}
.nego-box.yellow .nego-label{color:var(--yellow);}
.nego-box ul{list-style:none;margin:0;}
.nego-box li{font-size:8.5pt;padding:4px 0;border-bottom:1px solid rgba(0,0,0,.06);line-height:1.45;}
.nego-box li:last-child{border-bottom:none;}

/* ── CLOSING ── */
.closing-box{background:var(--navy);border-radius:10px;padding:22px 26px;margin:16px 0;}
.closing-label{font-size:7pt;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:10px;display:flex;align-items:center;gap:8px;}
.closing-label::before{content:'🏁';font-size:10pt;}
.closing-text{font-size:10.5pt;color:#fff;line-height:1.75;font-style:italic;}
.closing-text strong{color:var(--gold);font-style:normal;}
.closing-if{background:rgba(255,255,255,.06);border-radius:6px;padding:12px 16px;margin-top:14px;}
.closing-if-label{font-size:7.5pt;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;}
.closing-if-text{font-size:9.5pt;color:rgba(255,255,255,.8);font-style:italic;line-height:1.6;}

/* ── CHECKLIST ── */
.checklist{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0;}
.check-item{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 14px;display:flex;align-items:center;gap:10px;font-size:9pt;}
.check-box{width:16px;height:16px;border:2px solid var(--border);border-radius:3px;flex-shrink:0;}

/* ── FOOTER ── */
.doc-footer{
  background:var(--navy);
  padding:20px 64px;
  display:flex;justify-content:space-between;align-items:center;
}
.footer-wordmark{font-size:11pt;font-weight:800;color:#fff;letter-spacing:.5px;}
.footer-wordmark span{color:var(--gold);}
.footer-tagline{font-size:7.5pt;color:rgba(255,255,255,.35);margin-top:3px;}
.footer-meta{font-size:7pt;color:rgba(255,255,255,.3);text-align:right;line-height:1.9;}
.footer-red{color:#fca5a5;font-weight:600;}
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
    <div class="cover-int-badge">⚠ Uso Interno — Non Distribuire</div>
  </div>
  <div class="cover-main">
    <div class="cover-pretitle">Battle Card · Preparazione Call</div>
    <div class="cover-divider"></div>
    <div class="cover-title">Proposta<br>Komet Italia</div>
    <div class="cover-subtitle">Script, Obiezioni e Strategia Negoziale</div>
    <div class="cover-warn">
      <p><strong>Documento riservato.</strong> Contiene la strategia negoziale, i numeri walk-away e gli script di chiusura. Non lasciare in vista durante la call. Non distribuire.</p>
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-meta-grid">
      <div class="cover-meta-item">
        <label>Preparato per</label>
        <span>Francesco Formicola<br>Fondatore, Formicanera</span>
      </div>
      <div class="cover-meta-item">
        <label>Interlocutori</label>
        <span>CEO + CFO<br>Komet Italia S.r.l.</span>
      </div>
      <div class="cover-meta-item">
        <label>Obiettivo</label>
        <span>Commitment a procedere<br>Apertura €5.000 · Target €3.900/mese</span>
      </div>
    </div>
  </div>
</div>

<!-- ══════════════════ PAG 2: OBIETTIVO + PROFILI + APERTURA ══════════════════ -->
<div class="section pb-before">
  <h1>Obiettivo della Call</h1>
  <p>Non devi uscire da questa call con una firma — devi uscire con un <strong>commitment chiaro a procedere</strong>: accordo sul piano, disponibilità a calendarizzare il passo successivo (DPA + contratto). La firma arriva dopo.</p>
  <p style="background:var(--gold-light);border-left:3px solid var(--gold);padding:10px 14px;border-radius:0 5px 5px 0;font-size:9.5pt;margin-bottom:0;"><strong>Successo:</strong> &ldquo;Ok, andiamo avanti. Fateci avere il DPA e il contratto da esaminare.&rdquo;<br><strong>Fallimento:</strong> la call finisce senza una direzione chiara — non si rifiutano ma non si impegnano. Spingi per un next step concreto.</p>

  <h1 style="margin-top:28px;">Chi Hai Davanti</h1>
  <div class="profile-grid">
    <div class="profile-card ceo">
      <div class="profile-role">CEO</div>
      <div class="profile-title">Vuole scala e visione</div>
      <div class="profile-focus">Pensa a: adozione di rete, standardizzazione dei processi, vantaggio competitivo, immagine moderna di Komet Italia verso gli agenti.</div>
      <div class="profile-msg">Il tuo messaggio: <em>"70 agenti che lavorano tutti allo stesso modo, con gli stessi dati, in tempo reale — questo è quello che vi do."</em></div>
    </div>
    <div class="profile-card cfo">
      <div class="profile-role">CFO</div>
      <div class="profile-title">Vuole numeri e rischio controllato</div>
      <div class="profile-focus">Pensa a: costo totale (TCO), ROI misurabile, SLA e penali, protezione IP, GDPR, termini di uscita dal contratto.</div>
      <div class="profile-msg">Il tuo messaggio: <em>"€3.900/mese, ROI al terzo mese, SLA scritto, IP resta vostro sui dati, DPA firmato prima del go-live."</em></div>
    </div>
  </div>

  <h1 style="margin-top:28px;">Script di Apertura</h1>
  <div class="script-box">
    <div class="script-label">Parola per parola — Primi 3 minuti</div>
    <div class="script-text">
      "Buongiorno a entrambi, grazie per il tempo. <span class="script-pause">pausa</span> Ho preparato una proposta che va dritta ai numeri, perché credo che il valore di questa piattaforma si spieghi meglio con i dati che con le parole.<br><br>
      Formicanera è già in produzione — non è un prototipo, non è una demo. Ogni funzione che vedrete nella proposta è già usata ogni giorno su ordini reali. <span class="script-pause">pausa</span><br><br>
      Il punto di partenza è questo: <strong>quanto tempo perde oggi un agente per piazzare un ordine sull'ERP?</strong> 15, 20 minuti? Con Formicanera sono 3-5, e l'agente non apre neanche l'ERP — ci pensa il sistema in modo asincrono mentre lui è già dal cliente successivo. <span class="script-pause">pausa</span><br><br>
      Su 70 agenti, 3 ordini al giorno, 250 giorni lavorativi: stiamo parlando di <strong>oltre 13.000 ore recuperate solo sull'inserimento ordini — quasi 20.000 se contiamo documenti e coordinamento</strong>. Posso mostrarvi la proposta?"
    </div>
  </div>
</div>

<!-- ══════════════════ PAG 3: WALKTHROUGH PROPOSTA ══════════════════ -->
<div class="section pb-before">
  <h1>Walkthrough della Proposta</h1>
  <p>Per ogni sezione del documento che consegni, ecco cosa dire. Mantieni il ritmo — non leggere, racconta.</p>

  <div class="wt-item">
    <div class="wt-section">§1 — Perimetro del servizio</div>
    <div class="wt-say">"Tutto quello che serve per far funzionare la piattaforma è incluso nel canone — hosting, manutenzione, bot ERP, supporto, onboarding. Non ci sono sorprese nascoste. Quello che non è incluso è lo sviluppo di nuove funzionalità personalizzate, che gestiamo a preventivo concordato a €75/ora."</div>
    <div class="wt-note">💡 Se chiedono cosa significa "bot ERP": "È il sistema che inserisce automaticamente gli ordini nell'ERP Archibald al posto dell'agente — lui compila l'ordine sul telefono, il bot lo inserisce in Archibald senza che l'agente debba aprire il gestionale."</div>
  </div>

  <div class="wt-item">
    <div class="wt-section">§2 — Piani e prezzi</div>
    <div class="wt-say">"Il canone mensile è <strong>€5.000</strong> — il prezzo che il mercato applica per soluzioni comparabili, come vedete nella ricerca. Il setup una tantum è <strong>€30.000</strong> in due tranche. Se pagate il canone annualmente in anticipo, applico il 10% di sconto: <strong>€4.500 al mese effettivi</strong>."</div>
    <div class="wt-note">💡 Presenta prima il listino €5.000 — fa sembrare €4.500 già uno sconto reale. Non entrare tu nel merito della negoziazione: aspetta che siano loro a chiedere.</div>
  </div>

  <div class="wt-item">
    <div class="wt-section">§3 — SLA</div>
    <div class="wt-say">"Uptime garantito al 99,5%. Se il sistema ha un incidente critico — piattaforma giù o bot bloccato — rispondo entro 4 ore lavorative. Per il supporto ordinario, entro la giornata. Tutto scritto e vincolante in contratto."</div>
    <div class="wt-note">💡 Al CFO: "La penale per mancato SLA è un credito proporzionale sul canone mensile — è nel documento."</div>
  </div>

  <div class="wt-item">
    <div class="wt-section">§4 — Termini contrattuali</div>
    <div class="wt-say">"Contratto 24 mesi, rinnovo automatico. I dati di Komet restano di Komet — esportabili in qualsiasi momento, eliminati entro 60 giorni dalla cessazione. L'IP della piattaforma rimane mio. Prima del go-live firmiamo il DPA GDPR — i dati risiedono in Germania, nessun trasferimento extra-UE."</div>
  </div>

  <div class="wt-item">
    <div class="wt-section">§5 — Timeline + Prossimi passi</div>
    <div class="wt-say">"Dall'ok alla firma al go-live completo: 8 settimane. Settimane 1-4: setup e test integrazione ERP. Settimane 5-6: formazione e pilota con 10-15 agenti. Settimane 7-8: rollout completo della rete. Il prossimo passo concreto è calendarizzare l'incontro con il vostro DPO per il DPA."</div>
    <div class="wt-note">💡 Questa è la tua closing move — proponi sempre un next step concreto, non "ci pensiamo e vi ricontatteremo".</div>
  </div>
</div>

<!-- ══════════════════ PAG 4: LE 5 OBIEZIONI ══════════════════ -->
<div class="section pb-before">
  <h1>Le 5 Obiezioni — Risposta Pronta</h1>

  <div class="obj-item">
    <div class="obj-q"><p>❓ "Sei solo tu? Non abbiamo garanzie di continuità."</p></div>
    <div class="obj-a"><p>"Il vantaggio è avere accesso diretto al fondatore in ogni momento — non passate attraverso un call center o un account manager che non conosce il codice. <strong>Ogni problema arriva a me, entro ore.</strong> Detto questo: l'architettura è documentata e progettata per essere manutenibile. E nel contratto è inclusa una clausola di escrow del codice sorgente su richiesta."</p></div>
  </div>

  <div class="obj-item">
    <div class="obj-q"><p>❓ "Il prezzo è troppo alto."</p></div>
    <div class="obj-a"><p>"Capisco. Facciamo due conti: <strong>€4.500 al mese per 70 agenti fa €64 per agente al mese.</strong> Ogni agente recupera in media 3–4 ore a settimana, a €35/ora = €420–560 al mese per agente. Il sistema si ripaga <strong>in meno di 2 settimane di utilizzo</strong>. In un anno recupera produttività per circa €700.000. Quale altro investimento IT vi dà questo in 8 settimane?"</p></div>
  </div>

  <div class="obj-item">
    <div class="obj-q"><p>❓ "Vogliamo aspettare / valutiamo altre soluzioni."</p></div>
    <div class="obj-a"><p>"Rispetto la prudenza. Vi dico solo che ogni mese di attesa ha un costo reale: €700.000 di valore annuale / 12 mesi = <strong>circa €58.000 di produttività non recuperata per ogni mese che aspettate.</strong> Ogni mese di ritardo vale 13 volte il canone mensile. Non esiste alternativa sul mercato con questa integrazione già funzionante — costruirla da zero richiede 18 mesi e €220.000+."</p></div>
  </div>

  <div class="obj-item">
    <div class="obj-q"><p>❓ "Preferiamo 12 mesi, non 24."</p></div>
    <div class="obj-a"><p>"Nessun problema — 12 mesi si può fare. <strong>In quel caso il canone rimane €5.000 al mese</strong>, senza lo sconto prepagato. Se volete 24 mesi con pagamento annuale anticipato, applico il −10% e il canone effettivo è €4.500/mese. La scelta è vostra — ma il 24 mesi vi dà più stabilità di pianificazione e un risparmio reale di €6.000 l'anno."</p></div>
  </div>

  <div class="obj-item">
    <div class="obj-q"><p>❓ "Abbiamo dubbi su GDPR e sicurezza."</p></div>
    <div class="obj-a"><p>"È una domanda giusta e ce l'aspettavamo. I dati risiedono <strong>esclusivamente su server in Germania</strong> — zero trasferimenti extra-UE, Art. 44 GDPR. Firmiamo un DPA ai sensi dell'Art. 28 prima del go-live, basato sulle Clausole Contrattuali Tipo della Commissione Europea. Abbiamo già un piano di hardening tecnico pre-launch documentato. <strong>Se volete, lo esaminiamo insieme con il vostro DPO</strong> — proporrei di farlo come prossimo step."</p></div>
  </div>
</div>

<!-- ══════════════════ PAG 5: ANALISI ECONOMICA PER LA NEGOZIAZIONE ══════════════════ -->
<div class="section pb-before">
  <h1>Il Tuo Vantaggio — Analisi Economica</h1>
  <p>Questa sezione è solo per te. Conoscere i tuoi numeri ti permette di negoziare da una posizione solida.</p>

  <h2>Il Tuo P&L Reale</h2>
  <div class="nego-grid" style="grid-template-columns:1fr 1fr;margin:12px 0 8px;">
    <div class="nego-box green">
      <div class="nego-label">💰 Anno 1 (con setup)</div>
      <ul>
        <li>Setup incassato: <strong>+€30.000</strong></li>
        <li>Canone prepagato annuale: <strong>+€54.000</strong></li>
        <li>Infrastruttura VPS + domini: −€900</li>
        <li style="border-top:1px solid rgba(0,0,0,.1);padding-top:6px;margin-top:4px;font-weight:800;color:var(--navy);">Incasso netto: €83.100</li>
      </ul>
    </div>
    <div class="nego-box green">
      <div class="nego-label">📅 Anno 2+ (regime)</div>
      <ul>
        <li>Canone prepagato: <strong>+€54.000/anno</strong></li>
        <li>Infrastruttura: −€900</li>
        <li>Costo marginale aggiuntivo: <strong>~€0</strong></li>
        <li style="border-top:1px solid rgba(0,0,0,.1);padding-top:6px;margin-top:4px;font-weight:800;color:var(--navy);">Margine netto: ~€53.100/anno</li>
      </ul>
    </div>
  </div>
  <div class="wt-note" style="margin-bottom:14px;">La piattaforma esiste già — il costo marginale reale è quasi zero. Il tuo unico "costo" è il tempo che già spendi ogni giorno.</div>

  <h2>LTV Contratto Komet</h2>
  <div class="nego-grid" style="margin:12px 0 8px;">
    <div class="nego-box green">
      <div class="nego-label">📈 3 anni</div>
      <ul><li>€30k + €54k × 3 = <strong style="font-size:11pt;">€192.000</strong></li></ul>
    </div>
    <div class="nego-box" style="background:var(--navy);border:1px solid var(--gold);">
      <div class="nego-label" style="color:var(--gold);">⭐ 5 anni (scenario base)</div>
      <ul><li style="color:rgba(255,255,255,.85);">€30k + €54k × 5 = <strong style="font-size:11pt;color:var(--gold);">€300.000</strong></li></ul>
    </div>
    <div class="nego-box green">
      <div class="nego-label">📈 7 anni</div>
      <ul><li>€30k + €54k × 7 = <strong style="font-size:11pt;">€408.000</strong></li></ul>
    </div>
  </div>
  <div class="wt-note" style="margin-bottom:14px;">Non incluso: sviluppo extra (€75/h), utenti aggiuntivi (€35/mese oltre 80), eventuali ampliamenti contrattuali.</div>

  <h2>Il Costo del Ritardo — La Tua Leva più Forte</h2>
  <div class="obj-item" style="margin-bottom:14px;">
    <div class="obj-q"><p>❓ Ogni mese che Komet aspetta prima di firmare</p></div>
    <div class="obj-a">
      <p>€700.000 valore annuale ÷ 12 = <strong>€58.300/mese di produttività non recuperata.</strong><br>
      Ogni mese di "ci pensiamo" vale <strong>13 volte il canone mensile</strong>.<br><br>
      Script: <em>"Capisco, prendetevi il tempo necessario. Vi dico solo che ogni mese di attesa vale circa €58.000 in produttività non recuperata dalla rete — non è pressione, è un dato che conviene avere in testa mentre valutate."</em></p>
    </div>
  </div>

  <h2>La Regola d'Oro: Setup vs Mensile</h2>
  <div class="nego-grid" style="margin:12px 0 8px;">
    <div class="nego-box green">
      <div class="nego-label">🟢 Concedi sul setup</div>
      <ul>
        <li>−€3.000 setup = −€3.000 (una tantum)</li>
        <li>−€6.000 setup = −€6.000 (una tantum)</li>
        <li>Impatto su 5 anni: uguale alla perdita iniziale</li>
      </ul>
    </div>
    <div class="nego-box red">
      <div class="nego-label">🔴 Difendi il mensile</div>
      <ul>
        <li>−€100/mese = −€6.000 su 5 anni</li>
        <li>−€200/mese = −€12.000 su 5 anni</li>
        <li>−€500/mese = −€30.000 su 5 anni</li>
      </ul>
    </div>
  </div>
  <div class="callout" style="margin-top:0;">
    <p><strong>Ogni €100/mese ceduto = €6.000 persi su 5 anni.</strong> Il setup è una tantum — il mensile si moltiplica per ogni mese di contratto. Cedi sul setup quanto serve per chiudere, ma difendi il mensile come fosse la cosa più importante — perché lo è.</p>
  </div>
</div>

<!-- ══════════════════ PAG 6: MAPPA NEGOZIALE + CHIUSURA + CHECKLIST + FOOTER ══════════════════ -->
<div style="min-height:297mm;display:flex;flex-direction:column;break-before:page;page-break-before:always;">
  <div style="flex:1;padding:36px 64px 28px;">
    <h1>Mappa Negoziale</h1>
    <div class="nego-grid">
      <div class="nego-box green">
        <div class="nego-label">🟢 Concedi senza esitare</div>
        <ul>
          <li>Durata: da 24 a 12 mesi (a prezzo pieno €5.000)</li>
          <li>Setup: fino a −€6.000 (→ €24.000 min)</li>
          <li>Personalizzazioni onboarding minori</li>
          <li>Soglia utenti: +5-10 utenti inclusi</li>
          <li>SLA response time leggermente migliore</li>
        </ul>
      </div>
      <div class="nego-box red">
        <div class="nego-label">🔴 Non scendere mai</div>
        <ul>
          <li>Canone mensile sotto €3.000/mese</li>
          <li>Setup sotto €18.000</li>
          <li>Cessione IP della piattaforma</li>
          <li>Pagamenti oltre 60 giorni</li>
          <li>Tariffa evolutivo sotto €65/ora</li>
        </ul>
      </div>
      <div class="nego-box yellow">
        <div class="nego-label">🟡 Gestisci con attenzione</div>
        <ul>
          <li>Sconto >10% (solo su prepagato 2+ anni)</li>
          <li>SLA uptime 99.9% senza extra</li>
          <li>Clausole di uscita anticipata penalizzanti</li>
          <li>Integrazioni AX incluse nel canone</li>
          <li>Richiesta audit codice / pen test</li>
        </ul>
      </div>
    </div>

    <h1 style="margin-top:24px;">Script di Chiusura</h1>
    <div class="closing-box">
      <div class="closing-label">Frase finale — dopo aver presentato la proposta</div>
      <div class="closing-text">
        "Abbiamo visto i numeri, la struttura e le condizioni. <strong>La proposta è: €30.000 una tantum, €4.500 al mese con prepagato annuale — €5.000 se preferite mensile. Contratto 24 mesi.</strong> Il prossimo passo concreto è calendarizzare l'incontro con il vostro DPO per il DPA — così quando siete pronti per la firma avete già tutto allineato. <span class="script-pause" style="background:rgba(200,169,110,.15);color:var(--gold);">pausa</span> Come volete procedere?"
      </div>
      <div class="closing-if">
        <div class="closing-if-label">Se dicono "ci pensiamo"</div>
        <div class="closing-if-text">"Capisco. Propongo di fissare un secondo incontro entro due settimane — anche solo 30 minuti con il vostro team legale/IT per il DPA. Così non perdiamo slancio. Quando siete disponibili?"</div>
      </div>
    </div>

    <h1 style="margin-top:24px;">Post-Call — Checklist</h1>
    <div class="checklist">
      <div class="check-item"><div class="check-box"></div>Invia email riepilogativa entro 24h</div>
      <div class="check-item"><div class="check-box"></div>Allega PDF proposta commerciale</div>
      <div class="check-item"><div class="check-box"></div>Proponi data per incontro DPO/legale</div>
      <div class="check-item"><div class="check-box"></div>Follow-up a 7 giorni se nessuna risposta</div>
      <div class="check-item"><div class="check-box"></div>Prepara bozza DPA da mandare in anticipo</div>
      <div class="check-item"><div class="check-box"></div>Nota i punti aperti emersi in call</div>
    </div>
  </div>

  <div class="doc-footer" style="margin-top:auto;">
    <div>
      <div class="footer-wordmark">Formi<span>canera</span></div>
      <div class="footer-tagline">Battle Card · Uso Interno Esclusivo</div>
    </div>
    <div class="footer-meta">
      <span class="footer-red">⚠ Documento strettamente riservato</span><br>
      Non distribuire · Non lasciare in vista
    </div>
  </div>
</div>

</body>
</html>`;

const outputPath = join(__dirname, 'formicanera-battlecard-komet.pdf');

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
