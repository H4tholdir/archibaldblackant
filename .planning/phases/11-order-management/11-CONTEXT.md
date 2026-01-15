# Phase 11: Order Management - Context

**Created**: 2026-01-15
**Phase Goal**: Modifica ordini pendenti, duplica ordine e tracking stato spedizione

---

## Vision

Implementare un sistema completo di gestione ordini con tracking stato, modifica ordini pendenti, e gestione documenti (DDT, tracking, fatture). L'obiettivo è dare agli utenti visibilità completa sul lifecycle dei loro ordini dalla creazione alla consegna, con possibilità di modificare ordini prima dell'invio definitivo a Milano.

---

## How It Works

### Two-Step Order Submission Flow

Gli ordini seguono un workflow a due step:

#### Step 1: Invia ad Archibald ✅ (Already Implemented in Phase 9)
- Ordine creato nella nostra app e piazzato su Archibald
- **Ancora modificabile** dopo questo step
- Window di opportunità per ultime modifiche prima dell'invio definitivo

#### Step 2: Invia a Milano 🆕 (To Implement in Phase 11)
- Ordine inviato definitivamente al magazzino di Milano
- **Non più modificabile** dopo questo step
- Inizia la trafila stati (in lavorazione → spedito → consegnato)
- **Meccanismo**: Checkbox selezione ordine su Archibald + pulsante "Invio"

---

## Archibald Architecture (from screenshots)

### 1. Documenti di Trasporto (DDT) Page
**URL**: `https://4.231.124.90/Archibald/CUSTPACKINGSLIPJOUR_ListView/`
**Access**: Menu laterale → "Documenti di trasporto"

**Available Information**:
- DDT number (e.g., DDT/26000515)
- Data di consegna
- ID ordine di vendita (e.g., ORD/26000552)
- Conto ordine (customer ID)
- Nome venditore / Nome di consegna
- Indirizzo consegna completo
- Totale colli
- **Numero di tracciabilità** (tracking number) - clickable links (e.g., "fedex 445291888246")
- Modalità di consegna (FedEx, UPS Italia, etc.)
- Città di consegna

**Features**:
- Download DDT (mechanism to analyze)
- Clickable tracking links that redirect to courier website

### 2. Fatture Page
**URL**: `https://4.231.124.90/Archibald/CUSTINVOICEJOUR_ListView/`
**Access**: Menu laterale → "Fatture"

**Available Information**:
- Numero fattura
- Data emissione
- Importo totale
- Informazioni pagamento

**Features**:
- Download PDF fattura (mechanism to analyze)

### 3. Order States (from ARCHIBALD AGENTI.pptx)
Reference file contains all differences between order states and their progression.

### 4. "Send to Milano" Workflow
**From orders screen**:
1. Select order with checkbox (using matching order ID)
2. Click "Invio" button
3. Order is sent to Milano → no longer editable

---

## Essential Features

### 1. Status Tracking (High Priority)

**Scope**:
- Only orders from **last 3 weeks**
- Reduces data volume and focuses on active orders

**Synchronization Strategy**:
- **On-demand with cache** (not background job)
- When user opens OrderHistory:
  - If cache is older than **2 hours** → sync from Archibald
  - Otherwise → show cached data
- Reuses existing cache pattern from Phase 10

**States to Track**:
- Creato (only in app, pre-Step 1)
- Piazzato su Archibald (post-Step 1, pre-Step 2)
- Inviato a Milano (post-Step 2)
- In lavorazione
- Spedito (with DDT + tracking number)
- Consegnato

**Data Sources**:
- Order states: Main orders page + ARCHIBALD AGENTI.pptx (reference)
- DDT/Tracking: `CUSTPACKINGSLIPJOUR_ListView`
- Invoices: `CUSTINVOICEJOUR_ListView`

**UI Visualization**:
Timeline showing:
- Date/time of each state change
- Current state
- DDT number (when available)
- Tracking number with clickable link to courier (when available)
- Invoice number (when available)

### 2. Edit Pending Orders

**When Editable**:
- ✅ **Before Step 1**: Total freedom, changes only in local DB (already implemented in Phase 9)
- ⚠️ **After Step 1, before Step 2**: Order on Archibald, editable manually from there
  - Future feature: edit via bot from our app (OUT OF SCOPE Phase 11)
- ❌ **After Step 2**: Locked, not editable

**What Can Be Modified** (only pre-Step 1):
- ✅ Quantity of existing items
- ✅ Add new items
- ✅ Remove items
- ✅ Delete entire order
- ❌ Order notes (out of scope)

**How Modifications Work**:
- **Before Step 1**: Changes only in local DB, total flexibility
- **After Step 1**: Order on Archibald, editable from there (future feature: edit via bot from our app)

### 3. DDT and Tracking Number

**Source**: `CUSTPACKINGSLIPJOUR_ListView`

**Data to Scrape**:
- DDT number (e.g., DDT/26000515)
- Tracking number (e.g., "fedex 445291888246")
- Tracking link (format varies by courier: FedEx, UPS Italia, etc.)
- Delivery date
- Total packages
- Delivery method

**Order Matching**: Match via "ID di vendita" (ORD/26000XXX) and "Conto ordine" (customer ID)

### 4. Invoice PDF Download

**Source**: `CUSTINVOICEJOUR_ListView`

**Data to Scrape**:
- Invoice number
- Issue date
- Total amount
- PDF download mechanism (to analyze - likely link/button)

**Invoice Matching**: Match via order ID or customer info

**User Flow**:
1. When invoice available on Archibald → flag in DB
2. User clicks "Scarica fattura" → scraping + PDF download
3. PDF served directly to user

### 5. "Send to Milano" Feature (Step 2) 🆕

**Implementation**:

**UI**:
- Button "Invia a Milano" on orders in "Piazzato su Archibald" state
- Clear warning: "After sending, order cannot be modified"

**Backend**:
1. Login to Archibald
2. Navigate to orders page
3. **Select order with checkbox** (match via order ID)
4. **Click "Invio" button**
5. Confirm action
6. Verify success

**Database**:
- Update order state → "Inviato a Milano"
- Store timestamp of sending

**UI Update**:
- Order no longer editable
- Show "In lavorazione" or next state

---

## Out of Scope for Phase 11

❌ **Push/email notifications** when state changes
❌ **Duplicate order** ("Ripeti ultimo ordine") feature
❌ **Edit orders after Step 1 via bot** (editable manually from Archibald, automation is future work)

---

## Research Required (Plan 11-01)

### High Priority:

1. **ARCHIBALD AGENTI.pptx Analysis**
   - Understand all order states and their progression
   - Document state transitions and business rules

2. **DDT Page Scraping Structure**
   - HTML structure of `CUSTPACKINGSLIPJOUR_ListView`
   - Element selectors for each data field
   - How to extract tracking links with proper courier format
   - Pagination mechanism if present

3. **Invoice Page Scraping Structure**
   - HTML structure of `CUSTINVOICEJOUR_ListView`
   - PDF download mechanism (direct link, button, modal?)
   - Element selectors for invoice data

4. **"Invio" Button Workflow**
   - Checkbox selector for orders
   - "Invio" button selector
   - Any confirmation modals or dialogs
   - Success/error feedback mechanism
   - How to verify operation completed successfully

### Questions to Resolve:

1. **Order Matching Strategy**:
   - How to reliably match orders between our app and DDT page?
   - Use ORD/26000XXX + customer ID combination?
   - Are these IDs stable and unique?

2. **Invoice Matching Strategy**:
   - Same matching method as DDT?
   - Any alternative identifiers available?

3. **Tracking Link Format**:
   - Different format per courier (FedEx vs UPS Italia vs others)?
   - How to parse and construct proper tracking URLs?

4. **PDF Download Mechanism**:
   - Direct download link?
   - Button click that triggers download?
   - Modal with preview then download?
   - How to handle download in Playwright context?

5. **"Invio a Milano" Verification**:
   - How to verify order was successfully sent?
   - What feedback does Archibald provide?
   - Any error states to handle?

---

## Implementation Priority

**Recommended Sequence** (based on technical dependencies):

1. **Research (11-01)**: Analyze all Archibald pages and mechanisms
   - Foundation for everything else
   - Must understand data structures before building

2. **"Send to Milano" Feature (11-02)**: Implement Step 2 workflow
   - Core functionality that enables the rest
   - Once orders can be sent, we can track their progression

3. **DDT/Tracking Scraping (11-03)**: Extract essential tracking data
   - Most important data for users
   - Enables meaningful status updates

4. **Status Tracking Backend (11-04)**: Sync from Archibald with 2h cache
   - Reuse existing cache pattern from Phase 10
   - On-demand sync when user opens OrderHistory

5. **Status Tracking UI (11-05)**: Timeline with states + DDT + tracking
   - Present all tracking data in user-friendly timeline
   - Clickable tracking links to couriers

6. **Invoice Scraping + Download (11-06)**: PDF download functionality
   - Less critical than tracking but important for users
   - Completes the order lifecycle visibility

7. **Integration Test + Refinement (11-07)**: Audit log, edge cases, error handling
   - Audit log for "Invia a Milano" action (who, when)
   - Handle edge cases (network errors, Archibald changes, etc.)
   - Comprehensive error messages for users

---

## Technical Notes

### Database Schema Extensions Needed

**orders table** (already exists from Phase 10):
- Add `sent_to_milano_at` timestamp
- Add `current_state` field (enum: creato, piazzato, inviato_milano, in_lavorazione, spedito, consegnato)
- Add `ddt_number` string
- Add `tracking_number` string
- Add `tracking_url` string
- Add `tracking_courier` string (fedex, ups, etc.)
- Add `invoice_number` string
- Add `invoice_url` string (for PDF download)

**order_state_history table** (new):
- `id` primary key
- `order_id` foreign key
- `state` enum (same as current_state)
- `changed_at` timestamp
- `changed_by` user_id (for audit)
- `notes` text (optional context)

**order_audit_log table** (new):
- `id` primary key
- `order_id` foreign key
- `action` string (send_to_archibald, send_to_milano, edit, cancel)
- `performed_by` user_id
- `performed_at` timestamp
- `details` json (action-specific data)

### Reusable Patterns from Phase 10

- **Cache Strategy**: 2-hour TTL, on-demand sync
- **BrowserPool**: Per-user locking for concurrent requests
- **Force Sync Button**: Manual refresh when needed
- **Error Handling**: Toast notifications, retry logic

### Security Considerations

- **Order Access Control**: Users can only see/modify their own orders
- **Admin Role**: May need admin-only actions (manual state override, view all orders)
- **Audit Trail**: Every "Invia a Milano" action must be logged with user ID and timestamp
- **HTTPS**: All Archibald scraping over secure connection

---

## Success Criteria

✅ Users can see complete order lifecycle in timeline view
✅ DDT and tracking numbers displayed with clickable courier links
✅ Invoice PDFs can be downloaded directly from our app
✅ "Invia a Milano" button works reliably with proper confirmation
✅ Orders correctly locked after Step 2 (no accidental modifications)
✅ Cache strategy keeps data fresh without excessive scraping
✅ Audit log captures all critical actions for accountability
✅ Error handling provides clear feedback when Archibald operations fail

---

## Related Documentation

- [Phase 9 Summary](../9-offline-queue/9-SUMMARY.md) - Pending orders with conflict detection
- [Phase 10 Summary](../10-order-history/10-07-SUMMARY.md) - Order history with cache strategy
- [ARCHIBALD AGENTI.pptx](../../docs/ARCHIBALD%20AGENTI.pptx) - Order states reference
- [elementi pagina ordini.txt](../../../elementi%20pagina%20ordini.txt) - Scraping reference for order page
