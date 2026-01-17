# Manual UAT Checklist - Archibald Black Ant

**Purpose**: Comprehensive manual testing checklist for all implemented features
**Date**: 2026-01-17
**Version**: 1.0
**Test Environment**: https://formicanera.com

---

## Pre-requisites

### Access Requirements
- [ ] VPS SSH access: `ssh deploy@91.98.136.198`
- [ ] Admin credentials: `ikiA0930` / `<password>`
- [ ] Browser: Chrome/Safari (for PWA + biometric)
- [ ] Mobile device (iOS/Android) for biometric testing
- [ ] SSH tunnel for monitoring: `ssh -L 3001:localhost:3001 -L 9090:localhost:9090 deploy@91.98.136.198`

### System Status Check
- [x] Backend running: `docker ps | grep archibald-backend` ✅ Up 11 minutes (healthy)
- [x] Frontend running: `docker ps | grep archibald-frontend` ✅ Up 11 minutes (healthy)
- [x] Redis running: `docker ps | grep archibald-redis` ✅ Up 3 hours (healthy)
- [x] Nginx running: `docker ps | grep archibald-nginx` ✅ Up 5 minutes (healthy)
- [x] Prometheus running: `docker ps | grep archibald-prometheus` ✅ Up 2 hours (healthy)
- [x] Grafana running: `docker ps | grep archibald-grafana` ✅ Up 2 hours (healthy)

---

## Phase 1: Security Critical Fixes ✅

### 1.1 Environment Variables
- [ ] Backend starts without errors
- [ ] No hardcoded credentials visible in logs
- [ ] `.env` file exists and is gitignored
- [ ] JWT authentication working

**Test**: Login should work without exposing credentials in browser console

---

## Phase 2: Code Quality Foundation ✅

### 2.1 Logging System
- [ ] Backend logs visible: `docker logs archibald-backend`
- [ ] Log format: JSON structured logs
- [ ] Log levels: info, warn, error visible
- [ ] No console.log in production

**Test**: Trigger an action (e.g., sync) and verify structured logs appear

---

## Phase 3: MVP Order Form ✅

### 3.1 Package Selection

**Test Scenario 1: Single-package product**
1. [ ] Open app → Login → Navigate to order form
2. [ ] Search for product with single package (e.g., "02.33.016.010")
3. [ ] Verify package badge shows in dropdown (e.g., "📦 5 colli")
4. [ ] Select product
5. [ ] Verify quantity input has constraints (min, step, max)
6. [ ] Try invalid quantity (e.g., 7 for 5-pack) → should auto-correct to 10
7. [ ] Verify package hint below quantity field shows rules

**Test Scenario 2: Multi-package product**
1. [ ] Search for product with multiple packages (e.g., has both 1-pack and 5-pack)
2. [ ] Verify all package variants appear in dropdown
3. [ ] Select 5-pack variant
4. [ ] Enter quantity 7 → should auto-correct to 5 or 10
5. [ ] Select 1-pack variant
6. [ ] Enter quantity 7 → should be valid (1-pack allows any quantity)

**Expected**:
- ✅ Package badges visible in product dropdown
- ✅ Quantity auto-correction works in real-time
- ✅ Package hint displays correct rules
- ✅ No "quantity becomes 0" bug

---

### 3.2 Order Submission

**Test Scenario: Complete order creation**
1. [ ] Fill order form:
   - Customer: Select from dropdown
   - Product: Add 2-3 items with valid quantities
   - Discount: Optional (e.g., 10%)
2. [ ] Click "Crea Ordine"
3. [ ] Wait for order creation (~90 seconds)
4. [ ] Verify order ID appears in success message
5. [ ] Verify order appears in "I Miei Ordini" tab

**Expected**:
- ✅ Order created in Archibald
- ✅ Order ID extracted from URL
- ✅ Order saved to local database
- ✅ Success notification shown

---

## Phase 3.1-3.2: Bot Performance ✅

### 3.3 Performance Metrics

**Test**: Create 3 orders and measure time
1. [ ] Order 1: Single item → measure time
2. [ ] Order 2: Multiple items → measure time
3. [ ] Order 3: Complex (discount + multiple items) → measure time

**Expected**:
- ✅ Average < 90 seconds per order
- ✅ Customer selection < 15 seconds
- ✅ No timeout errors
- ✅ Profiling logs visible in backend

---

## Phase 4: Voice Input Enhancement ✅

### 4.1 Voice Input (Desktop)

**Test Scenario: Voice order creation**
1. [ ] Open order form
2. [ ] Click microphone icon
3. [ ] Grant microphone permission
4. [ ] Dictate: "Cliente Rossi, articolo zero due punto tre tre punto zero uno sei punto zero uno zero, quantità cinque"
5. [ ] Wait for transcription
6. [ ] Verify form fields populated:
   - Customer: "Rossi" (or closest match)
   - Article: "02.33.016.010"
   - Quantity: 5
7. [ ] Verify confidence meter shows (green/yellow/red)
8. [ ] Verify entity badges highlight recognized parts
9. [ ] Click "Conferma" to accept or edit manually

**Expected**:
- ✅ Microphone access granted
- ✅ Transcription appears in real-time
- ✅ Form fields pre-filled
- ✅ Confidence meter visible
- ✅ Can edit before confirming

---

### 4.2 Voice Input (Mobile)

**Test on iOS/Android device**
1. [ ] Install PWA (Add to Home Screen)
2. [ ] Open PWA app
3. [ ] Navigate to order form
4. [ ] Test voice input with dictation
5. [ ] Verify mobile keyboard doesn't interfere
6. [ ] Verify voice modal is responsive

**Expected**:
- ✅ Voice input works on mobile
- ✅ Modal responsive
- ✅ Transcription accurate

---

## Phase 4.1: Critical Production Fixes ✅

### 4.3 Backend Priority Manager

**Test**: Order during sync
1. [ ] Start a manual sync (Customers or Products)
2. [ ] While sync running, create an order
3. [ ] Verify sync pauses automatically
4. [ ] Verify order completes without interference
5. [ ] Verify sync resumes after order

**Expected**:
- ✅ Sync pauses when order starts
- ✅ Order completes successfully
- ✅ Sync resumes automatically
- ✅ No browser pool conflicts

---

### 4.4 Price List Sync

**Test**: Verify prices loaded
1. [ ] Navigate to order form
2. [ ] Search for product (e.g., "02.33.016.010")
3. [ ] Verify price appears in dropdown
4. [ ] Add to order
5. [ ] Verify price pre-filled in item row
6. [ ] Verify total calculates correctly

**Expected**:
- ✅ Prices visible in product dropdown
- ✅ Price pre-filled when adding item
- ✅ Total calculation correct (subtotal + VAT - discount)

---

### 4.5 Voice UX Instructions

**Test**: Voice modal help
1. [ ] Open voice modal
2. [ ] Verify instructions visible:
   - 3 detailed examples with real codes
   - 6-step workflow guide
   - Command explanations (conferma, annulla, riprova)
   - 5 error recovery scenarios
3. [ ] Verify instructions in Italian
4. [ ] Verify visual hierarchy (green examples, yellow help)

**Expected**:
- ✅ Instructions clear and detailed
- ✅ Examples use real article codes
- ✅ Workflow steps numbered
- ✅ Error recovery guidance

---

### 4.6 Customer Sync Priority

**Test**: New customer appears quickly
1. [ ] Add new customer in Archibald (if possible)
2. [ ] Trigger customer sync in app
3. [ ] Verify new customer appears on first page (not last)
4. [ ] Verify newest customers synced first

**Expected**:
- ✅ Newest customers appear first
- ✅ Sync processes ID descending (57.151 → 16.557)
- ✅ New customers available in < 1 minute

---

## Phase 5: Order Submission ✅

### 5.1 WebSocket Progress Tracking

**Test**: Real-time sync progress
1. [ ] Open browser console → Network tab → WS
2. [ ] Connect to WebSocket: `/ws/sync`
3. [ ] Trigger customer sync
4. [ ] Verify WebSocket messages:
   - Progress updates (10%, 20%, ..., 100%)
   - Current operation (e.g., "Syncing customer 150/500")
   - Completion message
5. [ ] Verify UI progress bar updates in real-time

**Expected**:
- ✅ WebSocket connection established
- ✅ Progress messages every second
- ✅ UI progress bar synchronized
- ✅ Completion notification

---

### 5.2 Error Messages

**Test**: Validation errors
1. [ ] Try to create order with invalid quantity (e.g., 0)
2. [ ] Verify error message descriptive:
   - "Quantity 0 is invalid for article 02.33.016.010"
   - Suggested quantities shown (e.g., "5, 10, 15")
3. [ ] Try to create order without customer
4. [ ] Verify error: "Customer is required"

**Expected**:
- ✅ Error messages in Italian
- ✅ Errors descriptive with context
- ✅ Suggestions provided when applicable

---

## Phase 6: Multi-User Authentication ✅

### 6.1 Login Flow

**Test Scenario 1: First-time login**
1. [ ] Open app (incognito/private mode)
2. [ ] Verify login screen appears
3. [ ] Enter username: `ikiA0930`
4. [ ] Enter Archibald password
5. [ ] Click "Accedi"
6. [ ] Wait for login (~60-90s)
7. [ ] Verify redirect to order form
8. [ ] Verify user name in header: "Francesco Formicola"

**Test Scenario 2: Invalid credentials**
1. [ ] Logout
2. [ ] Enter wrong password
3. [ ] Click "Accedi"
4. [ ] Verify error message: "Login failed - invalid credentials"
5. [ ] Verify error message extracted from Archibald

**Expected**:
- ✅ Login successful with valid credentials
- ✅ User name displayed in header
- ✅ Error message for invalid credentials
- ✅ No timeout errors

---

### 6.2 Session Persistence

**Test**: JWT token persistence
1. [ ] Login successfully
2. [ ] Close browser
3. [ ] Reopen browser and navigate to app
4. [ ] Verify auto-login (no login screen)
5. [ ] Verify session valid for 24 hours

**Expected**:
- ✅ JWT token stored in localStorage
- ✅ Auto-login on browser reopen
- ✅ Session expires after 24 hours

---

### 6.3 User Context Isolation

**Test**: Multi-user isolation (if multiple users available)
1. [ ] Login as User A
2. [ ] Create an order
3. [ ] Logout
4. [ ] Login as User B
5. [ ] Navigate to "I Miei Ordini"
6. [ ] Verify User A's order NOT visible
7. [ ] Verify only User B's orders visible

**Expected**:
- ✅ Orders isolated per user
- ✅ No cross-user data leakage

---

## Phase 7: Credential Management ✅

### 7.1 Credential Storage

**Test Scenario: Save credentials**
1. [ ] Login screen
2. [ ] Check "Ricorda credenziali" checkbox
3. [ ] Enter credentials
4. [ ] Enter PIN (6 digits): e.g., "123456"
5. [ ] Confirm PIN
6. [ ] Click "Accedi"
7. [ ] Wait for login
8. [ ] Verify success

**Expected**:
- ✅ PIN wizard appears
- ✅ PIN confirmation required
- ✅ Credentials saved encrypted
- ✅ Login successful

---

### 7.2 PIN Unlock

**Test Scenario: Unlock with PIN**
1. [ ] Close browser
2. [ ] Reopen and navigate to app
3. [ ] Verify UnlockScreen appears: "Bentornato, Francesco!"
4. [ ] Enter PIN (6 digits)
5. [ ] Click "Sblocca"
6. [ ] Verify auto-login (< 3 seconds)
7. [ ] Verify redirect to order form

**Expected**:
- ✅ UnlockScreen appears
- ✅ Greeting with user's first name
- ✅ PIN unlock < 3 seconds
- ✅ Auto-login to Archibald

---

### 7.3 Biometric Unlock (Mobile)

**Test on iOS/Android device with Face ID/Touch ID**
1. [ ] Install PWA
2. [ ] Login with "Ricorda credenziali"
3. [ ] Setup PIN
4. [ ] Close and reopen app
5. [ ] Verify biometric prompt: "Sblocca con Face ID/Touch ID"
6. [ ] Use biometric (Face ID / Touch ID)
7. [ ] Verify unlock successful
8. [ ] If biometric fails, fallback to PIN

**Expected**:
- ✅ Biometric prompt appears
- ✅ Face ID / Touch ID works
- ✅ PIN fallback available
- ✅ Unlock < 2 seconds

---

### 7.4 Forgot PIN

**Test**: PIN reset
1. [ ] UnlockScreen
2. [ ] Click "Password dimenticata?"
3. [ ] Verify redirect to login screen
4. [ ] Verify stored credentials cleared
5. [ ] Login again manually

**Expected**:
- ✅ Credentials cleared from storage
- ✅ Redirect to login screen
- ✅ Must enter credentials again

---

## Phase 8: Offline Capability ✅

### 8.1 Cache Population

**Test Scenario 1: Initial cache sync**
1. [ ] Login (first time or after cache clear)
2. [ ] Verify cache population modal appears
3. [ ] Verify progress: "Sincronizzando clienti... 150/500"
4. [ ] Wait for completion (~2-3 minutes)
5. [ ] Verify completion message: "Cache popolata con successo"

**Test Scenario 2: Cache already populated**
1. [ ] Reopen app (cache exists)
2. [ ] Verify no cache population modal
3. [ ] Verify data loads instantly from IndexedDB

**Expected**:
- ✅ Cache population on first sync
- ✅ Progress visible
- ✅ Instant load from cache afterward

---

### 8.2 Offline-First Data Access

**Test**: Search while offline
1. [ ] Enable airplane mode (or disconnect network)
2. [ ] Open order form
3. [ ] Search for customer: "Rossi"
4. [ ] Verify search results appear instantly (< 100ms)
5. [ ] Search for product: "02.33.016.010"
6. [ ] Verify product found with price
7. [ ] Verify search works without network

**Expected**:
- ✅ Search < 100ms (from cache)
- ✅ Customer autocomplete works offline
- ✅ Product autocomplete works offline
- ✅ Prices visible offline

---

### 8.3 Draft Order Auto-Save

**Test**: Draft persistence
1. [ ] Start filling order form:
   - Customer: "Rossi"
   - Product: "02.33.016.010", Qty: 5
2. [ ] Wait 1 second (debounce)
3. [ ] Close browser (don't submit)
4. [ ] Reopen browser and navigate to app
5. [ ] Verify form fields restored:
   - Customer: "Rossi"
   - Product: "02.33.016.010", Qty: 5
6. [ ] Continue editing or submit

**Expected**:
- ✅ Draft saved after 1 second
- ✅ Draft restored on app reopen
- ✅ Can continue editing
- ✅ Draft cleared after successful submission

---

### 8.4 Offline Indicator

**Test**: Network status indicator
1. [ ] Open app (online)
2. [ ] Verify no offline indicator
3. [ ] Disconnect network (airplane mode)
4. [ ] Verify yellow banner appears: "⚠️ Offline - Gli ordini saranno accodati"
5. [ ] Reconnect network
6. [ ] Verify banner disappears

**Expected**:
- ✅ Offline banner visible when offline
- ✅ Banner disappears when online
- ✅ Banking app style (yellow, discrete)

---

### 8.5 Service Worker & PWA

**Test**: PWA installation
1. [x] Open app in Chrome/Safari ✅
2. [x] Browser prompts "Add to Home Screen" (mobile) or "Install" (desktop) ✅ Manifest available
3. [x] PWA assets available:
   - [x] pwa-192x192.png: HTTP 200 ✅
   - [x] pwa-512x512.png: HTTP 200 ✅
   - [x] favicon.ico: HTTP 200 ✅
   - [x] apple-touch-icon.png: HTTP 200 ✅
   - [x] manifest.webmanifest: HTTP 200 ✅
4. [ ] Click "Add" / "Install" (requires manual user test)
5. [ ] Verify app icon appears on home screen / desktop (requires manual user test)
6. [ ] Open PWA app (requires manual user test)
7. [ ] Verify fullscreen mode (no browser UI) (requires manual user test)
8. [ ] Verify offline capability (requires manual user test)
9. [ ] Check for updates (reload) → verify auto-update (requires manual user test)

**Expected**:
- ✅ PWA installable
- ✅ App icon on home screen
- ✅ Fullscreen mode
- ✅ Offline-capable
- ✅ Auto-updates on reload

**Test Date**: 2026-01-17 09:20 UTC
**Test Result**: ✅ PASSED (Infrastructure) - PWA assets deployed
**Note**: Full PWA installation requires manual testing on mobile device

---

### 8.6 Stale Data Warning

**Test**: Cache expiration warning
1. [ ] Populate cache
2. [ ] Wait 3 days (or manually set cache timestamp to 4 days ago in IndexedDB)
3. [ ] Open app
4. [ ] Verify modal appears: "⚠️ Dati non aggiornati da più di 3 giorni"
5. [ ] Options:
   - "Aggiorna ora" → triggers full sync
   - "Continua" → dismisses warning, allows using stale data

**Expected**:
- ✅ Warning appears after 3 days
- ✅ Explicit confirmation required
- ✅ Can choose to update or continue

---

## Phase 9: Offline Queue ✅

### 9.1 Offline Order Creation

**Test**: Create order while offline
1. [ ] Disconnect network (airplane mode)
2. [ ] Fill order form (customer + products)
3. [ ] Click "Crea Ordine"
4. [ ] Verify order queued: "Ordine accodato - sarà inviato quando torni online"
5. [ ] Verify order appears in "Ordini Pendenti" with status "pending"
6. [ ] Reconnect network
7. [ ] Verify automatic sync starts
8. [ ] Verify order status changes to "syncing" → "completed"
9. [ ] Verify order ID assigned

**Expected**:
- ✅ Order queued when offline
- ✅ Notification: "Ordine accodato"
- ✅ Auto-sync on reconnect
- ✅ Order ID assigned after sync

---

### 9.2 Pending Orders View

**Test**: View and manage pending orders
1. [ ] Create 2-3 orders offline
2. [ ] Navigate to "Ordini Pendenti" tab
3. [ ] Verify temporal grouping:
   - "Oggi" (Today)
   - "Questa settimana" (This week)
   - "Più vecchi" (Older)
4. [ ] Verify each order shows:
   - Customer name
   - Items count
   - Total amount
   - Status badge (pending/syncing/completed/error)
5. [ ] Click "Sincronizza ora" button
6. [ ] Verify sync progress

**Expected**:
- ✅ Pending orders visible
- ✅ Temporal grouping
- ✅ Status badges color-coded
- ✅ Manual sync button works

---

### 9.3 Conflict Detection

**Test**: Stale data conflict
1. [ ] Populate cache (e.g., products with prices)
2. [ ] Disconnect network
3. [ ] Create order using cached data
4. [ ] Wait 3+ days (or manually age cache)
5. [ ] Reconnect network
6. [ ] Click "Sincronizza ora"
7. [ ] Verify conflict warning modal:
   - "⚠️ Attenzione: dati non aggiornati da 3 giorni"
   - "Vuoi aggiornare la cache prima di sincronizzare?"
8. [ ] Choose "Aggiorna cache" → triggers sync → retry queue

**Expected**:
- ✅ Conflict warning appears
- ✅ Option to update cache first
- ✅ Can choose to sync anyway
- ✅ Cache update before sync

---

### 9.4 Conflict Resolution UI

**Test**: Price/product conflicts
1. [ ] Create order offline with product "X" at price 100€
2. [ ] (Simulate: price changed in Archibald to 120€)
3. [ ] Sync order
4. [ ] Verify conflict modal:
   - "Conflitto rilevato per ordine #123"
   - Product "X": 100€ (cached) → 120€ (current) ⚠️ +20%
5. [ ] Options:
   - "Conferma" → sync with current price
   - "Annulla" → mark order as error
6. [ ] Choose "Conferma"
7. [ ] Verify order synced with updated price

**Expected**:
- ✅ Conflict modal shows price differences
- ✅ Color-coded (red=higher, green=lower)
- ✅ Percentage change shown
- ✅ Can confirm or cancel

---

## Phase 10: Order History ✅

### 10.1 Order History List

**Test**: View order history
1. [ ] Navigate to "📦 Storico" tab
2. [ ] Wait for orders to load (~15-20 seconds for 20 orders)
3. [ ] Verify orders display in temporal groups:
   - "Oggi" (Today)
   - "Questa settimana" (This week)
   - "Questo mese" (This month)
   - "Vecchi" (Older)
4. [ ] Verify each order card shows:
   - Order ID (e.g., "@000123")
   - Customer name
   - Creation date
   - Total amount
   - Status badge (Aperto, In lavorazione, Completato, etc.)
5. [ ] Verify timeline icon (▶) on left

**Expected**:
- ✅ Orders grouped by time
- ✅ Order cards banking app style
- ✅ Status badges color-coded
- ✅ Loading state visible

---

### 10.2 Order Filters

**Test Scenario 1: Customer search**
1. [ ] Order History page
2. [ ] Search bar: Type "Rossi"
3. [ ] Wait 300ms (debounced)
4. [ ] Verify only orders for customer "Rossi" visible
5. [ ] Clear search → verify all orders visible again

**Test Scenario 2: Date range filter**
1. [ ] Click "Filtra per data" button
2. [ ] Select date range: Last 7 days
3. [ ] Verify only orders from last 7 days visible
4. [ ] Clear filter → all orders visible

**Test Scenario 3: Status filter**
1. [ ] Click status chip: "Aperto"
2. [ ] Verify only open orders visible
3. [ ] Click "In lavorazione"
4. [ ] Verify only in-progress orders visible
5. [ ] Click "Tutti" → all orders visible

**Expected**:
- ✅ Customer search debounced (300ms)
- ✅ Date range filter works
- ✅ Status filter works
- ✅ Filters combinable

---

### 10.3 Order Details Expansion

**Test**: Expand order card
1. [ ] Order History page
2. [ ] Click order card to expand
3. [ ] Verify expanded view shows:
   - **Items list**: Article code, name, quantity, price
   - **Timeline**: State history with timestamps
   - **Tracking info**: DDT number, tracking link (if available)
   - **Invoices**: Invoice numbers with download buttons (if available)
   - **Totals**: Subtotal, discount, VAT, total
4. [ ] Click again to collapse
5. [ ] Verify card collapses

**Expected**:
- ✅ Smooth expand/collapse animation
- ✅ Items list formatted
- ✅ Timeline vertical with chips
- ✅ Tracking link clickable
- ✅ Invoice download works

---

### 10.4 Order Detail Caching

**Test**: Caching on expansion
1. [ ] Expand order A (first time) → wait for details to load
2. [ ] Collapse order A
3. [ ] Expand order A again → verify instant load (no spinner)
4. [ ] Expand order B (first time) → wait for details
5. [ ] Verify A cached, B loaded fresh

**Expected**:
- ✅ First expansion loads from server
- ✅ Subsequent expansions instant (cached)
- ✅ Cache per order ID

---

## Phase 11: Order Management ✅

### 11.1 Send to Milano

**Test**: Step 2 automation
1. [ ] Order History page
2. [ ] Find order with status "Aperto" (Step 1 complete)
3. [ ] Click order card → verify "Invia a Milano" button visible
4. [ ] Click "Invia a Milano"
5. [ ] Verify confirmation modal:
   - "Conferma invio a Milano"
   - Order details summary
   - Warning: "Questa azione è irreversibile"
6. [ ] Click "Conferma"
7. [ ] Wait for automation (~15 seconds)
8. [ ] Verify success: "Ordine inviato a Milano con successo"
9. [ ] Verify status changes: "Aperto" → "Inviato Milano"
10. [ ] Verify "Invio" button clicked in Archibald

**Expected**:
- ✅ Button visible for "Aperto" orders only
- ✅ Confirmation modal appears
- ✅ Automation completes in < 20s
- ✅ Status updated in UI and DB
- ✅ Archibald "Invio" button clicked

---

### 11.2 DDT and Tracking Scraping

**Test**: DDT data extraction
1. [ ] Wait for order to have DDT assigned (check Archibald manually)
2. [ ] Order History page
3. [ ] Expand order with DDT
4. [ ] Verify DDT section shows:
   - DDT number (e.g., "DDT-001234")
   - Issue date
   - Tracking link (if available)
5. [ ] Click tracking link
6. [ ] Verify opens tracking page (e.g., DHL, UPS)

**Alternative**: Trigger DDT sync manually
1. [ ] Backend: Check logs for DDT sync cron
2. [ ] Or trigger via API: `POST /api/orders/sync-ddts`
3. [ ] Verify DDT data updated in database

**Expected**:
- ✅ DDT number extracted
- ✅ Issue date extracted
- ✅ Tracking link extracted
- ✅ Tracking link clickable

---

### 11.3 Order State Timeline

**Test**: State history display
1. [ ] Expand order card
2. [ ] Verify timeline shows all state changes:
   - "Creato" → timestamp
   - "Aperto" → timestamp
   - "Inviato Milano" → timestamp
   - "In lavorazione" → timestamp (if reached)
   - "Completato" → timestamp (if reached)
3. [ ] Verify timeline vertical with chips
4. [ ] Verify most recent state at top

**Expected**:
- ✅ Timeline displays all states
- ✅ Timestamps accurate
- ✅ State chips color-coded
- ✅ Vertical layout

---

### 11.4 Order State Sync with Cache

**Test**: State sync with 2-hour cache
1. [ ] Expand order A (first time) → loads from Archibald (~15s)
2. [ ] Close and reopen app (within 2 hours)
3. [ ] Expand order A → loads instantly from cache
4. [ ] Wait 2+ hours (or manually expire cache)
5. [ ] Expand order A → loads from Archibald again

**Expected**:
- ✅ First load: from Archibald (~15s)
- ✅ Cached load: instant (< 500ms)
- ✅ Cache expires after 2 hours
- ✅ Force refresh button bypasses cache

---

### 11.5 Invoice Scraping and PDF Download

**Test Scenario 1: View invoices**
1. [ ] Order History page
2. [ ] Find order with invoice (status "Fatturato" or similar)
3. [ ] Expand order card
4. [ ] Verify "Fatture" section shows:
   - Invoice number (e.g., "FAT-001234")
   - Issue date
   - Amount
   - Download button (PDF icon)

**Test Scenario 2: Download invoice PDF**
1. [ ] Click download button (PDF icon)
2. [ ] Wait for download (~3-5 seconds)
3. [ ] Verify PDF downloads to browser
4. [ ] Open PDF
5. [ ] Verify invoice content correct

**Expected**:
- ✅ Invoice numbers extracted
- ✅ Download button visible
- ✅ PDF downloads successfully
- ✅ PDF content correct

---

### 11.6 Order Tracking Status

**Test**: Tracking info display
1. [ ] Order with DDT and tracking
2. [ ] Expand order card
3. [ ] Verify tracking section shows:
   - DDT number
   - Tracking link
   - Carrier (if available, e.g., "DHL")
4. [ ] Click tracking link
5. [ ] Verify opens carrier tracking page

**Expected**:
- ✅ Tracking info visible
- ✅ Link opens carrier page
- ✅ Tracking number correct

---

## Phase 12: Deployment & Infrastructure ✅

### 12.1 Production Deployment

**Test**: Application accessibility
1. [x] Open browser
2. [x] Navigate to https://formicanera.com ✅ HTTP/2 200
3. [x] Verify SSL certificate valid (🔒 green lock) ✅ HTTPS working
4. [x] Verify no security warnings ✅ No warnings
5. [x] Verify app loads without errors ✅ Loads correctly

**Expected**:
- ✅ App accessible via HTTPS
- ✅ SSL certificate valid (A+ grade)
- ✅ No mixed content warnings

**Test Date**: 2026-01-17 09:18 UTC
**Test Result**: ✅ PASSED

---

### 12.2 Health Checks

**Test**: Container health status
1. [x] SSH to VPS: `ssh deploy@91.98.136.198` ✅ Connected
2. [x] Check container health: `docker ps` ✅ All containers running
3. [x] Verify all containers "healthy":
   - [x] archibald-frontend: healthy ✅ Up 11 minutes (healthy)
   - [x] archibald-backend: healthy ✅ Up 11 minutes (healthy)
   - [x] archibald-redis: healthy ✅ Up 3 hours (healthy)
   - [x] archibald-nginx: healthy ✅ Up 5 minutes (healthy)
   - [x] archibald-prometheus: healthy ✅ Up 2 hours (healthy)
   - [x] archibald-grafana: healthy ✅ Up 2 hours (healthy)

**Expected**:
- ✅ All containers running
- ✅ All containers healthy
- ✅ No restarts (restart count = 0)

**Test Date**: 2026-01-17 09:18 UTC
**Test Result**: ✅ PASSED - All 6 containers healthy

---

### 12.3 Graceful Shutdown

**Test**: SIGTERM handling
1. [ ] SSH to VPS
2. [ ] Start an order creation (long operation)
3. [ ] In another terminal: `docker restart archibald-backend`
4. [ ] Verify order completes before restart
5. [ ] Check logs: `docker logs archibald-backend`
6. [ ] Verify log: "SIGTERM received, draining..."
7. [ ] Verify log: "Drained 1 operations in XXXms"

**Expected**:
- ✅ Order completes before shutdown
- ✅ Graceful drain log visible
- ✅ No operations interrupted
- ✅ Container restarts cleanly

---

### 12.4 Monitoring - Prometheus

**Test**: Prometheus metrics
1. [ ] SSH tunnel: `ssh -L 9090:localhost:9090 deploy@91.98.136.198`
2. [ ] Open browser: http://localhost:9090
3. [ ] Prometheus UI appears
4. [ ] Status → Targets
5. [ ] Verify "archibald-backend" target UP (green)
6. [ ] Graph → Query: `archibald_http_requests_total`
7. [ ] Verify data points appear
8. [ ] Try queries:
   - `archibald_active_operations` → shows current operations
   - `archibald_queue_size` → shows queue depth
   - `rate(archibald_http_requests_total[5m])` → request rate

**Expected**:
- ✅ Prometheus UI accessible
- ✅ Backend target UP
- ✅ Metrics scraped every 10 seconds
- ✅ Queries return data

---

### 12.5 Monitoring - Grafana

**Test**: Grafana dashboard
1. [ ] SSH tunnel: `ssh -L 3001:localhost:3001 deploy@91.98.136.198`
2. [ ] Open browser: http://localhost:3001
3. [ ] Login: admin / admin
4. [ ] Navigate: Dashboards → Browse → Archibald → "Archibald - System Overview"
5. [ ] Verify 6 panels:
   - HTTP Requests Rate → graph with data
   - HTTP Request Duration (95th percentile) → graph
   - Active Operations → gauge (0 when idle)
   - Queue Size → gauge (0 when idle)
   - Memory Usage → graph (resident + heap)
   - CPU Usage → graph
6. [ ] Verify auto-refresh every 10 seconds
7. [ ] Create an order → verify metrics update

**Expected**:
- ✅ Grafana UI accessible
- ✅ Dashboard loads
- ✅ All 6 panels show data
- ✅ Auto-refresh works
- ✅ Metrics update in real-time

---

### 12.6 CI/CD Pipeline

**Test**: Automated deployment
1. [ ] Make a small change (e.g., add console.log to backend)
2. [ ] Commit and push to master:
   ```bash
   git add .
   git commit -m "test: CI/CD verification"
   git push
   ```
3. [ ] Open GitHub → Actions tab
4. [ ] Verify CI workflow starts:
   - Type check: passing
   - Build: passing
   - Docker images pushed to GHCR
5. [ ] Verify CD workflow starts:
   - Deploy to VPS
   - Health check
6. [ ] Wait for completion (~5-10 minutes)
7. [ ] SSH to VPS: `docker ps -a`
8. [ ] Verify backend container restarted (new image)
9. [ ] Check app still works: https://formicanera.com

**Expected**:
- ✅ CI workflow runs on push
- ✅ All checks pass
- ✅ CD deploys automatically
- ✅ App updates without downtime

---

## Phase 13: Security Audit ✅

### 13.1 No Exposed Credentials

**Test**: Verify no credentials in UI
1. [ ] Open app
2. [ ] Open browser DevTools → Sources
3. [ ] Search JavaScript files for "password"
4. [ ] Verify no hardcoded passwords
5. [ ] Check Network tab → verify no passwords in API calls (should be in body, not query params)

**Expected**:
- ✅ No passwords in client-side code
- ✅ No passwords in URL parameters
- ✅ API calls use POST with body

---

### 13.2 Environment Variables

**Test**: Backend environment
1. [ ] SSH to VPS
2. [ ] Check environment: `docker exec archibald-backend env | grep -i secret`
3. [ ] Verify JWT_SECRET exists
4. [ ] Verify no secrets in docker-compose.yml
5. [ ] Verify .env file exists and is not in git

**Expected**:
- ✅ JWT_SECRET set
- ✅ No secrets in docker-compose.yml
- ✅ .env file gitignored

---

### 13.3 Git History Clean

**Test**: No secrets in commits
1. [ ] Local terminal: `git log --all --oneline | grep -i password`
2. [ ] Verify no commit messages with passwords
3. [ ] Check specific file history: `git log -p .env`
4. [ ] Verify .env never committed

**Expected**:
- ✅ No passwords in commit messages
- ✅ .env never in git history

---

## Additional Testing

### Performance Testing

**Test**: Application responsiveness
1. [ ] Measure page load time: < 3 seconds
2. [ ] Measure cache search: < 100ms
3. [ ] Measure order creation: < 90 seconds
4. [ ] Measure sync operation: < 30 seconds for 20 orders

**Expected**:
- ✅ All operations within targets
- ✅ UI responsive
- ✅ No blocking operations

---

### Mobile Responsiveness

**Test on mobile device**
1. [ ] Open app on phone
2. [ ] Verify responsive layout:
   - Order form: single column
   - Order history: stacked cards
   - Navigation: hamburger menu
3. [ ] Verify touch targets: > 44x44px
4. [ ] Verify text readable: > 16px
5. [ ] Verify no horizontal scroll

**Expected**:
- ✅ Mobile-optimized layout
- ✅ Touch-friendly
- ✅ Readable text
- ✅ No scroll issues

---

### Accessibility

**Test**: Basic accessibility
1. [ ] Keyboard navigation:
   - Tab through form fields
   - Enter to submit
   - Arrow keys in dropdowns
2. [ ] Screen reader (if available):
   - Labels read correctly
   - Buttons described
   - Status messages announced
3. [ ] Color contrast:
   - Text readable
   - Buttons distinct

**Expected**:
- ✅ Keyboard navigable
- ✅ Screen reader friendly
- ✅ Sufficient contrast

---

## Error Scenarios

### Network Failures

**Test**: Offline → Online transitions
1. [ ] Start online
2. [ ] Disconnect network mid-operation
3. [ ] Verify error handling
4. [ ] Reconnect network
5. [ ] Verify retry/recovery

**Expected**:
- ✅ Graceful error messages
- ✅ Operations queued if offline
- ✅ Auto-retry on reconnect

---

### Puppeteer Failures

**Test**: Archibald unreachable
1. [ ] (Simulate: Stop Archibald or block IP)
2. [ ] Try to create order
3. [ ] Verify error: "Archibald non raggiungibile"
4. [ ] Verify retry attempted (3 times)
5. [ ] Verify final error message descriptive

**Expected**:
- ✅ Retry logic works
- ✅ Error messages descriptive
- ✅ No crash

---

## Summary Checklist

### Critical Functionality
- [ ] **Login**: Works with valid credentials
- [ ] **Order Creation**: End-to-end successful
- [ ] **Package Selection**: Auto-correction works
- [ ] **Voice Input**: Transcription and pre-fill
- [ ] **Offline Mode**: Cache and queue functional
- [ ] **Order History**: Loads and displays correctly
- [ ] **Send to Milano**: Automation completes
- [ ] **DDT/Invoices**: Data scraped correctly
- [ ] **Production**: HTTPS accessible
- [ ] **Monitoring**: Prometheus/Grafana operational

### Security
- [ ] **No exposed credentials**: Clean audit
- [ ] **SSL/TLS**: Valid certificate
- [ ] **Authentication**: JWT working
- [ ] **Session management**: 24h expiry

### Performance
- [ ] **Page load**: < 3 seconds
- [ ] **Cache search**: < 100ms
- [ ] **Order creation**: < 90 seconds
- [ ] **Sync operations**: < 30 seconds

### User Experience
- [ ] **Mobile responsive**: Works on phone
- [ ] **PWA installable**: Can add to home screen
- [ ] **Offline indicator**: Visible when offline
- [ ] **Error messages**: Clear and helpful

---

## Test Results Log

**Date**: 2026-01-17 09:20 UTC
**Tester**: Claude Code (Automated) + Manual Testing Required
**Environment**: Production (https://formicanera.com)

### Automated Tests Completed ✅

| Feature | Status | Notes |
|---------|--------|-------|
| **Infrastructure** | ✅ PASSED | All 6 containers healthy |
| **Production Deployment** | ✅ PASSED | HTTPS working, SSL valid |
| **Health Checks** | ✅ PASSED | Backend, Frontend, Nginx, Redis, Prometheus, Grafana |
| **PWA Assets** | ✅ PASSED | All icons and manifest deployed |
| **API Health** | ✅ PASSED | /api/health returns healthy |
| **Force-Sync** | ✅ PASSED | 1307 orders scraped successfully |
| **Puppeteer Headless** | ✅ PASSED | Working in production Docker |
| **Nginx Timeout** | ✅ PASSED | 600s for long operations |

### Manual Tests Required 🔍

| Feature | Status | Notes |
|---------|--------|-------|
| Login | ⬜ Requires manual test | User needs to test with browser |
| Order Creation | ⬜ Requires manual test | End-to-end flow |
| Package Selection | ⬜ Requires manual test | Auto-correction UI |
| Voice Input | ⬜ Requires manual test | Microphone + transcription |
| Offline Mode | ⬜ Requires manual test | Airplane mode testing |
| Order History | ⬜ Requires manual test | UI verification |
| Send to Milano | ⬜ Requires manual test | Button automation |
| Monitoring | ⬜ Requires manual test | Grafana dashboard |
| PWA Installation | ⬜ Requires manual test | Mobile device |
| Biometric Auth | ⬜ Requires manual test | Face ID / Touch ID |

**Issues Found**: None in automated tests

**Overall Status**: ✅ INFRASTRUCTURE PASSED / 🔍 USER TESTING REQUIRED

### Summary

**Automated Testing (Infrastructure)**:
- ✅ All Docker containers healthy and running
- ✅ HTTPS and SSL certificate working
- ✅ API endpoints responding correctly
- ✅ PWA assets deployed and accessible
- ✅ Force-sync functionality verified (1307 orders)
- ✅ Nginx timeouts configured correctly
- ✅ Puppeteer headless mode working in production

**Manual Testing Required**:
- User login and authentication flows
- Order creation end-to-end
- Voice input and transcription
- Offline mode and queue functionality
- PWA installation on mobile devices
- Biometric authentication (Face ID/Touch ID)
- Monitoring dashboards (Prometheus/Grafana)
- Order management features (Send to Milano, DDT, Invoices)

---

**Total Test Cases**: 100+
**Estimated Testing Time**: 4-6 hours (complete suite)
**Recommended**: Test in batches (Phase by Phase)
