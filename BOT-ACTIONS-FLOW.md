# Archibald Bot - Complete Atomic Actions Flow

**Generated:** 2026-01-22
**Source File:** `/Users/hatholdir/Downloads/Archibald/archibald-web-app/backend/src/archibald-bot.ts`

---

## Table of Contents

1. [Initialization Phase](#initialization-phase)
2. [Login Phase](#login-phase)
3. [Order Creation Phase](#order-creation-phase)
   - [Step 1: Navigate to Orders Menu](#step-1-navigate-to-orders-menu)
   - [Step 2: Open New Order Form](#step-2-open-new-order-form)
   - [Step 3: Select Customer](#step-3-select-customer)
   - [Step 4: Create First Line Item Row](#step-4-create-first-line-item-row)
   - [Step 5-8: Add Articles (Loop)](#step-5-8-add-articles-loop)
   - [Step 9: Extract Order ID](#step-9-extract-order-id)
   - [Step 9.5: Apply Global Discount (Optional)](#step-95-apply-global-discount-optional)
   - [Step 10: Save and Close Order](#step-10-save-and-close-order)

---

## Initialization Phase

### Action 1: Initialize Browser (Multi-User Mode)
**Operation:** `browserPool.acquireContext`
**Category:** `login`
**Description:** Acquire browser context from pool for specific user

**Steps:**
1. Get BrowserPool singleton instance
2. Call `acquireContext(userId)`
3. Store context reference

**Timeout:** Default pool timeout
**Error Conditions:**
- Browser pool exhausted
- User context unavailable

---

### Action 2: Create New Page
**Operation:** `context.newPage`
**Category:** `login`
**Description:** Create new page in browser context

**Steps:**
1. Call `context.newPage()`
2. Store page reference

**Timeout:** Default Puppeteer timeout
**Error Conditions:**
- Context closed or invalid

---

### Action 3: Set Viewport
**Operation:** `page.setViewport`
**Category:** `login`
**Description:** Configure viewport dimensions

**Configuration:**
- Width: 1280px
- Height: 800px

**Steps:**
1. Call `page.setViewport({ width: 1280, height: 800 })`

**Error Conditions:**
- Page not initialized

---

### Action 4: Initialize Browser (Legacy Mode)
**Operation:** `browser.launch`
**Category:** `login`
**Description:** Launch dedicated Puppeteer browser instance

**Configuration:**
- Headless: From config
- SlowMo: From config
- Arguments:
  - `--no-sandbox`
  - `--disable-setuid-sandbox`
  - `--disable-web-security`
  - `--ignore-certificate-errors`
- Default Viewport: 1280x800

**Steps:**
1. Call `puppeteer.launch()` with configuration
2. Store browser reference

**Timeout:** Default Puppeteer launch timeout
**Error Conditions:**
- Browser launch failure
- System resource constraints

---

### Action 5: Create Page (Legacy Mode)
**Operation:** `browser.newPage`
**Category:** `login`
**Description:** Create new page in legacy browser

**Steps:**
1. Call `browser.newPage()`
2. Store page reference

**Error Conditions:**
- Browser closed

---

### Action 6: Enable Console Logging
**Operation:** `page.on('console')`
**Category:** `login`
**Description:** Attach console listener for browser logs

**Steps:**
1. Register console event handler
2. Log browser console messages to logger

---

### Action 7: Disable Request Interception
**Operation:** `page.setRequestInterception`
**Category:** `login`
**Description:** Configure request interception settings

**Steps:**
1. Call `page.setRequestInterception(false)`

**Error Conditions:**
- Page not initialized

---

## Login Phase

### Action 8: Load Session from Cache (Optional)
**Operation:** `login.cache.load`
**Category:** `login.cache`
**Description:** Attempt to restore session from persistent cache

**Steps:**
1. Check if cached cookies exist
   - Multi-user: `multiUserSessionCache.loadSession(userId)`
   - Legacy: `legacySessionCache.loadSession()`
2. If cookies found:
   - Set cookies via `page.setCookie(...cachedCookies)`
   - Navigate to `${config.archibald.url}/Default.aspx`
   - Wait for `networkidle2`
   - Verify URL does not contain "Login.aspx"
3. If session valid: Exit login (success)
4. If session expired: Clear cache and continue

**Timeout:** 10000ms for navigation
**Slowdown:** None
**Error Conditions:**
- Navigation timeout
- Session expired
- Cookie format invalid

---

### Action 9: Navigate to Login Page
**Operation:** `login.goto`
**Category:** `login`
**Description:** Navigate to Archibald login page

**URL Pattern:** `${config.archibald.url}/Login.aspx?ReturnUrl=%2fArchibald%2fDefault.aspx`

**Steps:**
1. Call `page.goto(loginUrl, { waitUntil: 'networkidle2', timeout })`
2. Verify HTTP response status = 200

**Timeout:** From config.puppeteer.timeout
**Metadata:**
- `url`: Login URL

**Error Conditions:**
- HTTP status != 200
- Network timeout
- No server response

---

### Action 10: Wait for Page Load
**Operation:** `login.wait_page`
**Category:** `login`
**Description:** Wait for login page to fully load

**Wait Time:** 2000ms (fixed)

**Steps:**
1. `setTimeout(2000)`

---

### Action 11: Find Username Field
**Operation:** `login.findUsernameField`
**Category:** `login`
**Description:** Locate username input field

**Selector Strategy:**
1. Find all `input[type="text"]` elements
2. Match by patterns:
   - `id` contains "UserName"
   - `name` contains "UserName"
   - `placeholder` contains "account" or "username" (case-insensitive)
3. Fallback: First visible text input

**Returns:** Field ID or name
**Error Conditions:**
- No text inputs found
- Screenshot saved to `logs/login-error.png`

---

### Action 12: Find Password Field
**Operation:** `login.findPasswordField`
**Category:** `login`
**Description:** Locate password input field

**Selector Strategy:**
1. Find all `input[type="password"]` elements
2. Return first match's ID or name

**Returns:** Field ID or name
**Error Conditions:**
- No password inputs found
- Screenshot saved to `logs/login-error.png`

---

### Action 13: Type Username
**Operation:** `login.typeUsername`
**Category:** `login`
**Description:** Fill username field

**Steps:**
1. Click field 3 times (select all)
2. Press Backspace (clear)
3. Type username with 50ms delay per character

**Metadata:**
- `field`: Username field selector

**Error Conditions:**
- Field detached from DOM
- Field not editable

---

### Action 14: Type Password
**Operation:** `login.typePassword`
**Category:** `login`
**Description:** Fill password field

**Steps:**
1. Click field 3 times (select all)
2. Press Backspace (clear)
3. Type password with 50ms delay per character

**Metadata:**
- `field`: Password field selector

**Error Conditions:**
- Field detached from DOM
- Field not editable

---

### Action 15: Click Login Button
**Operation:** `login.clickLoginButton`
**Category:** `login`
**Description:** Submit login form

**Selector Strategy:**
1. Find buttons/links: `button, input[type="submit"], a`
2. Match by text content:
   - Contains "accedi" (case-insensitive)
   - Contains "login" (case-insensitive)
   - ID contains "login" (case-insensitive)
3. Click element

**Fallback:** Press Enter key on password field

**Error Conditions:**
- Button not found (uses fallback)

---

### Action 16: Wait for Redirect
**Operation:** `login.waitRedirect`
**Category:** `login`
**Description:** Wait for post-login navigation

**Steps:**
1. Call `page.waitForNavigation({ waitUntil: 'networkidle2' })`
2. Verify URL contains "Default.aspx" OR does not contain "Login.aspx"

**Timeout:** From config.puppeteer.timeout
**Error Conditions:**
- Navigation timeout
- Still on login page (login failed)

---

### Action 17: Save Session to Cache
**Operation:** `login.cache.save`
**Category:** `login.cache`
**Description:** Persist session cookies for reuse

**Steps:**
1. Get cookies via `page.cookies()`
2. Save to cache:
   - Multi-user: `multiUserSessionCache.saveSession(userId, cookies)`
   - Legacy: `legacySessionCache.saveSession(cookies)`

**Error Conditions:**
- Cache write failure

---

## Order Creation Phase

### Step 1: Navigate to Orders Menu

### Action 18: Click "Ordini" Menu
**Operation:** `order.menu.ordini`
**Category:** `navigation.ordini`
**Description:** Click "Ordini" in left navigation menu

**Selector Strategy:**
```typescript
clickElementByText("Ordini", {
  exact: true,
  selectors: ["a", "span", "div", "td"]
})
```

**Steps:**
1. Find all elements matching selectors
2. Filter by text content (case-insensitive):
   - Exact match: "ordini"
   - Text length < 100 chars
3. Click matched element
4. Wait for orders list page verification

**Verification:**
```typescript
page.waitForFunction(() => {
  const elements = Array.from(document.querySelectorAll("span, button, a"));
  return elements.some(el => el.textContent?.trim().toLowerCase() === "nuovo");
}, { timeout: 5000 })
```

**Slowdown After:** `getSlowdown("click_ordini")` (default: 200ms)
**Timeout:** 5000ms for verification
**Error Conditions:**
- "Ordini" menu not found
- Navigation timeout
- "Nuovo" button never appears

---

### Step 2: Open New Order Form

### Action 19: Click "Nuovo" Button
**Operation:** `order.click_nuovo`
**Category:** `navigation.form`
**Description:** Click "Nuovo" to create new order

**Selector Strategy:**
```typescript
clickElementByText("Nuovo", {
  exact: true,
  selectors: ["button", "a", "span"]
})
```

**Steps:**
1. Capture current URL
2. Find and click "Nuovo" button
3. Wait for URL change verification
4. Wait for DevExpress loading indicators to disappear

**URL Change Verification:**
```typescript
page.waitForFunction(
  (oldUrl) => window.location.href !== oldUrl,
  { timeout: 5000 },
  urlBefore
)
```

**DevExpress Ready Check:**
```typescript
page.waitForFunction(() => {
  const loadingIndicators = Array.from(
    document.querySelectorAll('[id*="LPV"], .dxlp, .dxlpLoadingPanel, [id*="Loading"]')
  );
  return loadingIndicators.every(el =>
    el.style.display === "none" || el.offsetParent === null
  );
}, { timeout: 5000, polling: 100 })
```

**Slowdown After:** `getSlowdown("click_nuovo")` (default: 200ms)
**Timeout:** 5000ms for navigation
**Error Conditions:**
- "Nuovo" button not found
- URL did not change
- Form failed to load

---

### Step 3: Select Customer

### Action 20: Find Customer Field
**Operation:** `order.customer.select` (sub-step)
**Category:** `form.customer`
**Description:** Locate customer input field

**Immediate Check (Optimized):**
```typescript
const customerInputId = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
  const customerInput = inputs.find(input => {
    const id = input.id.toLowerCase();
    return (
      (id.includes("custtable") ||
       id.includes("custaccount") ||
       id.includes("custome") ||
       id.includes("cliente") ||
       id.includes("account") ||
       id.includes("profilo")) &&
      !input.disabled &&
      input.getBoundingClientRect().height > 0
    );
  });
  return customerInput ? customerInput.id : null;
});
```

**Fallback - Mutation Polling:**
```typescript
page.waitForFunction(() => {
  // Same logic as above
}, { timeout: 3000, polling: "mutation" })
```

**Timeout:** 3000ms for mutation polling
**Error Conditions:**
- Field not found after timeout
- Diagnostic: Log all text inputs on page

---

### Action 21: Click Customer Dropdown Button
**Operation:** `order.customer.select` (sub-step)
**Category:** `form.customer`
**Description:** Open customer dropdown

**Button Selector Strategies (in order):**
1. `#${customerBaseId}_B-1`
2. `#${customerBaseId}_B-1Img`
3. `#${customerBaseId}_B`
4. `#${customerBaseId}_DDD`
5. `#${customerBaseId}_DropDown`

**Steps:**
1. Extract base ID from customer input (remove `_I` suffix if present)
2. Try each selector in order
3. Verify element has bounding box
4. Click element

**Error Conditions:**
- Dropdown button not found for any selector

---

### Action 22: Wait for Search Input to Appear
**Operation:** `order.customer.select` (sub-step)
**Category:** `form.customer`
**Description:** Wait for dropdown search input to render

**Search Input Selectors:**
1. `#${customerBaseId}_DDD_gv_DXSE_I` (DevExpress standard pattern)
2. `input[placeholder*="enter text to search" i]` (generic fallback)

**Event-Driven Wait:**
```typescript
page.waitForFunction((selectors) => {
  for (const sel of selectors) {
    const input = document.querySelector(sel);
    if (input &&
        input.offsetParent !== null &&
        !input.disabled &&
        !input.readOnly) {
      return sel;
    }
  }
  return null;
}, { timeout: 3000, polling: 50 }, searchInputSelectors)
```

**Fallback:** Try each selector individually with visibility check

**Timeout:** 3000ms
**Error Conditions:**
- Search input not found
- Screenshot saved: `logs/search-input-not-found-{timestamp}.png`

---

### Action 23: Paste Customer Name
**Operation:** `order.customer.select` (sub-step)
**Category:** `form.customer`
**Description:** Paste customer name into search input

**Paste Helper Function:**
```typescript
async pasteText(inputHandle, text) {
  // 1. Triple click to select all
  await inputHandle.click({ clickCount: 3 });
  await wait(100);

  // 2. Set value directly (faster than clipboard)
  await inputHandle.evaluate((el, value) => {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, text);

  await wait(100);

  // 3. Press End to move cursor
  await inputHandle.press("End");
  await wait(100);
}
```

**Value Verification:**
```typescript
page.waitForFunction(
  (selector, expectedValue) => {
    const input = document.querySelector(selector);
    return input && input.value === expectedValue ? input.value : null;
  },
  { timeout: 1000, polling: 50 },
  foundSelector,
  orderData.customerName
)
```

**Error Conditions:**
- Paste failed
- Value mismatch

---

### Action 24: Press Enter and Wait for Results
**Operation:** `order.customer.select` (sub-step)
**Category:** `form.customer`
**Description:** Trigger search and wait for filtered results

**Steps:**
1. Press Enter key
2. Immediate check for existing results
3. If no results: Wait and click in one operation

**Immediate Check:**
```typescript
const stableRowCount = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
  const visibleRows = rows.filter(row =>
    row.offsetParent !== null &&
    row.getBoundingClientRect().height > 0
  );
  return visibleRows.length;
});
```

**Event-Driven Wait + Click (OPT-15):**
```typescript
page.waitForFunction(() => {
  const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
  const visibleRows = rows.filter(row =>
    row.offsetParent !== null &&
    row.getBoundingClientRect().height > 0
  );

  if (visibleRows.length > 0) {
    // Click immediately when first row appears
    const firstRow = visibleRows[0];
    const firstCell = firstRow.querySelector("td");
    const clickTarget = firstCell || firstRow;
    clickTarget.click();
    return true;
  }
  return false;
}, { timeout: 2000, polling: "mutation" })
```

**Timeout:** 2000ms
**Error Conditions:**
- No customer results found
- Click failed

---

### Action 25: Wait for Dropdown to Close
**Operation:** `order.customer.select` (sub-step)
**Category:** `form.customer`
**Description:** Wait for dropdown panel to disappear

**Event-Driven Wait:**
```typescript
page.waitForFunction(() => {
  const dropdownPanels = Array.from(document.querySelectorAll('[id*="_DDD_PW"]'));
  const visiblePanels = dropdownPanels.filter(panel =>
    panel.offsetParent !== null &&
    panel.style.display !== "none"
  );
  return visiblePanels.length === 0;
}, { timeout: 2000, polling: 100 })
```

**Timeout:** 2000ms
**Error Conditions:**
- Timeout ignored (non-critical)

---

### Action 26: Wait for DevExpress Ready
**Operation:** `order.customer.select` (sub-step)
**Category:** `form.customer`
**Description:** Wait for customer data to load

**Steps:**
1. Call `waitForDevExpressReady({ timeout: 3000 })`
2. Slowdown after customer selection

**Slowdown After:** `getSlowdown("select_customer")` (default: 200ms)
**Timeout:** 3000ms for DevExpress ready

---

### Step 4: Create First Line Item Row

### Action 27: Click "New" in Line Items Grid
**Operation:** `order.lineditems.click_new`
**Category:** `form.multi_article`
**Description:** Click "New" button to add first article row

**Wait Before:** 1000ms (for grid to load)

**Button Search Strategies:**

**Strategy 1 - data-args:**
```typescript
document.querySelectorAll('a[data-args*="AddNew"]')
```

**Strategy 2 - Image with Title:**
```typescript
// Find img with title="New" and src contains "Action_Inline_New"
const images = document.querySelectorAll('img[title="New"]');
for (const img of images) {
  if (img.src.includes("Action_Inline_New")) {
    const parent = img.parentElement; // Should be <a>
    if (parent && parent.tagName === "A") {
      return parent;
    }
  }
}
```

**Strategy 3 - ID Pattern:**
```typescript
// Find a.dxbButton_XafTheme with ID containing "SALESLINEs" and "DXCBtn"
const allLinks = document.querySelectorAll("a.dxbButton_XafTheme");
for (const link of allLinks) {
  if (link.id.includes("SALESLINEs") && link.id.includes("DXCBtn")) {
    return link;
  }
}
```

**Click Steps:**
1. Get button handle based on strategy
2. Scroll into view: `element.scrollIntoView({ block: "center" })`
3. Wait 300ms for scroll stabilization
4. Click button

**Error Conditions:**
- Button not found (all strategies failed)
- Screenshot: `logs/new-button-not-found-{timestamp}.png`

---

### Action 28: Wait for New Row to Appear
**Operation:** `order.lineditems.click_new` (sub-step)
**Category:** `form.multi_article`
**Description:** Verify article input field appeared

**Event-Driven Wait:**
```typescript
page.waitForFunction(() => {
  const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
  return inputs.some(input => {
    const id = input.id.toLowerCase();
    return (
      id.includes("itemid") ||
      id.includes("salesline") ||
      id.includes("articolo") ||
      id.includes("nome")
    );
  });
}, { timeout: 3000 })
```

**Final Verification:**
```typescript
const articleInputAppeared = await page.evaluate(() => {
  // Same logic as waitForFunction
  return inputs.some(...);
});
```

**Slowdown After:** `getSlowdown("click_new_article")` (default: 200ms)
**Timeout:** 3000ms
**Error Conditions:**
- New row did not appear

---

### Step 5-8: Add Articles (Loop)

**Repeat for each item in `orderData.items[]`**

---

#### Action 29: Select Package Variant (Item Loop)
**Operation:** `order.item.${i}.select_variant`
**Category:** `form.package`
**Description:** Query database for correct package variant

**Database Query:**
```typescript
const selectedVariant = productDb.selectPackageVariant(
  item.articleCode,
  item.quantity
);
```

**Variant Selection Logic:**
1. Find all variants matching article code
2. Select variant where quantity matches package rules:
   - `quantity >= variant.minQty`
   - `quantity <= variant.maxQty` (if set)
   - `quantity % variant.multipleQty === 0`

**Error Conditions:**
- Article not found in database
- Message: "Ensure product sync has run"

**Metadata Logged:**
- `variantId`
- `packageContent`
- `multipleQty`
- `quantity`

---

#### Action 30: Paste Article Code Directly (Item Loop)
**Operation:** `order.item.${i}.paste_article_direct`
**Category:** `form.article`
**Description:** Paste article code into article field (optimized - no dropdown click)

**Wait Before:** 1000ms for grid stability

**Find Article Field Strategies:**

**Strategy 1 - ITEMID:**
```typescript
const inputs = document.querySelectorAll('input[type="text"]');
const itemIdInput = inputs.find(input => {
  const id = input.id.toLowerCase();
  return (
    id.includes("itemid") &&
    id.includes("salesline") &&
    input.offsetParent !== null
  );
});
```

**Strategy 2 - INVENTTABLE:**
```typescript
const inventTableInput = inputs.find(input => {
  const id = input.id.toLowerCase();
  return (
    id.includes("inventtable") &&
    id.includes("salesline") &&
    input.offsetParent !== null
  );
});
```

**Strategy 3 - N/A Value:**
```typescript
const naInput = inputs.find(input => {
  const value = input.value;
  const id = input.id.toLowerCase();
  return (
    value === "N/A" &&
    id.includes("salesline") &&
    !id.includes("linenum") &&
    input.offsetParent !== null
  );
});
```

**Paste Steps:**
1. Get article input handle
2. Scroll into view: `element.scrollIntoView({ block: "center" })`
3. Wait 200ms
4. Click field to focus
5. Wait 300ms
6. Paste article code using `pasteText()` helper
7. Verify paste success
8. Wait 800ms for dropdown to auto-appear

**Paste Verification:**
```typescript
page.waitForFunction(
  (inputId, expectedValue) => {
    const input = document.querySelector(`#${inputId}`);
    return input && input.value === expectedValue ? input.value : null;
  },
  { timeout: 1000, polling: 50 },
  articleInputId,
  searchTerm
)
```

**Dropdown Appearance Check:**
```typescript
const resultsAppeared = await page.evaluate(() => {
  // Look for DevExpress dropdown/listbox containers
  const dropdowns = Array.from(
    document.querySelectorAll('[class*="dxeListBox"], [class*="DDD"]')
  );
  for (const dropdown of dropdowns) {
    if (dropdown.offsetParent === null) continue;

    // Look for table rows with article data
    const rows = Array.from(dropdown.querySelectorAll("tr"));
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length >= 3) {
        const hasContent = cells.some(cell => {
          const text = cell.textContent?.trim() || "";
          return text.length > 0 && text !== "No data to display";
        });
        if (hasContent) return true;
      }
    }
  }
  return false;
});
```

**Slowdown After:** `getSlowdown("paste_article_direct")` (default: 200ms)
**Error Conditions:**
- Article field not found
- Paste failed
- Dropdown did not appear
- Screenshot: `logs/article-field-not-found-{timestamp}.png` or `logs/article-dropdown-no-results-{timestamp}.png`

---

#### Action 31: Select Article Variant Row (Item Loop - with Pagination)
**Operation:** `order.item.${i}.select_article`
**Category:** `form.article`
**Description:** Select correct variant row from dropdown (supports pagination)

**Variant Suffix Extraction:**
```typescript
// Extract last 2 characters from variant ID
// Example: "005159K3" → "K3"
const variantSuffix = selectedVariant.id.substring(
  selectedVariant.id.length - 2
);
```

**Pagination Loop:**
```typescript
let rowSelected = false;
let currentPage = 1;
const maxPages = 10; // Safety limit

while (!rowSelected && currentPage <= maxPages) {
  // Try to find row on current page
  rowSelected = await selectRowOnCurrentPage();

  if (!rowSelected) {
    // Check for next page button
    const hasNextPage = await checkNextPageButton();
    if (!hasNextPage) break;

    // Click next page
    await clickNextPageButton();
    await wait(1500);
    currentPage++;
  }
}
```

**Row Selection Logic:**
```typescript
// Find all visible rows
const rows = Array.from(document.querySelectorAll('tr[class*="dxgvDataRow"]'));
const visibleRows = rows.filter(row => row.offsetParent !== null);

// Match by package content (most reliable)
for (const row of visibleRows) {
  const cells = Array.from(row.querySelectorAll("td"));
  if (cells.length < 6) continue;

  const cellTexts = cells.map(cell => cell.textContent?.trim() || "");

  // Look for packageContent in columns 3-5
  const packageStr = String(selectedVariant.packageContent);
  const hasPackageMatch = cellTexts.some((text, index) => {
    if (index >= 3 && index <= 5) {
      return text === packageStr;
    }
    return false;
  });

  if (hasPackageMatch) {
    // Click first cell
    const firstCell = cells[0];
    firstCell.click();
    return true;
  }
}
```

**Next Page Button Detection:**
```typescript
// Strategy 1: Find img with alt="Next" or class containing "pNext"
const images = Array.from(document.querySelectorAll("img"));
for (const img of images) {
  const alt = img.getAttribute("alt") || "";
  const className = img.className || "";

  if (alt === "Next" || className.includes("pNext")) {
    const parent = img.parentElement;
    if (parent && parent.offsetParent !== null) {
      const isDisabled = parent.className.includes("dxp-disabled") ||
                         parent.className.includes("disabled");
      if (!isDisabled) {
        return { hasNextPage: true, buttonElement: parent };
      }
    }
  }
}

// Strategy 2: Find button with onclick containing "PBN" (Page Button Next)
const allButtons = Array.from(
  document.querySelectorAll("a.dxp-button, button.dxp-button")
);
for (const btn of allButtons) {
  const onclick = btn.getAttribute("onclick") || "";
  const isNextButton = onclick.includes("'PBN'") || onclick.includes('"PBN"');
  const isDisabled = btn.className.includes("dxp-disabled");

  if (isNextButton && !isDisabled && btn.offsetParent !== null) {
    return { hasNextPage: true, buttonElement: btn };
  }
}
```

**Wait After Selection:** 1000ms + DevExpress ready check
**Additional Wait:** 2400ms for article data loading (critical)

**Slowdown After:** `getSlowdown("select_article")` (default: 200ms)
**Timeout:** 1500ms per page load
**Error Conditions:**
- Variant not found after searching all pages
- Screenshot: `logs/variant-not-found-{timestamp}.png`
- Error message includes: article code, variant ID, package content, pages searched

---

#### Action 32: Validate Quantity (Item Loop)
**Operation:** `order.item.${i}.select_article` (sub-step)
**Category:** `form.article`
**Description:** Validate quantity against package rules

**Validation Rules:**
```typescript
const validation = productDb.validateQuantity(selectedVariant, quantity);

// Checks:
// 1. quantity >= minQty
// 2. quantity <= maxQty (if maxQty is set)
// 3. quantity % multipleQty === 0
```

**Error Conditions:**
- Quantity below minimum
- Quantity above maximum
- Quantity not a multiple of multipleQty
- Error includes suggested valid quantities

**Metadata Populated:**
- `item.articleId = selectedVariant.id`
- `item.packageContent = parseInt(selectedVariant.packageContent)`

---

#### Action 33: Set Quantity (Item Loop - OPT-03)
**Operation:** `order.item.${i}.set_quantity`
**Category:** `field-editing`
**Description:** Set quantity in grid cell (optimized with smart skip)

**Smart Skip Optimization:**
```typescript
// If quantity == multipleQty, DevExpress auto-fills correctly
// Skip manual editing for exact package matches
if (item.quantity === selectedVariant.multipleQty) {
  logger.info(`⚡ Quantity matches multipleQty - skipping edit`);
  await wait(500); // Let DevExpress stabilize
  return;
}
```

**Field Editing Process (if not skipped):**

**1. Find Quantity Input:**
```typescript
const inputs = document.querySelectorAll('input[type="text"]');

// Map label to ID pattern
let idPattern = "";
if (label.toLowerCase().includes("qtà") ||
    label.toLowerCase().includes("quantit")) {
  idPattern = "qtyordered";
}

const input = inputs.find(inp => {
  const id = inp.id.toLowerCase();
  return (
    id.includes(idPattern) &&
    id.includes("salesline") &&
    inp.offsetParent !== null
  );
});
```

**2. Atomic Double-Click to Enter Edit Mode:**
```typescript
await page.evaluate((inputId) => {
  const input = document.querySelector(`#${inputId}`);
  if (!input) return false;

  input.focus();

  const dblClickEvent = new MouseEvent("dblclick", {
    view: window,
    bubbles: true,
    cancelable: true,
    detail: 2
  });
  input.dispatchEvent(dblClickEvent);

  // Sync wait for edit mode
  const start = Date.now();
  while (Date.now() - start < 150) {}

  return true;
}, inputInfo.id);
```

**Wait:** 300ms after double-click

**3. Select All Content:**
```typescript
await page.evaluate((inputId) => {
  const input = document.querySelector(`#${inputId}`);
  if (!input) return false;

  input.focus();
  input.select(); // Select all text programmatically

  return true;
}, inputInfo.id);
```

**Wait:** 100ms after selection

**4. Clear and Type New Value:**
```typescript
await page.keyboard.press("Backspace"); // Delete selected text
await wait(50);

// Format value (use comma as decimal separator)
const formattedValue = Number(value).toString().replace(".", ",");

await page.keyboard.type(formattedValue, { delay: 30 });
```

**Wait:** 300ms after typing

**⚠️ CRITICAL:** Do NOT press Enter or Tab! Leave value in editor for Update button to save.

**Slowdown After:** `getSlowdown("paste_qty")` (default: 200ms)
**Error Conditions:**
- Input field not found
- Double-click failed
- Text selection failed

---

#### Action 34: Set Discount (Item Loop - Optional)
**Operation:** `order.item.${i}.set_discount`
**Category:** `field-editing`
**Description:** Set discount percentage in grid cell

**Condition:** Only if `item.discount !== undefined && item.discount > 0`

**Field Editing Process:**
Same as Action 33 (Set Quantity), but:
- ID pattern: "discount"
- Label: "Applica sconto"

**Wait After:** 300ms
**Error Conditions:**
- Same as quantity field editing

---

#### Action 35: Click "Update" Button (Item Loop)
**Operation:** `order.item.${i}.click_update`
**Category:** `form.submit`
**Description:** Save line item changes (floppy disk icon)

**Button Search Strategies:**

**Strategy 1 - data-args:**
```typescript
document.querySelectorAll('a[data-args*="UpdateEdit"]')
```

**Strategy 2 - Image:**
```typescript
const images = document.querySelectorAll('img[title="Update"]');
for (const img of images) {
  if (img.src.includes("Action_Save")) {
    const parent = img.parentElement;
    if (parent && parent.tagName === "A") {
      return parent;
    }
  }
}
```

**Strategy 3 - ID Pattern:**
```typescript
const allLinks = document.querySelectorAll("a.dxbButton_XafTheme");
for (const link of allLinks) {
  if (link.id.includes("SALESLINEs") && link.id.includes("DXCBtn0")) {
    return link;
  }
}
```

**Atomic Click Process:**
```typescript
await page.evaluate(() => {
  const button = document.querySelector('a[data-args*="UpdateEdit"]');
  if (!button) return false;

  button.scrollIntoView({ block: "center" });

  // Sync wait for scroll stabilization
  const start = Date.now();
  while (Date.now() - start < 200) {}

  button.click();
  return true;
});
```

**Wait After:** DevExpress ready check (timeout: 3000ms)
**Slowdown After:** `getSlowdown("click_update")` (default: 200ms)
**Error Conditions:**
- Update button not found
- Click failed
- Screenshot: `logs/update-button-not-found-{timestamp}.png`

---

#### Action 36: Click "New" for Next Article (Item Loop - If Not Last)
**Operation:** `order.item.${i}.click_new_for_next`
**Category:** `multi-article-navigation`
**Description:** Add new row for next article

**Condition:** Only if `i < orderData.items.length - 1`

**OPT-04: Event-Driven Button Reappearance**

**Step 1 - Wait for Button Disappearance:**
```typescript
page.waitForFunction(() => {
  const buttons = Array.from(document.querySelectorAll('a[data-args*="AddNew"]'));
  return buttons.length === 0;
}, { timeout: 2000 })
```

**Step 2 - Wait for Button Reappearance:**
```typescript
page.waitForFunction(() => {
  const buttons = Array.from(document.querySelectorAll('a[data-args*="AddNew"]'));
  return buttons.length > 0;
}, { timeout: 5000 })
```

**Wait:** 200ms stability wait after button appears

**Button Search (Priority Order):**

**1. Prefer DXCBtn1 (after Update):**
```typescript
const buttons = document.querySelectorAll('a[data-args*="AddNew"]');
for (const btn of buttons) {
  if (btn.id.includes("DXCBtn1")) {
    return btn;
  }
}
```

**2. Fallback to DXCBtn0:**
```typescript
for (const btn of buttons) {
  if (btn.id.includes("SALESLINEs") && btn.id.includes("DXCBtn0")) {
    return btn;
  }
}
```

**3. Find by Image:**
```typescript
const images = document.querySelectorAll('img[title="New"]');
for (const img of images) {
  if (img.src.includes("Action_Inline_New")) {
    const parent = img.parentElement;
    if (parent && parent.tagName === "A" &&
        parent.id.includes("SALESLINE")) {
      return parent;
    }
  }
}
```

**Click Steps:**
1. Get button handle
2. Scroll into view: `element.scrollIntoView({ block: "center" })`
3. Wait 300ms
4. Click button

**Wait for New Row:**
```typescript
page.waitForFunction((expectedRowIndex) => {
  const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
  const articleInputs = inputs.filter(input => {
    const id = input.id.toLowerCase();
    return (
      id.includes("itemid") ||
      id.includes("salesline") ||
      id.includes("articolo") ||
      id.includes("nome")
    );
  });
  return articleInputs.length > 0;
}, { timeout: 3000 }, i + 1)
```

**Wait After:** DevExpress ready check (timeout: 3000ms)
**Timeout:** 2000ms for disappearance, 5000ms for reappearance, 3000ms for new row
**Error Conditions:**
- Button not found
- Screenshot: `logs/new-button-for-next-not-found-{timestamp}.png`

---

### Step 9: Extract Order ID

### Action 37: Extract Order ID
**Operation:** `order.extract_id`
**Category:** `form.submit`
**Description:** Get order ID before saving

**Extraction Strategies:**

**Strategy 1 - From URL:**
```typescript
const currentUrl = page.url();
const urlMatch = currentUrl.match(/ObjectKey=([^&]+)/);
if (urlMatch) {
  orderId = decodeURIComponent(urlMatch[1]);
}
```

**Strategy 2 - From Form Field:**
```typescript
const inputs = document.querySelectorAll('input[type="text"]');

for (const input of inputs) {
  const id = input.id || "";

  // Look for ID field pattern
  if (id.includes("dviID_") || id.includes("SALESID_")) {
    const value = input.value?.trim();
    if (value && value !== "0" && value !== "") {
      return { source: "form_field", value, fieldId: id };
    }
  }
}
```

**Fallback - Timestamp:**
```typescript
orderId = `ORDER-${Date.now()}`;
```

**Error Conditions:**
- None (fallback always succeeds)

---

### Step 9.5: Apply Global Discount (Optional)

### Action 38: Click "Prezzi e sconti" Tab
**Operation:** `order.apply_global_discount` (sub-step)
**Category:** `form.discount`
**Description:** Navigate to pricing/discounts tab

**Condition:** Only if `orderData.discountPercent > 0`

**Tab Search Strategies:**

**Strategy 1 - By Text:**
```typescript
const allLinks = Array.from(
  document.querySelectorAll("a.dxtc-link, span.dx-vam")
);

for (const element of allLinks) {
  const text = element.textContent?.trim() || "";
  if (text.includes("Prezzi") && text.includes("sconti")) {
    const clickTarget = element.tagName === "A" ? element : element.parentElement;
    if (clickTarget && clickTarget.offsetParent !== null) {
      clickTarget.click();
      return true;
    }
  }
}
```

**Strategy 2 - By Tab ID:**
```typescript
const tabs = Array.from(document.querySelectorAll('li[id*="_pg_AT"]'));
for (const tab of tabs) {
  const link = tab.querySelector("a.dxtc-link");
  const span = tab.querySelector("span.dx-vam");
  const text = span?.textContent?.trim() || "";

  if (text.includes("Prezzi") && text.includes("sconti")) {
    if (link && link.offsetParent !== null) {
      link.click();
      return true;
    }
  }
}
```

**Wait After:** 2000ms for tab content to load and render
**Error Conditions:**
- Tab not found (warning logged, continues anyway)

---

### Action 39: Find and Fill Global Discount Field
**Operation:** `order.apply_global_discount` (sub-step)
**Category:** `form.discount`
**Description:** Set global discount percentage

**Find MANUALDISCOUNT Field:**
```typescript
const inputs = document.querySelectorAll('input[type="text"]');

const manualDiscountInput = inputs.find(input => {
  const id = input.id.toLowerCase();
  return (
    (id.includes("manualdiscount") ||
     id.includes("dvimanualdiscount") ||
     id.includes("applica") ||
     id.includes("sconto")) &&
    !id.includes("salesline") && // Not a line-level discount
    input.offsetParent !== null && // Visible
    !input.readOnly // Editable
  );
});
```

**Debug Info:** Logs all discount-related inputs if field not found

**Edit Process:**

**1. Double-Click Field:**
```typescript
await discountInput.click({ clickCount: 2 });
await wait(300);
```

**2. Select All:**
```typescript
await page.keyboard.down("Control");
await page.keyboard.press("KeyA");
await page.keyboard.up("Control");
await wait(100);
```

**3. Type Discount (Italian Format):**
```typescript
// Format: "XX,XX" (comma, without % symbol)
const discountFormatted = orderData.discountPercent
  .toFixed(2)
  .replace(".", ",");

await page.keyboard.type(discountFormatted, { delay: 50 });
await wait(500);
```

**4. Confirm with Tab:**
```typescript
await page.keyboard.press("Tab");
await wait(1000); // Wait for Archibald to recalculate totals
```

**Error Conditions:**
- Field not found (warning, continues)
- Debug info includes all discount-related inputs

---

### Step 10: Save and Close Order

### Action 40: Open "Salvare" Dropdown
**Operation:** `order.save_and_close` (sub-step)
**Category:** `form.submit`
**Description:** Open save options dropdown

**Find "Salvare" Button:**
```typescript
const allElements = Array.from(
  document.querySelectorAll("span, button, a")
);
const salvareBtn = allElements.find(el => {
  const text = el.textContent?.trim() || "";
  return text.toLowerCase().includes("salvare");
});
```

**Click Dropdown Arrow:**
```typescript
const parent = salvareBtn.parentElement;
const arrow = parent.querySelector('img[id*="_B-1"], img[alt*="down"]');
if (arrow) {
  arrow.click();
  return true;
}

// Fallback: click button itself
salvareBtn.click();
```

**Slowdown After:** `getSlowdown("click_salvare_dropdown")` (default: 200ms)
**Error Conditions:**
- "Salvare" button not found

---

### Action 41: Click "Salva e chiudi"
**Operation:** `order.save_and_close` (sub-step)
**Category:** `form.submit`
**Description:** Save and close order

**Selector:**
```typescript
clickElementByText("Salva e chiudi", {
  exact: true,
  selectors: ["a", "span", "div"]
})
```

**Slowdown After:** `getSlowdown("click_salva_chiudi")` (default: 200ms)
**Error Conditions:**
- Option not found in dropdown

---

### Action 42: Write Operation Report
**Operation:** `writeOperationReport`
**Category:** `reporting`
**Description:** Generate performance report

**Report Location:** `logs/operation-report-{timestamp}.md`
**Format:** Enhanced markdown with:
- Summary statistics
- Category breakdown
- Percentile analysis (p50, p95, p99)
- Retry analysis
- Slowest operations
- Longest gaps
- Detailed timeline

**Export Format:** Also available as JSON via `exportProfilingData()`

---

## Error Handling

### Global Error Actions

**On Any Error:**
1. Log error message and stack trace
2. Capture screenshot: `logs/order-error-{timestamp}.png`
3. Write operation report (even on failure)
4. Re-throw error

**Screenshots Saved:**
- `logs/login-error.png` - Login fields not found
- `logs/login-error-final.png` - Login process failed
- `logs/search-input-not-found-{timestamp}.png` - Dropdown search input missing
- `logs/new-button-not-found-{timestamp}.png` - New line item button missing
- `logs/article-field-not-found-{timestamp}.png` - Article input field missing
- `logs/article-dropdown-no-results-{timestamp}.png` - Article dropdown empty
- `logs/variant-not-found-{timestamp}.png` - Variant row not in dropdown
- `logs/update-button-not-found-{timestamp}.png` - Update button missing
- `logs/new-button-for-next-not-found-{timestamp}.png` - New button for next article missing
- `logs/order-error-{timestamp}.png` - General order creation error

---

## Performance Optimizations

### OPT-03: Atomic Field Editing
- **Technique:** Single JavaScript evaluation for double-click + wait
- **Benefit:** Prevents element detachment after scroll
- **Used In:** Quantity, discount, update button clicks

### OPT-04: Event-Driven Waiting
- **Technique:** `waitForFunction()` with mutation polling instead of fixed `setTimeout()`
- **Benefit:** Reduces unnecessary wait time
- **Used In:** Grid row insertion, button reappearance

### OPT-05: No Fixed Waits for Dropdowns
- **Technique:** Event-based detection of element appearance/disappearance
- **Benefit:** Faster execution when UI responds quickly
- **Used In:** Search input appearance, dropdown closing

### OPT-06: Paste Helper with Event Verification
- **Technique:** Direct value setting + event dispatch + verification
- **Benefit:** 10x faster than character-by-character typing
- **Used In:** Customer name, article code, quantity, discount

### OPT-10: Removed Debug Screenshots
- **Benefit:** Saves I/O time during normal execution
- **Note:** Screenshots still captured on errors

### OPT-12: Immediate Check Before Wait
- **Technique:** Synchronous element check before async `waitForFunction()`
- **Benefit:** Zero wait if element already present
- **Used In:** Customer field, dropdown results

### OPT-15: Wait + Click in One Operation
- **Technique:** Click element immediately when it appears in `waitForFunction()`
- **Benefit:** Eliminates gap between detection and action
- **Used In:** Customer dropdown row selection

### Smart Skip: Quantity Auto-Fill
- **Technique:** Skip manual quantity editing when `quantity === multipleQty`
- **Benefit:** DevExpress auto-fills correctly, saves 500-1000ms per item
- **Used In:** Quantity field editing

---

## Slowdown Configuration

### Default Slowdown
**Value:** 200ms (if step not in config)

### Configurable Steps
All steps can be customized via `SlowdownConfig` parameter:

```typescript
const slowdownConfig = {
  "click_ordini": 200,
  "click_nuovo": 200,
  "select_customer": 200,
  "click_new_article": 200,
  "paste_article_direct": 200,
  "select_article": 200,
  "paste_qty": 200,
  "click_update": 200,
  "click_salvare_dropdown": 200,
  "click_salva_chiudi": 200
};
```

### Usage
```typescript
await bot.createOrder(orderData, slowdownConfig);
```

---

## Helper Functions

### `wait(ms: number)`
**Purpose:** Delay execution
**Implementation:** `new Promise(resolve => setTimeout(resolve, ms))`

### `getSlowdown(stepName: string)`
**Purpose:** Get slowdown value for step
**Returns:** `slowdownConfig[stepName] ?? 200`

### `clickElementByText(text, options)`
**Purpose:** Find and click element by text content
**Options:**
- `exact`: Exact match vs. contains (default: false)
- `selectors`: Element types to search (default: ["a", "span", "button", "div"])
- `timeout`: Not used (searches immediately)

**Search Logic:**
1. Query all elements matching selectors
2. Filter by text content (case-insensitive)
3. For non-exact: Also check text length < 100
4. Click matched element
5. Return true/false

### `openDevExpressDropdown(labelText, options)`
**Purpose:** Find and open DevExpress dropdown by label
**Not Used:** in optimized flow (replaced by direct ID-based approach)

### `pasteText(inputHandle, text)`
**Purpose:** Fast text input with event dispatch
**Steps:**
1. Triple-click to select all
2. Set `value` directly
3. Dispatch `input` and `change` events
4. Press End to move cursor

### `searchInDropdown(searchText, options)`
**Purpose:** Type/paste in dropdown search input
**Not Used:** in optimized flow (replaced by direct paste + Enter)

### `selectDropdownRow(matchText, options)`
**Purpose:** Select row in dropdown by text
**Options:**
- `exact`: Exact match vs. contains (default: false)

**Search Logic:**
1. Find all visible `tr[class*="dxgvDataRow"]`
2. Match row by text content
3. Click first `<td>` in matched row

### `editTableCell(cellLabelText, value)`
**Purpose:** Edit grid cell value (quantity, discount)
**Process:** See Actions 33-34

### `waitForDevExpressReady(options)`
**Purpose:** Wait for loading indicators to disappear
**Options:**
- `timeout`: Max wait time (default: 5000ms)

**Detection:**
```typescript
page.waitForFunction(() => {
  const loadingIndicators = Array.from(
    document.querySelectorAll('[id*="LPV"], .dxlp, .dxlpLoadingPanel, [id*="Loading"]')
  );
  return loadingIndicators.every(el =>
    el.style.display === "none" || el.offsetParent === null
  );
}, { timeout, polling: 100 })
```

**Stabilization:** Additional 300ms wait after indicators disappear
**Fallback:** Fixed 1000ms wait if detection fails

---

## Operation Tracking

### `runOp(name, fn, category, meta)`
**Purpose:** Wrap operation for profiling and reporting

**Tracks:**
- Operation ID (sequential)
- Name and category
- Start/end timestamps (ISO format)
- Duration (high-precision nanoseconds)
- Gap from previous operation
- Retry attempt number
- Memory before/after (heap usage)
- Status (ok/error)
- Error message (if failed)
- Custom metadata

**Usage:**
```typescript
await this.runOp(
  "order.menu.ordini",
  async () => {
    // Operation logic
  },
  "navigation.ordini",
  { customMeta: "value" }
);
```

### Category Naming Conventions
- `login` - Authentication and browser init
- `login.cache` - Session cache operations
- `navigation.ordini` - Navigate to orders menu
- `navigation.form` - Navigate to order form
- `form.customer` - Customer selection
- `form.article` - Article search/selection
- `form.quantity` - Quantity field
- `form.discount` - Discount field
- `form.package` - Package variant selection
- `form.submit` - Save/update operations
- `form.multi_article` - Multi-article row operations
- `field-editing` - Generic field editing
- `multi-article-navigation` - Navigation between articles

---

## End of Document

**Total Actions Documented:** 42 atomic actions
**Total Steps:** 10 major steps
**Helper Functions:** 9
**Optimizations:** 7 major techniques
**Error Screenshots:** 9 types

