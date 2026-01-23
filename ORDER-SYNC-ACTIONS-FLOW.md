# Order Sync Service - Complete Atomic Actions Flow

**Generated:** 2026-01-22
**Source Files:**
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/order-sync-service.ts`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/archibald-bot.ts`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/pdf-parser-orders-service.ts`
- `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/order-db-new.ts`

---

## Table of Contents

1. [Initialization Phase](#initialization-phase)
2. [Login Phase](#login-phase)
3. [Navigation Phase](#navigation-phase)
4. [PDF Download Phase](#pdf-download-phase)
5. [Parsing Phase](#parsing-phase)
6. [Database Phase](#database-phase)
7. [Cleanup Phase](#cleanup-phase)
8. [Comparison with Bot Flow](#comparison-with-bot-flow)

---

## Initialization Phase

### Action 1: Reset Progress State
**Operation:** `syncOrders` - Progress reset
**Category:** `initialization`
**Description:** Reset sync progress to initial state

**Steps:**
1. Check if sync already in progress → throw error if true
2. Check if service is paused → throw error if true
3. Set `syncInProgress = true`
4. Reset progress object:
```typescript
{
  status: "downloading",
  message: "Scaricamento PDF ordini da Archibald...",
  ordersProcessed: 0,
  ordersInserted: 0,
  ordersUpdated: 0,
  ordersSkipped: 0
}
```
5. Emit progress event

**Error Conditions:**
- Sync already in progress
- Service is paused

---

### Action 2: Acquire Browser Context
**Operation:** `downloadOrdersPDF` - Acquire context
**Category:** `initialization`
**Description:** Get browser context from pool for user

**Steps:**
1. Call `browserPool.acquireContext(userId)`
2. Store context reference

**Timeout:** Default pool timeout
**Error Conditions:**
- Browser pool exhausted
- User context unavailable
- Context acquisition failure

---

### Action 3: Create ArchibaldBot Instance
**Operation:** `downloadOrdersPDF` - Bot creation
**Category:** `initialization`
**Description:** Instantiate bot for user

**Steps:**
1. Create `new ArchibaldBot(userId)`
2. Store bot reference

**Error Conditions:**
- None (constructor always succeeds)

---

## Login Phase

**NOTE:** The order sync service uses the SAME login flow as the bot's createOrder method.
The login is handled by the browser context which is already authenticated from the pool.

**Reference:** See `BOT-ACTIONS-FLOW.md` Actions 8-17 for detailed login flow.

### Action 4: Create New Page
**Operation:** `downloadOrdersPDF` - Page creation
**Category:** `login`
**Description:** Create new page in authenticated browser context

**Steps:**
1. Call `context.newPage()`
2. Store page reference

**Error Conditions:**
- Context closed or invalid

---

### Action 5: Set HTTP Headers
**Operation:** `downloadOrdersPDF` - Language headers
**Category:** `login`
**Description:** Force Italian language for PDF export

**Headers:**
```typescript
{
  "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7"
}
```

**Steps:**
1. Call `page.setExtraHTTPHeaders(headers)`

**Error Conditions:**
- Page not initialized

---

## Navigation Phase

### Action 6: Navigate to Orders ListView
**Operation:** `downloadOrdersPDF` - Navigate
**Category:** `navigation`
**Description:** Navigate to Orders ListView page

**URL:** `https://4.231.124.90/Archibald/SALESTABLE_ListView_Agent/`

**Steps:**
1. Call `page.goto(ordersUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })`
2. Verify navigation success

**Timeout:** 60000ms (60 seconds)
**Wait After:** 2200ms total (2000ms + 200ms)
**Error Conditions:**
- Navigation timeout
- HTTP error response
- Server not reachable

---

## PDF Download Phase

### Action 7: Setup CDP Session
**Operation:** `downloadOrdersPDF` - CDP setup
**Category:** `pdf.download`
**Description:** Configure Chrome DevTools Protocol for download handling

**Steps:**
1. Get CDP client: `page.target().createCDPSession()`
2. Send download behavior command:
```typescript
client.send("Page.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: "/tmp"
})
```

**Wait After:** 200ms
**Error Conditions:**
- CDP session creation failed
- Command send failed

---

### Action 8: Wait for Menu Container
**Operation:** `downloadOrdersPDF` - Menu wait
**Category:** `pdf.download`
**Description:** Wait for vertical menu container to be present

**Selector:** `#Vertical_mainMenu_Menu_DXI3_`

**Steps:**
1. Call `page.waitForSelector(selector, { timeout: 10000 })`

**Timeout:** 10000ms (10 seconds)
**Wait After:** 200ms
**Error Conditions:**
- Menu container not found
- Selector timeout

---

### Action 9: Check Button Visibility
**Operation:** `downloadOrdersPDF` - Visibility check
**Category:** `pdf.download`
**Description:** Check if PDF export button is visible

**Selectors Checked:**
- LI: `#Vertical_mainMenu_Menu_DXI3_`
- A: `#Vertical_mainMenu_Menu_DXI3_T`

**Visibility Logic:**
```typescript
const isVisible = await page.evaluate(() => {
  const li = document.querySelector("#Vertical_mainMenu_Menu_DXI3_");
  const a = document.querySelector("#Vertical_mainMenu_Menu_DXI3_T");

  if (!li || !a) return false;

  const liRect = li.getBoundingClientRect();
  const aRect = a.getBoundingClientRect();

  return (
    liRect.width > 0 &&
    liRect.height > 0 &&
    aRect.width > 0 &&
    aRect.height > 0
  );
});
```

**Error Conditions:**
- None (returns boolean)

---

### Action 10: Hover on Parent Menu (Conditional)
**Operation:** `downloadOrdersPDF` - Menu hover
**Category:** `pdf.download`
**Description:** Hover on parent menu to reveal submenu if button not visible

**Condition:** Only if `isVisible === false`

**Selector:** `a.dxm-content`

**Steps:**
1. Call `page.hover(selector)`
2. Wait 500ms

**Wait After:** 500ms (if hovered), then 200ms
**Error Conditions:**
- Hover failed (warning logged, continues anyway)

---

### Action 11: Setup Download Promise
**Operation:** `downloadOrdersPDF` - Download monitoring
**Category:** `pdf.download`
**Description:** Create promise that polls for PDF file creation

**Download Path:** `/tmp/ordini-{timestamp}.pdf`

**Polling Configuration:**
- Interval: 500ms
- Timeout: 300000ms (5 minutes)
- Poll Log Frequency: Every 10 seconds (20 polls)

**File Patterns Searched:**
- `Ordini.pdf`
- `Ordini cliente.pdf`
- `Customer orders.pdf`
- `ordini-*.pdf`

**Priority Order:**
1. `Ordini cliente.pdf`
2. `Customer orders.pdf`
3. Last file in list

**Steps:**
1. Create promise with polling interval
2. Check `/tmp` directory every 500ms
3. Look for PDF files matching patterns
4. When found:
   - Rename to expected path: `/tmp/ordini-{timestamp}.pdf`
   - Resolve promise

**Logging:**
- Poll count every 20 polls (10 seconds)
- Elapsed seconds
- PDF files found

**Timeout:** 300000ms (5 minutes)
**Error Conditions:**
- Download timeout (300s exceeded)
- File system error during polling
- Rename failure

---

### Action 12: Click PDF Export Button (Strategy 1 - Responsive Menu)
**Operation:** `downloadOrdersPDF` - Click responsive menu
**Category:** `pdf.download`
**Description:** Attempt to click PDF export via responsive menu (DXI9 → DXI7)

**Wait Before:** 200ms

**Steps:**
1. Click show hidden items button: `#Vertical_mainMenu_Menu_DXI9_T`
```typescript
const showHiddenResult = await page.evaluate(() => {
  const hiddenMenuButton = document.querySelector(
    "#Vertical_mainMenu_Menu_DXI9_T"
  ) as HTMLElement;

  if (!hiddenMenuButton) {
    return { success: false, error: "Show hidden items button not found" };
  }

  hiddenMenuButton.click();
  return { success: true };
});
```

2. Wait 500ms for submenu to appear

3. Click PDF export button: `#Vertical_mainMenu_Menu_DXI7_T`
```typescript
const button = document.querySelector(
  "#Vertical_mainMenu_Menu_DXI7_T"
) as HTMLElement;

if (!button) {
  return { success: false, error: "DXI7 button not found in responsive menu" };
}

button.click();
return { success: true, method: "responsive-DXI7" };
```

**Wait After:** 500ms (between steps)
**Success Indicator:** `{ success: true, method: "responsive-DXI7" }`
**Error Conditions:**
- Show hidden button not found
- DXI7 button not found in responsive menu
- (Falls through to Strategy 2)

---

### Action 13: Click PDF Export Button (Strategy 2 - Direct Button)
**Operation:** `downloadOrdersPDF` - Click direct button
**Category:** `pdf.download`
**Description:** Fallback to click PDF export button directly (DXI3)

**Condition:** Only if Strategy 1 failed

**Selector:** `#Vertical_mainMenu_Menu_DXI3_T`

**Steps:**
1. Click button:
```typescript
const button = document.querySelector(
  "#Vertical_mainMenu_Menu_DXI3_T"
) as HTMLElement;

if (!button) {
  return { success: false, error: "DXI3 button not found" };
}

button.click();
return { success: true, method: "direct-DXI3" };
```

**Success Indicator:** `{ success: true, method: "direct-DXI3" }`
**Error Conditions:**
- DXI3 button not found
- Click failed
- Throws error if both strategies fail

---

### Action 14: Wait for Download Completion
**Operation:** `downloadOrdersPDF` - Download wait
**Category:** `pdf.download`
**Description:** Wait for download promise to resolve

**Steps:**
1. Await `downloadComplete` promise (from Action 11)
2. Promise resolves when PDF file is detected and renamed

**Timeout:** 300000ms (5 minutes) - from polling promise
**Error Conditions:**
- Download timeout
- File not found
- Polling error

---

### Action 15: Close Page
**Operation:** `downloadOrdersPDF` - Cleanup
**Category:** `pdf.download`
**Description:** Close page after download completes

**Steps:**
1. Check if page is not closed: `!page.isClosed()`
2. Call `page.close()`
3. Catch and ignore errors

**Error Conditions:**
- None (errors caught and ignored)

---

### Action 16: Release Browser Context
**Operation:** `downloadOrdersPDF` - Release context
**Category:** `pdf.download`
**Description:** Return browser context to pool

**Steps:**
1. Call `browserPool.releaseContext(userId, context, true)`
2. Log release success/failure

**Parameter:** `true` = keep session (don't clear cookies)
**Error Conditions:**
- Release failure (logged but not thrown)

---

## Parsing Phase

### Action 17: Update Progress to Parsing
**Operation:** `syncOrders` - Progress update
**Category:** `parsing`
**Description:** Update sync progress state

**Steps:**
1. Set progress:
```typescript
{
  status: "parsing",
  message: "Estrazione dati PDF..."
}
```
2. Emit progress event

---

### Action 18: Spawn Python Parser Process
**Operation:** `PDFParserOrdersService.parseOrdersPDF`
**Category:** `parsing`
**Description:** Execute Python script to parse PDF

**Command:** `python3 /path/to/parse-orders-pdf.py {pdfPath}`

**Configuration:**
- Timeout: 300000ms (5 minutes)
- Max Buffer: 20MB (20 * 1024 * 1024 bytes)

**Steps:**
1. Spawn process: `spawn("python3", [parserPath, pdfPath], { timeout })`
2. Store process reference

**Error Conditions:**
- Python not found
- Script not found
- Spawn failure

---

### Action 19: Collect Parser Output (Streaming)
**Operation:** `PDFParserOrdersService.parseOrdersPDF` - stdout handling
**Category:** `parsing`
**Description:** Collect and parse JSON output line-by-line

**Output Format:** Line-delimited JSON (one order per line)

**Steps:**
1. Listen to stdout data events
2. Append to buffer: `stdoutBuffer += data.toString()`
3. Split by newlines: `lines = stdoutBuffer.split("\n")`
4. Keep incomplete line in buffer: `stdoutBuffer = lines.pop()`
5. For each complete line:
   - Trim whitespace
   - Parse JSON: `JSON.parse(line)`
   - Push to orders array
   - Log warning if parse fails

**Parsed Order Structure:**
```typescript
{
  id: string,
  order_number: string | null,
  customer_profile_id: string | null,
  customer_name: string | null,
  delivery_name: string | null,
  delivery_address: string | null,
  creation_date: string, // ISO 8601
  delivery_date: string | null,
  remaining_sales_financial: string | null,
  customer_reference: string | null,
  sales_status: string | null,
  order_type: string | null,
  document_status: string | null,
  sales_origin: string | null,
  transfer_status: string | null,
  transfer_date: string | null,
  completion_date: string | null,
  discount_percent: string | null,
  gross_amount: string | null,
  total_amount: string | null
}
```

**Error Conditions:**
- JSON parse error (warning logged, line skipped)

---

### Action 20: Log Parser Errors
**Operation:** `PDFParserOrdersService.parseOrdersPDF` - stderr handling
**Category:** `parsing`
**Description:** Capture Python script errors

**Steps:**
1. Listen to stderr data events
2. Log warnings: `logger.warn("[PDFParserOrdersService] Python stderr", { stderr })`

---

### Action 21: Handle Parser Exit
**Operation:** `PDFParserOrdersService.parseOrdersPDF` - process close
**Category:** `parsing`
**Description:** Process completion and error handling

**Steps:**
1. Listen to close event with exit code
2. Calculate duration: `Date.now() - startTime`
3. If exit code === 0:
   - Log success with duration and order count
   - Resolve promise with orders array
4. If exit code !== 0:
   - Log error with code and duration
   - Reject promise with error

**Error Conditions:**
- Non-zero exit code
- Timeout (300s)
- Process killed

---

## Database Phase

### Action 22: Update Progress to Saving
**Operation:** `syncOrders` - Progress update
**Category:** `database`
**Description:** Update sync progress state

**Steps:**
1. Set progress:
```typescript
{
  status: "saving",
  message: `Salvataggio ${parsedOrders.length} ordini...`
}
```
2. Emit progress event

---

### Action 23: Process Each Order (Loop)
**Operation:** `saveOrders` - Order iteration
**Category:** `database`
**Description:** Iterate through parsed orders and upsert each

**Loop:** `for (let i = 0; i < parsedOrders.length; i++)`

**Steps for Each Order:**
1. Get parsed order: `parsedOrders[i]`
2. Handle placeholder for pending orders:
```typescript
const orderNumber = parsedOrder.order_number || `PENDING-${parsedOrder.id}`;
```
3. Build order data object
4. Call `upsertOrder(userId, orderData)`
5. Track result: inserted/updated/skipped
6. Log progress every 100 orders

**Progress Logging (Every 100 Orders):**
```typescript
{
  processed: i + 1,
  total: parsedOrders.length,
  inserted,
  updated,
  skipped
}
```

**Error Conditions:**
- Upsert error (logged, continues to next order)

---

### Action 24: Compute Order Hash
**Operation:** `OrderDatabaseNew.upsertOrder` - Hash computation
**Category:** `database`
**Description:** Generate MD5 hash of order fields for change detection

**Hash Input Fields (Pipe-Separated):**
```typescript
[
  order.id,
  order.orderNumber,
  order.customerProfileId ?? "",
  order.customerName ?? "",
  order.deliveryName ?? "",
  order.deliveryAddress ?? "",
  order.creationDate,
  order.deliveryDate ?? "",
  order.remainingSalesFinancial ?? "",
  order.customerReference ?? "",
  order.salesStatus ?? "",
  order.orderType ?? "",
  order.documentStatus ?? "",
  order.salesOrigin ?? "",
  order.transferStatus ?? "",
  order.transferDate ?? "",
  order.completionDate ?? "",
  order.discountPercent ?? "",
  order.grossAmount ?? "",
  order.totalAmount ?? ""
].join("|")
```

**Hash Algorithm:** MD5
**Steps:**
1. Join fields with pipe separator
2. Create MD5 hash: `crypto.createHash("md5").update(hashInput).digest("hex")`

**Error Conditions:**
- None (always succeeds)

---

### Action 25: Check Existing Order
**Operation:** `OrderDatabaseNew.upsertOrder` - Existence check
**Category:** `database`
**Description:** Check if order exists in database

**Query:**
```sql
SELECT hash FROM orders WHERE user_id = ? AND order_number = ?
```

**Parameters:**
- userId
- order.orderNumber

**Result:**
- `undefined` = order does not exist
- `{ hash: string }` = order exists with hash

**Error Conditions:**
- Database query error

---

### Action 26a: Insert New Order (If Not Exists)
**Operation:** `OrderDatabaseNew.upsertOrder` - Insert
**Category:** `database`
**Description:** Insert new order into database

**Condition:** Only if Action 25 returned `undefined`

**Query:**
```sql
INSERT INTO orders (
  id, user_id, order_number, customer_profile_id, customer_name,
  delivery_name, delivery_address, creation_date, delivery_date,
  remaining_sales_financial, customer_reference, sales_status,
  order_type, document_status, sales_origin, transfer_status,
  transfer_date, completion_date, discount_percent, gross_amount,
  total_amount, hash, last_sync, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

**Parameters (24 values):**
1. order.id
2. userId
3. order.orderNumber
4. order.customerProfileId
5. order.customerName
6. order.deliveryName
7. order.deliveryAddress
8. order.creationDate
9. order.deliveryDate
10. order.remainingSalesFinancial
11. order.customerReference
12. order.salesStatus
13. order.orderType
14. order.documentStatus
15. order.salesOrigin
16. order.transferStatus
17. order.transferDate
18. order.completionDate
19. order.discountPercent
20. order.grossAmount
21. order.totalAmount
22. hash (computed)
23. now (Unix timestamp)
24. new Date().toISOString() (created_at)

**Return:** `"inserted"`
**Error Conditions:**
- Database insert error
- Constraint violation

---

### Action 26b: Update Last Sync (If Unchanged)
**Operation:** `OrderDatabaseNew.upsertOrder` - Sync timestamp update
**Category:** `database`
**Description:** Update only last_sync timestamp for unchanged order

**Condition:** Only if order exists AND `existing.hash === hash`

**Query:**
```sql
UPDATE orders SET last_sync = ? WHERE user_id = ? AND order_number = ?
```

**Parameters:**
- now (Unix timestamp)
- userId
- order.orderNumber

**Return:** `"skipped"`
**Error Conditions:**
- Database update error

---

### Action 26c: Update Changed Order (If Hash Different)
**Operation:** `OrderDatabaseNew.upsertOrder` - Full update
**Category:** `database`
**Description:** Update all order fields and hash for changed order

**Condition:** Only if order exists AND `existing.hash !== hash`

**Query:**
```sql
UPDATE orders SET
  customer_profile_id = ?, customer_name = ?, delivery_name = ?,
  delivery_address = ?, creation_date = ?, delivery_date = ?,
  remaining_sales_financial = ?, customer_reference = ?, sales_status = ?,
  order_type = ?, document_status = ?, sales_origin = ?, transfer_status = ?,
  transfer_date = ?, completion_date = ?, discount_percent = ?,
  gross_amount = ?, total_amount = ?, hash = ?, last_sync = ?
WHERE user_id = ? AND order_number = ?
```

**Parameters (22 values):**
1-18. Updated order fields (see Action 26a for order)
19. hash (new computed hash)
20. now (Unix timestamp)
21. userId
22. order.orderNumber

**Return:** `"updated"`
**Error Conditions:**
- Database update error

---

### Action 27: Aggregate Save Results
**Operation:** `saveOrders` - Result aggregation
**Category:** `database`
**Description:** Compile statistics from all upsert operations

**Tracked Counters:**
- `inserted` - New orders added
- `updated` - Existing orders modified
- `skipped` - Unchanged orders

**Result Object:**
```typescript
{
  ordersProcessed: parsedOrders.length,
  ordersInserted: inserted,
  ordersUpdated: updated,
  ordersSkipped: skipped
}
```

**Error Conditions:**
- None (always returns results)

---

## Cleanup Phase

### Action 28: Delete PDF File
**Operation:** `syncOrders` - PDF cleanup
**Category:** `cleanup`
**Description:** Remove downloaded PDF from /tmp

**Steps:**
1. Call `fs.unlink(pdfPath)`
2. Catch errors (warning logged)

**Error Conditions:**
- File deletion failed (warning only, not thrown)

---

### Action 29: Update Progress to Completed
**Operation:** `syncOrders` - Final progress update
**Category:** `cleanup`
**Description:** Update sync progress to completed state

**Steps:**
1. Calculate duration: `Math.floor((Date.now() - startTime) / 1000)` seconds
2. Set progress:
```typescript
{
  status: "completed",
  message: `✓ Sync completato in ${duration}s`,
  ordersProcessed: saveResults.ordersProcessed,
  ordersInserted: saveResults.ordersInserted,
  ordersUpdated: saveResults.ordersUpdated,
  ordersSkipped: saveResults.ordersSkipped
}
```
3. Emit progress event

---

### Action 30: Reset Sync Flag
**Operation:** `syncOrders` - Finally block
**Category:** `cleanup`
**Description:** Reset sync in progress flag

**Steps:**
1. Set `syncInProgress = false`

**Condition:** Always runs (in finally block)
**Error Conditions:**
- None

---

## Error Handling

### Global Error Actions

**On Any Error During Sync:**

1. Calculate duration
2. Extract error message and stack
3. Log error with context:
```typescript
{
  error: errorMessage,
  stack: errorStack,
  duration,
  durationMs,
  progressStatus: currentProgressStatus
}
```
4. Update progress to error state:
```typescript
{
  status: "error",
  message: `❌ Errore sync: ${errorMessage}`,
  error: errorMessage
}
```
5. Emit progress event
6. Re-throw error
7. Reset `syncInProgress = false` (in finally)

**Error Categories:**
- **Download errors**: Browser context acquisition, navigation, PDF download
- **Parse errors**: Python process spawn, JSON parsing, timeout
- **Database errors**: Insert/update failures, constraint violations
- **Cleanup errors**: PDF deletion (non-critical, logged only)

---

## Comparison with Bot Flow

### Similarities with Bot's createOrder Flow

1. **Browser Context Acquisition:** Both use `BrowserPool.acquireContext(userId)`
2. **Session Reuse:** Both leverage cached cookies from pool
3. **Error Handling:** Both log errors and release context in finally blocks
4. **Authenticated Navigation:** Both assume context is already logged in

### Key Differences

#### Login Phase
- **Bot:** May perform full login (Actions 8-17 in BOT-ACTIONS-FLOW.md) if session expired
- **Order Sync:** Relies on pre-authenticated context from pool
- **Note:** If context session is expired, the pool handles re-authentication before releasing context

#### Navigation
- **Bot:** Navigates to Orders menu → New order form (`/Default.aspx` → click "Ordini" → click "Nuovo")
- **Order Sync:** Direct navigation to Orders ListView (`/SALESTABLE_ListView_Agent/`)

#### Timeout Values
| Operation | Bot | Order Sync | Difference |
|-----------|-----|------------|------------|
| Page navigation | `config.puppeteer.timeout` | 60000ms | Order sync uses fixed 60s |
| Menu wait | 5000ms | 10000ms | Order sync waits longer for menu |
| Download timeout | N/A | 300000ms (5 min) | Order sync specific |
| Parser timeout | N/A | 300000ms (5 min) | Order sync specific |

#### Wait Times
| Operation | Bot | Order Sync | Difference |
|-----------|-----|------------|------------|
| After navigation | Varies by step | 2200ms (2000 + 200) | Order sync uses fixed waits |
| After button click | 200ms (slowdown) | 200-500ms | Similar |
| After dropdown open | Event-driven | 500ms fixed | Bot more optimized |

#### Selectors
- **Bot:** Uses dynamic text-based selectors (`clickElementByText`)
- **Order Sync:** Uses specific ID selectors (`#Vertical_mainMenu_Menu_DXI3_T`)
- **Note:** Order sync has fallback strategy (responsive menu → direct button)

#### PDF Export Strategy
**Order Sync Only:**
1. **Strategy 1:** Click show hidden items (`DXI9`) → Click PDF export (`DXI7`)
2. **Strategy 2:** Click PDF export directly (`DXI3`)
3. **File Polling:** Check `/tmp` every 500ms for up to 5 minutes
4. **File Renaming:** Rename detected file to expected path

#### Post-Action Processing
- **Bot:** Creates order record, updates database immediately
- **Order Sync:** Batch processing with delta detection (insert/update/skip)

---

## Performance Characteristics

### Expected Duration (Typical Scenario)

**Phase Breakdown:**
1. **Initialization:** ~100-500ms (context acquisition)
2. **Navigation:** ~2-5s (page load + waits)
3. **PDF Download:** ~10-120s (depends on Archibald server, order count)
4. **Parsing:** ~5-30s (depends on PDF size, order count)
5. **Database:** ~1-10s (depends on order count, delta ratio)
6. **Cleanup:** ~50-200ms (file deletion)

**Total:** ~20-170 seconds for typical sync (1000-5000 orders)

### Bottlenecks

1. **PDF Download:** Longest phase, depends on Archibald server processing
   - Archibald generates PDF on demand (can take 60-120s for large datasets)
   - Network transfer time
   - Polling overhead (500ms interval)

2. **Parsing:** CPU-intensive Python process
   - PDF extraction (pdfplumber)
   - Text parsing and validation
   - JSON serialization

3. **Database:** I/O bound
   - Hash computation for every order
   - Delta detection query per order
   - Insert/update per changed order

### Optimization Opportunities

1. **PDF Download:**
   - Use CDP download events instead of polling (more efficient)
   - Request smaller date ranges if API supports

2. **Parsing:**
   - Stream parsing (currently implemented) ✓
   - Parallel processing (if Python GIL allows)

3. **Database:**
   - Batch inserts/updates (currently processes one-by-one)
   - Transaction wrapping (reduce I/O)
   - Index optimization on (user_id, order_number)

---

## Action Count Summary

**Total Actions:** 30 primary actions
- **Initialization:** 3 actions
- **Login:** 2 actions (minimal, uses pool session)
- **Navigation:** 1 action
- **PDF Download:** 10 actions
- **Parsing:** 5 actions
- **Database:** 6 actions (+ 3 sub-actions for upsert paths)
- **Cleanup:** 3 actions

**Sub-Actions:** 3 upsert paths (insert/skip/update)

**Total Atomic Operations:** 33 (including upsert sub-paths)

---

## End of Document

**Document Version:** 1.0
**Last Updated:** 2026-01-22
**Maintainer:** Development Team
