# Phase 28.1 UAT Checklist

## Test Date: [To be filled]
## Tester: [To be filled]
## Environment: [Development/Production]

---

## 1. Customer Selection Tests

### 1.1 Basic Selection
- [ ] Click customer input, dropdown appears
- [ ] Dropdown shows customer list
- [ ] Click a customer, customer is selected
- [ ] Customer name appears in input field
- [ ] "✅ Cliente selezionato: [name]" confirmation appears
- [ ] Dropdown closes after selection

### 1.2 Filtering
- [ ] Type partial name (e.g., "ros"), dropdown filters
- [ ] Only matching customers shown
- [ ] Click filtered customer, selection works
- [ ] Case-insensitive search works (ROS = ros)

### 1.3 Edge Cases
- [ ] Long customer names display correctly
- [ ] Special characters in names handled (è, à, ù, ò)
- [ ] Selecting customer at bottom of dropdown works
- [ ] Clearing input resets dropdown to full list
- [ ] Can change customer after selecting

### 1.4 Regression
- [ ] Voice input for customer still works
- [ ] Customer search from IndexedDB cache fast (<100ms)

---

## 2. Product Filtering Tests

### 2.1 Article Code Search
- [ ] Type partial article code (e.g., "h129"), dropdown shows matches
- [ ] Type full article code (e.g., "h129fsq.104.023"), specific product appears
- [ ] Dots in article codes handled (XX.XX.XXX.XXX format)
- [ ] Case-insensitive article search works (H129 = h129)
- [ ] Partial codes from beginning work ("h12" matches "h129...")
- [ ] Selecting product from dropdown populates form

### 2.2 Product Name Search
- [ ] Type product name (e.g., "vite"), dropdown shows matches
- [ ] Products filter by name correctly
- [ ] Mixed search (name and code) works

### 2.3 Product Display
- [ ] Product dropdown shows name, price, package info
- [ ] Price displays with "€X.XX + IVA → €X.XX" format
- [ ] Package content shows as "📦 N colli"
- [ ] Product description truncated if long

### 2.4 Edge Cases
- [ ] Products without article field don't crash filter
- [ ] Products without price display correctly (no price shown)
- [ ] Empty search shows all products (up to limit)
- [ ] No results for invalid article code shows empty dropdown

### 2.5 Regression
- [ ] Voice input for products still works
- [ ] Product variant selection still works
- [ ] Package constraints validation still works
- [ ] Product search from IndexedDB cache fast (<100ms)

---

## 3. Form Submission Tests

### 3.1 Happy Path
- [ ] Select customer
- [ ] Select product
- [ ] Set quantity
- [ ] Click "Aggiungi articolo", item added to draft list
- [ ] Form clears for next item
- [ ] Can add multiple items
- [ ] Click "🚀 Create Order", confirmation modal appears
- [ ] Confirm order, success message shows
- [ ] Draft saved without crash
- [ ] Form resets after save

### 3.2 Validation Errors
- [ ] Add item without customer: can add to draft
- [ ] Submit order without customer: error message shown
- [ ] Add item without product: error message shown
- [ ] Add item with quantity 0: error message shown
- [ ] Invalid package quantity: error with suggestions shown

### 3.3 Error Scenarios
- [ ] Cache stale warning appears when appropriate
- [ ] Force refresh works if cache stale
- [ ] IndexedDB errors show user-friendly messages
- [ ] Network errors handled gracefully
- [ ] Can retry after error without reload

### 3.4 No White Screens
- [ ] No white screen when adding invalid quantity
- [ ] No white screen when submitting with missing data
- [ ] No white screen on IndexedDB errors
- [ ] No white screen on network errors
- [ ] Error Boundary shows recovery UI if rendering fails

### 3.5 Regression
- [ ] Draft items display correctly
- [ ] Remove draft item works
- [ ] Pricing calculations correct
- [ ] Target total calculation works
- [ ] Discount percentage calculation works
- [ ] Voice-populated fields indicators work
- [ ] Multi-item orders work
- [ ] Offline mode draft saving works

---

## 4. Integration Tests

### 4.1 Voice Input Integration
- [ ] Voice input customer selection works
- [ ] Voice input product selection works
- [ ] Voice input quantity works
- [ ] Voice-populated fields show indicators
- [ ] Manual edit of voice fields works

### 4.2 Cache Integration
- [ ] IndexedDB cache loads on mount
- [ ] Cache refresh works manually
- [ ] Cache staleness detection works
- [ ] API fallback works if cache empty

### 4.3 Offline Integration
- [ ] Order form works offline
- [ ] Draft saves locally offline
- [ ] Pending orders queue works

---

## 5. Performance Tests

- [ ] Customer search < 100ms
- [ ] Product search < 100ms
- [ ] Add item < 50ms
- [ ] Form submission < 500ms
- [ ] No memory leaks (test with 20+ items)

---

## 6. Mobile Tests (if applicable)

- [ ] Customer dropdown works on mobile
- [ ] Product dropdown works on mobile
- [ ] Typing on mobile keyboard filters correctly
- [ ] Touch selection works
- [ ] No horizontal scroll
- [ ] Dropdowns don't overflow screen

---

## 7. Browser Compatibility

- [ ] Chrome (desktop)
- [ ] Firefox (desktop)
- [ ] Safari (desktop)
- [ ] Safari (iOS)
- [ ] Chrome (Android)

---

## Test Results Summary

**Total Tests**: 80+
**Passed**: ___
**Failed**: ___
**Blocked**: ___

**Critical Bugs**: [List any P0/P1 bugs found]

**Notes**: [Additional observations]

**Tester Signature**: _______________  **Date**: __________
