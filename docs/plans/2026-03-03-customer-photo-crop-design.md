# Customer Photo Crop

## Summary

Add circular crop functionality when uploading customer profile photos. After selecting/taking a photo, a modal opens allowing the user to pan, zoom, and crop the image before upload.

## Current State

- Photos uploaded via `CustomerCard.tsx` ("Scatta foto" / "Scegli dalla galleria")
- Frontend compresses to max 800px width, 0.7 JPEG quality (`customers.service.ts`)
- Stored as base64 data URI in `agents.customers.photo` (TEXT column)
- Displayed as circular avatars (120px detail, 40px list) with `object-fit: cover`
- No cropping capability exists

## Design

### User Flow

1. User clicks "Scatta foto" or "Scegli dalla galleria"
2. File selected -> modal opens with circular crop overlay
3. User can pan (drag) and zoom (slider) to frame the desired portion
4. "Conferma" -> crop + compress + upload
5. "Annulla" -> close modal, no changes

### Architecture

**New component:** `PhotoCropModal.tsx`
- Uses `react-easy-crop` for circular crop with zoom/pan
- Props: `imageSrc: string`, `onConfirm: (blob: Blob) => void`, `onCancel: () => void`
- Utility function `getCroppedImg(imageSrc, pixelCrop)` using Canvas API

**Modified:** `CustomerCard.tsx`
- After file selection, open `PhotoCropModal` instead of uploading directly
- On confirm, pass cropped blob to existing `uploadPhoto()` flow

**No backend changes required.**

### Library

`react-easy-crop` v5.x (~10KB, 527k weekly downloads, native circular crop support)

### Modal Style

- Dark semi-transparent backdrop
- Crop area ~300px (responsive)
- Zoom slider below crop area
- "Conferma" (green) + "Annulla" (gray) buttons
- Consistent with app's inline styling approach
