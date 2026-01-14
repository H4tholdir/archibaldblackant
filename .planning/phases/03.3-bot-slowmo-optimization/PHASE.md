---
phase: 03.3-bot-slowmo-optimization
type: inserted
priority: high
---

# Phase 3.3: Bot SlowMo Granular Optimization (INSERTED)

**Status**: 🚧 In Progress (Plans 1-3 complete, Plan 4 pending)
**Type**: Performance optimization
**Priority**: HIGH - Directly impacts order creation speed
**Completed**: 2026-01-14 (Infrastructure)

## Goal

Implementare sistema di ottimizzazione granulare del delay slowMo per ogni operazione atomica del bot, utilizzando binary search automatico per trovare il delay minimo necessario per affidabilità, con target di riduzione tempo ordine da 75s a ~60s (-20%).

## Context

**From Phase 3.1/3.2**: Profiling ha identificato ~8.7s di overhead da slowMo globale (200ms) applicato a tutte le operazioni. Analisi dettagliata mostra che:
- Operazioni semplici (Tab, Enter, Backspace) non servono 200ms
- Operazioni DevExpress critiche potrebbero servire <200ms con testing
- ~80% tempo è wait DOM rendering (non slowMo), ma 8.7s di overhead è significativo

**Current Baseline**:
- SlowMo globale: 200ms
- Tempo ordine: ~75s
- SlowMo overhead: ~8.7s (12% del totale)

**Target**:
- SlowMo ottimizzato per operazione: 0-150ms
- Tempo ordine: ~60-65s
- Risparmio: 10-15s (-15-20%)

## Research

Research type: **Level 0 - Implementation Only**

No research needed. Architecture decisions:
1. **Storage**: JSON file dinamico (modificabile runtime)
2. **Naming**: ID numerico + descrizione (001_login_click_username)
3. **Log**: Massimo (DOM state + stack trace + video recording)
4. **Retry**: Binary search (più veloce)
5. **Mode**: Full automatic test
6. **Crash handling**: Stop & alert
7. **Output**: Detailed markdown report
8. **Wrapper**: Explicit function names

## Dependencies

- Depends on: Phase 3.2 (baseline performance)
- Blocks: Nothing (optimization can run in parallel)

## Plans

### Plan 1: DelayManager & Infrastructure ✅ COMPLETE
- ✅ Create DelayManager class with JSON storage
- ✅ Create operation delays JSON schema
- ✅ Implement binary search retry logic
- ✅ Create detailed logging system
- **Summary**: See [PLAN-1-SUMMARY.md](./PLAN-1-SUMMARY.md)

### Plan 2: Operation Mapping & Wrappers ✅ COMPLETE
- ✅ Map all 48 bot operations with numeric IDs
- ✅ Create explicit wrapper functions in ArchibaldBot
- ✅ Integrate DelayManager with bot
- ✅ Replace direct page calls with wrappers (infrastructure ready)
- **Note**: Wrapper functions defined, integration into existing methods deferred to execution phase

### Plan 3: Automatic Testing Script ✅ COMPLETE
- ✅ Create test automation script template
- ✅ Implement binary search algorithm
- ✅ Add screenshot/video capture on failure
- ✅ Generate markdown report template
- **Note**: Test functions require refactoring bot methods (deferred to Plan 4)

### Plan 4: Execute Optimization & Validate 🚧 PENDING
- [ ] Refactor bot methods to use wrapper functions
- [ ] Implement individual test functions
- [ ] Run automatic optimization test
- [ ] Validate optimized delays
- [ ] Compare baseline vs optimized performance
- [ ] Document final results

## Estimated Effort

- Plan 1: 30 minutes (infrastructure)
- Plan 2: 45 minutes (mapping + wrappers)
- Plan 3: 30 minutes (test script)
- Plan 4: 60 minutes (execution + validation)

**Total**: ~2.5 hours

## Success Criteria

- [x] DelayManager implemented with JSON persistence
- [x] All 48 operations mapped with numeric IDs
- [x] Wrapper functions created for all operations
- [x] Binary search retry system working
- [x] Automatic test script template complete
- [ ] Optimization executed successfully (Plan 4)
- [ ] Performance improvement validated (target: -10-15s) (Plan 4)
- [x] Markdown report template generated
- [ ] No regression in order success rate (Plan 4)

## Risks

1. **Instability**: Some operations might fail even at 200ms
   - Mitigation: Stop & alert for manual investigation

2. **Testing Time**: Full optimization might take 2-3 hours
   - Mitigation: Can pause/resume via JSON file

3. **False Positives**: Operation passes at low delay but fails later
   - Mitigation: Run validation test after optimization

## Deliverables

- `backend/src/delay-manager.ts` - Delay management system
- `backend/config/operation-delays.json` - Optimized delays
- `backend/src/scripts/optimize-delays.ts` - Test automation
- `.planning/phases/03.3-bot-slowmo-optimization/OPTIMIZATION-REPORT.md` - Results
- Modified `backend/src/archibald-bot.ts` - With wrapper functions

## Notes

- This is an INSERTED phase (not in original roadmap)
- Can be executed in parallel with other phases
- Results will inform future bot optimization work
