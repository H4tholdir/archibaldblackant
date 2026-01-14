# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-11)

**Core value:** Rendere la creazione ordini Archibald **veloce, affidabile e mobile-friendly** per agenti in movimento
**Current focus:** Phase 8 — Offline Capability (Cache IndexedDB e bozze persistenti)

## Current Position

Phase: 8 of 12 (Offline Capability) 🚧 IN PROGRESS
Plan: 7 of 8 complete
Status: Completed Plan 08-07 (Offline Order Queue with Automatic Sync)
Last activity: 2026-01-14 — Completed Plan 08-07
Start time: 2026-01-14 22:26 → End time: 2026-01-14 23:46

Progress: ███████░ 87.5% Phase 8 (7/8 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 51
- Average duration: 59 min
- Total execution time: 55.67 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 5 | 965 min | 193 min |
| 2 | 8 | 101 min | 13 min |
| 3 | 8 | 346 min | 43 min |
| 3.1 | 3 | 350 min | 117 min |
| 4 | 3 | 285 min | 95 min |
| 4.1 | 4 | 233 min | 58 min |
| 6 | 7 | 209 min | 30 min |
| 7 | 6 | 243 min | 41 min |
| 8 | 7 | 184 min | 26 min |

**Recent Trend:**
- Last 7 plans: 08-02 (25m), 08-03 (15m), 08-04 (22m), 08-05 (11m), 08-06 (11m), 08-07 (80m)
- Trend: Plan 08-07 longer due to debugging (API schema mismatch), but delivered robust solution

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

| Phase | Decision | Rationale |
|-------|----------|-----------|
| 08-07 | PendingOrder stores complete API-compliant order data | Direct API compatibility eliminates transformation logic, preserves all user data, enables future features (preview queue, edit pending), simpler sync (pass-through vs reconstruction) |
| 08-07 | Database migration v2 clears incompatible pending orders | Schema change incompatible with old records, simpler than data migration, acceptable for pilot phase with no production data |
| 08-07 | Sync immediately when isOnline changes false→true | Minimizes delay between connectivity restore and order submission, simple implementation, users expect immediate action |
| 08-07 | Comprehensive debug logging in OrderForm and sync service | Enables rapid troubleshooting, aids user verification, useful for production issues |
| 08-06 | Banking app style yellow banner for offline indicator | Matches trusted UX patterns from Intesa/UniCredit, prominent and unmissable, reassuring message emphasizes continuity |
| 08-06 | Fixed position banner with 64px margin adjustment | Prevents content overlap, banner always visible regardless of scroll position |
| 08-06 | navigator.onLine + browser events for network detection | 97% browser support, reliable standard API, works across desktop/mobile platforms |
| 08-05 | 1-second debounce for draft auto-save | Prevents excessive IndexedDB writes during rapid typing, balances responsiveness with performance |
| 08-05 | Upsert pattern for drafts (reuse existing ID) | Single draft per user prevents clutter, updatedAt tracks latest changes |
| 08-05 | Clear draft immediately after order submission | Prevents stale drafts from reappearing, clean state after successful completion |
| 08-04 | CacheFirst for Google Fonts with 1-year expiration | Long-lived assets with low churn, instant offline loading for typography |
| 08-04 | Auto-update service worker (registerType: autoUpdate) | Seamless deployment updates without user intervention, always latest version |
| 08-04 | vite-env.d.ts for virtual:pwa-register types | TypeScript support for PWA registration, resolves module not found errors |
| 08-03 | 50 result limit for searchCustomers() and searchProducts() | Prevents UI lag with huge result sets, balances performance vs completeness |
| 08-03 | 3-day stale cache threshold (72 hours) | From 08-CONTEXT.md requirements, balances freshness vs offline capability |
| 08-03 | Dexie startsWithIgnoreCase() for indexed search | Leverages compound indexes for < 100ms performance, prefix matching ideal for autocomplete |
| 08-03 | Fallback contains() search if no prefix matches | Catches cases where user types mid-string or formatting differs, broader coverage |
| 08-03 | Parallel enrichment with Promise.all for variants/prices | Single round-trip for all enrichment queries, maintains < 100ms target |
| 08-03 | Cache age indicator always visible (not just on stale) | Transparency requirement from 08-CONTEXT.md, agents always see data freshness |
| 08-03 | Large limit (10000) for initial customer load | Load all customers at once from cache (fast with IndexedDB), fallback to API if empty |
| 08-03 | Cache-first strategy with API fallback | Offline-first architecture, graceful degradation if cache empty |
| 08-02 | Full sync in one request (not paginated) | 6 MB uncompressed acceptable for ~14,000 records, simpler implementation, good for MVP |
| 08-02 | bulkPut() for IndexedDB inserts | Single transaction per table, fastest method (2-3s for ~14k records) |
| 08-02 | Auto-sync on first run or stale cache | Seamless UX, no manual trigger needed, 24h TTL balances freshness vs unnecessary syncs |
| 08-02 | Progress callbacks every 20% | Responsive UI without overwhelming updates, meaningful stages (fetching, customers, products, variants, prices) |
| 08-01 | Dexie.js for IndexedDB abstraction | TypeScript-first API, automatic schema versioning, query optimizations, well-maintained (~100k weekly downloads) |
| 08-01 | Compound indexes on name/article fields | Achieve <100ms search performance requirement for offline-first features |
| 08-01 | Auto-increment IDs for local-only data (drafts, pending) | Simpler than UUIDs for offline-first features, no server sync needed |
| 08-01 | Graceful degradation if IndexedDB unavailable | App renders even if IndexedDB fails (quota exceeded, version conflicts), offline features degrade gracefully |
| 08-01 | Non-blocking initialization in main.tsx | Database initialization doesn't block app render, prioritizes user experience |
| 07-06 | Keep PasswordCache as session-scoped in-memory cache (1h TTL) | Pragmatic stateless: no persistent storage (disk/database), in-memory session state acceptable, avoids Puppeteer login per order (~30s saved) |
| 07-05 | Web Authentication API (WebAuthn) for biometric unlock | Browser-native biometric standard, cross-platform support (iOS Face ID/Touch ID, Android fingerprint), graceful degradation |
| 07-05 | Simplified WebAuthn implementation (MVP, no server validation) | MVP functionality for Phase 7, full FIDO2 compliance deferred to future security hardening |
| 07-05 | HTTPS required for biometric testing (WebAuthn security) | Browser security policy, biometric testing deferred to production deployment |
| 07-05 | Desktop remains PIN-only (Windows Hello deferred) | Mobile biometric higher priority for banking app parity, desktop can be added later |
| 07-04 | lastUser stored in localStorage (userId + fullName only) | Non-sensitive metadata for detecting returning users, credentials stay encrypted in IndexedDB |
| 07-04 | Auto-submit on 6-digit PIN entry | Banking app UX (Intesa, UniCredit reference), no "Submit" button needed |
| 07-04 | Failed attempt tracking (max 3, no hard lockout) | Balance security vs UX, escalating error messages, recovery flow available ("PIN dimenticato?") |
| 07-04 | logout preserves lastUser (unlock screen on next visit) | Unlock screen should appear after logout if credentials saved, lastUser only cleared on "PIN dimenticato?" |
| 07-03 | PIN length: 6 digits (banking app standard) | Match user expectations from banking apps (Intesa, UniCredit), mobile-friendly numeric keyboard |
| 07-03 | 2-step wizard (create → confirm) | Prevent typos in PIN creation, standard banking app pattern |
| 07-03 | Temporary credentials cleared after PIN setup | Minimize plaintext credential lifetime in memory for security |
| 07-02 | PBKDF2 iterations: 100,000 (configurable for tests) | Balances security vs UX on mobile, configurable constructor param allows 100 iterations in tests |
| 07-02 | Singleton pattern via getCredentialStore() | Single instance prevents multiple DB connections, clean API for app-wide use |
| 07-02 | Wrong PIN returns null (not throw) | Graceful error handling, easy to distinguish authentication failure from errors |
| 07-02 | Non-extractable CryptoKeys | Enhanced security - keys cannot be exported from Web Crypto API |
| 07-01 | Encryption algorithm: AES-GCM 256-bit | Native Web Crypto API support, authenticated encryption, hardware acceleration, banking app standard |
| 07-01 | Key derivation: PBKDF2-SHA256 with 310,000 iterations | OWASP 2025 standard, Web Crypto native support (Argon2 not available), adequate for 6-digit PIN entropy |
| 07-01 | Storage: IndexedDB for encrypted credentials | 97% browser compatibility, persistent across sessions, no server sync needed |
| 07-01 | Biometric: WebAuthn platform authenticators + PIN fallback | iOS Face ID/Touch ID, Android fingerprint, desktop PIN-only (Windows Hello deferred) |
| 07-01 | IndexedDB schema: { userId, encryptedData, iv, salt, timestamps } | Random IV per encryption, random salt per user, timestamps for session management |
| 06-06 | Order API security: JWT required for all operations | Ensures orders created under correct user account, 401 if missing/invalid |
| 06-06 | Error handling: 401 responses trigger re-login | Token expiration handled gracefully with user prompt |
| 06-06 | Logging traceability: Include username/userId in all logs | Complete audit trail for order operations enables debugging |
| 06-06 | Session routing: JWT → userId → BrowserContext | Seamless integration with 06-05 multi-user session infrastructure |
| 06-05 | Session storage: File-based per-user cache | Simple .cache/session-{userId}.json files, no external dependencies, 24h TTL |
| 06-05 | Context lifecycle: Persistent until logout/error | Create on first acquire, keep for reuse (maximize performance) |
| 06-05 | Cookie isolation: BrowserContext API guarantee | Puppeteer guarantees complete isolation per BrowserContext |
| 06-05 | Backwards compatibility: Legacy mode preserved | No userId = single-user mode (existing code continues to work) |
| 06-05 | Memory efficiency: Shared Browser architecture | 5x improvement (300MB vs 1.5GB for 10 users) via single Browser + multiple contexts |
| 06-02 | UUID v4 for user IDs | Consistent with project patterns (customer-db, product-db), globally unique |
| 06-02 | Boolean whitelisted field stored as INTEGER in SQLite | SQLite compatibility, converted to boolean in rowToUser() method |
| 06-02 | Default whitelisted: true for new users | All users start with access, admin can revoke via PATCH endpoint |
| 06-02 | Admin endpoints: No authentication in Phase 6 | Deferred to Phase 7, documented as known limitation for MVP |
| 06-02 | Seed script creates 3 test users | Sufficient for testing multi-user authentication flows |
| 06-04 | JWT storage in localStorage with key 'archibald_jwt' | Simple persistence mechanism, cleared on logout |
| 06-04 | Auto-restore session by calling GET /api/auth/me on mount | Verify token validity on app startup, handle expired/invalid tokens gracefully |
| 06-04 | Login UX with modal overlay blocking app access | Full-screen modal prevents unauthorized access to main app |
| 06-04 | User display shows fullName not username in header | Better UX - "Francesco Formicola" more natural than "ikiA0930" |
| 06-04 | Admin user: ikiA0930 = Francesco Formicola (whitelisted) | Primary admin user with real Archibald credentials for testing and production |
| 06-03 | JWT middleware with AuthRequest interface | Type-safe user context in protected routes, extends Express Request |
| 06-03 | Login validation via Puppeteer test (not password hash) | Validates against real Archibald system, ensures credentials work end-to-end |
| 06-03 | JWT format: { userId, username, iat, exp } | Minimal payload with essential identity info, 8h expiry |
| 06-03 | No credential storage anywhere | Passwords used only for immediate validation in loginWithCredentials(), then discarded |
| 06-01 | BrowserContext Pooling architecture for multi-user sessions | 5x memory efficiency vs separate Browsers (300MB vs 1.5GB for 10 users), 35s faster logins, production-grade pattern |
| 06-01 | JWT library: jose (not jsonwebtoken) | Better ESM support, native async/await, no CommonJS issues |
| 06-01 | JWT expiry: 8 hours | Balance between UX (don't logout too often) and security |
| 06-01 | Session cache: File-based (.cache/session-{userId}.json) | Simple, no external dependencies, 24h TTL matches Archibald session |
| 06-01 | Passwords never stored in database | Used only for immediate Puppeteer validation, security-first approach |
| 04.1-04 | Client-side sort manipulation via column header click | DevExpress XAF has no URL/API sort parameters; UI click is only reliable option |
| 04.1-04 | Sort state detection (none/asc/desc) before clicking | Idempotent behavior - prevents toggling sort on subsequent syncs |
| 04.1-04 | Conditional click algorithm: none=2, asc=1, desc=0 | Explicit state transitions more reliable than blind clicking |
| 04.1-04 | Process newest customers first (ID descending) | New customers (high IDs) available in minutes, not hours; unblocks agents immediately |
| 04.1-03 | 3 detailed examples with real article formats (XX.XX.XXX.XXX) | Generic examples (SF1000) don't match real products; agents need actual formats to build confidence |
| 04.1-03 | Structured workflow guide with 6 steps | Linear flow reduces cognitive load; agents know exactly what to do at each step |
| 04.1-03 | Command explanations with when/what/result | Agents need context (when to use) and outcomes (what happens) to use commands confidently |
| 04.1-03 | Error recovery section with 5 scenarios | Proactive guidance reduces frustration; agents can self-recover instead of abandoning feature |
| 04.1-03 | Visual hierarchy with colors and sections | Dense instructional content needs structure; colors (green=success, yellow=help) aid scanning |
| 04.1-02 | Multi-level matching: ID → name exact → name normalized | Single matching method fails with data variations; 3 levels maximize match rate (59.8% → 85%+) |
| 04.1-02 | Normalized matching removes dots, spaces, dashes, lowercase | Catches formatting variations like "354TL.12.000.050" vs "354TL12.000.050" |
| 04.1-02 | Default pricing: group average or global average (€24.90) | Products in same group have similar pricing; more accurate than random default |
| 04.1-02 | Green badge for price display in autocomplete | Green = positive/price information; stands out without overwhelming UI |
| 4.02 | Real-time parsing in useEffect watching transcript | Immediate feedback as user speaks - don't wait for final result |
| 4.02 | Package disambiguation modal instead of inline selection | Complex choice with multiple options - modal provides focus and clear decision space |
| 04.1-01 | EventEmitter pattern for lifecycle events in PriorityManager | Node.js built-in, well-understood, enables future observability |
| 04.1-01 | Polling-based wait for sync completion (500ms) | Simple, reliable, good balance between responsiveness and CPU usage |
| 04.1-01 | Service registration in QueueManager constructor | Centralized registration point, ensures priority lock always available |
| 4.02 | Mark optimal solution with green "Raccomandato" badge | Guide users to best choice (fewest packages) while allowing alternatives |
| 4.02 | ARIA live="polite" instead of "assertive" | Voice input shouldn't interrupt current screen reader context |
| 4.02 | Entity highlighting with badges instead of background color | More prominent, works better on mobile, clearer entity boundaries |
| 4.02 | 3-tier confidence visualization (low < 40%, medium 40-70%, high > 70%) | Aligns with voice recognition accuracy thresholds |
| 3.05 | Show package size as badge in autocomplete dropdown | Users need to see package differences BEFORE selecting - upfront visibility beats auto-selection |
| 3.05 | Use HTML5 input constraints (min, step, max) | Native browser validation more reliable and accessible than custom validation |
| 3.05 | Real-time validation with onChange + onBlur | Auto-correct to nearest valid multiple on typing - prevents invalid submission |
| 3.05 | REFACTOR: Remove PackageInfo component after user feedback | User testing showed complex variant selection confusing - simpler UX with badges + constraints better |
| 3.04 | Validate quantity immediately after variant selection | Catch invalid quantities early before UI interaction - faster feedback, prevents wasted bot operations |
| 3.04 | Include suggestions in ValidationResult | Better UX - tell user nearest valid quantities, don't just say "invalid" |
| 3.04 | Use Pick<Product> for validation parameter type | Validation only needs minQty, multipleQty, maxQty - more flexible, easier testing, clearer intent |
| 3.1 | Self-contained HTML dashboard with inline CSS/JS | No external dependencies, easy distribution, ~40KB typical size |
| 3.1 | SVG for charts instead of Canvas | Crisp rendering at any zoom, easier event handling, DOM manipulation |
| 3.1 | Static methods in PerformanceDashboardGenerator | No state needed, pure functions, easier testing |
| 3.1 | Dynamic import in ArchibaldBot.generatePerformanceDashboard() | Avoid circular dependencies between bot and dashboard generator |
| 3.08 | Search Archibald by variant ID instead of article name | Variant ID is unique, article name matches multiple variants causing selection errors |
| 3.08 | Create reusable DevExpress helper methods | DevExpress patterns repeat across dropdowns, tables, cell editing - reduce duplication ~40% |
| 3.08 | Preserve old createOrder() as createOrderOLD_BACKUP | Major refactor with regression risk - keep old code for emergency rollback or reference |
| 3.08 | Use text content for element identification | DevExpress dynamic IDs change between sessions - text is more stable |
| 3 | Populate articleId and packageContent in OrderItem | Enable order tracking, debugging, and verification of correct variant selection |
| 3 | Manual verification script instead of brittle integration tests | Full bot tests fragile (UI changes), slow (2+ min), complex setup; manual script provides instant verification |
| 3 | Ordered variants by multipleQty DESC in getProductVariants() | Highest package always first for consistent selection |

### Deferred Issues

None yet.

### Blockers/Concerns

None yet.

### Roadmap Evolution

- **2026-01-12 (Early)**: Plan 03-08 (Critical Bot Refactor) executed
  - **Priority**: CRITICAL - BLOCKED ALL PHASE 3 WORK
  - **Reason**: Bot used wrong menu names ("Inserimento ordini"), wrong dropdowns ("Account esterno"), wrong workflow - could not create orders
  - **Duration**: 4 hours actual
  - **Deliverables**:
    - UI selectors documented from 17 screenshots (.planning/archibald-ui-selectors.md)
    - 6 reusable DevExpress helper methods created
    - Complete createOrder() refactored: "Ordini" menu → "Profilo cliente" dropdown → "Nome articolo" dropdown → variant selection
    - Multi-article support with Update button loop
    - "Salvare" → "Salva e chiudi" final save workflow
  - **Impact**: Bot now matches actual Archibald UI - can create orders end-to-end
  - **Note**: Documentation (SUMMARY.md) added retroactively after Phase 3.1 completion

- **2026-01-12 (Mid)**: Phase 3.1 (Bot Performance Profiling & Optimization) inserted after Plan 03-08 as URGENT priority
  - **Reason**: Critico profilare flusso bot completo prima di continuare con validazioni e frontend Phase 3
  - **Impact**: Paused Phase 3 main flow (plans 03-04 to 03-07) to complete profiling
  - **Rationale**: Ottimizzazione basata su dati reali (non supposizioni) è fondamentale per velocità produzione
  - **Current baseline**: ~82s order creation (con cache), colli di bottiglia identificati in customer selection (24.8s) e article search (9.1s)

- **2026-01-12 (Late)**: Phase 3.1 execution completed
  - **Plans executed**: 3 plans (03.1-01: Enhanced Profiling, 03.1-02: Dashboard & Visualization, 03.1-03: Optimization Plan Documentation)
  - **Actual duration**: 5.8 hours total (80m + 150m + 120m)
  - **Deliverables**:
    - Enhanced profiling system with category tracking, percentiles, memory tracking
    - Self-contained HTML performance dashboard with Gantt charts and bottleneck analysis
    - Comprehensive optimization plan with 7 optimizations, 40% improvement potential (-32.5s)
  - **Baseline established**: 3 profiling runs averaging 81.5s order creation (72.3s with cache)
  - **Bottlenecks quantified**: Customer selection (24.8s, 30.4%), quantity setting (9.5s, 11.7%), article search (9.1s, 11.1%)
  - **Bug discovered**: 5 operations missing category parameter (lines 2290, 2362, 2380, 2591, 2640 in archibald-bot.ts)
  - **SLO targets defined**: P95 < 60s order creation (vs. current 81.5s)
  - **Optimization roadmap**: Phase 1 (7h, -8.5s) → Phase 2 (14h, -17s, achieves SLO) → Phase 3 (16h, -13s)
  - **Next steps**: Resume Phase 3 main flow (plans 03-04 through 03-07), execute optimization roadmap in future phase

- **2026-01-12 (Evening)**: Plan 03-04 (Quantity Validation Against Package Rules) executed
  - **Duration**: 4 minutes (extremely fast TDD plan)
  - **Approach**: TDD with RED-GREEN cycle, atomic commits per phase (test → feat → refactor → test)
  - **Deliverables**:
    - ValidationResult interface with valid, errors, suggestions fields
    - validateQuantity() method in ProductDatabase (checks minQty, multipleQty, maxQty)
    - Bot integration: validation after variant selection, before UI interaction
    - Comprehensive test coverage: 9 unit tests + 2 integration tests (11 total)
  - **Impact**: Prevents "quantity becomes 0" bug by validating early, provides suggestions for nearest valid quantities
  - **Test results**: All 90 tests passing (49 product-db, 2 archibald-bot, 39 other) - no regressions
  - **Next steps**: Plans 03-05 (Frontend Package Display), 03-06 (Frontend Quantity Validation), 03-07 (Integration Tests)

- **2026-01-12 (Night)**: Plan 03-05 (Frontend Package Display in OrderForm) executed
  - **Duration**: 37 minutes (including checkpoint and refactor)
  - **Approach**: Segmented execution (Strategy B) with human verification checkpoint
  - **Initial Deliverables**:
    - GET /api/products/variants endpoint
    - products.ts API client with getProductVariants()
    - PackageInfo component with variant list
    - Integration in OrderForm with auto-selection
    - Comprehensive CSS styling
  - **User Feedback at Checkpoint**: "Too complex - can't see differences when searching" + "Why both variants show as selected?"
  - **REFACTOR (Breaking Change)**:
    - Removed complex PackageInfo component (~200 lines)
    - Added package badges in autocomplete dropdown (📦 5 colli)
    - HTML5 input constraints (min, step, max) for quantity
    - Real-time validation with onChange + onBlur handlers
    - Package hint below input showing rules
  - **Impact**: Much simpler, more intuitive UX - see variants upfront, quantity auto-constrained
  - **Commits**: 6 total (4 implementation + 1 bug fix + 1 refactor)
  - **Next steps**: Plans 03-06 (Frontend Quantity Validation), 03-07 (Integration Tests)

- **2026-01-12 (Night, continued)**: Plan 03-06 (Frontend Quantity Validation) marked complete
  - **Duration**: 0 minutes (already implemented in 03-05)
  - **Rationale**: Real-time auto-correction implemented in 03-05 is superior to planned error-message approach
  - **Implementation**: onChange handler auto-corrects quantities, onBlur provides safety net
  - **Impact**: Proactive validation (auto-correct) vs reactive validation (show errors) - better UX
  - **Decision**: Skip redundant implementation, mark as complete, update roadmap
  - **Next steps**: Plan 03-07 (Integration Tests) - final Phase 3 plan

- **2026-01-12 (Night, continued)**: Plan 03-07 (Integration Tests) executed and complete
  - **Duration**: 21 minutes
  - **Deliverables**:
    - Test fixtures for 6 order scenarios (single/multi-package, invalid quantities)
    - Integration test suite with 9 E2E tests
    - Extended vitest config timeouts (30s test, 10s hooks)
    - TEST-COVERAGE.md documentation (~90% unit coverage documented)
  - **Bug Fixes**: ProductDatabase import, bot initialization method
  - **Test Results**: All 9 tests require active Archibald session (documented limitation)
  - **Impact**: Integration test infrastructure complete, ready for regression testing
  - **Commits**: 5 total (3 implementation + 2 bug fixes)
  - **Phase Status**: Phase 3 MVP Order Form now COMPLETE (8/8 plans)

- **2026-01-13 (Early Morning)**: Phase 3.2 (Bot Performance Implementation) - Ad-hoc optimization work
  - **Context**: 126 commits made outside GSD framework
  - **Duration**: ~4 hours (00:00 - 04:00)
  - **Approach**: Iterative A/B testing with multiple optimization attempts
  - **Major Achievement - OPT-15: Customer Selection Optimization**:
    - Integrated click directly into waitForFunction() - eliminates gap between detection and action
    - Used mutation polling for instant DOM change detection
    - **Impact**: Customer selection 20.91s → 12.51s (-8.4s, -40.2%)
    - **Overall**: Total order time 90.55s → 82.23s (-8.32s, -9.2%)
    - **Commit**: ffcd8fa
  - **Attempted - OPT-03: Field Editing Optimization**:
    - Multiple iterations (v1: JavaScript setValue, v2: research-based, v3: atomic operations)
    - **Result**: No measurable improvement (~0s)
    - **Lesson**: DevExpress grid overhead dominates input method optimization
    - **Decision**: De-prioritize, focus on other high-ROI optimizations
  - **Critical Bug Fix**: Variant Selection Logic (commit 94ae6b8)
    - **Problem**: Bot selected K2 (5-pack) for qty=7 when K3 (1-pack) was valid
    - **Solution**: Filter variants by valid multiples (qty % multipleQty === 0), prefer largest
    - **Impact**: Quantity 7 now correctly selects K3, prevents invalid quantity errors
  - **Critical Bug Fix**: Package Constraints Validation (commit b97c617)
    - Dual-layer validation (client + server) prevents invalid order submission
    - Frontend: Real-time validation in handleAddItem() with suggestions
    - Backend: Server-side validation before bot execution with detailed errors
    - Fixes Job ID 38/31 validation bypass bug
  - **Status**: Phase 3.2 COMPLETE (partial implementation, 1 of 6 plans)
  - **Performance vs Plan**:
    - Phase 1 target: 71s (-10.5s), Actual: 82.23s (-8.3s) → 2.2s short of target
    - SLO target: < 60s, Current: 82.23s → 22.23s improvement deferred
  - **Decision**: Close Phase 3.2 early, defer remaining optimizations (OPT-02, OPT-06, OPT-01)
  - **Rationale**: Good progress achieved (9%), user features higher priority, can revisit later
  - **Documentation**: Complete phase summary (3.2-PHASE-COMPLETE.md, PERFORMANCE-ANALYSIS.md, 3.2-AD-HOC-SUMMARY.md)
  - **Next**: Phase 4 - Voice Input Enhancement

- **2026-01-13 (Late Morning)**: Plan 04-01 (Voice Parser Enhancement) executed
  - **Duration**: 45 minutes
  - **Approach**: TDD with RED-GREEN cycle, atomic commits per task
  - **Deliverables**:
    - Confidence scoring types (ParsedOrderWithConfidence, ArticleValidationResult)
    - Comprehensive test suite (29 unit tests, all passing)
    - Article code normalization (handles "H71 104 032" without "punto")
    - Mixed-package detection algorithm (knapsack-style, optimal solution marking)
    - 3-layer validation with fuzzy matching (fuse.js, handles H71→H61 errors)
  - **Impact**: Critical voice input patterns handled, error recovery implemented
  - **Test results**: 29/29 tests passing, no TypeScript errors
  - **Deferred**: Confidence scoring algorithm (Task 5), multi-item enhancement (Task 7), integration tests (Task 8 - Plan 04-02 scope)
  - **Next steps**: Execute Plan 04-02 (Visual Feedback) or Plan 04-03 (Integration Tests)

- **2026-01-13 (Afternoon)**: Plan 04-02 (Visual Feedback During Voice Recognition) executed
  - **Duration**: 120 minutes actual
  - **Deliverables**:
    - ConfidenceMeter component with color-coded progress bar (9 tests passing)
    - EntityBadge component for entity highlighting (12 tests passing)
    - TranscriptDisplay component with highlightEntities() utility (5 tests passing)
    - ValidationStatus component for async feedback (7 tests passing)
    - SmartSuggestions component with error recovery (7 tests passing)
    - PackageDisambiguationModal component for packaging selection (7 tests passing)
    - Integration into OrderForm voice modal with real-time parsing
    - Accessibility audit complete - all ARIA attributes present, keyboard navigation functional
  - **Test Results**: 82/82 tests passing, 0 TypeScript errors
  - **Impact**: Voice modal now has real-time visual feedback with confidence indicators, entity highlighting, validation status, smart suggestions, and package disambiguation
  - **Commits**: 8 atomic commits (ef89a5f through 094ffbe)
  - **Next steps**: Execute Plan 04-03 (Integration Tests) if needed, or verify Phase 4 complete

- **2026-01-13 (Afternoon, continued)**: Plan 04-03 (Form Field Population + Manual Edit + Tap Confirmation) executed
  - **Duration**: 120 minutes actual
  - **Deliverables**:
    - Voice hybrid workflow: dettatura → form pre-fill → manual edit → tap confirmation
    - VoicePopulatedBadge component with confidence indicators (🎤 85%)
    - Review & Apply button with smart enabling (confidence > 50%)
    - Draft items list for staging before order creation
    - Confirmation modal with order summary before submission
    - Multi-item voice input with summary modal
    - User onboarding hints with first-use guidance
    - Manual edit capability for all voice-populated fields
  - **Test Results**: 98/98 tests passing, 0 TypeScript errors
  - **Impact**: Complete voice hybrid workflow with review, edit, and explicit confirmation steps
  - **Commits**: 10 atomic commits (ac1654d through 58bfdd7)
  - **Phase Status**: Phase 4 Voice Input Enhancement now COMPLETE (3/3 plans)

- **2026-01-13 (Evening)**: Fix 04-FIX (Critical Infinite Loop Bug) executed
  - **Duration**: 45 minutes
  - **Priority**: 🔴 BLOCKER - Entire voice feature non-functional
  - **Root Cause**: useEffect dependency issue in useVoiceInput hook causing infinite re-renders
  - **Fix Strategy**: useRef pattern to stabilize callbacks without triggering effect re-runs
  - **Deliverables**:
    - Fixed useVoiceInput.ts with useRef pattern (6e40ba4)
    - 13 comprehensive regression tests (13/13 passing) (35fe0ec)
    - Manual UAT verification checklist (4172515)
    - Complete fix summary documentation (93a3417)
  - **Test Results**: 13/13 unit tests passing, 0 TypeScript errors
  - **Impact**: UAT-001 resolved - voice input now functional, SpeechRecognition stable
  - **Commits**: 4 total (fix + tests + docs + metadata)
  - **Phase Status**: Phase 4 technically complete, manual UAT pending

- **2026-01-13 (Late Evening)**: Phase 4.1 (Critical Production Fixes) inserted as URGENT priority
  - **Reason**: 4 critical production blockers discovered during user review
  - **Priority**: 🔴 CRITICAL - Must fix before Phase 5 Order Submission
  - **Issues Identified**:
    1. Backend processes interfere with bot during order creation (HIGH impact)
    2. Prices not visible in order form despite existing in Archibald (HIGH impact, 4 screenshots provided)
    3. Voice modal UX insufficient - needs better examples and workflow guide (MEDIUM impact)
    4. Customer sync processes old customers first, new customers last (HIGH impact - blocks agents)
  - **Plans**: 4 plans (1 per issue)
  - **Estimated Effort**: 8-12 hours total
  - **Execution Priority**: 04.1-01 (Backend) → 04.1-04 (Customer) → 04.1-02 (Price) → 04.1-03 (Voice UX)
  - **Impact**: Blocks reliable production use - must fix before continuing
  - **Context**: Full analysis documented in `.planning/phases/04.1-critical-production-fixes/04.1-CONTEXT.md`

- **2026-01-13 (Evening continued)**: Plan 04.1-01 complete (Backend Process Priority Manager)
  - **Accomplishments**:
    - PriorityManager singleton created with pause/resume coordination (44810cc)
    - All 3 sync services now pausable/resumable (129f40c)
    - Order creation wrapped with priority lock in queue manager (5099b42)
  - **Key Decisions**:
    - EventEmitter pattern for lifecycle observability
    - Polling-based wait for sync completion (500ms intervals)
    - Service registration in QueueManager constructor
  - **Test Results**: New code compiles cleanly, pre-existing TypeScript errors unaffected
  - **Impact**: Eliminates race conditions between bot and sync services, order creation now has exclusive resource access
  - **Duration**: ~25 minutes
  - **Next**: Plan 04.1-02 (Price Sync Investigation & Fix)

- **2026-01-13 (Late Evening)**: Plan 04.1-02 complete (Price Sync Investigation & Fix)
  - **Duration**: 120 minutes actual
  - **Accomplishments**:
    - Multi-level price matching: ID → name exact → name normalized (f22bac0)
    - Default pricing script: assign group average or global average (e6ebd58)
    - Price display in product autocomplete with green badges (5d26ef3)
    - ForceFullSync parameter to enable manual full price sync
  - **Key Decisions**:
    - Multi-level matching catches formatting variations (354TL.12 vs 354TL12)
    - Default pricing uses group-based averages for accuracy
    - Green badge for price display in autocomplete (positive indicator)
  - **Impact**: 100% price coverage (4,541/4,541 products), up from 59.8%
  - **Test Results**: Comprehensive testing documented in TEST-RESULTS-04.1-02.md
  - **Next**: Plan 04.1-03 (Voice Modal UX Enhancement)

- **2026-01-13 (Late Evening continued)**: Plan 04.1-03 complete (Voice Modal UX Enhancement)
  - **Duration**: 15 minutes actual
  - **Accomplishments**:
    - 3 detailed examples with real article code formats (XX.XX.XXX.XXX)
    - Step-by-step workflow guide (6 steps from tap to confirm)
    - Detailed command explanations (conferma, annulla, riprova) with when/what/result
    - Comprehensive error recovery section (5 common scenarios)
    - All content in Italian for agent usability
  - **Impact**: Substantially more comprehensive voice modal instructions, improved agent confidence
  - **Test Results**: TypeScript compilation passed, all changes UI-only
  - **Commits**: 1 atomic commit (c582255)
  - **Next**: Plan 04.1-04 (Customer Sync Priority Reversal)

- **2026-01-13 (Late Evening continued)**: Plan 04.1-04 complete ✅ (Customer Sync Priority Reversal)
  - **Duration**: 73 minutes actual
  - **Accomplishments**:
    - Research: Investigated DevExpress XAF ListView API, confirmed no URL/API sort parameters
    - Implementation: Client-side sort manipulation via ID column header click
    - Sort state detection: none/ascending/descending via CSS class inspection
    - Conditional click algorithm: none=2 clicks, asc=1 click, desc=0 clicks (idempotent)
    - Verification: Confirmed newest customers (ID 57.151 → 16.557) synced first
  - **Key Decisions**:
    - Client-side sort manipulation (only option with DevExpress XAF)
    - Idempotent state detection prevents toggling on subsequent syncs
    - Explicit state transitions more reliable than blind clicking
  - **Impact**: New customers available in < 1 minute (first page) instead of hours (last page)
  - **Test Results**: Manual verification confirmed reverse priority (newest first)
  - **Commits**: 1 atomic commit (ce93ce7)
  - **Phase 4.1 Status**: ✅ COMPLETE (4/4 plans done)

- **2026-01-13 (Late Evening continued)**: Phase 5 (Order Submission) ROLLED BACK and POSTPONED
  - **Reason**: Phase 5 changes compromised some functionality (user reported)
  - **Action**: Complete rollback of all Phase 5 changes
  - **Reverted Commits** (commit 20f1cd4):
    - aa1b324 fix(05-01): correct WebSocket URL to use backend port 3000
    - 04dbf96 debug(websocket): add detailed logging for progress tracking
    - 306b7f3 fix(05-01): implement WebSocket connection in OrderStatus
    - db7b34f docs(05-01): complete granular progress tracking plan
    - 08edccb feat(05-01): create WebSocket endpoint for order progress
    - a574b7d feat(05-01): add granular progress tracking to processOrder
  - **Files Affected**:
    - [archibald-web-app/backend/src/index.ts](archibald-web-app/backend/src/index.ts) - WebSocket endpoint removed
    - [archibald-web-app/backend/src/queue-manager.ts](archibald-web-app/backend/src/queue-manager.ts) - Progress tracking removed
    - [archibald-web-app/frontend/src/components/OrderStatus.tsx](archibald-web-app/frontend/src/components/OrderStatus.tsx) - WebSocket connection removed
    - `.planning/phases/05-order-submission/05-01-SUMMARY.md` - Deleted
  - **Roadmap Updates**:
    - Phase 5 moved from position 5 to final position (after Phase 12)
    - Phase 6 dependencies updated (now depends on Phase 4.1)
    - ROADMAP.md updated with postponement notice
  - **Impact**: System restored to stable pre-Phase-5 state
  - **Decision**: Focus on user-facing features (Multi-User Auth, Credential Management, Offline) before returning to Order Submission UX enhancements
  - **Next**: Phase 6 (Multi-User Authentication) planning

## Session Continuity

Last session: 2026-01-14 (morning)
Stopped at: Completed Plan 06-06 (Integrate User Sessions in Order Flow), JWT-protected order creation with per-user session routing operational
Next: Execute Plan 06-07 (Session Cleanup & Testing) - implement logout cleanup and integration tests for multi-user flow
