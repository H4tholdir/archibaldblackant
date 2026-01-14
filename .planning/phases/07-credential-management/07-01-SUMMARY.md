---
phase: 07-credential-management
plan: 01
subsystem: security
tags: [web-crypto-api, aes-gcm, pbkdf2, indexeddb, webauthn, biometric-auth, encryption]

# Dependency graph
requires:
  - phase: 06-multi-user-auth
    provides: JWT authentication, localStorage token storage, useAuth hook
provides:
  - Comprehensive encryption strategy using Web Crypto API (AES-GCM + PBKDF2)
  - IndexedDB schema design for encrypted credential storage
  - Cross-platform biometric authentication patterns (WebAuthn)
  - Security audit checklist and implementation patterns
  - Banking app UX patterns (Intesa, UniCredit reference)
affects: [07-02-indexeddb-store, 07-03-pin-setup, 07-04-unlock-screen, 07-05-webauthn, 07-06-auto-login]

# Tech tracking
tech-stack:
  added: [Web Crypto API (SubtleCrypto), IndexedDB, WebAuthn]
  patterns: [AES-GCM authenticated encryption, PBKDF2 key derivation, client-side credential encryption, biometric authentication with PIN fallback]

key-files:
  created: [.planning/phases/07-credential-management/07-RESEARCH.md]
  modified: []

key-decisions:
  - "AES-GCM (256-bit) for authenticated encryption with 96-bit IV and 128-bit tag"
  - "PBKDF2-SHA256 with 310,000 iterations (OWASP 2025 standard) for PIN-based key derivation"
  - "Use native Web Crypto API only (no third-party crypto libraries) for security and performance"
  - "6-digit PIN with 16-byte random salt per user, stored alongside encrypted data in IndexedDB"
  - "WebAuthn platform authenticators for biometric support with PIN fallback for universal compatibility"
  - "IndexedDB for encrypted credential storage (97% cross-platform compatibility)"
  - "Rate limiting: 3 PIN attempts per 30-second window to mitigate brute-force attacks"
  - "Accept PBKDF2 over Argon2 due to native browser support, performance, and PIN entropy limitations"

patterns-established:
  - "Encryption flow: PIN → PBKDF2 (310k iterations) → AES-GCM key → encrypt credentials + IV + salt → IndexedDB"
  - "Decryption flow: retrieve from IndexedDB → PIN + salt → PBKDF2 → derive key → AES-GCM decrypt → plaintext credentials"
  - "Error handling: wrong PIN = decryption failure, rate limit after 3 attempts, 500ms UI delay for timing attack mitigation"
  - "Banking app UX: biometric first (if enrolled) → fallback to PIN → auto-login with decrypted credentials"
  - "Security: non-extractable keys (extractable=false), unique IV per encryption, crypto.getRandomValues for salt/IV"

issues-created: []

# Metrics
duration: 38min
completed: 2026-01-14
---

# Phase 7 Plan 1: Credential Management Research

**Web Crypto API encryption strategy with AES-GCM, PBKDF2 key derivation, IndexedDB storage, and WebAuthn biometric authentication**

## Performance

- **Duration:** 38 min
- **Started:** 2026-01-14T18:55:18Z
- **Completed:** 2026-01-14T19:33:00Z
- **Tasks:** 1 (autonomous research)
- **Files created:** 1

## Accomplishments

- Researched and documented comprehensive Web Crypto API encryption strategy using AES-GCM authenticated encryption
- Established PBKDF2 key derivation approach with 310,000 iterations (OWASP 2025 standard) for PIN-to-key transformation
- Designed IndexedDB schema for storing encrypted credentials with IV and salt metadata
- Assessed cross-platform WebAuthn biometric authentication support (97% browser compatibility)
- Documented security considerations: timing attacks, rate limiting, memory security, threat model
- Provided complete implementation patterns with TypeScript code examples for encryption/decryption flows
- Analyzed banking app UX patterns (Intesa Sanpaolo, UniCredit) for unlock screen design
- Created security audit checklist for Phase 7 completion verification

## Task Commits

No commits required (research-only phase, no code changes).

## Files Created/Modified

- `.planning/phases/07-credential-management/07-RESEARCH.md` - Comprehensive research document covering:
  - Web Crypto API encryption strategy (AES-GCM algorithm choice and configuration)
  - Key derivation strategy (PBKDF2 vs Argon2 analysis, iteration count recommendations)
  - Credential storage schema (IndexedDB structure and encrypted data format)
  - Cross-platform biometric support (WebAuthn platform authenticators, fallback patterns)
  - Security audit checklist (encryption, key derivation, storage, cross-platform testing)
  - Implementation patterns (TypeScript code examples for encrypt/decrypt/error handling)
  - Banking app UX patterns (Italian banking apps reference)
  - Library recommendations (native Web Crypto API vs third-party)
  - Security trade-offs and limitations (acknowledged threat model)
  - Comprehensive references (MDN, W3C specs, security papers, 40+ sources)

## Decisions Made

### Algorithm Selection
**AES-GCM for Authenticated Encryption:**
- Chosen over AES-CBC/CTR for built-in authentication tag (integrity + confidentiality)
- 256-bit key length, 96-bit IV (12 bytes), 128-bit authentication tag
- Native browser support with hardware acceleration
- Protects against chosen-ciphertext attacks

**PBKDF2 over Argon2:**
- **Trade-off:** PBKDF2 weaker against GPU/ASIC attacks, but Web Crypto API only supports PBKDF2 natively
- Argon2 would require pure-JS implementation (significantly slower, larger bundle)
- 310,000 iterations provides adequate security given PIN entropy limitations (6 digits = ~20 bits)
- Decision accepted because PIN weakness is fundamental bottleneck, not KDF choice

### Key Derivation Parameters
- **Iterations:** 310,000 (OWASP 2025 recommendation for PBKDF2-SHA256)
- **Salt:** 16 bytes (128 bits) random per user, generated with crypto.getRandomValues
- **Hash:** SHA-256
- **Key:** Non-extractable (extractable=false) for security hardening

### Storage Strategy
**IndexedDB for Encrypted Credentials:**
- Store encrypted credentials + IV + salt per user
- IV and salt not secret (standard cryptographic practice)
- 97% cross-platform browser compatibility (iOS, Android, Windows, Mac)
- Schema: `{ userId, encryptedData, iv, salt, createdAt, updatedAt }`

### Biometric Authentication
**WebAuthn Platform Authenticators:**
- Use WebAuthn for biometric enrollment (Face ID, Touch ID, Windows Hello)
- Platform-specific limitations:
  - Windows/iOS 14.5+: OS-level registration (works across browsers)
  - macOS: Browser-level registration (must enroll per browser)
  - Android: Chrome only
- **Fallback:** Always require PIN setup, biometric optional enhancement
- **Architecture:** Biometric proves identity, PIN derives encryption key (both required)

### Security Mitigations
- **Rate Limiting:** 3 PIN attempts per 30-second window (prevent brute force)
- **Timing Attacks:** Rely on AES-GCM's constant-time authentication tag verification, add 500ms UI delay
- **Memory Security:** Minimize plaintext credential lifetime, clear references for GC
- **Session Timeout:** Auto-lock after inactivity (default: 5 minutes)

### Library Strategy
**Native Web Crypto API Only:**
- No third-party crypto libraries (crypto-js, tweetnacl, etc.)
- Zero dependencies, best security audit, hardware acceleration, zero bundle impact
- Optional utility libraries only if complexity justifies: idb (IndexedDB wrapper), @simplewebauthn/browser (WebAuthn)

## Deviations from Plan

None - plan executed exactly as written. Research scope matched plan requirements:
- ✅ Web Crypto API fundamentals (SubtleCrypto, AES-GCM, key derivation)
- ✅ Key derivation from PIN (PBKDF2, salt strategy, iteration count)
- ✅ IndexedDB storage patterns (schema design, encrypted data format)
- ✅ Cross-platform biometric access (WebAuthn assessment, platform availability)
- ✅ Security considerations (plaintext handling, timing attacks, rate limiting)
- ✅ Implementation patterns (TypeScript examples, error handling)
- ✅ Banking app security patterns (Intesa, UniCredit UX reference)

## Issues Encountered

None. Research completed smoothly with comprehensive web search results providing:
- Current OWASP recommendations (310,000 iterations for PBKDF2 in 2025)
- Web Crypto API best practices and code examples
- WebAuthn browser compatibility data (97% support)
- IndexedDB cross-platform compatibility (iOS, Android, desktop)
- Banking app security patterns and UX guidelines
- Timing attack mitigation strategies
- 40+ authoritative references (MDN, W3C, NIST, security researchers)

## Next Phase Readiness

**Ready for Plan 07-02 (IndexedDB Credential Store Implementation):**
- Clear IndexedDB schema defined (userId, encryptedData, iv, salt, timestamps)
- Encryption/decryption patterns documented with TypeScript code examples
- PBKDF2 configuration specified (310,000 iterations, SHA-256, 16-byte salt)
- AES-GCM parameters specified (256-bit key, 96-bit IV, 128-bit tag)
- Error handling patterns documented (wrong PIN, rate limiting, decryption failure)

**Ready for Plan 07-03 (PIN Setup UI):**
- PIN requirements defined (6 digits, confirmation entry)
- Setup wizard UX flow documented (banking app pattern)
- Integration points identified (post-login, settings)

**Ready for Plan 07-04 (Unlock Screen UI):**
- Unlock screen UX patterns documented (logo, username, PIN pad)
- Error states defined (wrong PIN, rate limited, animation patterns)
- Rate limiting algorithm specified (3 attempts, 30-second lockout)

**Ready for Plan 07-05 (WebAuthn Biometric Integration):**
- WebAuthn enrollment/authentication patterns documented
- Platform compatibility assessed (iOS, Android, Windows, Mac)
- Fallback strategy defined (biometric → PIN cascade)

**Ready for Plan 07-06 (Auto-Login Integration):**
- Auto-login flow defined (unlock → decrypt → login with stored credentials)
- Session timeout behavior specified (5-minute default, configurable)
- Settings UI requirements documented (change PIN, forget credentials, biometric toggle)

**No blockers.** All subsequent plans have clear implementation guidance from research.

---
*Phase: 07-credential-management*
*Completed: 2026-01-14*
