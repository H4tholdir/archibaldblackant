# Phase 3.1: Bot Performance Profiling & Optimization (INSERTED)

**Status**: 📋 Planned - Ready for execution
**Priority**: 🔴 URGENT - Blocca proseguimento Phase 3
**Created**: 2026-01-12
**Planned**: 2026-01-12 (3 plans)

## Goal

Implementare sistema di profiling dettagliato per tracciare tempi di ogni operazione bot, identificare colli di bottiglia e strutturare piano di ottimizzazione super-dettagliato per massimizzare velocità esecuzione ordini.

## Why This Phase Was Inserted

Dopo aver completato 03-03 (Package Selection in Archibald Bot) e implementato diverse ottimizzazioni (paste method, session cache), è critico:

1. **Profilare l'intero flusso bot** prima di continuare con validazioni e frontend
2. **Identificare colli di bottiglia** basandosi su dati reali, non supposizioni
3. **Creare baseline performance** per misurare miglioramenti futuri
4. **Strutturare piano di ottimizzazione** step-by-step con priorità basate su impatto

## Current Performance Baseline

From recent test runs (2026-01-12):

### Order Creation Time
- **With cache**: ~82s (best case)
- **Without cache**: ~108s (cold start)

### Operation Breakdown (slowest operations)
1. **Customer selection**: 24.8s (30% of total time)
2. **Article search**: 9.1-9.5s per article
3. **Quantity setting**: 9.5s (Ctrl+A + Backspace pattern)
4. **Discount setting**: 9.1s
5. **Login**: 26s (without cache) / 4s (with cache)

### Already Implemented Optimizations
- ✅ Paste method for customer/article input (-28% to -38% faster vs typing)
- ✅ Session cache with daily expiration (-22s login time, -25% total)
- ✅ Multi-article support with correct New button (DXCBtn1)
- ✅ Package selection logic based on quantity
- ✅ Discount field support (20% tested)

## What Needs To Be Done

### Profiling System
- [ ] Extend existing `runOp()` timing system for comprehensive tracking
- [ ] Add hierarchical operation categorization (login, navigation, form filling, etc.)
- [ ] Capture percentiles (p50, p95, p99) not just averages
- [ ] Track operation retries and failures
- [ ] Add memory profiling for leak detection

### Reporting & Visualization
- [ ] Generate HTML performance dashboard
- [ ] Include Gantt charts for operation timeline visualization
- [ ] Show bottleneck analysis with recommendations
- [ ] Add trend charts for comparing runs
- [ ] Export data to JSON/CSV for external analysis

### Optimization Plan Documentation
- [ ] Document each optimization opportunity with:
  - Current performance (baseline)
  - Target performance (goal)
  - Estimated effort (hours)
  - Expected impact (% improvement)
  - Implementation complexity (low/medium/high)
- [ ] Prioritize optimizations by ROI (impact / effort)
- [ ] Create step-by-step implementation plan
- [ ] Define SLO (Service Level Objectives) targets

## Known Bottlenecks to Investigate

1. **Customer Selection (24.8s)** - Possibili ottimizzazioni:
   - Verificare se dropdown si può evitare (API diretta?)
   - Ridurre wait times tra operazioni
   - Pre-caricare lista clienti comuni

2. **Article Search (~9s per article)** - Possibili ottimizzazioni:
   - Cache articoli cercati di recente
   - Ricerca batch per multi-articolo
   - Verificare se dropdown search può essere più veloce

3. **Field Editing (9-10s per field)** - Possibili ottimizzazioni:
   - Testare alternative a Ctrl+A + Backspace
   - Valutare JavaScript setValue con event trigger
   - Ridurre wait times tra keypress

4. **Network Latency** - Possibili ottimizzazioni:
   - Misurare latenza rete Archibald
   - Verificare se operazioni possono essere parallele
   - Ottimizzare screenshot frequency

## Success Criteria

Phase 3.1 è completa quando:

- [ ] Sistema di profiling implementato e testato
- [ ] Dashboard performance generata con dati reali
- [ ] Colli di bottiglia identificati e quantificati
- [ ] Piano di ottimizzazione dettagliato documentato con priorità
- [ ] Target performance (SLO) definiti
- [ ] Baseline metrics salvate per confronti futuri

## Next Steps

```bash
/gsd:plan-phase 3.1
```

Questo creerà i plan dettagliati per implementare il sistema di profiling e il piano di ottimizzazione.
