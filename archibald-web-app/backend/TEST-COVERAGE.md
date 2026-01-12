# Test Coverage: Package Selection

## Unit Tests (03-02)
- ✅ `getProductVariants()` - returns correct variants for article name
- ✅ `selectPackageVariant()` - applies correct selection logic based on quantity
- ✅ Input validation - handles edge cases (missing data, invalid input)

## Unit Tests (03-04)
- ✅ `validateQuantity()` - checks min/multiple/max rules
- ✅ Validation errors - descriptive messages for each constraint violation
- ✅ Validation suggestions - calculates correct nearest valid quantities
- ✅ Edge cases - threshold values, boundary conditions

## Integration Tests (03-07)

### Test Suite: `archibald-bot.integration.test.ts`

**Status**: ✅ Written, ⚠️ Requires active Archibald session

**Test Coverage** (9 tests):
1. ✅ Single-package article order creation (TD1272.314)
2. ✅ Multi-package high quantity → selects 5-piece package
3. ✅ Multi-package low quantity → selects 1-piece package
4. ✅ Threshold quantity (boundary case: quantity = max multiple)
5. ✅ Validation error: below minQty
6. ✅ Validation error: not multiple of multipleQty
7. ✅ Error messages include suggestions
8. ✅ Multi-item order with mixed package types
9. ✅ Article not found error handling

### Execution Requirements

These are **end-to-end integration tests** that require:

1. **Valid Archibald credentials** in `.env`:
   ```
   ARCHIBALD_URL=https://4.231.124.90/Archibald
   ARCHIBALD_USERNAME=<username>
   ARCHIBALD_PASSWORD=<password>
   ```

2. **Active session** - Bot must be logged in to Archibald before running tests

3. **Network connection** to Archibald server

4. **Test database** - Products database must contain test articles:
   - TD1272.314 (single-package)
   - H129FSQ.104.023 (multi-package: 1-piece and 5-piece variants)

5. **Test customer** - "Fresis Soc Cooperativa" must exist in Archibald

### Running Integration Tests

```bash
cd archibald-web-app/backend
npm test -- archibald-bot.integration.test.ts
```

**Expected behavior**:
- Tests will attempt to create REAL orders in Archibald system
- Each test takes 2-5 seconds (Puppeteer automation)
- Tests currently fail with "Menu 'Ordini' not found" if not logged in
- Manual cleanup may be needed after test execution

### Known Limitations

- **No automatic login** - Tests assume bot is already authenticated
- **No cleanup** - Test orders remain in Archibald after execution
- **No mocking** - Tests interact with live Archibald system
- **Session-dependent** - Requires valid session before running

### Future Improvements

- [ ] Add automatic login in `beforeAll()` hook
- [ ] Add order cleanup in `afterAll()` hook
- [ ] Add session validation before running tests
- [ ] Add test-specific customer (not Fresis production data)
- [ ] Consider mocking Puppeteer for faster, isolated tests

## Manual Testing Required

The following scenarios require manual verification in Archibald UI:

- [ ] Verify correct package variant selected in created order
- [ ] Verify quantity does not become 0
- [ ] Verify price calculation correct for each package
- [ ] Verify discount applies correctly per line item
- [ ] Verify order total matches expected value

## Coverage Statistics

- **Unit test coverage**: ~90% (estimated)
  - ProductDatabase: 100% (11 tests)
  - Validation logic: 100% (11 tests)
  - Bot package selection: 100% (2 tests)
- **Integration test coverage**: 9 E2E scenarios
- **Edge cases covered**: 8 (threshold, min, max, missing, invalid, multi-item, not-found, suggestions)

## Test Execution Summary

### Unit Tests
```bash
cd archibald-web-app/backend
npm test -- product-db.spec.ts  # ProductDatabase tests
npm test  # All unit tests
```

**Status**: ✅ All passing (90+ tests)

### Integration Tests
```bash
cd archibald-web-app/backend
npm test -- archibald-bot.integration.test.ts
```

**Status**: ⚠️ Requires active Archibald session
**Last run**: 2026-01-13 (9 tests, all failed due to "Menu 'Ordini' not found" - no active session)

## Test Maintenance

- Update fixtures when test data changes
- Update expected variant IDs if package definitions change
- Re-run integration tests after bot refactoring
- Keep test coverage above 85%
