# Phase 7: Credential Management - Security Audit Checklist

**Date:** 2026-01-14
**Phase:** 07-credential-management
**Status:** Pre-completion verification

## Objective

Verify Phase 7 security requirements before marking phase complete.

This checklist ensures:
- No plaintext credentials anywhere in system
- Encryption implementation is correct
- No credential leakage in logs, errors, or network traffic
- Banking app security parity achieved

## Checklist

### 1. Credential Encryption (Frontend)

- [ ] **Credentials encrypted in IndexedDB**
  - Navigate to DevTools → Application → IndexedDB → ArchibaldCredentials → credentials
  - Verify `encryptedData` is ArrayBuffer (not readable)
  - Verify `iv` and `salt` are Uint8Array
  - CANNOT see plaintext username or password anywhere

- [ ] **Encryption key never stored**
  - Search IndexedDB for any key/password fields
  - Verify no "encryptionKey" or "derivedKey" fields
  - Key must be derived from PIN/biometric each unlock

- [ ] **Random salt per user**
  - Create two users with same password and different PINs
  - Verify `salt` values are different
  - Verify `salt` is 16 bytes (128 bits)

- [ ] **Random IV per encryption**
  - Store credentials twice for same user (delete and re-store)
  - Verify `iv` values are different
  - Verify `iv` is 12 bytes (96 bits) for AES-GCM

- [ ] **PBKDF2 iterations sufficient**
  - Check `credential-store.ts` deriveKeyFromPin method
  - Verify iterations: 100000 (100k minimum)
  - Acceptable range: 100k-1M (balance security vs mobile UX)

### 2. PIN/Biometric Unlock

- [ ] **Wrong PIN does not leak credentials**
  - Enter wrong PIN 3 times
  - Check browser console for any error messages
  - Verify NO plaintext credentials in error messages
  - Verify decryption failure returns null (not throw with credentials)

- [ ] **PIN validation rejects weak patterns**
  - Try PIN: 000000 → should reject
  - Try PIN: 123456 → should reject
  - Try PIN: 111111 → should reject
  - Verify error message: "PIN troppo semplice" or similar

- [ ] **Biometric failure graceful (mobile only)**
  - Fail biometric authentication (cancel or wrong face/finger)
  - Verify NO credentials in error message
  - Verify automatic PIN fallback appears

### 3. Backend Stateless (No Persistent Storage)

- [ ] **No credentials in database**
  - Check `archibald-web-app/backend/data/users.db`
  - Verify users table has NO password column
  - Verify NO other tables store passwords

- [ ] **PasswordCache is in-memory only**
  - Check `password-cache.ts` implementation
  - Verify no file writes (fs.writeFile, etc.)
  - Verify no database persistence
  - Verify 1h TTL for cache entries

- [ ] **Backend restart clears cache**
  - Restart backend server
  - Verify PasswordCache is empty (no persistent reload)
  - User must re-authenticate after backend restart (expected)

### 4. Logging & Error Messages

- [ ] **No credentials in backend logs**
  - Trigger login with valid credentials
  - Check backend console output
  - Verify logs show: username (OK), userId (OK), NOT password
  - Search logs for "password", "credentials" → should be generic messages only

- [ ] **No credentials in frontend console**
  - Open browser DevTools → Console
  - Perform unlock with PIN/biometric
  - Verify NO plaintext credentials logged
  - Console.log/error should NOT contain passwords

- [ ] **Error messages generic**
  - Cause decryption error (corrupt IndexedDB data)
  - Verify error: "PIN errato" or "Errore imprevisto" (generic)
  - NO error like "Decryption failed for password X" (specific)

### 5. Network Traffic

- [ ] **HTTPS required for production**
  - Development: http://localhost (acceptable)
  - Production: MUST use HTTPS
  - Credentials transmitted during login POST (encrypted by TLS)

- [ ] **Credentials in login POST body only**
  - Open DevTools → Network → POST /api/auth/login
  - Verify credentials in request body: { username, password }
  - Verify NOT in URL query params
  - Verify NOT in headers (except Authorization: Bearer {JWT} for other requests)

- [ ] **JWT does not contain credentials**
  - Copy JWT token from localStorage
  - Decode at jwt.io (or console: atob(token.split('.')[1]))
  - Verify payload: { userId, username, iat, exp }
  - Verify NO password field in JWT

- [ ] **No credentials in order requests**
  - Open DevTools → Network → POST /api/orders/create
  - Verify request body: { orderData, ... }
  - Verify NO password in request
  - Verify Authorization header: Bearer {JWT} (token only)

### 6. Session Management

- [ ] **JWT expiry enforced (8h)**
  - Login and note JWT `exp` timestamp
  - Verify expires in ~8 hours (28800 seconds)
  - After expiry, verify 401 Unauthorized on protected routes

- [ ] **PasswordCache TTL enforced (1h)**
  - Login and create order (PasswordCache populated)
  - Wait 1 hour + 1 minute
  - Create another order
  - Verify Puppeteer login happens (PasswordCache expired)

- [ ] **Logout clears PasswordCache**
  - Login and verify authenticated
  - Logout
  - Check backend: PasswordCache.get(userId) should return null
  - Verify user must re-authenticate on next login

### 7. PIN Recovery Flow

- [ ] **"PIN dimenticato?" deletes credentials**
  - Setup: Save credentials with PIN
  - Click "PIN dimenticato?" → confirm
  - Check IndexedDB: credentials entry DELETED
  - Check localStorage: lastUser entry DELETED
  - Next app launch shows LoginModal (not UnlockScreen)

- [ ] **"Usa un altro account" preserves credentials**
  - Setup: Save credentials with PIN
  - Click "Usa un altro account"
  - Check IndexedDB: credentials entry STILL EXISTS
  - LoginModal appears (different account login)
  - Original account can still unlock later

### 8. Cross-Platform Verification

- [ ] **iOS: Face ID / Touch ID works**
  - UnlockScreen shows "Sblocca con Face ID / Touch ID"
  - Tap button → native iOS prompt appears
  - Success → auto-login works
  - Failure → PIN fallback appears

- [ ] **Android: Fingerprint works**
  - UnlockScreen shows "Sblocca con Impronta digitale"
  - Tap button → native Android prompt appears
  - Success → auto-login works
  - Failure → PIN fallback appears

- [ ] **Desktop: PIN-only (no biometric)**
  - Open on desktop browser (Chrome, Firefox, Safari)
  - UnlockScreen shows PIN input ONLY
  - No biometric button visible
  - PIN unlock works

### 9. Edge Cases

- [ ] **Corrupt IndexedDB data**
  - Manually corrupt encryptedData in IndexedDB (edit with DevTools)
  - Try to unlock with correct PIN
  - Verify: Error message (not crash)
  - Verify: Option to use "PIN dimenticato?" to reset

- [ ] **Browser storage cleared**
  - Login with saved credentials
  - Clear browser storage (DevTools → Application → Clear storage)
  - Reload app
  - Verify: LoginModal appears (not UnlockScreen)
  - No crash, graceful degradation

- [ ] **Concurrent sessions (same user, different tabs)**
  - Open app in two tabs
  - Login with saved credentials in tab 1
  - Verify tab 2 also authenticates (JWT in localStorage shared)
  - Logout in tab 1
  - Verify tab 2 also logs out (localStorage sync)

## Verification Status

**Completed by:** [Name/Date]

**Result:** [ ] PASS / [ ] FAIL

**Issues Found:** [List any security issues discovered]

**Recommendations:** [Any security hardening recommendations for future phases]

---

**Phase 7 Approved:** [Date]
**Sign-off:** [Approver]
