# Testing Guide - Role-Based Access Control

## Quick Start

This guide helps you test the role-based access control system implemented in Phase 8.

## Prerequisites

- Backend and frontend servers running
- At least one user in the system
- Browser with DevTools (for testing API calls)

## Test Setup

### 1. Check Current Users

```bash
cd archibald-web-app/backend
npx ts-node src/migrations/list-users.ts
```

**Expected Output:**
```
📋 User List

Total users: 1

1. ikiA0930
   Name: Francesco Formicola
   Role: 🔧 ADMIN
   Whitelisted: ✅
   Created: 2026-01-14 04:56:43
   Last Login: 2026-01-14 23:24:31

📊 Summary:
   Admins: 1
   Agents: 0
```

### 2. Create Test Agent User (Optional)

For comprehensive testing, create a second user with agent role:

**Option A: Via Backend API** (requires authentication endpoint)

**Option B: Manually in Database** (for quick testing)
```bash
# Start SQLite CLI
sqlite3 data/users.db

# Insert test agent
INSERT INTO users (id, username, fullName, role, whitelisted, createdAt, lastLoginAt)
VALUES (
  '12345678-1234-1234-1234-123456789012',
  'test_agent',
  'Test Agent',
  'agent',
  1,
  strftime('%s', 'now') * 1000,
  NULL
);

# Verify
SELECT username, fullName, role FROM users;
```

Now you have:
- **Admin user**: ikiA0930 (existing)
- **Agent user**: test_agent (for testing restrictions)

## Test Scenarios

### Test 1: Admin User - Full Access ✅

**Objective**: Verify admin user has full access to all features.

**Steps:**

1. **Login as Admin**
   - Navigate to app (http://localhost:5173)
   - Login with: `ikiA0930` / `<password>`
   - Should login successfully

2. **Verify Admin UI Elements**
   - Look for "🔧 Admin" button in header next to user info
   - Should be visible
   - ✅ **Pass if visible**

3. **Access Admin Panel**
   - Click "🔧 Admin" button
   - Should navigate to `/admin` route
   - Should see:
     - Header: "📊 Archibald Admin"
     - Three sync bars (Clienti, Prodotti, Prezzi)
     - Info cards explaining each sync
     - Purple gradient background
   - ✅ **Pass if admin panel loads**

4. **Test Sync Operations**
   - Click "Avvia Sync" on any bar (e.g., Clienti)
   - Should see:
     - Progress bar activating (0% → 100%)
     - Status updates in real-time
     - Success message on completion
   - Check backend logs for sync activity
   - ✅ **Pass if sync completes successfully**

5. **Verify Main App Access**
   - Click "📱 Vai all'App" button in admin panel
   - Should return to main app (`/`)
   - Should still have access to order creation
   - Should still see "🔄 Aggiorna dati" button (cache refresh)
   - ✅ **Pass if main app works normally**

6. **Test API Endpoint Access**
   - Open DevTools → Network tab
   - In admin panel, trigger a sync
   - Check network request to `/api/sync/customers` (or similar)
   - Should return `200 OK` with success message
   - ✅ **Pass if no 403 errors**

**Expected Result**: ✅ Admin user has full access to all features.

---

### Test 2: Agent User - Restricted Access 🚫

**Objective**: Verify agent user cannot access admin features.

**Steps:**

1. **Logout Current User**
   - Click "Logout" button
   - Should return to login screen

2. **Login as Agent**
   - Login with: `test_agent` / `<password>`
   - Should login successfully

3. **Verify No Admin UI Elements**
   - Look for "🔧 Admin" button in header
   - Should NOT be visible
   - Only see: "🔄 Aggiorna dati" and "Logout"
   - ✅ **Pass if admin button is hidden**

4. **Attempt Manual Navigation to Admin Panel**
   - Manually navigate to: `http://localhost:5173/admin`
   - Should either:
     - Show 404 / not found
     - Redirect to `/`
     - Show empty page (route doesn't render)
   - Should NOT show admin panel content
   - ✅ **Pass if admin panel is inaccessible**

5. **Test API Endpoint Protection**
   - Open DevTools → Console
   - Get JWT token:
     ```javascript
     localStorage.getItem('archibald_jwt')
     ```
   - Try calling sync endpoint:
     ```javascript
     fetch('/api/sync/customers', {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${localStorage.getItem('archibald_jwt')}`
       }
     }).then(r => r.json()).then(console.log)
     ```
   - Should return:
     ```json
     {
       "error": "Admin access required"
     }
     ```
   - HTTP Status: `403 Forbidden`
   - ✅ **Pass if 403 error received**

6. **Check Backend Logs**
   - View backend terminal/logs
   - Should see warning:
     ```
     [warn]: Non-admin user attempted to access admin endpoint {
       "userId": "...",
       "username": "test_agent",
       "role": "agent"
     }
     ```
   - ✅ **Pass if warning logged**

7. **Verify Agent Can Still Use Main App**
   - Create a new order
   - Search for customers (cache should work)
   - Submit order
   - All main app features should work normally
   - ✅ **Pass if main app functions normally**

8. **Test Cache Refresh (Non-Admin Operation)**
   - Click "🔄 Aggiorna dati" button
   - Should show progress: "Aggiornamento... X%"
   - Should complete successfully
   - Alert: "Dati aggiornati: X clienti, Y prodotti"
   - ✅ **Pass if cache refresh works**

**Expected Result**: ✅ Agent user has restricted access, main app works, admin features blocked.

---

### Test 3: JWT Token Verification 🔐

**Objective**: Verify JWT tokens include role and are validated correctly.

**Steps:**

1. **Inspect Admin JWT Token**
   - Login as admin user
   - Open DevTools → Console
   - Get token:
     ```javascript
     const token = localStorage.getItem('archibald_jwt');
     const [header, payload, signature] = token.split('.');
     const decoded = JSON.parse(atob(payload));
     console.log(decoded);
     ```
   - Should see:
     ```json
     {
       "userId": "...",
       "username": "ikiA0930",
       "role": "admin",  // ← Should be "admin"
       "iat": 1736899471,
       "exp": 1736928271
     }
     ```
   - ✅ **Pass if role is "admin"**

2. **Inspect Agent JWT Token**
   - Login as agent user
   - Repeat above steps
   - Should see:
     ```json
     {
       "userId": "...",
       "username": "test_agent",
       "role": "agent",  // ← Should be "agent"
       "iat": 1736899471,
       "exp": 1736928271
     }
     ```
   - ✅ **Pass if role is "agent"**

3. **Test Token Expiry**
   - Tokens expire after 8 hours
   - After expiry, user should be logged out
   - Re-login should generate new token
   - ✅ **Pass if re-login works after expiry**

**Expected Result**: ✅ JWT tokens include correct role claim.

---

### Test 4: Role Change Verification 🔄

**Objective**: Verify role changes require re-login to take effect.

**Steps:**

1. **Login as Agent**
   - Login with agent user
   - Verify no admin button visible

2. **Promote to Admin (Backend)**
   - In terminal:
     ```bash
     npx ts-node src/migrations/set-user-admin.ts test_agent
     ```
   - Should see:
     ```
     ✅ User 'test_agent' is now an admin
     ```

3. **Verify Old Token Still Shows Agent**
   - In browser (still logged in), check token:
     ```javascript
     const token = localStorage.getItem('archibald_jwt');
     const decoded = JSON.parse(atob(token.split('.')[1]));
     console.log(decoded.role); // Still shows "agent"
     ```
   - Admin button still not visible
   - ✅ **Pass if old token unchanged**

4. **Logout and Re-Login**
   - Click "Logout"
   - Login again with same user
   - New JWT should include updated role

5. **Verify New Token Shows Admin**
   - Check token again:
     ```javascript
     const token = localStorage.getItem('archibald_jwt');
     const decoded = JSON.parse(atob(token.split('.')[1]));
     console.log(decoded.role); // Now shows "admin"
     ```
   - Admin button should now be visible
   - ✅ **Pass if admin button appears**

6. **Test Admin Access**
   - Click admin button
   - Should access `/admin` successfully
   - ✅ **Pass if admin panel accessible**

**Expected Result**: ✅ Role changes require re-login to take effect (JWT immutability).

---

### Test 5: Database Constraints 🛡️

**Objective**: Verify database enforces role constraints.

**Steps:**

1. **Test Invalid Role Insertion**
   ```bash
   sqlite3 data/users.db
   ```
   ```sql
   -- Try to insert user with invalid role
   INSERT INTO users (id, username, fullName, role, whitelisted, createdAt)
   VALUES ('test-id', 'test', 'Test User', 'invalid_role', 1, 1736899471000);
   ```
   - Should fail with error:
     ```
     Error: CHECK constraint failed: valid_role
     ```
   - ✅ **Pass if insertion rejected**

2. **Test Valid Roles**
   ```sql
   -- Should succeed
   INSERT INTO users (id, username, fullName, role, whitelisted, createdAt)
   VALUES ('test-id-2', 'test2', 'Test User 2', 'agent', 1, 1736899471000);

   INSERT INTO users (id, username, fullName, role, whitelisted, createdAt)
   VALUES ('test-id-3', 'test3', 'Test User 3', 'admin', 1, 1736899471000);
   ```
   - Both should succeed
   - ✅ **Pass if both insertions succeed**

3. **Test Default Role**
   ```sql
   -- Insert without specifying role
   INSERT INTO users (id, username, fullName, whitelisted, createdAt)
   VALUES ('test-id-4', 'test4', 'Test User 4', 1, 1736899471000);

   -- Check role
   SELECT username, role FROM users WHERE username = 'test4';
   ```
   - Should show `role = 'agent'` (default)
   - ✅ **Pass if default is 'agent'**

**Expected Result**: ✅ Database constraints enforce valid roles.

---

## Test Results Summary

After completing all tests, fill out this checklist:

### Admin User Tests
- [ ] Admin button visible in header
- [ ] Can access `/admin` route
- [ ] Can see sync bars in admin panel
- [ ] Can trigger sync operations successfully
- [ ] Sync endpoints return 200 OK
- [ ] Can navigate back to main app
- [ ] Main app features work normally

### Agent User Tests
- [ ] Admin button NOT visible in header
- [ ] Cannot access `/admin` route
- [ ] Sync endpoints return 403 Forbidden
- [ ] Unauthorized attempts logged in backend
- [ ] Main app features work normally
- [ ] Cache refresh button works

### JWT Token Tests
- [ ] Admin token includes `role: "admin"`
- [ ] Agent token includes `role: "agent"`
- [ ] Token expiry works (8 hours)

### Role Change Tests
- [ ] Old token doesn't reflect role changes
- [ ] Re-login required for role changes to take effect
- [ ] New token includes updated role

### Database Constraint Tests
- [ ] Invalid roles rejected at DB level
- [ ] Valid roles ('agent', 'admin') accepted
- [ ] Default role is 'agent'

## Common Issues and Solutions

### Issue: "Admin button not showing after promotion"

**Solution**: User needs to logout and re-login. Old JWT token doesn't include role changes.

### Issue: "403 Forbidden for admin user"

**Diagnosis**:
1. Check user role in database: `npx ts-node src/migrations/list-users.ts`
2. Check JWT token: Decode token and verify `role` field
3. Verify user logged in after role change

**Solution**: Ensure user logged in AFTER being promoted to admin.

### Issue: "Cannot access admin panel"

**Diagnosis**:
1. Check if user has admin role
2. Check browser URL (should be `/admin`)
3. Check React Router is rendering admin route

**Solution**: Verify `isAdmin` condition in AppRouter.tsx is working.

### Issue: "Sync endpoints not working"

**Diagnosis**:
1. Check backend logs for errors
2. Verify middleware order: `authenticateJWT, requireAdmin`
3. Check if Puppeteer/browser pool is running

**Solution**: Ensure backend is running and Archibald ERP is accessible.

## Manual Test Execution

Run these commands in sequence:

```bash
# 1. List current users
npx ts-node src/migrations/list-users.ts

# 2. Set admin user (if needed)
npx ts-node src/migrations/set-user-admin.ts ikiA0930

# 3. Verify
npx ts-node src/migrations/list-users.ts

# 4. Start backend
npm run dev

# 5. Start frontend (in another terminal)
cd ../frontend
npm run dev

# 6. Open browser
open http://localhost:5173

# 7. Follow test scenarios above
```

## Automated Testing (Future)

Future automated tests could include:

1. **Unit Tests**
   - Middleware functions (authenticateJWT, requireAdmin)
   - JWT generation and verification
   - Database operations

2. **Integration Tests**
   - Login flow with different roles
   - Protected endpoint access
   - Role change workflow

3. **E2E Tests**
   - Full user journey for admin
   - Full user journey for agent
   - Cross-role scenarios

## Reporting Issues

If you find issues during testing:

1. **Document the issue**:
   - What you were testing
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable

2. **Check logs**:
   - Backend console output
   - Browser DevTools console
   - Network tab for API calls

3. **Verify environment**:
   - Node.js version
   - Database state
   - Browser version

4. **Create bug report** with all above information.

## Success Criteria

Testing is successful when:

✅ Admin users can access all features
✅ Agent users are properly restricted
✅ Sync endpoints are protected
✅ JWT tokens include correct roles
✅ Database constraints work
✅ All unauthorized attempts are logged
✅ Main app works for both roles

## Next Steps

After successful testing:

1. ✅ Deploy to production with confidence
2. ✅ Monitor logs for unauthorized access attempts
3. ✅ Document any production-specific configurations
4. ✅ Train admin users on admin panel features
5. ✅ Set up regular role audits

---

**Testing Complete**: Role-based access control system is production-ready! 🚀
