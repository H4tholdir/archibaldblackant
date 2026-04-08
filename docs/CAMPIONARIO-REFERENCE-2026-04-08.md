# Komet Campionari — Reference per Riconoscimento Visivo
# Generato: 2026-04-08 — 165 immagini su VPS in /home/deploy/komet-campionari/

## Directory sul VPS
```
/home/deploy/komet-campionari/
  mtb566-diao/           (8 strip)   Diamantate DIAO
  mtb541-diamantate-ct/  (50 strip)  Diamantate + Frese CT studio
  mtb159-gommini-studio/ (8 strip)   Gommini Studio
  mtb372-sonico/         (10 strip)  Punte Soniche
  mtb450-ultrasoniche/   (7 strip)   Punte Ultrasoniche
  mtb524-endodonzia/     (23 img)    Endodonzia (strip + FQ + Procodile)
  mtb457-diamantate-lab/ (9 strip)   Diamantate Laboratorio HP (shank 104)
  mtb325-gommini-lab/    (13 strip)  Gommini Laboratorio
  mtb161-dischi-lab/     (10 strip)  Dischi Diamantati Laboratorio
  mtb335-fresaggio-lab/  (9 strip)   Fresaggio Laboratorio
  mtb137-frese-ct-lab/   (8 strip)   Frese CT Laboratorio
  mtb456-fresoni-lab/    (10 strip)  Fresoni Laboratorio
```

---

## MAPPATURA FAMIGLIE → IMMAGINI CAMPIONARIO

### Formato immagine MTB541 (studio FG/HP)
Ogni strip mostra: familia_code (es. 830) + size (es. 010) + dot colorato grana
- Verde = grana grossa (S = super grossa)
- Rosso = grana media (standard)
- Giallo = extra fine (EF)
- Bianco/cerchio = ultra fine (UF)

### Formato immagine MTB457 (lab HP, shank 104)
Ogni strip mostra: Größe (misura) | REF (familia) | Schaft (104=HP)

---

## FAMIGLIE CRITICHE PER RICONOSCIMENTO (HP shank 104)

### MTB457 strip 06 — LA STRISCIA CHIAVE per disambiguazione HP
Immagine: `mtb457-diamantate-lab/mtb457-particolare-06.jpg`
Famiglie visibili affiancate (tutte shank 104):
- 8860 (009) — fiamma corta fine
- 860 (010, 012, 016, 014, 018) — **FIAMMA CORTA** — conico continuo → punta acuta
- 862 (012, 016, 025) — **FIAMMA** — conico → punta acuta
- 863 (014) — **FIAMMA LUNGA** — conico continuo → punta acuta LUNGA ← critico
- 8867 (014) — fiamma variante
- 879 (014, 018, 023, 027) — **CHAMFER CILINDRICO LUNGO** — corpo PARALLELO → tip arrotondato ← critico
- 880 (020) — chamfer cilindrico corto testa tonda
- 892 (025) — oliva
- 368 (023) — football/oliva
- 379 (014) — oliva
- 390 (023, 016) — granata

### MTB457 strip 02 — Cono rovescio HP
Immagine: `mtb457-diamantate-lab/mtb457-particolare-02.jpg`
Famiglie visibili (tutte shank 104):
- 805 A (023) — variante
- **807** (016, 018, 023) — **CONO ROVESCIO LUNGO** — testa larga in cima, si restringe verso il manico ← critico
- 830 RL (023) — pera tonda
- 835 (010, 021) — cilindro corto
- 836 (012, 014, 027, 055) — cilindro
- 837 (014, 016) — cilindro
- 842 (018) / 842 R (018) — forme miste

### MTB457 strip 01 — Sfere HP
Immagine: `mtb457-diamantate-lab/mtb457-particolare-01.jpg`
- **801** (009-050) — **PALLINA/SFERA** — testa sferica uniforme
- 6801 (023, 029, 035) — pallina lunga
- 8801 (023) — pallina fine
- 805 (012) — cono rovescio corto

### MTB457 strip 03 — Conica/chamfer HP
Immagine: `mtb457-diamantate-lab/mtb457-particolare-03.jpg`
- **845** (010) — **CONICA CORTA TESTA PIATTA** (bordi arrotondati) ← chamfer conico corto
- **846** (025) — conica testa piatta L 6mm
- **847** (014, 018, 033, 040) — conica testa piatta L 8mm
- **848** (016, 018) — conica lunga testa piatta
- 849 (009, 010) — conica testa tonda corta
- 850 (016, 023, 025) — **conica lunga testa tonda**
- 855 (025, 033) — conica corta testa tonda
- 856 (040) — conica testa tonda
- 858 (014) / 859 (018) — **LANCIA** (separatori)

---

## VOCABOLARIO FORME (da testo ufficiale Komet MTB541)

| Codice IT | Forma | Descrizione tecnica | Note discriminanti |
|-----------|-------|--------------------|--------------------|
| **822** | Pera piccola | parte finale allargata, si stringe verso il collo | ibrido pallina-cilindro, L 2mm |
| **801** | Pallina | sferica uniforme | versatile, usabile con qualsiasi inclinazione |
| **802** | Pallina con collo | diamantatura estesa sul collo | collo diamantato visibile |
| **805** | Cono rovescio | base stretta → testa larga | INVERTITO rispetto alla fiamma |
| **807** | Cono rovescio lungo | come 805 ma più lungo | L più lunga, testa più larga |
| **813** | Clessidra | forma a clessidra | rastremato al centro |
| **830** | Pera | parte finale allargata | L 2,7mm standard |
| **835-842 KR** | Cilindro testa piatta (bordi arrotondati) | corpo cilindrico, testa piatta, KR=spigolo arrotondato | varie lunghezze 4-12mm |
| **845-848 KR** | Conica testa piatta (bordi arrotondati) | cono con testa piatta e spigoli arrotondati | dal corto (4mm) al lungo (10mm) |
| **845-848** | Conica testa piatta (spigoli vivi) | cono con testa piatta | senza bordi arrotondati |
| **849-850,855-856** | Conica testa tonda | cono che finisce arrotondato | "testa tonda" = rounded tip |
| **858-859** | Lancia | conico continuo → punta acuta, CORTA | Separierer, L 8-10mm |
| **860** | Fiamma corta | conico → punta acuta, corta | L 4-5mm |
| **862** | Fiamma | conico → punta acuta | L 8mm |
| **863** | Fiamma lunga | conico → punta acuta LUNGA | L 10mm ← il più lungo |
| **864** | Fiamma extralunga | conico → punta acuta | L 12mm |
| **876-877** | Chamfer cilindrico corto | corpo PARALLELO + tip chamfer | L 5-6mm |
| **878** | Chamfer cilindrico | corpo PARALLELO + tip chamfer | L 8mm |
| **879** | Chamfer cilindrico lungo | corpo PARALLELO + tip chamfer | L 10mm ← il più lungo |
| **876K-879K** | Chamfer conico | corpo CONICO (si restringe) + tip chamfer | diverso dal 879 che è parallelo! |
| **880-882** | Cilindro testa tonda | corpo PARALLELO + tip arrotondato ("testa tonda") | nessun chamfer, tip sferico |
| **883** | Fiammetta | fiamma piccola | L 3mm |
| **889** | Ago | agiforme | L 3,5-4mm |
| **892** | Oliva | forma ovale | uso occlusale |
| **368** | Football/oliva | forma ovale | uso occlusale/palatale |
| **379** | Oliva | ovale | uso occlusale |
| **390** | Granata | forma particolare | uso occlusale |

---

## REGOLE DI DISCRIMINAZIONE VISIVA

### 863 vs 879 (il caso più critico — HP studio)
```
863 (fiamma lunga):
  ✓ Corpo CONICO — si restringe CONTINUAMENTE dalla base alla punta
  ✓ Apice ACUTO, sottile come un ago
  ✓ Profilo: triangolo allungato △
  ✓ Lunghezza parte attiva: ~10mm
  ✗ NON ha sezione cilindrica parallela

879 (chamfer cilindrico lungo):
  ✓ Corpo CILINDRICO — sezione PARALLELA (stesso diametro per tutta la lunghezza)
  ✓ Tip a CHAMFER = arrotondato/smussato, NON appuntito
  ✓ Profilo: rettangolo con angolo smussato in cima ▬▬▬◥
  ✓ Lunghezza parte attiva: ~10mm
  ✗ NON ha la punta affilata
```

### 807 vs 863/879 (cono rovescio)
```
807 (cono rovescio lungo):
  ✓ INVERTITO — più LARGO in cima che alla base
  ✓ La parte attiva si allarga verso il tip (opposta alla fiamma)
  ✓ Profilo: trapezio con base larga in alto ▽
  ✗ Completamente diverso da flamme e torpedo
```

### 878K/879K vs 879 (chamfer conico vs cilindrico)
```
879K (chamfer conico):
  ✓ Corpo CONICO (si restringe verso la base, come un cono rovesciato)
  ✓ Tip chamfer/piatto
  Descritto da Komet come "Konische Hohlkehlenpräparation"

879 (chamfer CILINDRICO):
  ✓ Corpo PARALLELO (stesso diametro per tutta la lunghezza)
  ✓ Tip chamfer/arrotondato
  Descritto da Komet come "Parallele Hohlkehlenpräparation"
```

---

## MAPPA STRIP MTB541 PER FAMIGLIA (FG studio)

| Strip | Famiglie principali visibili |
|-------|------------------------------|
| 01 | 822, 6830, 830, 8830, 830EF, 8830, 830EF |
| 02 | 5830L, S6830L, 830L, 8830L, 830LEF, S6830RL, 830RL, 8830RL |
| 03 | 5801, 6801, S6801, 801 (palline) |
| 04 | 8801, 801EF, 801UF, S6801L, 825, H59, K59, H132A |
| 05 | ZR6801, ZR801L, ZR8801L, 6802, 802 |
| 06 | 6805, 805, 807, ZR6807, 6806, 806, 813 |
| 07 | 889M, 838M, 830M, 8830M, 953M, 8953M (mikropräparation) + Set4383 |
| 08 | 6835KR, S6835KR, 835KR, 8835KR, 835KREF |
| 09 | 6836KR, S6836KR, 836KR, 8836KR, S6837KR, 837KR, 837KREF, 842KR |
| 10 | S6845KR, 845KR, 8845KR, 845KREF, 846KR, 8846KR, 846KREF (PrepMarker) |
| 11 | S6847KR, 847KR, 8847KR, 847KREF |
| 12 | S6848KR, 848KR, 8848KR, 8372P, 8372PL, 845KRD, 6847KRD |
| 13 | 6845, 845, 6846, 846, 8846, 5847, 6847, 847, 8847 |
| 14 | 5848, 6848, 8848 (coniche lunghe senza KR) |
| 15 | K1SM (rosette ceramica), Polybur P1 |
| 16 | H1SEM, H1SM (rosette CT) |
| 17 | H1, H1SE, H2 (rosette CT + debonding ortodontico) |
| 18 | H4MCL, H4MC (tagliacorone), 4ZR, 4ZRS |
| 19 | H32, 5985 (rimozione restauri) |
| 20 | 6858, 858, 8858, 858EF, 858UF, 6859, 859, 8859, 859EF (lance) |
| 21 | 6838, 838, 8838, S6880, 880, 8880, 880P (cilindriche testa tonda) |
| 22 | 881, 8881, 881EF, 881P, S6882, 882, 8882, S6882L, 8882L |
| 23 | 875, 876, 8876, 6877, S6877, 877, 8877 |
| 24 | 5878, S6878, 6878, 878, 8878, 878EF, 6878P, 8878P |
| 25 | S6879, 6879, 879, 8879, 879EF, 879L, 8879L, 851, 857 ← **TORPEDO** |
| 26 | 868BP, 868B, 868, 8868, 834, 6844 (faccette) |
| 27 | 6849, 849, 8849P, KT, 5855, 855, 8855, 855D |
| 28 | 5856, S6856, 6856, 856, 8856, 856EF, 6856P, 856P, 8856P |
| 29 | S6856XL, 8856XL, 5850, 6850, S6850, 850, 8850 |
| 30 | 5878K, S6878K, 6878K, 878K, 8878K, 878KP + 8878 KP ← **CHAMFER CONICO** |
| 31 | 5879K, 6879K, S6879K, 879K, 8879K, 879KP, 8879KP |
| 32 | 6884, 884, 8884, 6885, 885, 8885, 6886, 886, 8886, S6886K |
| 33 | 6852, 852, 8852, 852EF, 852UF, 8955, 955EF, 8956, 956EF, 8957 |
| 34 | 6883, 6889, 889, 8889, 6860, 860, 8860, 860EF |
| 35 | 5862, S6862, 6862, 862, 8862, 862EF, 862UF + H48LQ + Arkansas |
| 36 | 5863, S6863, 6863, 863, 8863, 863EF, 863UF + H48XLQ + 864, 8864 ← **FIAMMA LUNGA** |
| 37 | 811, 370, 8370 (OccluShaper), 5909, 6909, 909 |
| 38 | 899, 8899, DF1C, DF1, DF1F, DF1EF (reciprocanti) |
| 39 | 5368, S6368, 6368, 368, 8368, 368EF, 368UF, 8368L (football/oliva) |
| 40 | 5379, S6379, 6379, 379, 8379, 379EF + ZR varianti, 390, 8380 |
| 41 | 8972, 972EF, 973, 8973, 833A, 8833A, 8804, 8392 |
| 42 | H1SEM, H1SE (frese CT per conservativa) |
| 43 | H11, H21, H71 (frese CT forme varie) |
| 44 | H31R, H51, H52 (frese CT multilame) |
| 45 | H281, H282, H283, H283E, H284, H281K, H282K, H283K, H284K, H336 |
| 46 | H30L, H133, H33 (frese CT lunghe) |
| 47 | H16, H17, H18 (frese CT finishing) |
| 48 | H48LQ, H48XLQ, H379Q, H390Q (frese Q per composito) |
| 49 | frese CT metalliche varie |
| 50 | 831, 8831, 832, 8832 (Paro-Diamanten) + 227A (Implantat) |

---

## MAPPA STRIP MTB457 (LAB, HP shank 104)

| Strip | Famiglie principali |
|-------|---------------------|
| 01 | **801, 6801, 8801** (sfere HP) + 805 |
| 02 | 805A, **807** (cono rovescio), 830RL, 835, 836, 837, 842, 842R |
| 03 | **845, 846, 847, 848** (coniche piatte), **849, 850, 855, 856** (coniche tonde), **858, 859** (lance) |
| 04 | forme miste lab |
| 05 | ZR 390L, ZR 972, ZR 943 (dischi), ZR 8856, ZR 8881, ZR 8850, ZR 8862, **ZR 8863** (fiamma), ZR 8801L, **ZR 8379** (torpedo ZR), ZR 8390 |
| 06 | 8860, **860, 862, 863** (fiamme HP), 8867, **879** (torpedo HP), **880**, 892, 368, 379, 390 ← **STRISCIA CHIAVE DISAMBIGUAZIONE** |
| 07 | H280, H281, H282, H283, H284 (CT lab HP) |
| 08 | H1, H2, H3, H4, H5, H6 (CT lab HP varie) |
| 09 | forme speciali, set |

---

## TESTO "SCOPRI" / "DESCRIZIONE GENERALE" PER CAMPIONARIO

### MTB566 — Diamantate DIAO
DIAO = DIA (diamante) + O (perle ceramiche distanziatrici). Tecnologia brevettata con grani diamantati distanziati da sfere ceramiche.
Risultati: +27% abrasione iniziale, +34% durata rispetto a standard.
Colore identificativo: rosa-oro con anello verde.
Velocità: 160.000 giri/min su contrangolo anello rosso. OccluShaper solo su moltiplicatore.
Uso: preparazione protesica e conservativa. Include OccluShaper per modellazione occlusale.

### MTB541 — Diamantate e Frese CT
Campionario misto 8 pagine: diamantate (rosse) + CT multilame (verdi) + chirurgia (azzurro).
Organizzato per uso clinico: prima sgrossatura poi rifinitura.
Pag.1: conservativa | Pag.2: conservativa/protesi | Pag.3: escavazione/ortodonzia/tagliacorone
Pag.4-6: protesi e rifinitura | Pag.7: frese CT rifinitura.

### MTB159 — Gommini Studio
Campionario Gommini Studio MTB159.000. Gommini per rifinitura e lucidatura.

### MTB372 — Punte Soniche
Punte soniche come complemento agli strumenti rotanti. Uso: preparazione conservativa/protesica controllata, accesso a zone difficili, riduzione di vibrazione.
Vantaggio: precisione e visibilità superiori rispetto al rotante, controllo nell'asportazione selettiva di materiale.

### MTB450 — Punte Ultrasoniche (Piezoline)
Campionario Punte Ultrasoniche MTB450.000. Punte piezoelettriche per uso ultrasonico.

### MTB524 — Endodonzia
Endodonto = sistema dei canali radicolari ("l'interno del dente").
Fasi del trattamento endodontico:
1. Apertura cavità/camera pulpare: diamantata DIAO KP6830L (forma pera), poi forma 880 (6mm = altezza camera media)
2. Eliminazione carie: rosette H1SEM, K1SM (ceramica ZrO2), PolyBur (polimero monouso)
3. Disegno cavità d'accesso: EndoGuard H269QGK (punta non tagliente + lame tacchettate)
4. Ricerca accessi canalari: EndoTracer H1SML (collo lungo), EndoExplorer L31/L34
Contiene anche: FQ files (lime rotanti), Procodile (strumento speciale).

### MTB457 — Diamantate Laboratorio
Campionario MTB457.104 per lab odontotecnico con strumenti shank HP (104).
Materiali: ceramica integrale, zirconia, PMMA, compositi.
Include: sfere (801), coniche (845-856), lance (858-859), fiamme (860-863), torpedo (879), forme ZR.

### MTB325 — Gommini Laboratorio
Campionario Gommini Laboratorio MTB325.000. Gommini per rifinitura in laboratorio.

### MTB161 — Dischi Diamantati Laboratorio
Tendenza: diminuzione momento sottrattivo, aumento cura superfici. Varietà: 934/6934 (nido d'ape, flessibili), 6924 (rinforzato), 911 (robusto), 911H (standard riferimento), 936 (segmenti diamante), Miniflex (mini-dischi).
Varietà di granulometria e diamantatura bilaterale/monolaterale.

### MTB335 — Fresaggio Laboratorio
Campionario Fresaggio Laboratorio MTB335.000. Frese per fresaggio di precisione in laboratorio.

### MTB137 — Frese CT Laboratorio
Campionario Frese in Carburo di Tungsteno Laboratorio MTB137.000.

### MTB456 — Fresoni Laboratorio
Campionario Fresoni Laboratorio MTB456.104. Fresoni per uso in laboratorio, shank HP (104).

---

## NOTE PER INTEGRAZIONE NEL SISTEMA DI RICONOSCIMENTO

### Immagine di riferimento per disambiguation 863 vs 879 (HP)
File: `/home/deploy/komet-campionari/mtb457-diamantate-lab/mtb457-particolare-06.jpg`
Contiene entrambe affiancate con etichette chiare. Da inviare come immagine nel prompt.

### Immagine di riferimento per 807 (cono rovescio HP)
File: `/home/deploy/komet-campionari/mtb457-diamantate-lab/mtb457-particolare-02.jpg`

### Immagine di riferimento per 879 FG (studio)
File: `/home/deploy/komet-campionari/mtb541-diamantate-ct/campionario-diamantate-e-frese-carburo-tungsteno-particolari-25.jpg`
Etichetta: "Parallele Hohlkehlenpräparation"

### Immagine di riferimento per 863 FG (studio)
File: `/home/deploy/komet-campionari/mtb541-diamantate-ct/campionario-diamantate-e-frese-carburo-tungsteno-particolari-36.jpg`
