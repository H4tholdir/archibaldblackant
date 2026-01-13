# Phase 6 Multi-User Authentication Architecture

**Date**: 2026-01-13
**Architecture Decision**: BrowserContext Pooling (Option A)
**Status**: APPROVED

---

## Architecture Decision

**Selected**: Option A - BrowserContext Pooling

**Rationale**:
- 5x more memory efficient than separate Browsers (300MB vs 1.5GB for 10 users)
- 35s faster on subsequent logins (72s vs 107s)
- Industry-standard pattern for multi-tenant Puppeteer applications
- Excellent scalability (handles 50+ concurrent users)
- Session persistence enables fast re-login without full Puppeteer authentication

**Trade-offs Accepted**:
- Higher implementation complexity (worth it for performance)
- Requires careful context lifecycle management
- Cookie cache management overhead (minimal)

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (React)                     │
├─────────────────────────────────────────────────────────────┤
│  LoginModal  →  useAuth Hook  →  localStorage (JWT)         │
│  OrderForm   →  JWT in Authorization header                 │
└─────────────────────────────────────────────────────────────┘
                              ↓ HTTP + JWT
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Fastify)                         │
├─────────────────────────────────────────────────────────────┤
│  JWT Middleware (authenticateJWT)                           │
│    ↓ extracts userId from token                             │
│  POST /api/auth/login                                        │
│  POST /api/auth/logout                                       │
│  GET  /api/auth/me                                           │
│  POST /api/orders/create (protected)                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Service Layer                              │
├─────────────────────────────────────────────────────────────┤
│  UserDatabase (SQLite)  ←  whitelist CRUD                   │
│  BrowserPool (refactored)  ←  per-user BrowserContexts      │
│  SessionCacheManager  ←  per-user cookie persistence        │
│  QueueManager  ←  passes userId to bot                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Browser Layer (Puppeteer)                   │
├─────────────────────────────────────────────────────────────┤
│  Browser (single instance)                                   │
│    ├─ BrowserContext (user-1)  →  Page  →  Archibald        │
│    ├─ BrowserContext (user-2)  →  Page  →  Archibald        │
│    └─ BrowserContext (user-N)  →  Page  →  Archibald        │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Users Table (SQLite)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,              -- UUID v4
  username TEXT UNIQUE NOT NULL,    -- Archibald username (e.g., "mario.rossi")
  fullName TEXT NOT NULL,           -- Display name (e.g., "Mario Rossi")
  whitelisted INTEGER NOT NULL DEFAULT 1,  -- 1 = authorized, 0 = blocked
  createdAt INTEGER NOT NULL,       -- Unix timestamp (ms)
  lastLoginAt INTEGER,              -- Unix timestamp (ms), NULL if never logged in
  CONSTRAINT unique_username UNIQUE (username)
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_whitelisted ON users(whitelisted);
```

**Notes**:
- `id`: UUID v4 generated on user creation
- `username`: Must match Archibald credentials exactly (case-sensitive)
- `whitelisted`: Toggle for access control (admin can block users)
- `createdAt`: Record creation timestamp
- `lastLoginAt`: Updated on every successful login

**Initial Seed Data**:
```sql
INSERT INTO users (id, username, fullName, whitelisted, createdAt) VALUES
  ('user-1-uuid', 'mario.rossi', 'Mario Rossi', 1, 1705142400000),
  ('user-2-uuid', 'luigi.verdi', 'Luigi Verdi', 1, 1705142400000);
```

---

## Session Cache Schema

### Per-User Cookie Cache (File-based)

**Location**: `backend/.cache/session-{userId}.json`

**Structure**:
```json
{
  "userId": "user-1-uuid",
  "cookies": [
    {
      "name": ".ASPXAUTH",
      "value": "...",
      "domain": "archibald.example.com",
      "path": "/",
      "expires": 1705228800,
      "httpOnly": true,
      "secure": true,
      "sameSite": "Lax"
    }
  ],
  "timestamp": 1705142400000,
  "expiresAt": 1705228800000
}
```

**TTL**: 24 hours (86400000ms)

**Lifecycle**:
- **Create**: After successful Puppeteer login, save cookies to `session-{userId}.json`
- **Load**: On context acquisition, check cache validity, restore cookies if valid
- **Update**: After each successful order operation, refresh cookies
- **Delete**: On explicit logout or session expiry

**SessionCacheManager API**:
```typescript
class SessionCacheManager {
  async saveSession(userId: string, cookies: Protocol.Network.Cookie[]): Promise<void>
  async loadSession(userId: string): Promise<Protocol.Network.Cookie[] | null>
  clearSession(userId: string): void
  async hasValidSession(userId: string): Promise<boolean>
  clearAllSessions(): void // Admin/maintenance only
}
```

---

## JWT Structure

### Token Payload

```json
{
  "userId": "user-1-uuid",
  "username": "mario.rossi",
  "iat": 1705142400,
  "exp": 1705171200
}
```

**Fields**:
- `userId`: User's UUID (primary key in users table)
- `username`: For logging and display purposes
- `iat`: Issued at timestamp (seconds)
- `exp`: Expiration timestamp (seconds) - 8 hours from `iat`

**Library**: `jose` (ESM-native, better than `jsonwebtoken`)

**Security**:
- `JWT_SECRET`: Environment variable (min 32 characters, randomly generated)
- Algorithm: HS256 (HMAC-SHA256)
- Expiry: 8 hours (28800 seconds)
- Refresh: Not implemented in Phase 6 (user must re-login after 8h)

**Generation**:
```typescript
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

const token = await new SignJWT({
  userId: user.id,
  username: user.username
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('8h')
  .sign(secret);
```

**Verification**:
```typescript
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const { payload } = await jwtVerify(token, secret);
```

---

## API Endpoints

### Authentication Endpoints

#### POST /api/auth/login

**Purpose**: Validate user credentials via Puppeteer login, return JWT

**Request**:
```json
{
  "username": "mario.rossi",
  "password": "secret123"
}
```

**Flow**:
1. Check `username` exists in `users` table with `whitelisted = 1`
2. If not whitelisted → return 403 Forbidden
3. Create temporary BrowserContext
4. Attempt Puppeteer login to Archibald with credentials
5. If login succeeds:
   - Save cookies to `session-{userId}.json`
   - Generate JWT token
   - Update `lastLoginAt` timestamp in database
   - Close temporary context
   - Return JWT + user info
6. If login fails → return 401 Unauthorized

**Response (Success)**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-1-uuid",
    "username": "mario.rossi",
    "fullName": "Mario Rossi"
  }
}
```

**Response (Error)**:
```json
{
  "success": false,
  "error": "Invalid credentials" | "User not whitelisted" | "Login failed"
}
```

**Security Notes**:
- Password NEVER stored in database (used only for immediate Puppeteer validation)
- Failed login attempts logged for security monitoring
- Rate limiting recommended (future enhancement)

---

#### POST /api/auth/logout

**Purpose**: Close user's BrowserContext and clear session cache

**Headers**: `Authorization: Bearer {token}`

**Flow**:
1. JWT middleware extracts `userId` from token
2. Call `BrowserPool.closeUserContext(userId)` - closes context
3. Call `SessionCacheManager.clearSession(userId)` - deletes cache file
4. Return success

**Response**:
```json
{
  "success": true
}
```

**Note**: Client-side must also clear JWT from localStorage

---

#### GET /api/auth/me

**Purpose**: Verify JWT validity and return user profile

**Headers**: `Authorization: Bearer {token}`

**Flow**:
1. JWT middleware extracts `userId` from token
2. Query `users` table for user by `id`
3. Return user profile

**Response**:
```json
{
  "success": true,
  "user": {
    "id": "user-1-uuid",
    "username": "mario.rossi",
    "fullName": "Mario Rossi",
    "whitelisted": true,
    "lastLoginAt": 1705142400000
  }
}
```

**Error (Invalid Token)**:
```json
{
  "success": false,
  "error": "Invalid or expired token"
}
```

---

### Admin Endpoints (Future)

#### POST /api/admin/users

Create new user in whitelist

#### GET /api/admin/users

List all users

#### PATCH /api/admin/users/:id/whitelist

Toggle user whitelist status

#### DELETE /api/admin/users/:id

Delete user (soft delete or hard delete TBD)

**Note**: Admin endpoints NOT implemented in Phase 6, deferred to future phase

---

## JWT Middleware

### authenticateJWT Middleware

**Purpose**: Extract userId from JWT, attach to request object

**Implementation**:
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify } from 'jose';

export interface AuthRequest extends FastifyRequest {
  user?: {
    userId: string;
    username: string;
  };
}

export async function authenticateJWT(
  request: AuthRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      success: false,
      error: 'Missing or invalid Authorization header'
    });
  }

  const token = authHeader.substring(7);

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    request.user = {
      userId: payload.userId as string,
      username: payload.username as string
    };
  } catch (error) {
    return reply.status(401).send({
      success: false,
      error: 'Invalid or expired token'
    });
  }
}
```

**Usage**:
```typescript
app.post('/api/orders/create', { preHandler: authenticateJWT }, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  // ... use userId for order creation
});
```

---

## Sequence Diagrams

### Login Flow

```
User                Frontend              Backend                UserDB      BrowserPool     Puppeteer
 |                     |                     |                     |              |              |
 |--[Enter credentials]->                    |                     |              |              |
 |                     |                     |                     |              |              |
 |                     |--POST /api/auth/login->                   |              |              |
 |                     |  {username, password}                     |              |              |
 |                     |                     |                     |              |              |
 |                     |                     |--Check whitelist--> |              |              |
 |                     |                     |<--User found--------|              |              |
 |                     |                     |                     |              |              |
 |                     |                     |--Create temp context->             |              |
 |                     |                     |                     |              |              |
 |                     |                     |                     |              |--Login------>|
 |                     |                     |                     |              |<--Success----|
 |                     |                     |                     |              |              |
 |                     |                     |<--Cookies-----------|              |              |
 |                     |                     |                     |              |              |
 |                     |                     |--Save session------>|SessionCache |              |
 |                     |                     |                     |              |              |
 |                     |                     |--Generate JWT------>|              |              |
 |                     |                     |                     |              |              |
 |                     |                     |--Update lastLoginAt->              |              |
 |                     |                     |                     |              |              |
 |                     |<--{token, user}-----|                     |              |              |
 |                     |                     |                     |              |              |
 |--[Logged in]--------|                     |                     |              |              |
 |  (JWT in localStorage)                    |                     |              |              |
```

---

### Order Creation Flow (Multi-User)

```
User-1              Frontend              Backend              QueueManager     BrowserPool      Archibald
 |                     |                     |                     |                |              |
 |--[Create order]---->|                     |                     |                |              |
 |                     |                     |                     |                |              |
 |                     |--POST /api/orders/create->                |                |              |
 |                     |  Authorization: Bearer {JWT-1}            |                |              |
 |                     |                     |                     |                |              |
 |                     |                     |--JWT middleware---->|                |              |
 |                     |                     |  extracts userId-1  |                |              |
 |                     |                     |                     |                |              |
 |                     |                     |--addOrder(data, userId-1)-->         |              |
 |                     |                     |                     |                |              |
 |                     |                     |                     |--processOrder->|              |
 |                     |                     |                     |  userId-1      |              |
 |                     |                     |                     |                |              |
 |                     |                     |                     |                |--acquire---->|
 |                     |                     |                     |                |  Context-1   |
 |                     |                     |                     |                |<--Context----|
 |                     |                     |                     |                |              |
 |                     |                     |                     |                |--createOrder>|
 |                     |                     |                     |                |  (User-1)    |
 |                     |                     |                     |                |<--Success----|
 |                     |                     |                     |                |              |
 |                     |                     |                     |                |--release---->|
 |                     |                     |                     |                |  Context-1   |
 |                     |                     |                     |                |  (success=true)
 |                     |                     |                     |<--Order ID-----|              |
 |                     |                     |                     |                |              |
 |                     |<--{success, jobId}--|                     |                |              |
 |                     |                     |                     |                |              |
 |<--Order created-----|                     |                     |                |              |
```

**Concurrent User-2**:
- At the same time, User-2's order uses `Context-2`
- Complete cookie isolation - User-1 and User-2 sessions don't interfere
- Orders created under correct Archibald user account

---

### Logout Flow

```
User                Frontend              Backend              BrowserPool     SessionCache
 |                     |                     |                     |              |
 |--[Click logout]---->|                     |                     |              |
 |                     |                     |                     |              |
 |                     |--POST /api/auth/logout->                  |              |
 |                     |  Authorization: Bearer {JWT}              |              |
 |                     |                     |                     |              |
 |                     |                     |--JWT middleware---->|              |
 |                     |                     |  extracts userId    |              |
 |                     |                     |                     |              |
 |                     |                     |--closeUserContext(userId)-->       |
 |                     |                     |                     |              |
 |                     |                     |                     |--close context->
 |                     |                     |                     |              |
 |                     |                     |                     |--clearSession->
 |                     |                     |                     |  (delete file) |
 |                     |                     |                     |              |
 |                     |<--{success: true}---|                     |              |
 |                     |                     |                     |              |
 |                     |--Remove JWT from--->|                     |              |
 |                     |  localStorage       |                     |              |
 |                     |                     |                     |              |
 |<--Back to login-----|                     |                     |              |
```

---

## BrowserPool Refactoring

### Current Architecture (Single-User)

```typescript
class BrowserPool {
  private pool: ArchibaldBot[] = [];
  private inUse: Set<ArchibaldBot> = new Set();

  async acquire(): Promise<ArchibaldBot>
  async release(bot: ArchibaldBot, success: boolean): Promise<void>
}
```

**Problem**: Shared pool - all users use same authenticated session

---

### New Architecture (Multi-User)

```typescript
class BrowserPool {
  private browser: Browser | null = null;
  private userContexts: Map<string, BrowserContext> = new Map();
  private sessionCache: SessionCacheManager;

  async initialize(): Promise<void>
  async acquireContext(userId: string): Promise<BrowserContext>
  async releaseContext(userId: string, context: BrowserContext, success: boolean): Promise<void>
  async closeUserContext(userId: string): Promise<void>
  async shutdown(): Promise<void>
  getStats(): { activeContexts: number; browserRunning: boolean }
}
```

**Key Changes**:

1. **Single Browser**: One shared Browser instance (launched on `initialize()`)
2. **Per-User Contexts**: `Map<userId, BrowserContext>` tracks user contexts
3. **Context Lifecycle**:
   - **Acquire**: Return existing context if available, create new if not
   - **Release**: Save cookies to cache, keep context in pool
   - **Close**: Explicit close on logout, clear cache
4. **Cookie Cache Integration**: Use `SessionCacheManager` for persistence

**API Example**:
```typescript
// In ArchibaldBot
class ArchibaldBot {
  constructor(private userId?: string) {}

  async initialize() {
    if (this.userId) {
      // Multi-user mode
      const pool = BrowserPool.getInstance();
      this.context = await pool.acquireContext(this.userId);
      this.page = await this.context.newPage();
    } else {
      // Legacy single-user mode (backwards compatible)
      this.browser = await puppeteer.launch({...});
      this.page = await this.browser.newPage();
    }
  }

  async close() {
    if (this.userId && this.context) {
      const pool = BrowserPool.getInstance();
      await pool.releaseContext(this.userId, this.context, true);
    } else if (this.browser) {
      await this.browser.close();
    }
  }
}
```

---

## Security Considerations

### Password Handling

- **NEVER stored in database**: Passwords used only for immediate Puppeteer validation
- **Transmitted over HTTPS only**: No plaintext password transmission
- **Not logged**: Passwords excluded from all log statements

### JWT Security

- **Secret Management**: `JWT_SECRET` environment variable (min 32 chars)
- **Token Storage**: Client-side localStorage (alternative: httpOnly cookies for enhanced security)
- **Token Expiry**: 8 hours - balance between UX and security
- **Token Validation**: Every protected endpoint validates JWT

### Session Isolation

- **BrowserContext Guarantee**: Puppeteer API guarantees complete cookie isolation
- **No Shared State**: Each user's BrowserContext independent
- **Cache Isolation**: Separate cache file per user (`session-{userId}.json`)

### Whitelist Authorization

- **Pre-authentication Check**: Login fails if `whitelisted = 0`
- **Admin Control**: Admins can block users without deleting accounts
- **Audit Trail**: `lastLoginAt` tracks user activity

---

## Environment Variables

```env
# JWT Secret (required)
JWT_SECRET=your-secret-key-min-32-characters-randomly-generated

# Archibald Credentials (unchanged)
ARCHIBALD_URL=https://archibald.example.com
ARCHIBALD_USERNAME=admin
ARCHIBALD_PASSWORD=secret
```

**JWT_SECRET Generation**:
```bash
# Generate secure random secret
openssl rand -base64 32
```

---

## Migration Strategy

### Phase 6 Implementation Order

1. **Plan 06-02**: User Database & Whitelist Backend
   - Create `users.db` SQLite database
   - Implement `UserDatabase` singleton
   - Seed test users
   - Admin CRUD endpoints (deferred to future)

2. **Plan 06-03**: Authentication Backend & JWT
   - Implement JWT middleware (`authenticateJWT`)
   - Create `/api/auth/login` endpoint
   - Create `/api/auth/logout` endpoint
   - Create `/api/auth/me` endpoint

3. **Plan 06-04**: Login UI & Frontend Auth State
   - Create `LoginModal` component
   - Implement `useAuth` hook
   - Integrate JWT in API calls
   - Update `App.tsx` with auth flow

4. **Plan 06-05**: Refactor BrowserPool for Multi-User Sessions
   - Create `SessionCacheManager`
   - Refactor `BrowserPool` for per-user contexts
   - Update `ArchibaldBot` to accept `userId` parameter

5. **Plan 06-06**: Integrate User Sessions in Order Flow
   - Update `POST /api/orders/create` to require JWT
   - Pass `userId` from JWT to `QueueManager`
   - Update order processing to use user's BrowserContext

6. **Plan 06-07**: Session Cleanup & Testing
   - Implement session expiry background job
   - Test multi-user concurrent order creation
   - Verify complete session isolation
   - Update documentation

---

## Testing Strategy

### Unit Tests

- `UserDatabase`: CRUD operations, whitelist filtering
- `SessionCacheManager`: Save/load/clear session cache, expiry logic
- `JWT middleware`: Token validation, error handling
- `BrowserPool`: Context acquisition/release, lifecycle management

### Integration Tests

- Login flow: Valid credentials → JWT returned
- Login flow: Invalid credentials → 401 error
- Login flow: Not whitelisted → 403 error
- Order creation: Multi-user concurrent orders use correct sessions
- Logout flow: Context closed, cache cleared

### Manual Testing (Checkpoint)

- Login with 2 different users simultaneously (separate browser windows)
- Create orders from both users
- Verify orders appear under correct Archibald user account
- Logout from one user, verify other user unaffected
- Re-login, verify session persistence (fast login)

---

## Performance Expectations

### Baseline (Current Single-User)

- Order creation: ~82s with cache, ~107s without cache

### Multi-User (BrowserContext Pooling)

- **First user login**: ~82s (same as current)
- **Subsequent logins** (cached session): ~72s (10s faster, skip Puppeteer login)
- **Context creation**: ~100ms (negligible)
- **Context switch**: <50ms (negligible)
- **Memory overhead**: ~10-20MB per active user

### Scalability Target

- **10 concurrent users**: ~300MB total memory
- **50 concurrent users**: ~1.2GB total memory
- **100 concurrent users**: ~2.2GB total memory (requires vertical scaling)

---

## Future Enhancements (Post-Phase 6)

1. **Token Refresh**: Implement refresh tokens for seamless 24h+ sessions
2. **Admin Panel**: Web UI for user management (whitelist, view activity)
3. **Rate Limiting**: Prevent brute-force login attempts
4. **Session Monitoring**: Dashboard for active sessions, memory usage
5. **Horizontal Scaling**: Distribute BrowserPool across multiple servers
6. **Audit Logging**: Comprehensive audit trail for all user actions
7. **2FA Support**: Optional two-factor authentication
8. **Role-Based Access Control**: Distinguish admin vs regular users

---

## References

- Puppeteer BrowserContext API: https://pptr.dev/api/puppeteer.browsercontext
- jose JWT Library: https://github.com/panva/jose
- SQLite better-sqlite3: https://github.com/WiseLibs/better-sqlite3
- Fastify Documentation: https://fastify.dev/docs/latest/

---

## Approval

**Architecture**: BrowserContext Pooling (Option A)
**Approved By**: User
**Approved Date**: 2026-01-13
**Status**: Ready for implementation (Plans 06-02 through 06-07)
