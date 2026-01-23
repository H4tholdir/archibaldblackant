# Legacy Voice-Based Order System

This folder contains the **old voice-based order entry system** that was replaced by the new Phase 28.2 form-based architecture.

## ⚠️ Important

**DO NOT USE THESE FILES IN THE MAIN APPLICATION.**

All files in this folder are:
- Marked with `// @ts-nocheck` to disable TypeScript checking
- Not imported by any active components
- Kept only for reference and potential future reuse

## What's Inside

### Main Components
- `OrderForm_OLD_BACKUP.tsx` - Old voice-based order form
- `DraftOrders.tsx` - Draft order management page (voice system)

### Voice Recognition Components
- `TranscriptDisplay.tsx` / `TranscriptDisplay.spec.tsx` - Voice transcript display
- `ConfidenceMeter.tsx` - Confidence level indicator for voice recognition
- `ValidationStatus.tsx` - Validation status display
- `VoiceDebugPanel.tsx` - Debugging panel for voice input
- `VoicePopulatedBadge.tsx` / `VoicePopulatedBadge.spec.tsx` - Badge showing voice-populated fields

### Smart Suggestion Components
- `SmartSuggestions.tsx` - Smart suggestion display
- `CustomerSuggestions.tsx` - Customer-specific suggestions

### Services & Utilities
- `draftOrderStorage.ts` - Draft order persistence (voice system)
- `orderParser.ts` - Voice input parsing logic
- `orderParser.spec.ts` - Parser unit tests
- `orderParser.article.spec.ts` - Article parsing tests
- `orderParser.customer.spec.ts` - Customer parsing tests
- `draft-service.ts` / `draft-service.spec.ts` - Draft service layer

### Hooks
- `useVoiceInput.ts` / `useVoiceInput.spec.ts` - Voice input management hook

### Test Files
- `OrderForm.voice.spec.tsx` - Voice form tests
- Various `.spec.tsx` files for legacy components

### Modals
- `PackageDisambiguationModal.tsx` / `PackageDisambiguationModal.spec.tsx` - Package variant selection

## New System

The new order system (Phase 28.2) is located at:
- **Main Form**: `src/components/OrderForm.tsx`
- **Components**: `src/components/new-order-form/`
- **Route**: `/order`

### Key Differences

| Feature | Legacy (Voice) | New (Phase 28.2) |
|---------|---------------|------------------|
| Input Method | Voice recognition | Form-based with autocomplete |
| Architecture | Monolithic component | Three-layer (Presentation → Business → Data) |
| State | Draft orders in IndexedDB | Pending orders queue |
| Validation | Real-time voice parsing | Variant-based quantity validation |
| Order Flow | Draft → Edit → Place | Direct → Pending Queue → Sync |

## Migration Notes

- **DraftOrders** were specific to the voice system (saving partial voice entries)
- **PendingOrders** are used by the new system (offline-first queue)
- The new system does NOT use draft functionality
- Voice recognition code can be reused if voice input is added later

## Removal Consideration

These files can be safely deleted if:
1. Voice input feature is confirmed to never be reimplemented
2. No historical reference is needed
3. All stakeholders agree to permanent removal

For now, they remain for reference purposes.
