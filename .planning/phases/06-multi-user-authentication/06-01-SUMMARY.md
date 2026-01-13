# Phase 6 Plan 1: Research & Architecture Design Summary

**Phase**: 6 - Multi-User Authentication
**Plan**: 01 of 07
**Date**: 2026-01-13
**Duration**: 45 minutes
**Status**: ✅ COMPLETE

---

## Objective

Research Puppeteer multi-session patterns and design per-user session architecture.

**Purpose**: Choose the right multi-user browser session strategy before implementation to avoid costly refactoring later. Decision between BrowserContext pooling vs on-demand creation affects performance, memory usage, and code complexity.

**Output**: Architecture decision document with chosen approach, database schema design, and API flow design ready for implementation.

---

## Accomplishments

### Task 1: Research Puppeteer Multi-User Session Patterns ✅

**Researched**:
- BrowserContext API capabilities (complete cookie isolation)
- Performance characteristics (context creation ~100ms vs browser launch ~3-5s)
- Multi-tenant session management best practices
- Memory efficiency comparisons

**Documented 3 Options**:

1. **Option A: BrowserContext Pooling** (RECOMMENDED)
   - One Browser, multiple BrowserContexts per user
   - Memory: ~300MB for 10 users
   - Performance: 72s subsequent logins
   - Complete cookie isolation guaranteed

2. **Option B: On-Demand BrowserContext Creation**
   - Create/destroy contexts per login/logout
   - Simplest implementation
   - Performance: 107s every login (no optimization)

3. **Option C: Separate Browser Per User**
   - Maximum isolation but resource-heavy
   - Memory: ~1.5GB for 10 users
   - Does not scale beyond 10-20 users

**Deliverable**: [06-01-RESEARCH.md](.planning/phases/06-multi-user-authentication/06-01-RESEARCH.md)
**Commit**: c90f798

---

### Task 2: Architecture Decision Checkpoint ✅

**Decision**: Option A - BrowserContext Pooling

**Rationale**:
- 5x more memory efficient than separate Browsers
- 35s faster on subsequent logins (72s vs 107s)
- Industry-standard pattern for multi-tenant applications
- Excellent scalability (50+ concurrent users)
- Session persistence enables fast re-login

**Trade-offs Accepted**:
- Higher implementation complexity (justified by performance gains)
- Careful context lifecycle management required
- Cookie cache management overhead (minimal)

**Approved By**: User
**Approved Date**: 2026-01-13

---

### Task 3: Design Database Schema and API Flow ✅

**Database Schema Designed**:

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,              -- UUID v4
  username TEXT UNIQUE NOT NULL,    -- Archibald username
  fullName TEXT NOT NULL,           -- Display name
  whitelisted INTEGER NOT NULL DEFAULT 1,  -- Access control
  createdAt INTEGER NOT NULL,
  lastLoginAt INTEGER
);
```

**Session Cache Schema**:
- Location: `backend/.cache/session-{userId}.json`
- TTL: 24 hours
- Structure: userId, cookies array, timestamp, expiresAt

**JWT Structure**:
```json
{
  "userId": "user-uuid",
  "username": "mario.rossi",
  "iat": timestamp,
  "exp": timestamp + 8h
}
```
- Library: `jose` (ESM-native, better than `jsonwebtoken`)
- Algorithm: HS256
- Expiry: 8 hours

**API Endpoints Designed**:
- `POST /api/auth/login`: Validate whitelist → test Puppeteer login → return JWT
- `POST /api/auth/logout`: Close BrowserContext → clear cache
- `GET /api/auth/me`: Verify JWT → return user profile
- JWT middleware: Extract userId from token, attach to request

**BrowserPool Refactoring**:
- Current: `ArchibaldBot[]` pool (single-user)
- New: `Map<userId, BrowserContext>` (multi-user)
- Methods: `acquireContext(userId)`, `releaseContext()`, `closeUserContext()`

**SessionCacheManager API**:
- `saveSession(userId, cookies)`: Save to file
- `loadSession(userId)`: Load if valid
- `clearSession(userId)`: Delete file
- `hasValidSession(userId)`: Check validity

**Deliverable**: [06-01-ARCHITECTURE.md](.planning/phases/06-multi-user-authentication/06-01-ARCHITECTURE.md)
**Commit**: 25994b2

---

## Files Created

1. `.planning/phases/06-multi-user-authentication/06-01-RESEARCH.md`
   - 3 architecture options with pros/cons
   - Performance metrics and memory comparisons
   - Best practices from Puppeteer docs, Apify, Latenode
   - Recommendation with rationale

2. `.planning/phases/06-multi-user-authentication/06-01-ARCHITECTURE.md`
   - Complete database schema (users table)
   - Session cache structure (per-user JSON files)
   - JWT structure and security considerations
   - API endpoint specifications
   - BrowserPool refactoring design
   - 3 sequence diagrams (login, order creation, logout)
   - Component architecture diagram
   - Migration strategy for Plans 06-02 through 06-07
   - Testing strategy and performance expectations

---

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| **Architecture**: BrowserContext Pooling | 5x memory efficiency, 35s faster logins, production-grade pattern |
| **JWT Library**: jose | Better ESM support than jsonwebtoken, native async/await |
| **JWT Expiry**: 8 hours | Balance between UX (don't logout too often) and security |
| **Session Cache**: File-based (`.cache/session-{userId}.json`) | Simple, no external dependencies, 24h TTL |
| **Password Storage**: Never stored | Used only for immediate Puppeteer validation, security-first |
| **Database**: SQLite (users.db) | Consistent with existing project stack (products.db, customers.db) |
| **Cookie Cache TTL**: 24 hours | Match Archibald session expiry |

---

## Architecture Highlights

### Component Flow

```
Frontend (React + useAuth)
    ↓ JWT in Authorization header
Backend (Fastify + JWT middleware)
    ↓ userId extracted
BrowserPool (Map<userId, BrowserContext>)
    ↓ per-user context
Puppeteer (BrowserContext isolation)
    ↓ separate cookies
Archibald ERP (per-user sessions)
```

### Security Model

- **Password**: Never stored, used only for immediate validation
- **JWT**: HS256, 8h expiry, JWT_SECRET environment variable
- **Whitelist**: Pre-authentication check, admin-controlled
- **Session Isolation**: BrowserContext API guarantees complete cookie isolation

### Performance Model

| Scenario | Current | Multi-User | Improvement |
|----------|---------|------------|-------------|
| First login | ~82s | ~82s | 0s (same) |
| Subsequent login (cache hit) | ~82s | ~72s | -10s (faster) |
| Memory (10 users) | N/A | ~300MB | N/A |
| Context creation | N/A | ~100ms | N/A |

---

## Issues Encountered

None (design phase only - no code written)

---

## Next Steps

Ready for **Plan 06-02: User Database & Whitelist Backend**

**Tasks**:
1. Create `backend/src/user-database.ts` (UserDatabase singleton)
2. Create `backend/data/users.db` SQLite database
3. Implement CRUD methods (createUser, getUserById, getUserByUsername, updateUser, deleteUser)
4. Implement whitelist methods (toggleWhitelist, getWhitelistedUsers)
5. Seed test users (mario.rossi, luigi.verdi)

**Estimated Duration**: 60-90 minutes

---

## Commits

1. **c90f798** - `docs(06-01): research Puppeteer multi-user session patterns`
   - 06-01-RESEARCH.md with 3 options documented
   - Sources: Puppeteer docs, Apify, Latenode, WebScraping.AI

2. **25994b2** - `docs(06-01): design multi-user authentication architecture`
   - 06-01-ARCHITECTURE.md with complete design
   - Database schema, JWT structure, API endpoints
   - Sequence diagrams and component architecture
   - Migration strategy and testing strategy

---

## References

### Research Sources

- [Puppeteer BrowserContext API](https://pptr.dev/api/puppeteer.browsercontext)
- [Puppeteer Cookies Guide](https://pptr.dev/guides/cookies)
- [Apify Academy: Browser Contexts](https://docs.apify.com/academy/puppeteer-playwright/browser-contexts)
- [Latenode: Browser Performance Comparison](https://community.latenode.com/t/comparing-single-browser-multi-page-execution-with-multiple-browser-instances-in-puppeteer/4794)
- [Medium: Puppeteer Memory Leak Journey](https://medium.com/@matveev.dina/the-hidden-cost-of-headless-browsers-a-puppeteer-memory-leak-journey-027e41291367)
- [WebScraping.AI: Multi-Session Management](https://webscraping.ai/faq/puppeteer-sharp/how-do-i-manage-browser-contexts-in-puppeteer-sharp-for-multi-session-scenarios)
- [Browserless: Managing Sessions](https://www.browserless.io/blog/manage-sessions)
- [Latenode: Cookie Management](https://latenode.com/blog/cookie-management-in-puppeteer-session-preservation-auth-emulation-and-limitations)

### Technology Documentation

- [jose JWT Library](https://github.com/panva/jose)
- [SQLite better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [Fastify Documentation](https://fastify.dev/docs/latest/)

---

**Plan 06-01 Status**: ✅ COMPLETE
**Phase 6 Progress**: 1 of 7 plans complete (14%)
**Overall Project**: 33 of 38 plans complete (87%)
