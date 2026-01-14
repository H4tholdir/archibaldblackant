# Phase 7: Credential Management - Architecture Decisions

**Date:** 2026-01-14
**Status:** Final

## Decision 1: Keep PasswordCache (Session-Scoped Cache)

**Context:**
Phase 7 goal: "Backend stateless - no credential storage"

Question: Does "no credential storage" mean:
A. Zero backend memory state (pure stateless) - requires encrypted blob per request
B. No persistent storage (in-memory session cache acceptable)

**Decision:** Approach B - Keep PasswordCache with 1h TTL

**Rationale:**
1. **Security Maintained:**
   - PasswordCache is in-memory only (never disk/database)
   - 1h TTL is reasonable for banking app standards
   - Lost on backend restart (no persistent risk)

2. **UX Benefits:**
   - Avoids Puppeteer login per order (~30s saved)
   - User authenticates once per hour (acceptable)
   - Backend restart is rare operational event

3. **Implementation Simplicity:**
   - Already working (Phase 6)
   - No encrypted blob in every request (less attack surface)
   - Clear separation: frontend encrypts, backend caches temporarily

4. **Semantic Interpretation:**
   - "No credential storage" = "no persistent storage" ✅
   - "Session state" (like JWT in memory) is acceptable ✅
   - User credentials exist primarily on frontend device ✅

**Alternatives Considered:**
- **Pure Stateless (encrypted blob per request):**
  - Pro: True stateless backend
  - Con: Credentials in transit with every order request
  - Con: More complex, higher attack surface
  - Rejected: UX/security trade-off not favorable

**Implications:**
- PasswordCache remains in codebase (Phase 6 implementation unchanged)
- Backend is "stateless" for persistent storage, "stateful" for session cache
- Backend restart requires user re-authentication (acceptable operational constraint)

---

## Decision 2: PIN-Only for Desktop, Biometric for Mobile

**Context:**
Phase 7 supports biometric unlock (Face ID, Touch ID, fingerprint).

Question: Should desktop users get Windows Hello / Touch ID (Mac)?

**Decision:** PIN-only for desktop in Phase 7 MVP

**Rationale:**
1. **Mobile Priority:**
   - Primary users are mobile sales representatives
   - iOS/Android biometric support is higher priority
   - Desktop users (admins) less common

2. **Windows Hello Complexity:**
   - Requires WebAuthn server-side attestation
   - Testing burden (Windows devices needed)
   - Lower ROI for MVP

3. **Mac Touch ID:**
   - Supported by WebAuthn but not tested in Phase 7
   - Can be enabled in future if user requests

**Future Enhancement:**
Phase 8 or later can add desktop biometric support if demand exists.

---

## Decision 3: Simplified WebAuthn (No Server Validation)

**Context:**
Phase 7 uses Web Authentication API for biometric unlock.

Full FIDO2 requires server-side attestation/assertion validation.

**Decision:** Simplified WebAuthn - client-side only, no server validation

**Rationale:**
1. **MVP Scope:**
   - Phase 7 focuses on credential encryption and unlock UX
   - Full FIDO2 is security hardening (future phase)

2. **Security Trade-off:**
   - Credentials still encrypted (primary security layer)
   - Biometric is user verification, not authentication
   - Acceptable risk for MVP

3. **Implementation Complexity:**
   - Server-side validation requires crypto libraries, challenge storage
   - Increases Phase 7 scope significantly

**Future Security Hardening:**
Phase 9 or security audit phase can add:
- Server-side attestation validation
- Challenge-response protocol
- WebAuthn credential backup/sync
- Full FIDO2 compliance

---

## Security Model Summary

**Phase 7 Security Guarantees:**

1. **Credentials Encrypted:**
   - AES-GCM 256-bit encryption
   - PBKDF2 key derivation (100k iterations)
   - Random salt per user, random IV per encryption
   - Stored in IndexedDB (frontend device only)

2. **No Plaintext Storage:**
   - Frontend: Credentials exist only encrypted
   - Backend: PasswordCache (in-memory, 1h TTL, no disk persistence)
   - No credentials in logs, errors, or permanent storage

3. **Key Derivation:**
   - Encryption key never stored in clear
   - Derived from PIN/biometric each unlock
   - PBKDF2 100k iterations (balance security vs UX)

4. **Transport Security:**
   - HTTPS required (credentials sent during login POST)
   - JWT tokens for subsequent requests (no credentials)
   - No credentials in URL query params or headers (except login POST body)

5. **Session Management:**
   - JWT 8h expiry (Phase 6)
   - PasswordCache 1h TTL (Phase 7)
   - PIN/biometric required every app launch

6. **Logout:**
   - Clears JWT from localStorage
   - Clears PasswordCache for user
   - Credentials remain encrypted in IndexedDB (not deleted unless "PIN dimenticato?")

**Known Limitations (MVP):**
- PasswordCache is in-memory session state (not 100% stateless)
- Simplified WebAuthn (no server attestation validation)
- Desktop biometric not supported (PIN-only)
- Credentials transmitted during login POST (encrypted via HTTPS)

**Acceptable for Phase 7 MVP:** YES
**Future hardening recommended:** Security audit phase

---

**Approved by:** Phase 7 Planning
**Review date:** 2026-01-14
