# Role-Based Access Control System

## Overview

Archibald Mobile implements a two-role RBAC system to separate administrative backend operations from agent user operations.

### Roles

1. **Agent** (`role: 'agent'`)
   - Default role for all users
   - Access to order creation and management
   - Can refresh local cache from backend
   - Cannot access backend sync operations

2. **Admin** (`role: 'admin'`)
   - Full agent capabilities
   - Access to admin panel (`/admin`)
   - Can trigger backend sync from Archibald ERP
   - Protected sync endpoint access

## Architecture

### Two-Tier Data Flow

```
[Archibald ERP]
    ↓
    ↓ (Tier 1: Puppeteer scraping - ADMIN ONLY)
    ↓ SyncBars component triggers /api/sync/*
    ↓
[Backend SQLite Database]
    ↓
    ↓ (Tier 2: API export - ALL AUTHENTICATED USERS)
    ↓ CacheRefreshButton triggers /api/cache/export
    ↓
[Frontend IndexedDB Cache]
    ↓
[Agent's App]
```

### Key Separation

- **Tier 1 (Admin)**: Backend sync operations (ERP → Database)
- **Tier 2 (Users)**: Cache population (Database → IndexedDB)

## Backend Implementation

### Database Schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  fullName TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent',
  whitelisted INTEGER NOT NULL DEFAULT 1,
  createdAt INTEGER NOT NULL,
  lastLoginAt INTEGER,
  CONSTRAINT valid_role CHECK (role IN ('agent', 'admin'))
);

CREATE INDEX idx_role ON users(role);
```

### JWT Authentication

```typescript
// JWT Payload includes role
interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole; // 'agent' | 'admin'
}

// Generated on login
const token = await generateJWT({
  userId: user.id,
  username: user.username,
  role: user.role
});
```

### Middleware Protection

```typescript
// Auth middleware extracts role from JWT
export async function authenticateJWT(req, res, next) {
  const payload = await verifyJWT(token);
  req.user = payload; // includes role
  next();
}

// Admin middleware checks role
export async function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    logger.warn('Non-admin access attempt', { userId: req.user.userId });
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
```

### Protected Endpoints

All backend sync endpoints require admin role:

```typescript
// Sequential sync
app.post("/api/sync/full", authenticateJWT, requireAdmin, async (req) => { ... });

// Individual syncs
app.post("/api/sync/customers", authenticateJWT, requireAdmin, async (req) => { ... });
app.post("/api/sync/products", authenticateJWT, requireAdmin, async (req) => { ... });
app.post("/api/sync/prices", authenticateJWT, requireAdmin, async (req) => { ... });
```

## Frontend Implementation

### User Interface

```typescript
export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole; // 'agent' | 'admin'
  whitelisted: boolean;
  lastLoginAt: number | null;
}
```

### React Router Setup

```typescript
function AppRouter() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === 'admin';

  return (
    <BrowserRouter>
      <Routes>
        {/* Admin-only route */}
        {isAdmin && (
          <Route path="/admin" element={<AdminPage />} />
        )}

        {/* Main app - all authenticated users */}
        <Route path="/" element={<MainApp />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Conditional UI Elements

```typescript
// Admin button in header (only for admins)
{isAdmin && (
  <a href="/admin" className="btn btn-secondary btn-sm">
    🔧 Admin
  </a>
)}

// SyncBars only in AdminPage (not in main app)
// Agents never see backend sync operations
```

## Admin Panel

### Features

Located at `/admin` route (admins only):

1. **Sync Operations**
   - Customer sync (ERP → Backend)
   - Product sync (ERP → Backend)
   - Price sync (ERP → Backend)
   - Real-time progress indicators

2. **Educational Info Cards**
   - Explains what each sync does
   - Clarifies data flow
   - Professional purple gradient design

3. **Navigation**
   - Button to return to main app
   - User info with logout
   - Clean separation from agent UI

## User Management

### Migration Scripts

Location: `backend/src/migrations/`

#### 1. Add Role Column (One-time)

```bash
npx ts-node src/migrations/add-role-column.ts
```

Safely adds `role` column to existing users table. Idempotent (can run multiple times).

#### 2. List Users

```bash
npx ts-node src/migrations/list-users.ts
```

Shows all users with:
- Username and full name
- Role (🔧 ADMIN or 👤 Agent)
- Whitelisted status
- Creation and last login dates
- Summary statistics

Output example:
```
📋 User List

Total users: 2

1. admin_user
   Name: Admin User
   Role: 🔧 ADMIN
   Whitelisted: ✅
   Created: 2026-01-14 04:56:43
   Last Login: 2026-01-14 23:24:31

2. agent_user
   Name: Agent User
   Role: 👤 Agent
   Whitelisted: ✅
   Created: 2026-01-14 05:12:15
   Last Login: 2026-01-14 22:45:20

📊 Summary:
   Admins: 1
   Agents: 1
```

#### 3. Set User as Admin

```bash
npx ts-node src/migrations/set-user-admin.ts <username>
```

Promotes a user to admin role.

Example:
```bash
npx ts-node src/migrations/set-user-admin.ts francesco
✅ User 'francesco' is now an admin
```

### Creating New Users

Users are created through the backend API (not migration scripts):

```typescript
import { UserDatabase } from './user-db';

const userDb = UserDatabase.getInstance();

// Create agent (default)
const agent = userDb.createUser('username', 'Full Name');

// Create admin
const admin = userDb.createUser('admin_user', 'Admin Name', 'admin');
```

## Security Features

### JWT Token Security

- **Token expiry**: 8 hours
- **Secure signing**: HS256 algorithm
- **Secret key**: Configurable via `JWT_SECRET` env var
- **Role immutability**: Role stored in token, cannot be modified client-side

### Endpoint Protection

1. **Authentication Check**: All protected endpoints require valid JWT
2. **Role Verification**: Admin endpoints check `role === 'admin'`
3. **Logging**: All unauthorized access attempts logged with user details
4. **HTTP Status Codes**:
   - 401 Unauthorized: Missing or invalid token
   - 403 Forbidden: Valid token but insufficient permissions

### Database Constraints

- `CHECK (role IN ('agent', 'admin'))`: Prevents invalid roles at DB level
- `DEFAULT 'agent'`: Safe default for new users
- Index on `role` column: Efficient role-based queries

## Testing

### Test Scenarios

#### 1. Agent Login (Default User)

**Expected Behavior:**
- ✅ Can login and create orders
- ✅ Can see "🔄 Aggiorna dati" button (cache refresh)
- ❌ Cannot see "🔧 Admin" button
- ❌ Cannot access `/admin` route (redirected or no route)
- ❌ Cannot call `/api/sync/*` endpoints (403 Forbidden)

**Test Steps:**
1. Login as agent user
2. Verify no admin button in header
3. Try navigating to `/admin` manually
4. Try calling sync endpoint (should get 403)

#### 2. Admin Login

**Expected Behavior:**
- ✅ Can login and create orders (same as agent)
- ✅ Can see "🔄 Aggiorna dati" button
- ✅ Can see "🔧 Admin" button in header
- ✅ Can access `/admin` route
- ✅ Can trigger sync operations
- ✅ SyncBars show progress correctly

**Test Steps:**
1. Login as admin user
2. Verify admin button appears in header
3. Click admin button → navigate to `/admin`
4. Verify admin panel loads with sync bars
5. Test sync operations work

#### 3. Endpoint Protection

**Test with Admin Token:**
```bash
# Should succeed (200 OK)
curl -X POST http://localhost:3001/api/sync/customers \
  -H "Authorization: Bearer <admin_token>"
```

**Test with Agent Token:**
```bash
# Should fail (403 Forbidden)
curl -X POST http://localhost:3001/api/sync/customers \
  -H "Authorization: Bearer <agent_token>"

# Response:
# {"error": "Admin access required"}
```

**Check Logs:**
```
2026-01-15 00:50:21 [warn]: Non-admin user attempted to access admin endpoint {
  "userId": "...",
  "username": "agent_user",
  "role": "agent"
}
```

### Manual Testing Checklist

- [ ] Run migration: `npx ts-node src/migrations/add-role-column.ts`
- [ ] List users: `npx ts-node src/migrations/list-users.ts`
- [ ] Set admin: `npx ts-node src/migrations/set-user-admin.ts <username>`
- [ ] Create test agent user (via API or manually)
- [ ] Login as agent → verify no admin access
- [ ] Login as admin → verify full access
- [ ] Test sync endpoints with both roles
- [ ] Verify 403 responses logged correctly

## Production Deployment

### Pre-Deployment Checklist

1. **Environment Variables**
   ```bash
   # Set secure JWT secret
   JWT_SECRET=<strong-random-secret>
   ```

2. **Database Migration**
   ```bash
   # Run migration on production DB
   npx ts-node src/migrations/add-role-column.ts
   ```

3. **Assign Admin Roles**
   ```bash
   # Promote admin users
   npx ts-node src/migrations/set-user-admin.ts <admin_username>
   ```

4. **Verify Setup**
   ```bash
   # List all users and verify roles
   npx ts-node src/migrations/list-users.ts
   ```

### Security Best Practices

1. **Limit Admin Users**: Only assign admin role to trusted users
2. **Rotate JWT Secret**: Change `JWT_SECRET` periodically
3. **Monitor Logs**: Track unauthorized access attempts
4. **Regular Audits**: Review admin user list monthly
5. **Principle of Least Privilege**: Default to agent role

## Troubleshooting

### Issue: User Not Seeing Admin Button

**Diagnosis:**
1. Check user role in database:
   ```bash
   npx ts-node src/migrations/list-users.ts
   ```

2. Verify JWT includes role:
   - Login endpoint should return `user.role` in response
   - Frontend should store role in auth state

3. Check token expiry:
   - Tokens expire after 8 hours
   - User must re-login to get new token with updated role

**Solution:**
- If role is wrong in DB: Use `set-user-admin.ts` script
- If token is old: Force user to logout and re-login
- If frontend not updating: Clear localStorage and re-login

### Issue: 403 Forbidden for Admin User

**Diagnosis:**
1. Verify user role in database
2. Check JWT token contains `role: 'admin'`
3. Verify middleware order: `authenticateJWT` must come before `requireAdmin`
4. Check backend logs for middleware execution

**Solution:**
- Ensure user logged in AFTER role was updated
- Old tokens don't include role changes
- Force logout and re-login

### Issue: Migration Fails

**Error: "column already exists"**
- Migration script checks for existing column
- Safe to ignore or run script again (idempotent)

**Error: "table not found"**
- Database not initialized
- Run backend server first to create schema

## API Reference

### Authentication Endpoints

#### POST `/api/auth/login`

**Request:**
```json
{
  "username": "user",
  "password": "pass"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "username": "user",
    "fullName": "Full Name",
    "role": "admin"  // or "agent"
  }
}
```

#### GET `/api/auth/me`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "user",
      "fullName": "Full Name",
      "role": "admin",
      "whitelisted": true,
      "lastLoginAt": 1736899471000
    }
  }
}
```

### Protected Admin Endpoints

All require `authenticateJWT` + `requireAdmin` middleware.

#### POST `/api/sync/full`

Sequential sync of customers → products → prices.

**Response:**
```json
{
  "success": true,
  "message": "Sincronizzazione completa avviata in sequenza"
}
```

#### POST `/api/sync/customers`

Sync customers from Archibald ERP.

#### POST `/api/sync/products`

Sync products from Archibald ERP.

#### POST `/api/sync/prices`

Sync prices from Archibald ERP.

Query param: `?full=true` for full sync from page 1.

## Future Enhancements

### Potential Improvements

1. **Additional Roles**
   - `supervisor`: Can view sync status but not trigger
   - `readonly`: Can only view orders, no creation

2. **Granular Permissions**
   - Per-entity permissions (e.g., can sync customers but not prices)
   - Time-based access (e.g., sync only during business hours)

3. **Audit Logging**
   - Track all admin actions with timestamps
   - Generate audit reports

4. **Role Management UI**
   - Admin panel to manage user roles
   - Bulk role assignment

5. **Two-Factor Authentication**
   - Additional security for admin accounts
   - SMS or authenticator app verification

## Summary

The role-based access control system provides:

✅ **Clear Separation**: Admins manage backend, agents focus on orders
✅ **Security**: JWT-based auth with middleware protection
✅ **Flexibility**: Easy to add users and change roles
✅ **Auditability**: All access attempts logged
✅ **Scalability**: Database constraints and indexes for performance

**Key Principle**: Agents and admins have different concerns. The system architecturally separates these concerns while maintaining a unified authentication flow.
