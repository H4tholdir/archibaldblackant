---
phase: 04-voice-input-enhancement
plan: 04-FIX
type: fix
---

<objective>
Fix critical infinite loop bug preventing voice input from starting.

Source: 04-ISSUES.md (UAT-001)
Priority: 🔴 **BLOCKER** - Entire voice feature non-functional
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-phase.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md

**Issues being fixed:**
@.planning/phases/04-voice-input-enhancement/04-ISSUES.md

**Original plans for reference:**
@.planning/phases/04-voice-input-enhancement/04-01-PLAN.md
@.planning/phases/04-voice-input-enhancement/04-02-PLAN.md
@.planning/phases/04-voice-input-enhancement/04-03-PLAN.md

**Affected files:**
@archibald-web-app/frontend/src/hooks/useVoiceInput.ts
@archibald-web-app/frontend/src/components/OrderForm.tsx
</context>

<tasks>

<task type="auto">
  <name>Fix UAT-001: Stabilize useVoiceInput dependencies to prevent infinite loop</name>
  <files>
archibald-web-app/frontend/src/hooks/useVoiceInput.ts
archibald-web-app/frontend/src/components/OrderForm.tsx
  </files>
  <action>
**Root cause:** The `useEffect` in `useVoiceInput.ts` (lines 39-119) has `onResult` and `onError` callbacks in its dependency array (line 119). These callbacks are recreated on every render in OrderForm.tsx, causing the effect to re-run infinitely.

**Fix strategy:**

**Option A (Recommended): Use useCallback with useRef pattern**

1. **In useVoiceInput.ts:**
   - Use `useRef` to store the latest `onResult` and `onError` callbacks
   - Update refs in a separate effect that doesn't recreate the recognition instance
   - Remove `onResult` and `onError` from the main effect's dependencies
   - Call callbacks via refs in event handlers

2. **Pattern:**
```typescript
const onResultRef = useRef(onResult);
const onErrorRef = useRef(onError);

// Update refs when callbacks change (doesn't recreate recognition)
useEffect(() => {
  onResultRef.current = onResult;
  onErrorRef.current = onError;
}, [onResult, onError]);

// Main effect without callback dependencies
useEffect(() => {
  // ... SpeechRecognition setup ...

  recognitionInstance.onresult = (event) => {
    // ...
    if (finalTranscript && onResultRef.current) {
      onResultRef.current(finalTranscript.trim());
    }
  };

  recognitionInstance.onerror = (event) => {
    // ...
    if (onErrorRef.current) {
      onErrorRef.current(errorMessage);
    }
  };

  // ...
}, [lang, continuous, interimResults, isSupported]); // No onResult/onError
```

3. **Why this works:**
   - Refs store latest callback versions without triggering effect re-runs
   - SpeechRecognition instance remains stable
   - Callbacks still work correctly via refs

**Do NOT:**
- Remove callbacks from dependency array without using refs (violates React rules)
- Use `eslint-disable` comments (masks the problem)
- Add empty dependency array (callbacks won't update)

**Alternative Option B (if Option A doesn't work):**
Wrap callbacks with `useCallback` in OrderForm.tsx to prevent recreation, but this requires modifying parent component and is less robust.
  </action>
  <verify>
1. `cd archibald-web-app/frontend && npm run dev`
2. Open http://localhost:5173
3. Click voice/microphone button
4. Click "Riprendi" button
5. Check console: NO "Maximum update depth exceeded" errors
6. Observe: Modal changes from "In pausa" to "In ascolto..."
7. Speak into microphone: Transcript appears in real-time
  </verify>
  <done>
- No React infinite loop errors in console
- Voice modal transitions from paused to listening state
- Microphone starts capturing audio
- Transcript displays user speech
- Voice recognition fully functional
  </done>
</task>

<task type="auto">
  <name>Add unit test to prevent regression</name>
  <files>
archibald-web-app/frontend/src/hooks/useVoiceInput.spec.ts (new file)
  </files>
  <action>
Create unit tests for `useVoiceInput` hook to ensure it doesn't recreate recognition instance on parent re-renders:

**Test cases:**
1. **Hook initializes SpeechRecognition once**
   - Render hook with callbacks
   - Re-render with different callback references
   - Assert: SpeechRecognition constructor called only once

2. **Callbacks remain functional after parent re-render**
   - Render hook with onResult callback
   - Re-render with new onResult callback
   - Trigger recognition result
   - Assert: New callback is called (not stale closure)

3. **startListening works after parent re-renders**
   - Render hook, re-render multiple times
   - Call startListening()
   - Assert: No infinite loop, recognition starts

**Use @testing-library/react-hooks for hook testing:**
```typescript
import { renderHook, act } from '@testing-library/react';
import { useVoiceInput } from './useVoiceInput';
```

Mock SpeechRecognition API:
```typescript
const mockRecognition = {
  start: vi.fn(),
  stop: vi.fn(),
  // ...
};

global.SpeechRecognition = vi.fn(() => mockRecognition);
```

**Why these tests:**
- Prevent regression of infinite loop bug
- Ensure callback refs work correctly
- Document expected behavior
  </action>
  <verify>
`cd archibald-web-app/frontend && npm test useVoiceInput.spec.ts`

All tests pass (3+ tests covering regression scenarios).
  </verify>
  <done>
- useVoiceInput.spec.ts created with 3+ tests
- Tests cover infinite loop regression scenario
- Tests verify callback refs work correctly
- All tests passing
  </done>
</task>

<task type="auto">
  <name>Run full voice integration test to ensure fix works end-to-end</name>
  <files>
archibald-web-app/frontend/src/components/OrderForm.tsx
archibald-web-app/frontend/src/hooks/useVoiceInput.ts
  </files>
  <action>
**Manual verification checklist** (from 04-02-SUMMARY.md):

1. Start voice input → confidence meter appears and updates in real-time
2. Say "cliente Mario Rossi" → customer name highlighted in blue badge
3. Say "articolo SF1000 quantità 5" → all entities highlighted with correct colors
4. Say invalid customer → validation error shown with suggestions
5. Say "articolo H71 104 032" (without "punto") → normalizes to H71.104.032
6. Say quantity 7 for multi-package article → disambiguation modal appears
7. Select optimal packaging → form populated with correct variant
8. Keyboard navigation: Tab through elements, Esc closes, Enter applies
9. Screen reader: Announces status changes via ARIA live regions

Run each test scenario and document results in commit message.

**Pass criteria:** All 9 scenarios work without errors.
  </action>
  <verify>
Manual test execution with real voice input.

Document test results:
- ✓ scenarios passed
- ✗ scenarios failed (if any)
- Any remaining issues
  </verify>
  <done>
- All 9 voice scenarios tested manually
- Voice input works end-to-end
- No infinite loop errors
- Microphone captures speech correctly
- All visual feedback components functional
  </done>
</task>

</tasks>

<verification>
Before declaring fix complete:

- [ ] No "Maximum update depth exceeded" errors in console
- [ ] Voice modal successfully transitions from "In pausa" to "In ascolto..."
- [ ] Microphone captures speech and displays transcript
- [ ] All unit tests pass (existing + new regression tests)
- [ ] No TypeScript errors
- [ ] Manual UAT checklist completed (9 scenarios from 04-02-SUMMARY.md)
- [ ] Voice feature fully functional end-to-end
</verification>

<success_criteria>
- UAT-001 resolved: Voice input starts successfully
- No infinite loop in useVoiceInput hook
- Regression tests added to prevent future issues
- All Phase 4 voice features functional
- Ready for production use
</success_criteria>

<output>
After completion, create `.planning/phases/04-voice-input-enhancement/04-FIX-SUMMARY.md`:

# Phase 4 Fix Summary

**Fixed critical infinite loop bug preventing voice input from starting**

## Issues Fixed

### UAT-001: Voice modal stuck in paused state (BLOCKER)

**Root cause:** `useEffect` dependency issue causing infinite re-renders

**Fix applied:** useRef pattern to stabilize callbacks without breaking React rules

**Verification:** Manual UAT shows all 9 voice scenarios working correctly

## Files Modified

- `frontend/src/hooks/useVoiceInput.ts` - Stabilized callback dependencies
- `frontend/src/hooks/useVoiceInput.spec.ts` - Added regression tests
- `frontend/src/components/OrderForm.tsx` - (if needed for callback wrapping)

## Test Results

- Unit tests: X/X passing
- Manual UAT: 9/9 scenarios passing
- TypeScript: 0 errors
- Console: 0 infinite loop errors

## Next Steps

Voice feature is now fully functional and ready for:
1. Production deployment
2. User acceptance testing with real agents
3. Phase 5 planning (Order Submission)

Move UAT-001 from "Open Issues" to "Resolved Issues" section in 04-ISSUES.md.
</output>
