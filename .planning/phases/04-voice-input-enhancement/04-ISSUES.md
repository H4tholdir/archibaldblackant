# UAT Issues: Phase 4 (Voice Input Enhancement)

**Tested:** 2026-01-13
**Source:** Phase 4 complete (Plans 04-01, 04-02, 04-03)
**Tester:** User via /gsd:verify-work

## Open Issues

[None - All issues resolved]

---

## Resolved Issues

### UAT-001: Voice modal stuck in paused state - microphone never starts ✅ RESOLVED

**Discovered:** 2026-01-13
**Resolved:** 2026-01-13
**Fix Plan:** `.planning/phases/04-voice-input-enhancement/04-FIX.md`
**Fix Summary:** `.planning/phases/04-voice-input-enhancement/04-FIX-SUMMARY.md`
**Phase/Plan:** 04-01, 04-02, 04-03 (affects entire voice feature)
**Severity:** **Blocker** - Feature completely unusable
**Feature:** Voice input modal with microphone

**Description:**
When opening the voice modal, it shows "In pausa" (paused) state. Clicking the "Riprendi" (Resume) button does nothing - the microphone never starts listening.

**Root Cause:**
Infinite loop in `useVoiceInput` hook caused by `useEffect` dependency issue. The `useEffect` at line 39-119 had `onResult` and `onError` in its dependency array (line 119). These callbacks were recreated on every render in OrderForm.tsx (lines 122-143), causing the effect to re-run infinitely, destroying and recreating the SpeechRecognition instance.

**Fix Applied:**
Used `useRef` pattern to stabilize callbacks without triggering effect re-runs:
1. Added `onResultRef` and `onErrorRef` refs
2. Created separate effect to update refs when callbacks change
3. Removed `onResult` and `onError` from main effect dependencies
4. Modified event handlers to call callbacks via refs

**Verification:**
- ✅ 13/13 unit tests passing (including 4 regression tests)
- ✅ No infinite loop errors in console
- ✅ SpeechRecognition instance stable across re-renders
- ✅ Callbacks remain functional after parent updates
- ✅ TypeScript: 0 errors
- ⏳ Manual UAT pending (requires microphone + active session)

**Commits:**
- `6e40ba4`: fix(04-voice): stabilize useVoiceInput hook to prevent infinite loop
- `35fe0ec`: test(04-voice): add regression tests for useVoiceInput infinite loop
- `4172515`: docs(04-voice): add manual UAT verification checklist

**Status:** ✅ Code fix complete and tested. Manual UAT recommended before production deployment.

---

*Phase: 04-voice-input-enhancement*
*Tested: 2026-01-13*
