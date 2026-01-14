# Phase 7: Credential Management - Research

**Research Date:** 2026-01-14
**Objective:** Establish secure encryption strategy using Web Crypto API for client-side credential storage

---

## Executive Summary

This research establishes a secure, cross-platform credential storage architecture using browser-native Web Crypto API. The strategy uses AES-GCM authenticated encryption with PBKDF2 key derivation from user PIN, storing encrypted credentials in IndexedDB. Cross-platform biometric support is achieved through WebAuthn where available, with PIN fallback for universal compatibility.

**Key Decision:** Use PBKDF2 (310,000+ iterations) despite known weaknesses vs Argon2, because Web Crypto API natively supports only PBKDF2. The security trade-off is acceptable given PIN entropy limitations and UX requirements.

---

## Web Crypto API Encryption Strategy

### Algorithm Choice: AES-GCM

**Why AES-GCM:**
- **Authenticated Encryption:** AES-GCM provides built-in authentication, protecting against both confidentiality and integrity attacks. The authentication tag verifies that ciphertext hasn't been modified by an attacker.
- **Chosen-Ciphertext Attack Protection:** GCM is strongly recommended over other AES modes (CBC, CTR) because it includes checks that help protect against chosen-ciphertext attacks.
- **Web Crypto API Native Support:** AES-GCM is natively supported in SubtleCrypto interface across all modern browsers.
- **Performance:** Hardware acceleration available on most platforms.

**Technical Specifications:**
- **Key Length:** 256 bits (AES-256-GCM)
- **IV Length:** 96 bits (12 bytes) - recommended by AES-GCM specification
- **Authentication Tag Length:** 128 bits (default) - recommended by spec, provides strong authentication
- **IV Uniqueness Requirement:** CRITICAL - Never reuse an IV with the same key. Generate new random IV for every encryption operation.

**Code Example:**
```typescript
interface EncryptionConfig {
  algorithm: 'AES-GCM';
  keyLength: 256; // bits
  ivLength: 12;   // bytes (96 bits)
  tagLength: 128; // bits
}

async function encryptData(
  data: ArrayBuffer,
  key: CryptoKey
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  // Generate unique IV for this encryption
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128
    },
    key,
    data
  );

  return { ciphertext, iv };
}

async function decryptData(
  ciphertext: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  return await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128
    },
    key,
    ciphertext
  );
}
```

---

## Key Derivation Strategy

### PBKDF2 vs Argon2 Decision

**Industry Recommendation (2025/2026):**
- Argon2 is considered the most secure password-based KDF, especially against GPU and ASIC attacks
- PBKDF2 is the least secure among modern KDFs (Argon2, scrypt, bcrypt, PBKDF2)
- However, PBKDF2 is still considered safe when used with high iteration counts

**Web Crypto API Limitation:**
- Web Crypto API (SubtleCrypto) only natively supports PBKDF2 as of 2026
- Argon2 requires JavaScript-based implementations which are significantly slower than native
- Proposal to add Argon2/scrypt/bcrypt to Web Crypto API exists but not yet implemented

**Decision Rationale:**
Use PBKDF2 despite being weaker because:
1. Native browser support ensures best performance (critical for UX - derivation must be fast enough)
2. PIN-based systems have fundamentally limited entropy (6 digits = ~20 bits) - even Argon2 couldn't overcome this
3. 310,000+ iterations provide adequate security for the threat model
4. Banking apps (reference: Intesa, UniCredit) successfully use similar approaches

### PBKDF2 Configuration

**Current OWASP Recommendations (2025):**
- **PBKDF2-SHA256:** Minimum 310,000 iterations
- **PBKDF2-SHA512:** Minimum 210,000 iterations (2023 guidance)

**Iteration Count Selection:**
- **Target:** 310,000 iterations (OWASP 2025 standard)
- **Rationale:** ~100ms derivation time on modern consumer hardware
  - Imperceptible to users during unlock
  - Significantly slows brute-force attacks
- **Trade-off:** Security vs UX responsiveness

**Important Context - PIN Entropy Limitation:**
A 6-digit PIN has approximately 20 bits of entropy (1,000,000 possible combinations). Even with 310,000 iterations, this is fundamentally weak against targeted attacks. However:
- Physical device access required (credentials stored locally only)
- Biometric/device-level protections provide additional layers
- Aligns with banking app industry standards (acceptable risk/UX balance)

**Salt Strategy:**
- **Per-User Salt:** Generate unique random salt per user during first setup
- **Salt Length:** 128 bits (16 bytes) minimum
- **Salt Storage:** Store alongside encrypted credentials in IndexedDB (salt is not secret)
- **Salt Generation:** Use `crypto.getRandomValues()` for cryptographically secure random

**Key Derivation Parameters:**
```typescript
interface PBKDF2Config {
  name: 'PBKDF2';
  hash: 'SHA-256';
  iterations: 310000; // OWASP 2025 recommendation
  salt: Uint8Array;   // 16 bytes minimum
}

async function derivePINKey(
  pin: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const pinBuffer = new TextEncoder().encode(pin);

  // Import PIN as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pinBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive AES-GCM key from PIN
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: 310000,
      salt: salt
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256
    },
    false, // Not extractable (security hardening)
    ['encrypt', 'decrypt']
  );

  return key;
}
```

**Security Considerations:**
1. **PIN Never Stored:** PIN exists only in memory during derivation, immediately discarded
2. **Key Not Extractable:** Set extractable=false to prevent key export via Web Crypto API
3. **No Plaintext in Memory:** Clear sensitive data from memory after use (zero out buffers)
4. **Timing Attack Mitigation:** PBKDF2 derivation time is consistent (same iteration count always)

---

## Credential Storage Schema

### IndexedDB Structure

**Database Design:**
```typescript
interface CredentialStore {
  dbName: 'archibald_credentials';
  version: 1;
  objectStore: 'credentials';
}

interface StoredCredential {
  // Primary key
  userId: string; // User ID from JWT (unique per user)

  // Encrypted data
  encryptedData: ArrayBuffer; // AES-GCM encrypted JSON

  // Encryption metadata
  iv: Uint8Array;    // 12 bytes, unique per encryption
  salt: Uint8Array;  // 16 bytes, unique per user

  // Timestamp
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
}

interface PlaintextCredential {
  username: string;
  password: string;
}
```

**Encrypted Data Format:**
- Credentials stored as JSON string before encryption: `{"username":"...", "password":"..."}`
- Entire JSON string encrypted as single blob using AES-GCM
- After decryption, parse JSON to recover username/password

**IndexedDB Schema Implementation:**
```typescript
function initCredentialDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('archibald_credentials', 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('credentials')) {
        const store = db.createObjectStore('credentials', {
          keyPath: 'userId'
        });

        // Indexes for efficient querying
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
```

**Storage Flow:**

**Save Credentials:**
1. User successfully logs in with username/password
2. User checks "Remember credentials" and sets up PIN
3. Generate random salt (16 bytes) using `crypto.getRandomValues()`
4. Derive encryption key from PIN using PBKDF2
5. Serialize credentials to JSON: `{"username":"...", "password":"..."}`
6. Generate random IV (12 bytes)
7. Encrypt JSON string using AES-GCM with derived key and IV
8. Store in IndexedDB: `{ userId, encryptedData, iv, salt, createdAt, updatedAt }`

**Retrieve Credentials:**
1. User enters PIN on unlock screen
2. Retrieve stored record from IndexedDB by userId
3. Derive encryption key from PIN using stored salt and PBKDF2
4. Decrypt `encryptedData` using derived key and stored IV
5. Parse decrypted JSON to recover username/password
6. Use credentials for automatic login to Archibald ERP

**Important Security Notes:**
- **No Plaintext Storage:** IndexedDB never contains plaintext credentials
- **Salt Not Secret:** Salt stored in clear (not encrypted) - this is standard practice
- **IV Not Secret:** IV stored in clear alongside ciphertext - this is required for decryption
- **Key Never Stored:** Encryption key exists only during encrypt/decrypt operations
- **Wrong PIN Handling:** If PIN incorrect, PBKDF2 derives different key → AES-GCM decryption fails with error

---

## Cross-Platform Biometric Support

### WebAuthn Platform Authenticator Assessment

**Browser Support (2026):**
- **Desktop:** Full support on Chrome, Firefox, Safari, Edge
- **iOS Safari:** Full support (10.3-26.1)
- **Android Chrome:** Full support (all versions)
- **Android Browser:** Full support (4.4-142)
- **Browser Compatibility Score:** 97/100 (excellent)

**Platform Authenticator Types:**

**1. Platform Authenticators (Built-in Biometrics):**
- iOS: Face ID, Touch ID
- Android: Fingerprint, Face Unlock
- Windows: Windows Hello (fingerprint, face, iris)
- macOS: Touch ID on supported MacBook models

**2. Cross-Platform Authenticators (Security Keys):**
- Hardware tokens like YubiKey, Titan Key
- Not applicable for Phase 7 (no external hardware requirement)

**Key Limitation - Registration Scope:**
- **Windows & iOS 14.5+:** WebAuthn platform authenticator registered at OS level → works across all browsers
- **macOS:** WebAuthn platform authenticator registered at browser level → must enroll separately per browser
- **Android:** Only Chrome supports WebAuthn platform authenticators

**WebAuthn User Verification Modes:**
```typescript
interface WebAuthnConfig {
  // User verification enforced (biometric or PIN)
  userVerification: 'required' | 'preferred' | 'discouraged';

  // Platform authenticator (built-in) vs cross-platform (security key)
  authenticatorAttachment: 'platform' | 'cross-platform';

  // Timeout for user interaction
  timeout: 60000; // ms
}

async function enrollBiometric(
  userId: string,
  displayName: string
): Promise<PublicKeyCredential> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: challenge,
      rp: {
        name: 'Archibald',
        id: window.location.hostname
      },
      user: {
        id: new TextEncoder().encode(userId),
        name: userId,
        displayName: displayName
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }  // ES256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Built-in biometric
        userVerification: 'required',        // Must verify user
        requireResidentKey: true             // Store credential on device
      },
      timeout: 60000,
      attestation: 'none' // No attestation needed for credential storage
    }
  });

  return credential as PublicKeyCredential;
}

async function authenticateBiometric(
  credentialId: ArrayBuffer
): Promise<boolean> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge,
        rpId: window.location.hostname,
        allowCredentials: [{
          id: credentialId,
          type: 'public-key',
          transports: ['internal'] // Platform authenticator
        }],
        userVerification: 'required',
        timeout: 60000
      }
    });

    return assertion !== null;
  } catch (error) {
    return false; // Biometric failed or cancelled
  }
}
```

### Fallback Strategy

**Biometric → PIN Cascade:**

1. **Setup Phase (after successful login):**
   - Always require PIN setup (6 digits)
   - If device supports biometrics (WebAuthn available), offer biometric enrollment
   - Store both: PIN-derived encryption key + WebAuthn credential ID

2. **Unlock Phase:**
   - Primary: Show biometric prompt if enrolled
   - If biometric fails (3 attempts) or unavailable: Fall back to PIN entry
   - If PIN fails (3 attempts): Lock out briefly (30 seconds) to prevent brute force

3. **Platform-Specific Behavior:**
   - **Mobile (iOS/Android):** Biometric first, PIN fallback
   - **Desktop (Windows with Hello, Mac with Touch ID):** Biometric first, PIN fallback
   - **Desktop (no biometric support):** PIN only

**Implementation Pattern:**
```typescript
async function unlockCredentials(userId: string): Promise<PlaintextCredential | null> {
  // Check if biometric enrolled
  const biometricCredId = await getBiometricCredentialId(userId);

  if (biometricCredId) {
    // Attempt biometric authentication
    const biometricSuccess = await authenticateBiometric(biometricCredId);

    if (biometricSuccess) {
      // Biometric succeeded - but we still need PIN to decrypt!
      // Prompt for PIN (biometric only proves identity, doesn't provide encryption key)
      const pin = await promptPINEntry();
      return await decryptCredentials(userId, pin);
    }

    // Biometric failed - fall back to PIN
  }

  // PIN authentication (primary or fallback)
  const pin = await promptPINEntry();
  return await decryptCredentials(userId, pin);
}
```

**Important Architectural Note:**
WebAuthn biometric authentication is separate from encryption key derivation:
- **Biometric:** Proves user identity (authentication)
- **PIN → PBKDF2:** Derives encryption key (decryption)

Therefore, even with successful biometric authentication, PIN is required to derive the encryption key. This can be handled two ways:

**Option A: Biometric + PIN**
- Biometric proves identity
- User must still enter PIN to decrypt credentials
- More secure but less convenient

**Option B: PIN-only with Biometric Wrapper**
- Use platform's native biometric to protect PIN storage
- On biometric success, retrieve PIN from secure storage
- Best UX but relies on platform security

**Recommendation:** Implement Option B for Phase 7 (banking app pattern), revisit in future if security requirements change.

---

## Security Audit Checklist

Before considering Phase 7 complete, verify:

### Encryption Implementation
- [ ] AES-GCM used with 256-bit keys
- [ ] Unique IV generated for each encryption operation (never reused)
- [ ] IV length exactly 96 bits (12 bytes)
- [ ] Authentication tag length 128 bits (default)
- [ ] Encrypted data includes authentication tag for integrity verification

### Key Derivation
- [ ] PBKDF2-SHA256 with minimum 310,000 iterations
- [ ] Unique random salt per user (16+ bytes)
- [ ] Salt generated using `crypto.getRandomValues()` (cryptographically secure)
- [ ] PIN never stored in plaintext anywhere (memory, storage, logs)
- [ ] Derived key set as non-extractable (`extractable: false`)

### Storage Security
- [ ] No plaintext credentials in IndexedDB
- [ ] No plaintext credentials in localStorage
- [ ] No plaintext credentials in console.log or debug output
- [ ] Encrypted data stored with IV and salt
- [ ] Credentials cleared from memory after use

### Cross-Platform Testing
- [ ] iOS Safari: Biometric enrollment and unlock work
- [ ] Android Chrome: Biometric enrollment and unlock work
- [ ] Windows Desktop: PIN unlock works, Hello optional
- [ ] macOS Desktop: PIN unlock works, Touch ID optional
- [ ] Fallback to PIN works on all platforms if biometric unavailable

### Error Handling
- [ ] Wrong PIN: Clear error message, no data leak in error
- [ ] Decryption failure: Graceful handling, offer PIN re-entry
- [ ] IndexedDB unavailable: Inform user, fall back to manual login
- [ ] WebAuthn unavailable: Gracefully fall back to PIN-only mode

### Attack Mitigation
- [ ] Timing attack considerations documented (see below)
- [ ] Brute force mitigation: Rate limiting on PIN attempts
- [ ] Session timeout implemented (credentials re-require unlock after inactivity)
- [ ] No sensitive data in error messages or stack traces

---

## Timing Attack Considerations

### Background

Timing attacks exploit differences in computation time to infer secret information. For credential storage:
- **Concern:** Comparing user-entered PIN to derive key and decrypt - can timing reveal information about correct PIN?
- **PBKDF2 Mitigation:** PBKDF2 always takes same time regardless of input (fixed iteration count)
- **AES-GCM Decryption:** Constant-time internally, but failure vs success may have measurable timing difference

### Web Crypto API Timing-Safe Comparison

**crypto.subtle.timingSafeEqual (Cloudflare Workers, Node.js):**
- Compares two buffers in constant time
- **Not available in browser Web Crypto API as of 2026**

**Alternative: Double HMAC Pattern**
```typescript
async function timingSafeCompare(
  a: ArrayBuffer,
  b: ArrayBuffer
): Promise<boolean> {
  // Not available in browser - must use alternative approach
  // For Phase 7: rely on AES-GCM authentication tag verification
  // which provides timing-safe comparison implicitly
}
```

**Phase 7 Approach:**
- AES-GCM's authentication tag verification is timing-safe at the algorithm level
- Wrong PIN → derive different key → AES-GCM decrypt fails with error
- Timing of "wrong PIN" vs "correct PIN but decryption failed" is not distinguishable
- No explicit constant-time comparison needed beyond what AES-GCM provides

**Additional Mitigations:**
1. **Rate Limiting:** Limit PIN attempts to 3 per 30-second window
2. **Network Timing Noise:** Decryption happens client-side, no network timing leak
3. **UI Feedback Delay:** Add artificial 500ms delay before showing "wrong PIN" error to mask any micro-timing differences

---

## Implementation Patterns

### Encryption Flow (Save Credentials)

```typescript
interface SaveCredentialsInput {
  userId: string;
  username: string;
  password: string;
  pin: string;
}

async function saveCredentials(input: SaveCredentialsInput): Promise<void> {
  // 1. Generate random salt (first-time setup)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 2. Derive encryption key from PIN
  const encryptionKey = await derivePINKey(input.pin, salt);

  // 3. Prepare plaintext credentials
  const plaintext: PlaintextCredential = {
    username: input.username,
    password: input.password
  };
  const plaintextJSON = JSON.stringify(plaintext);
  const plaintextBuffer = new TextEncoder().encode(plaintextJSON);

  // 4. Generate unique IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 5. Encrypt credentials
  const encryptedData = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128
    },
    encryptionKey,
    plaintextBuffer
  );

  // 6. Store in IndexedDB
  const db = await initCredentialDB();
  const tx = db.transaction('credentials', 'readwrite');
  const store = tx.objectStore('credentials');

  const record: StoredCredential = {
    userId: input.userId,
    encryptedData: encryptedData,
    iv: iv,
    salt: salt,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await store.put(record);
  await tx.complete;

  // 7. Clear sensitive data from memory
  // Note: JavaScript doesn't provide guaranteed memory zeroing
  // but we can help garbage collector by dereferencing
}
```

### Decryption Flow (Retrieve Credentials)

```typescript
interface RetrieveCredentialsInput {
  userId: string;
  pin: string;
}

async function retrieveCredentials(
  input: RetrieveCredentialsInput
): Promise<PlaintextCredential | null> {
  try {
    // 1. Retrieve stored credential from IndexedDB
    const db = await initCredentialDB();
    const tx = db.transaction('credentials', 'readonly');
    const store = tx.objectStore('credentials');
    const record = await store.get(input.userId) as StoredCredential;

    if (!record) {
      return null; // No saved credentials
    }

    // 2. Derive encryption key from PIN using stored salt
    const encryptionKey = await derivePINKey(input.pin, record.salt);

    // 3. Decrypt credentials using stored IV
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: record.iv,
        tagLength: 128
      },
      encryptionKey,
      record.encryptedData
    );

    // 4. Parse decrypted JSON
    const decryptedJSON = new TextDecoder().decode(decryptedBuffer);
    const credentials: PlaintextCredential = JSON.parse(decryptedJSON);

    // 5. Return plaintext credentials
    return credentials;

  } catch (error) {
    // Decryption failed - likely wrong PIN
    // Could also be corrupted data or algorithm mismatch
    console.error('Failed to decrypt credentials:', error);
    return null;
  }
}
```

### Error Handling

```typescript
type UnlockError =
  | 'WRONG_PIN'           // PIN incorrect (decryption failed)
  | 'NO_CREDENTIALS'      // No saved credentials for user
  | 'BIOMETRIC_FAILED'    // Biometric authentication failed
  | 'BIOMETRIC_CANCELLED' // User cancelled biometric prompt
  | 'RATE_LIMITED'        // Too many failed attempts
  | 'DB_ERROR'            // IndexedDB access error
  | 'UNKNOWN';

async function unlockWithErrorHandling(
  userId: string,
  pin: string
): Promise<{ success: boolean; credentials?: PlaintextCredential; error?: UnlockError }> {
  try {
    // Check rate limiting
    if (await isRateLimited(userId)) {
      return { success: false, error: 'RATE_LIMITED' };
    }

    // Attempt decryption
    const credentials = await retrieveCredentials({ userId, pin });

    if (!credentials) {
      // Could be wrong PIN or no credentials saved
      const hasCredentials = await checkCredentialsExist(userId);

      if (!hasCredentials) {
        return { success: false, error: 'NO_CREDENTIALS' };
      }

      // Wrong PIN - increment failure counter
      await incrementFailureCounter(userId);

      // Add UI delay to mask timing
      await delay(500);

      return { success: false, error: 'WRONG_PIN' };
    }

    // Success - reset failure counter
    await resetFailureCounter(userId);

    return { success: true, credentials };

  } catch (error) {
    console.error('Unlock error:', error);
    return { success: false, error: 'UNKNOWN' };
  }
}

// Rate limiting helper
interface RateLimitState {
  failureCount: number;
  lastFailureAt: number;
}

const rateLimitState = new Map<string, RateLimitState>();

async function isRateLimited(userId: string): Promise<boolean> {
  const state = rateLimitState.get(userId);

  if (!state) return false;

  // 3 failures = 30 second lockout
  if (state.failureCount >= 3) {
    const lockoutEndsAt = state.lastFailureAt + 30000;
    if (Date.now() < lockoutEndsAt) {
      return true;
    }
    // Lockout expired, reset
    rateLimitState.delete(userId);
  }

  return false;
}

async function incrementFailureCounter(userId: string): Promise<void> {
  const state = rateLimitState.get(userId) || { failureCount: 0, lastFailureAt: 0 };
  state.failureCount++;
  state.lastFailureAt = Date.now();
  rateLimitState.set(userId, state);
}

async function resetFailureCounter(userId: string): Promise<void> {
  rateLimitState.delete(userId);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## Banking App UX Patterns

### Reference: Italian Banking Apps (Intesa Sanpaolo, UniCredit)

**Key UX Patterns to Emulate:**

**1. Unlock Screen:**
- Clean, minimal design
- App logo prominent
- Username/account displayed (not editable)
- Biometric prompt or PIN entry pad
- "Forgot PIN?" link (leads to credential reset)
- No "back" button - unlock is mandatory gate

**2. Biometric Prompt:**
- Native OS biometric UI (Face ID, Touch ID, Windows Hello)
- Clear message: "Unlock Archibald"
- Fallback link: "Use PIN instead"
- Cancel button returns to unlock screen

**3. PIN Entry:**
- Full-screen numeric keypad (large touch targets on mobile)
- 6-digit PIN with masked display (••••••)
- Clear error state: "PIN incorrect" with red shake animation
- Attempt counter: "2 attempts remaining" after first failure
- Lockout message: "Too many attempts. Try again in 30 seconds."

**4. Login Flow Integration:**
```
[First Login - Manual Entry]
↓
Username/Password fields
↓
☑️ "Remember credentials on this device"
↓
[Login Success]
↓
[Setup Wizard]
↓
"Setup secure unlock"
↓
Enter 6-digit PIN (twice to confirm)
↓
(If supported) "Enable Face ID / Touch ID?"
↓
[Setup Complete]
↓
[App Home]

[Subsequent Sessions]
↓
[Unlock Screen]
↓
Biometric prompt OR PIN entry
↓
[Unlock Success → Auto-login with stored credentials]
↓
[App Home]
```

**5. Settings Integration:**
- Security section in settings
- "Change PIN" - requires current PIN, then set new PIN
- "Enable/Disable Biometric" - toggle with confirmation
- "Forget credentials" - confirmation dialog, warning about re-entry required
- "Auto-lock timeout" - configure inactivity timeout (1min, 5min, 15min, never)

**6. Session Timeout:**
- After configured inactivity (default: 5 minutes)
- App blurs/blanks and shows unlock screen
- No data visible until unlocked
- Countdown timer in settings preview: "Auto-lock: 2 minutes remaining"

---

## Recommended Implementation Approach

### Phase 7 Roadmap

**Plan 07-02: IndexedDB Credential Store**
- Implement IndexedDB schema
- Implement encryption/decryption helpers
- Unit tests for crypto operations
- No UI yet (testable API layer)

**Plan 07-03: PIN Setup UI**
- Setup wizard after login
- PIN entry component (6-digit keypad)
- PIN confirmation screen
- Integration with credential storage

**Plan 07-04: Unlock Screen UI**
- Unlock screen component
- PIN entry pad
- Error states and rate limiting
- Integration with credential retrieval

**Plan 07-05: WebAuthn Biometric Integration**
- Biometric enrollment flow
- Biometric authentication
- Fallback to PIN
- Platform detection

**Plan 07-06: Auto-Login Integration**
- Modify login flow to support auto-login
- Integrate unlock screen into app routing
- Session timeout and re-lock
- Settings UI for credential management

---

## Library Recommendations

### Native Web Crypto API vs Third-Party

**Recommendation: Use Native Web Crypto API Only**

**Rationale:**
- **No Dependencies:** Zero third-party crypto libraries needed
- **Security Audited:** Browser implementations audited by major vendors (Google, Apple, Mozilla, Microsoft)
- **Performance:** Hardware-accelerated encryption where available
- **Future-Proof:** W3C standard, guaranteed long-term support
- **No Bundle Size Impact:** Native APIs don't add to JavaScript bundle

**Third-Party Libraries Considered:**
- **crypto-js:** Popular but pure JavaScript implementation (slower), larger bundle size
- **tweetnacl-js:** Good for NaCl-style crypto, but Web Crypto API covers our needs
- **dexie-encrypted:** Transparent IndexedDB encryption, but adds abstraction we don't need
- **Argon2 (WASM):** Better security than PBKDF2, but no native support, slower than native PBKDF2

**Decision:** Native Web Crypto API is sufficient and preferred for Phase 7.

### Utility Libraries (Optional)

**For IndexedDB Management:**
- **idb (by Jake Archibald):** Promise-based IndexedDB wrapper, minimal abstraction
  - Pros: Cleaner API, smaller than Dexie
  - Cons: Still an abstraction layer
  - **Recommendation:** Optional, evaluate if raw IndexedDB becomes cumbersome

**For WebAuthn:**
- **@simplewebauthn/browser:** Simplifies WebAuthn client-side implementation
  - Pros: Well-maintained, handles browser quirks
  - Cons: Adds dependency
  - **Recommendation:** Consider if WebAuthn implementation becomes complex

**Decision for Phase 7:** Start with native APIs only. Introduce utility libraries only if complexity justifies the dependency cost.

---

## Security Trade-offs and Limitations

### Acknowledged Limitations

**1. PIN Entropy:**
- 6-digit PIN = ~20 bits entropy (1 million combinations)
- Fundamentally weak against brute-force if attacker has device
- **Mitigation:** Rate limiting, device-level security (OS encryption), biometric layer

**2. PBKDF2 vs Argon2:**
- PBKDF2 weaker against GPU/ASIC attacks than Argon2
- **Trade-off:** Native browser support (performance + security) vs pure-JS Argon2 (better algorithm but slower)
- **Acceptable:** Banking apps use similar approaches, PIN entropy is limiting factor anyway

**3. JavaScript Memory Security:**
- No guaranteed memory zeroing in JavaScript
- Plaintext credentials exist in memory during decrypt → use → encrypt cycle
- **Mitigation:** Minimize plaintext lifetime, rely on garbage collection, avoid logging

**4. Browser DevTools Access:**
- If attacker has physical access + browser DevTools open, could extract credentials from memory
- **Mitigation:** Assume physical device security (OS-level screen lock), not solvable at app level

**5. IndexedDB Inspection:**
- IndexedDB is accessible via browser DevTools
- **OK:** Credentials are encrypted, inspector only sees ciphertext + IV + salt (all expected to be non-secret except ciphertext)

**6. Cross-Device Sync:**
- Phase 7 explicitly excludes credential sync between devices
- Each device stores credentials locally
- **User Impact:** Must set up PIN on each device separately

### Threat Model

**Protected Against:**
- ✅ Remote attacker accessing server (no credentials on server)
- ✅ Attacker with read-only access to IndexedDB (credentials encrypted)
- ✅ Casual attacker finding unlocked device (auto-lock timeout)
- ✅ Brute-force PIN guessing (rate limiting)

**Not Protected Against:**
- ❌ Attacker with physical device + unlocked state (assumed secure device)
- ❌ Attacker with root/admin access to OS (can read process memory)
- ❌ Browser extension malware (can intercept all JS execution)

**Acceptable Risk:** Aligns with banking app threat model - assume device OS security as baseline.

---

## References

### Web Crypto API
- [MDN: Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [MDN: SubtleCrypto.encrypt()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt)
- [MDN: AesGcmParams](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams)
- [GitHub: Web Crypto API AES-GCM Example](https://gist.github.com/chrisveness/43bcda93af9f646d083fad678071b90a)
- [Medium: How to Secure Encrypt and Decrypt Data with AES-GCM and PBKDF2](https://medium.com/@thomas_40553/how-to-secure-encrypt-and-decrypt-data-within-the-browser-with-aes-gcm-and-pbkdf2-057b839c96b6)

### PBKDF2 and Key Derivation
- [DEV Community: Why You Should Use 310,000+ Iterations with PBKDF2 in 2025](https://dev.to/securebitchat/why-you-should-use-310000-iterations-with-pbkdf2-in-2025-3o1e)
- [PBKDF2 | Practical Cryptography for Developers](https://cryptobook.nakov.com/mac-and-key-derivation/pbkdf2)
- [NIST: Recommendation for Password-Based Key Derivation](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-132.pdf)
- [1Password: How PBKDF2 Strengthens Your Account Password](https://support.1password.com/pbkdf2/)

### Argon2 vs PBKDF2 Comparison
- [Guide: Password Hashing Guide 2025 - Argon2 vs Bcrypt vs Scrypt vs PBKDF2](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/)
- [Security Boulevard: Comparative Analysis of Password Hashing Algorithms](https://securityboulevard.com/2024/07/comparative-analysis-of-password-hashing-algorithms-argon2-bcrypt-scrypt-and-pbkdf2/)
- [GitHub: WICG Proposals - Better Password-Based KDF in WebCrypto](https://github.com/WICG/proposals/issues/59)

### WebAuthn and Biometric Authentication
- [WebAuthn Guide](https://webauthn.guide/)
- [Auth0: Configure WebAuthn with Device Biometrics for MFA](https://auth0.com/docs/secure/multi-factor-authentication/fido-authentication-with-webauthn/configure-webauthn-device-biometrics-for-mfa)
- [Yubico: Platform vs Cross-Platform Authenticators](https://developers.yubico.com/WebAuthn/WebAuthn_Developer_Guide/Platform_vs_Cross-Platform.html)
- [Can I Use: WebAuthn Browser Support](https://www.webauthn.me/browser-support)
- [SuperTokens: Biometric Authentication on the Web](https://supertokens.com/blog/biometric-auth)

### IndexedDB Security
- [GitHub: W3C IndexedDB - Encrypted Storage Issue](https://github.com/w3c/IndexedDB/issues/191)
- [GitHub: AKASHA Secure WebStore](https://github.com/AKASHAorg/secure-webstore)
- [GitHub: Dexie Encrypted - Transparent IndexedDB Encryption](https://github.com/dfahlander/dexie-encrypted)
- [Zerocrat: Zero-Knowledge AES-256 Encryption with Web Crypto API and IndexedDB](https://zerocrat.com/advanced-encryption-zero-knowledge-aes-256-encryption-for-unrivaled-data-protection/)
- [Can I Use: IndexedDB Browser Support](https://caniuse.com/indexeddb)

### Timing Attack Mitigation
- [Cloudflare Workers: Using timingSafeEqual](https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/)
- [Arun.blog: Timing-Safe Auth with Web Crypto](https://www.arun.blog/timing-safe-auth-web-crypto/)
- [Intel: Mitigate Timing Side Channels Against Cryptographic Implementations](https://www.intel.com/content/www/us/en/developer/articles/technical/software-security-guidance/secure-coding/mitigate-timing-side-channel-crypto-implementation.html)
- [A Beginner's Guide to Constant-Time Cryptography](https://www.chosenplaintext.ca/articles/beginners-guide-constant-time-cryptography.html)

### Banking App Security Best Practices
- [CodeSuite: Essential Best Practices for Mobile Banking App Security in 2025](https://codesuite.org/blogs/essential-best-practices-for-mobile-banking-app-security-in-2025/)
- [Qualysec: Mobile Banking Security Threats 2026 & Prevention](https://qualysec.com/mobile-banking-security/)
- [Astra: 23 Mobile App Security Best Practices in 2026](https://www.getastra.com/blog/mobile/mobile-app-security-best-practices/)
- [Meniga: How Strong Is Digital Banking Security - 2026 Best Practices](https://www.meniga.com/resources/digital-banking-security/)

### Secure Random Generation
- [MDN: Crypto.getRandomValues()](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)
- [Medium: Navigating Randomness in JavaScript: Math.random() vs Crypto.getRandomValues()](https://medium.com/@vishvashivam32/navigating-randomness-in-javascript-math-random-vs-crypto-getrandomvalues-0088ab0bcf09)
- [Paragon Initiative: How to Generate Secure Random Numbers in Various Programming Languages](https://paragonie.com/blog/2016/05/how-generate-secure-random-numbers-in-various-programming-languages)

---

## Conclusion

Phase 7 research establishes a secure, practical credential storage architecture using Web Crypto API. The strategy balances security (AES-GCM encryption, PBKDF2 key derivation), UX (banking app patterns, biometric support), and cross-platform compatibility (native browser APIs, IndexedDB).

**Key decisions:**
- **AES-GCM:** Industry-standard authenticated encryption
- **PBKDF2:** Native browser support trumps Argon2's security advantages
- **310,000 iterations:** OWASP 2025 standard, balances security/UX
- **IndexedDB:** Cross-platform storage with 97% compatibility
- **WebAuthn + PIN fallback:** Biometric where available, universal PIN support

**Ready for implementation:** Plan 07-02 can proceed with IndexedDB credential store based on patterns documented above.

**No blockers identified.** Research complete.

---

*Research completed: 2026-01-14*
*Next: Plan 07-02 - IndexedDB Credential Store Implementation*
