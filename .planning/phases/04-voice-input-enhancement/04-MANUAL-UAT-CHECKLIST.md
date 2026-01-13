# Manual UAT Verification Checklist - Phase 4 Voice Fix

**Date**: 2026-01-13
**Issue**: UAT-001 - Voice modal stuck in paused state
**Fix**: useRef pattern to stabilize callbacks

## Pre-Verification Status

**Unit Tests**: ✅ 13/13 passing
**TypeScript**: ✅ No errors
**Automated Checks**: ✅ All passing

## Manual Verification Steps

### Critical Test (UAT-001 Resolution)

**Test**: Basic voice input start/stop
1. `cd archibald-web-app/frontend && npm run dev`
2. Open http://localhost:5173
3. Click voice/microphone button (🎤 Dettatura Completa Ordine)
4. Observe: Modal opens showing "⏸️ In pausa"
5. Click "▶️ Riprendi" button
6. **Expected**: Modal changes to "🎙️ In ascolto..."
7. **Expected**: No "Maximum update depth exceeded" errors in console
8. Speak into microphone
9. **Expected**: Transcript appears in real-time
10. Click "⏸️ Pausa"
11. **Expected**: Modal returns to "⏸️ In pausa" state

**Pass Criteria**:
- ✅ No infinite loop errors in console
- ✅ Modal transitions between paused and listening states
- ✅ Microphone captures audio
- ✅ Transcript displays user speech

---

### Extended Voice Scenarios (from 04-02-SUMMARY.md)

These scenarios test the full voice feature integration:

#### 1. Confidence Meter Display
**Test**: Start voice input → confidence meter appears and updates
- Open voice modal
- Start listening
- Speak: "cliente Mario Rossi"
- **Expected**: Confidence meter shows percentage and updates in real-time

#### 2. Customer Name Entity Highlighting
**Test**: Say "cliente Mario Rossi" → customer name highlighted
- Continue from above
- **Expected**: "Mario Rossi" highlighted with blue badge in transcript

#### 3. Multi-Entity Highlighting
**Test**: Say "articolo SF1000 quantità 5" → all entities highlighted
- Say full order: "articolo SF1000 quantità 5"
- **Expected**: All three entities (article, quantity) highlighted with correct colors

#### 4. Invalid Customer Validation
**Test**: Say invalid customer → validation error with suggestions
- Say: "cliente XYZ123NonExistent"
- **Expected**: Validation error shown with customer suggestions

#### 5. Article Code Normalization
**Test**: Say "articolo H71 104 032" (without "punto") → normalizes correctly
- Say article code without saying "punto"
- **Expected**: Code normalized to H71.104.032 format

#### 6. Multi-Package Disambiguation
**Test**: Say quantity 7 for multi-package article → disambiguation modal
- Say: "articolo [multi-package-item] quantità 7"
- **Expected**: Package disambiguation modal appears with options

#### 7. Optimal Package Selection
**Test**: Select optimal packaging → form populated correctly
- In disambiguation modal, select recommended package
- **Expected**: Form populated with correct variant and quantity

#### 8. Keyboard Navigation
**Test**: Tab through elements, Esc closes, Enter applies
- Use only keyboard to navigate voice modal
- **Expected**: All interactive elements accessible via keyboard

#### 9. Screen Reader Accessibility
**Test**: Screen reader announces status changes
- Enable screen reader (VoiceOver/NVDA)
- Open voice modal and interact
- **Expected**: Status changes announced via ARIA live regions

---

## Verification Result Template

```
Date: [YYYY-MM-DD]
Browser: [Chrome/Safari/Firefox] [Version]
OS: [macOS/Windows/Linux]
Tester: [Name]

Critical Test (UAT-001):
- [ ] Voice modal opens
- [ ] "Riprendi" button works
- [ ] Modal transitions to listening state
- [ ] No infinite loop errors
- [ ] Transcript appears
- [ ] Voice input functional

Extended Scenarios:
- [ ] 1. Confidence meter
- [ ] 2. Customer highlighting
- [ ] 3. Multi-entity highlighting
- [ ] 4. Invalid customer validation
- [ ] 5. Article code normalization
- [ ] 6. Multi-package disambiguation
- [ ] 7. Optimal package selection
- [ ] 8. Keyboard navigation
- [ ] 9. Screen reader accessibility

Issues Found: [None / List issues]

Overall Status: [✅ PASS / ❌ FAIL]
```

---

## Automated Verification (Already Complete)

✅ **Unit Tests**: 13/13 tests passing
- 4 infinite loop regression tests
- 9 basic functionality tests
- 1 cleanup test

✅ **Fix Verification**:
- SpeechRecognition constructor called only once despite re-renders
- Callbacks remain functional after parent updates
- Hook stable across multiple re-renders
- No infinite loops detected

✅ **Code Quality**:
- TypeScript: 0 errors
- Prettier: Formatted
- ESLint: No issues

---

**Note**: Manual UAT testing requires:
1. Real microphone access
2. Browser with Web Speech API support (Chrome recommended)
3. Italian language support for voice recognition
4. Active Archibald session for customer/product validation
