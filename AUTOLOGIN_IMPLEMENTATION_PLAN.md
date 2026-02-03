# Piano di Implementazione: Sistema di Auto-Login Trasparente per Archibald

**Data creazione**: 2026-02-03
**Versione**: 1.0
**Stato**: In Progress
**Autore**: Team Development

---

## 📋 Indice

1. [Panoramica del Problema](#panoramica-del-problema)
2. [Soluzione Proposta](#soluzione-proposta)
3. [Architettura di Sicurezza](#architettura-di-sicurezza)
4. [Piano di Implementazione](#piano-di-implementazione)
5. [Dettagli Tecnici](#dettagli-tecnici)
6. [Testing Strategy](#testing-strategy)
7. [Deployment e Rollback](#deployment-e-rollback)
8. [Monitoring e Logging](#monitoring-e-logging)
9. [Checklist Completa](#checklist-completa)

---

## 🚨 Panoramica del Problema

### Situazione Attuale

Il sistema presenta diverse criticità nella gestione dell'autenticazione con Archibald:

#### 1. **Backend Restart = Perdita Sessioni**
- **Causa**: `PasswordCache` è in-memory, si svuota ad ogni restart
- **Impatto**: Dopo ogni deploy, tutti gli utenti devono riloggare manualmente
- **Frequenza**: Ogni deploy in fase di sviluppo (multipli al giorno)

#### 2. **Timeout Archibald Non Gestiti**
- **Causa**: Archibald ERP occasionalmente va in timeout
- **Impatto**: Operazioni falliscono con errore generico, utente deve riloggare
- **Comportamento attuale**: Nessun retry automatico

#### 3. **JWT Expiry Senza Refresh**
- **Causa**: JWT scade dopo 8 ore, nessun meccanismo di refresh
- **Impatto**: Utente deve fare logout/login completo ogni 8 ore
- **UX**: Interruzione del workflow, frustrazione utente

#### 4. **Gestione Errori Manuale**
- **Causa**: `fetchWithRetry` non fa retry su `CREDENTIALS_EXPIRED`
- **Impatto**: Utente vede errore e deve manualmente sloggare → riloggare
- **UX**: PWA sembra "rotta", esperienza non seamless

### Obiettivi dell'Implementazione

1. ✅ **Trasparenza Totale**: Utente non si accorge mai di problemi di autenticazione
2. ✅ **Zero Downtime**: Backend restart non impatta utenti attivi
3. ✅ **Auto-Recovery**: Timeout/errori gestiti automaticamente con retry
4. ✅ **Sessioni Persistenti**: JWT refresh automatico prima dell'expiry
5. ✅ **Sicurezza Massima**: Password encrypted at rest con AES-256-GCM
6. ✅ **Reliability**: Single source of truth (DB), no cache issues

---

## 🎯 Soluzione Proposta

### Architettura Generale

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (PWA)                            │
├─────────────────────────────────────────────────────────────────────┤
│  1. Enhanced Fetch Interceptor                                      │
│     • Cattura CREDENTIALS_EXPIRED (401)                             │
│     • Cattura timeout/errori Archibald (500/503)                    │
│     • Auto-retry con exponential backoff                            │
│     • Logging dettagliato per monitoring                            │
│                                                                      │
│  2. JWT Auto-Refresh Monitor                                        │
│     • Background check ogni 5 minuti                                │
│     • Refresh se JWT scade tra < 30 minuti                          │
│     • Silente, zero interruzioni UI                                 │
│                                                                      │
│  3. LocalStorage (minimal)                                          │
│     • JWT token (unico dato persistito)                             │
│     • Niente password, niente credenziali                           │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
                           HTTPS (TLS 1.3)
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND VPS (Express)                        │
├─────────────────────────────────────────────────────────────────────┤
│  1. Password Encryption Service                                     │
│     • AES-256-GCM encryption/decryption                             │
│     • PBKDF2 key derivation (100k iterations)                       │
│     • Unique IV per ogni password                                   │
│     • Auth tag per integrity verification                           │
│                                                                      │
│  2. Auto-Load Password at Boot                                      │
│     • Load encrypted passwords da SQLite                            │
│     • Decrypt e popolare PasswordCache                              │
│     • Automatic recovery dopo restart                               │
│                                                                      │
│  3. JWT Refresh Endpoint                                            │
│     • POST /api/auth/refresh                                        │
│     • Genera nuovo JWT senza re-login Puppeteer                     │
│     • Valida token corrente e rinnova                               │
│                                                                      │
│  4. Enhanced Error Handling                                         │
│     • Retry logic per timeout Puppeteer                             │
│     • Graceful degradation su Archibald down                        │
│     • Logging strutturato per debugging                             │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    SQLite Database (users.db)                       │
├─────────────────────────────────────────────────────────────────────┤
│  users table:                                                       │
│    • id (existing)                                                  │
│    • username (existing)                                            │
│    • encrypted_password (NEW - Base64 AES-256-GCM ciphertext)      │
│    • encryption_iv (NEW - Base64 initialization vector)            │
│    • encryption_auth_tag (NEW - Base64 authentication tag)         │
│    • encryption_version (NEW - per future key rotation)            │
│    • password_updated_at (NEW - timestamp ultimo update)           │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   ARCHIBALD ERP (Remote System)                     │
│              https://4.231.124.90/Archibald                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Architettura di Sicurezza

### 1. Encryption Algorithm: AES-256-GCM

**Scelta**: AES-256-GCM (Galois/Counter Mode)

**Perché AES-256-GCM:**
- ✅ Standard NIST (National Institute of Standards and Technology)
- ✅ Usato da: AWS KMS, Google Cloud KMS, Signal, WhatsApp
- ✅ FIPS 140-2 compliant (certificazione governativa USA)
- ✅ Authenticated encryption (AEAD): confidentiality + integrity in un unico algoritmo
- ✅ Resistance a timing attacks
- ✅ Performance elevate (hardware acceleration su CPU moderne)

**Proprietà di Sicurezza:**
```
Confidentiality: Impossible decifrare senza chiave (2^256 combinazioni)
Integrity: Auth tag previene tampering del ciphertext
Authenticity: Verifica che ciphertext non sia stato modificato
IV Uniqueness: Stesso plaintext + diverso IV = diverso ciphertext
```

### 2. Key Derivation: PBKDF2

**Algoritmo**: PBKDF2-HMAC-SHA256

**Configurazione**:
```typescript
const KEY_DERIVATION_CONFIG = {
  algorithm: 'PBKDF2',
  hash: 'SHA256',
  iterations: 100000,        // OWASP recommended minimum
  keyLength: 32,             // 256 bits per AES-256
  salt: userId + 'archibald-salt-2026',  // Unique per user
};
```

**Formula Key Derivation**:
```
masterKey = PBKDF2(
  password = JWT_SECRET,
  salt = userId + 'archibald-salt-2026',
  iterations = 100000,
  keyLength = 32 bytes,
  digest = SHA256
)
```

**Perché PBKDF2:**
- ✅ Standard OWASP per key derivation
- ✅ Computationally expensive (100k iterations = protezione da brute force)
- ✅ Unique key per ogni utente (salt include userId)
- ✅ Deterministic: stessa input = stessa key (necessario per decrypt)
- ✅ Supported nativamente in Node.js crypto module

### 3. Initialization Vector (IV)

**Generazione**:
```typescript
const iv = crypto.randomBytes(16);  // 128 bits random
```

**Perché Random IV:**
- ✅ Garantisce che stessa password encrypted 2 volte = 2 ciphertext diversi
- ✅ Previene pattern analysis
- ✅ Stored in plaintext nel DB (safe, non è segreto)

### 4. Authentication Tag

**Scopo**: Verifica integrità del ciphertext

**Generazione**: Automatica durante AES-GCM encryption

**Utilizzo**:
```typescript
// Encryption
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const authTag = cipher.getAuthTag();  // 128 bits

// Decryption
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag);  // Set PRIMA di decipher.update()
const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
```

**Se Auth Tag Non Matcha**: `decipher.final()` throws `Error: Unsupported state or unable to authenticate data`

### 5. Threat Model & Mitigations

#### Threat 1: Database Dump (SQL Injection, Backup Leak)
**Scenario**: Attaccante ottiene copia di `users.db`
**Mitigazione**: Password encrypted, inutilizzabili senza `JWT_SECRET`
**Residual Risk**: LOW

#### Threat 2: JWT_SECRET Compromesso
**Scenario**: Attaccante legge `.env` file (RCE, SSH access)
**Mitigazione**:
  - File permissions: `chmod 600 .env` (readable solo da Node process)
  - VPS hardening: SSH key-only, no password auth
  - Rotate JWT_SECRET ogni 3 mesi con `rotateEncryptionKey()` method
**Residual Risk**: MEDIUM (se attaccante ha RCE, può fare molto altro)

#### Threat 3: Man-in-the-Middle (MITM)
**Scenario**: Attaccante intercetta traffico HTTP
**Mitigazione**: HTTPS enforced, password mai in plaintext su network
**Residual Risk**: VERY LOW (TLS 1.3)

#### Threat 4: Memory Dump (Server Compromesso)
**Scenario**: Attaccante fa memory dump del processo Node.js
**Mitigazione**: Nessuna (se attaccante ha root, game over)
**Residual Risk**: HIGH (ma richiede root access)

#### Threat 5: Timing Attacks
**Scenario**: Attaccante misura tempo di decryption per inferire informazioni
**Mitigazione**: AES-GCM è resistant a timing attacks (constant-time operations)
**Residual Risk**: VERY LOW

### 6. Security Best Practices Implementate

```typescript
// ✅ 1. Constant-time comparison per auth tag
crypto.timingSafeEqual(expectedTag, actualTag);

// ✅ 2. Secure random generation (cryptographically secure)
crypto.randomBytes(16);  // NON Math.random()!

// ✅ 3. Zero sensitive data in logs
logger.info('Password encrypted', { userId, ivLength: iv.length });
// ❌ MAI loggare: password, encryptionKey, ciphertext completo

// ✅ 4. Graceful error handling senza info leak
catch (error) {
  // ❌ Non esporre: "Decryption failed: invalid auth tag"
  // ✅ Esponi: "Authentication failed, please re-login"
}

// ✅ 5. Wipe sensitive data dalla memoria quando possibile
let password = decryptPassword(...);
// ... uso password ...
password = null;  // Help GC
```

### 7. Key Rotation Strategy

**Quando Rotare JWT_SECRET:**
- Ogni 3-6 mesi (scheduled)
- Dopo un security incident
- Dopo onboarding/offboarding di admin con accesso al server

**Procedura**:
```bash
# 1. Backup database
cp users.db users.db.backup

# 2. Set nuovo JWT_SECRET in .env
JWT_SECRET_NEW=nuova-chiave-super-sicura

# 3. Run migration script
node scripts/rotate-encryption-key.js --old-secret "$OLD_JWT_SECRET" --new-secret "$JWT_SECRET_NEW"

# 4. Update .env
JWT_SECRET=$JWT_SECRET_NEW

# 5. Restart backend
pm2 restart archibald-backend

# 6. Verify tutto funziona
curl -X POST https://app.archibald.com/api/auth/login -d '{"username":"test","password":"test"}'

# 7. Delete backup (dopo 7 giorni)
rm users.db.backup
```

---

## 📐 Piano di Implementazione

### Phase 1: Backend - Password Encryption Service

**Tempo stimato**: 2-3 ore

#### Task 1.1: Creare `password-encryption-service.ts`

**File**: `backend/src/services/password-encryption-service.ts`

**Interfacce**:
```typescript
interface EncryptedPassword {
  ciphertext: string;      // Base64 encoded
  iv: string;              // Base64 encoded
  authTag: string;         // Base64 encoded
  version: number;         // Per future key rotation
}

interface EncryptionConfig {
  algorithm: 'aes-256-gcm';
  keyDerivation: {
    algorithm: 'PBKDF2';
    iterations: 100000;
    keyLength: 32;
    digest: 'sha256';
  };
}
```

**Metodi da implementare**:
```typescript
class PasswordEncryptionService {
  /**
   * Encrypt una password usando AES-256-GCM
   * @param plaintext - Password in chiaro
   * @param userId - User ID per key derivation
   * @returns Oggetto con ciphertext, iv, authTag
   */
  encrypt(plaintext: string, userId: string): EncryptedPassword;

  /**
   * Decrypt una password encrypted
   * @param encrypted - Oggetto con ciphertext, iv, authTag
   * @param userId - User ID per key derivation
   * @returns Password in chiaro
   * @throws Error se auth tag non valido o decryption fail
   */
  decrypt(encrypted: EncryptedPassword, userId: string): string;

  /**
   * Derive encryption key da JWT_SECRET + userId
   * @param userId - User ID per salt
   * @returns 32-byte encryption key
   */
  private deriveKey(userId: string): Buffer;

  /**
   * Rotate encryption key (per future use)
   * @param oldSecret - Vecchio JWT_SECRET
   * @param newSecret - Nuovo JWT_SECRET
   * @returns Number di password re-encrypted
   */
  async rotateAllKeys(oldSecret: string, newSecret: string): Promise<number>;
}
```

**Implementazione dettagliata**:
```typescript
import crypto from 'crypto';
import config from '../config';

const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-gcm' as const,
  ivLength: 16,  // 128 bits
  keyLength: 32, // 256 bits
  authTagLength: 16, // 128 bits
  keyDerivation: {
    algorithm: 'PBKDF2',
    iterations: 100000,
    digest: 'sha256',
  },
  currentVersion: 1,
};

export class PasswordEncryptionService {
  private jwtSecret: string;

  constructor(jwtSecret?: string) {
    this.jwtSecret = jwtSecret || config.jwtSecret;
    if (!this.jwtSecret || this.jwtSecret === 'dev-secret-key-change-in-production') {
      console.warn('⚠️  WARNING: Using default JWT_SECRET in production is INSECURE!');
    }
  }

  encrypt(plaintext: string, userId: string): EncryptedPassword {
    try {
      // 1. Derive encryption key
      const key = this.deriveKey(userId);

      // 2. Generate random IV
      const iv = crypto.randomBytes(ENCRYPTION_CONFIG.ivLength);

      // 3. Create cipher
      const cipher = crypto.createCipheriv(
        ENCRYPTION_CONFIG.algorithm,
        key,
        iv
      );

      // 4. Encrypt
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);

      // 5. Get auth tag
      const authTag = cipher.getAuthTag();

      // 6. Return encoded data
      return {
        ciphertext: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        version: ENCRYPTION_CONFIG.currentVersion,
      };
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt password');
    }
  }

  decrypt(encrypted: EncryptedPassword, userId: string): string {
    try {
      // 1. Derive encryption key (stessa key usata per encrypt)
      const key = this.deriveKey(userId);

      // 2. Decode Base64 data
      const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
      const iv = Buffer.from(encrypted.iv, 'base64');
      const authTag = Buffer.from(encrypted.authTag, 'base64');

      // 3. Create decipher
      const decipher = crypto.createDecipheriv(
        ENCRYPTION_CONFIG.algorithm,
        key,
        iv
      );

      // 4. Set auth tag PRIMA di decipher.update()
      decipher.setAuthTag(authTag);

      // 5. Decrypt
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),  // Throws se auth tag non valido
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt password - invalid auth tag or corrupted data');
    }
  }

  private deriveKey(userId: string): Buffer {
    // PBKDF2 key derivation: deterministico, computationally expensive
    const salt = `${userId}-archibald-salt-2026`;

    return crypto.pbkdf2Sync(
      this.jwtSecret,                        // Password
      salt,                                   // Salt (unique per user)
      ENCRYPTION_CONFIG.keyDerivation.iterations,
      ENCRYPTION_CONFIG.keyLength,
      ENCRYPTION_CONFIG.keyDerivation.digest
    );
  }

  async rotateAllKeys(
    oldSecret: string,
    newSecret: string,
    userDb: any  // UserDatabase instance
  ): Promise<number> {
    console.log('🔄 Starting encryption key rotation...');

    const users = await userDb.getAllUsers();
    let rotatedCount = 0;

    for (const user of users) {
      if (!user.encrypted_password) continue;

      try {
        // 1. Decrypt con vecchia chiave
        const oldService = new PasswordEncryptionService(oldSecret);
        const plaintext = oldService.decrypt({
          ciphertext: user.encrypted_password,
          iv: user.encryption_iv,
          authTag: user.encryption_auth_tag,
          version: user.encryption_version || 1,
        }, user.id);

        // 2. Re-encrypt con nuova chiave
        const newService = new PasswordEncryptionService(newSecret);
        const reencrypted = newService.encrypt(plaintext, user.id);

        // 3. Update database
        await userDb.updateEncryptedPassword(user.id, reencrypted);

        rotatedCount++;
        console.log(`✅ Rotated key for user: ${user.username}`);
      } catch (error) {
        console.error(`❌ Failed to rotate key for user ${user.username}:`, error);
      }
    }

    console.log(`🎉 Key rotation complete: ${rotatedCount}/${users.length} users`);
    return rotatedCount;
  }
}

// Singleton instance
export const passwordEncryption = new PasswordEncryptionService();
```

#### Task 1.2: Database Migration

**File**: `backend/migrations/021-encrypted-passwords.ts`

**SQL Migration**:
```typescript
import Database from 'better-sqlite3';

export function up(db: Database.Database) {
  console.log('Running migration 021: Add encrypted password columns');

  // Add new columns per password encryption
  db.exec(`
    ALTER TABLE users ADD COLUMN encrypted_password TEXT;
    ALTER TABLE users ADD COLUMN encryption_iv TEXT;
    ALTER TABLE users ADD COLUMN encryption_auth_tag TEXT;
    ALTER TABLE users ADD COLUMN encryption_version INTEGER DEFAULT 1;
    ALTER TABLE users ADD COLUMN password_updated_at TEXT;
  `);

  console.log('✅ Migration 021 complete');
}

export function down(db: Database.Database) {
  console.log('Rolling back migration 021');

  // Rimuovi colonne (SQLite non supporta DROP COLUMN, serve recreate table)
  db.exec(`
    CREATE TABLE users_backup AS SELECT
      id, username, fullName, role, isWhitelisted, lastLoginAt, createdAt
    FROM users;

    DROP TABLE users;

    ALTER TABLE users_backup RENAME TO users;
  `);

  console.log('✅ Rollback 021 complete');
}
```

**Auto-run Migration at Boot**:

**File**: `backend/src/database/user-database.ts` (modificare)

```typescript
import { up as migration021 } from '../migrations/021-encrypted-passwords';

export class UserDatabase {
  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    // ... existing migrations ...

    // Run migration 021
    try {
      migration021(this.db);
    } catch (error) {
      console.log('Migration 021 already applied or failed:', error.message);
    }
  }
}
```

#### Task 1.3: Update `UserDatabase` Class

**File**: `backend/src/database/user-database.ts`

**Nuovi metodi da aggiungere**:
```typescript
import { EncryptedPassword } from '../services/password-encryption-service';

export class UserDatabase {
  // ... existing methods ...

  /**
   * Salva password encrypted per un utente
   */
  saveEncryptedPassword(userId: string, encrypted: EncryptedPassword): void {
    const stmt = this.db.prepare(`
      UPDATE users
      SET
        encrypted_password = ?,
        encryption_iv = ?,
        encryption_auth_tag = ?,
        encryption_version = ?,
        password_updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      encrypted.version,
      new Date().toISOString(),
      userId
    );
  }

  /**
   * Recupera password encrypted per un utente
   */
  getEncryptedPassword(userId: string): EncryptedPassword | null {
    const stmt = this.db.prepare(`
      SELECT
        encrypted_password as ciphertext,
        encryption_iv as iv,
        encryption_auth_tag as authTag,
        encryption_version as version
      FROM users
      WHERE id = ?
    `);

    const row = stmt.get(userId) as any;

    if (!row || !row.ciphertext) {
      return null;
    }

    return {
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.authTag,
      version: row.version || 1,
    };
  }

  /**
   * Get tutti gli utenti con password encrypted (per key rotation)
   */
  getAllUsersWithEncryptedPasswords(): Array<{
    id: string;
    username: string;
    encrypted_password: string;
    encryption_iv: string;
    encryption_auth_tag: string;
    encryption_version: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT
        id, username,
        encrypted_password, encryption_iv,
        encryption_auth_tag, encryption_version
      FROM users
      WHERE encrypted_password IS NOT NULL
    `);

    return stmt.all() as any[];
  }

  /**
   * Cancella password encrypted per un utente (logout completo)
   */
  clearEncryptedPassword(userId: string): void {
    const stmt = this.db.prepare(`
      UPDATE users
      SET
        encrypted_password = NULL,
        encryption_iv = NULL,
        encryption_auth_tag = NULL,
        encryption_version = NULL,
        password_updated_at = NULL
      WHERE id = ?
    `);

    stmt.run(userId);
  }
}
```

#### Task 1.4: Update Login Endpoint

**File**: `backend/src/index.ts` (linea 685-821)

**Modifiche al flow di login**:
```typescript
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, deviceId, platform, deviceName } =
      loginSchema.parse(req.body);

    // 1. Verifica utente esiste
    const user = userDb.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Credenziali non valide'
      });
    }

    // 2. Verifica whitelist
    if (!user.isWhitelisted) {
      return res.status(403).json({
        success: false,
        error: 'USER_NOT_WHITELISTED',
        message: 'Utente non autorizzato'
      });
    }

    // 3. Valida credenziali
    let needsPuppeteerValidation = true;
    const cachedPassword = PasswordCache.get(user.id);

    if (cachedPassword && cachedPassword === password) {
      // Fast path: password già cached e match
      needsPuppeteerValidation = false;
      console.log(`Fast path login for user: ${username}`);
    }

    if (needsPuppeteerValidation) {
      // Slow path: valida con Puppeteer
      console.log(`Validating credentials via Puppeteer for user: ${username}`);

      try {
        await browserPool.validateCredentials(username, password);
        console.log(`✅ Puppeteer validation successful for: ${username}`);
      } catch (error) {
        console.error(`❌ Puppeteer validation failed for ${username}:`, error);

        // Clear cached password se presente
        if (cachedPassword) {
          PasswordCache.clear(user.id);
        }

        return res.status(401).json({
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'Credenziali non valide'
        });
      }
    }

    // 4. Password validata con successo!

    // 4a. Salva password in cache (in-memory)
    PasswordCache.set(user.id, password);
    console.log(`Password cached for user: ${username}`);

    // 4b. 🆕 Encrypt e salva password nel database
    try {
      const encrypted = passwordEncryption.encrypt(password, user.id);
      userDb.saveEncryptedPassword(user.id, encrypted);
      console.log(`✅ Password encrypted and saved for user: ${username}`);
    } catch (error) {
      console.error(`⚠️  Failed to encrypt password for ${username}:`, error);
      // Non è fatal error, continua con login
    }

    // 5. Update last login timestamp
    userDb.updateLastLogin(user.id);

    // 6. Registra dispositivo se fornito
    if (deviceId) {
      deviceManager.registerDevice({
        userId: user.id,
        deviceId,
        platform: platform || 'unknown',
        deviceName: deviceName || 'Unknown Device',
      });
    }

    // 7. Genera JWT token
    const token = generateJWT({
      userId: user.id,
      username: user.username,
      role: user.role,
      deviceId,
    });

    // 8. Trigger background sync
    userSpecificSyncService
      .checkAndSyncOnLogin(user.id)
      .catch((err) => console.error('Background sync failed:', err));

    // 9. Return success response
    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Errore interno del server'
    });
  }
});
```

#### Task 1.5: Auto-Load Passwords at Boot

**File**: `backend/src/index.ts` (boot sequence)

**Aggiungere dopo inizializzazione database**:
```typescript
import { passwordEncryption } from './services/password-encryption-service';
import { PasswordCache } from './password-cache';
import { userDb } from './database/user-database';

// ... dopo inizializzazione database ...

/**
 * Auto-load encrypted passwords al boot
 * Questo permette di ripristinare PasswordCache dopo backend restart
 */
async function loadEncryptedPasswordsAtBoot() {
  console.log('🔐 Loading encrypted passwords from database...');

  try {
    const users = userDb.getAllUsersWithEncryptedPasswords();
    let loadedCount = 0;

    for (const user of users) {
      try {
        const encrypted = {
          ciphertext: user.encrypted_password,
          iv: user.encryption_iv,
          authTag: user.encryption_auth_tag,
          version: user.encryption_version,
        };

        const plaintext = passwordEncryption.decrypt(encrypted, user.id);
        PasswordCache.set(user.id, plaintext);

        loadedCount++;
        console.log(`  ✅ Loaded password for user: ${user.username}`);
      } catch (error) {
        console.error(`  ❌ Failed to decrypt password for ${user.username}:`, error);
        // Non blocca boot, solo log error
      }
    }

    console.log(`🎉 Loaded ${loadedCount}/${users.length} passwords successfully`);
  } catch (error) {
    console.error('❌ Failed to load encrypted passwords:', error);
    // Non blocca boot, solo log error
  }
}

// Run at boot
loadEncryptedPasswordsAtBoot().catch(console.error);

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
```

#### Task 1.6: Nuovo Endpoint `/api/auth/refresh`

**File**: `backend/src/index.ts`

**Implementazione**:
```typescript
/**
 * POST /api/auth/refresh
 * Rinnova JWT token senza re-login
 */
app.post('/api/auth/refresh', authenticateJWT, async (req, res) => {
  try {
    const user = req.user!;  // Garantito da authenticateJWT middleware

    // Verifica che password sia ancora in cache
    const cachedPassword = PasswordCache.get(user.userId);
    if (!cachedPassword) {
      return res.status(401).json({
        success: false,
        error: 'CREDENTIALS_EXPIRED',
        message: 'Sessione scaduta. Effettua nuovamente il login.',
      });
    }

    // Genera nuovo JWT token
    const newToken = generateJWT({
      userId: user.userId,
      username: user.username,
      role: user.role,
      deviceId: user.deviceId,
    });

    console.log(`🔄 JWT refreshed for user: ${user.username}`);

    return res.json({
      success: true,
      token: newToken,
      user: {
        id: user.userId,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('JWT refresh error:', error);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Errore durante il refresh del token',
    });
  }
});
```

---

### Phase 2: Frontend - Enhanced Fetch Interceptor

**Tempo stimato**: 2 ore

#### Task 2.1: Update `fetchWithRetry`

**File**: `frontend/src/utils/fetch-with-retry.ts`

**Configurazione retry**:
```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,      // 1s
  maxDelay: 10000,         // 10s
  backoffMultiplier: 2,    // Exponential: 1s, 2s, 4s
  totalTimeout: 20000,     // Hard cap: 20s totale
};

const RETRYABLE_ERRORS = {
  // Network/server errors (transient)
  500: true,  // Internal Server Error
  502: true,  // Bad Gateway
  503: true,  // Service Unavailable
  504: true,  // Gateway Timeout

  // NON ritentare questi
  400: false, // Bad Request (errore client)
  401: false, // Unauthorized (gestito separatamente)
  403: false, // Forbidden
  404: false, // Not Found
};
```

**Enhanced implementation**:
```typescript
import { authApi } from '../api/auth-api';

interface RetryContext {
  attempt: number;
  totalElapsed: number;
  lastError: Error | null;
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  context: RetryContext = { attempt: 0, totalElapsed: 0, lastError: null }
): Promise<Response> {
  const startTime = Date.now();

  try {
    // 1. Get JWT token
    const token = localStorage.getItem('archibald_jwt');
    if (!token && !url.includes('/api/auth/login')) {
      throw new Error('No authentication token found');
    }

    // 2. Add Authorization header
    const headers = new Headers(options.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    // 3. Make request
    const response = await fetch(url, { ...options, headers });

    // 4. Handle 401 Unauthorized
    if (response.status === 401) {
      const data = await response.json().catch(() => ({}));

      // 4a. CREDENTIALS_EXPIRED = password non in cache backend
      if (data.error === 'CREDENTIALS_EXPIRED') {
        console.log('🔄 Credentials expired, attempting silent re-login...');

        // Tenta silent re-login
        const reloginSuccess = await attemptSilentRelogin();

        if (reloginSuccess && context.attempt === 0) {
          // Retry original request con nuovo token
          console.log('✅ Silent re-login successful, retrying original request...');
          return fetchWithRetry(url, options, {
            attempt: context.attempt + 1,
            totalElapsed: context.totalElapsed + (Date.now() - startTime),
            lastError: null,
          });
        } else {
          // Silent re-login failed, redirect a login
          console.log('❌ Silent re-login failed, redirecting to login...');
          window.location.href = '/login?reason=session_expired';
          throw new Error('Session expired');
        }
      }

      // 4b. Altri 401 (token invalido, etc.)
      console.log('❌ Unauthorized, clearing token and redirecting to login...');
      localStorage.removeItem('archibald_jwt');
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    // 5. Handle retryable errors (500, 502, 503, 504)
    if (RETRYABLE_ERRORS[response.status as keyof typeof RETRYABLE_ERRORS]) {
      const shouldRetry = context.attempt < RETRY_CONFIG.maxRetries;
      const timeoutReached = context.totalElapsed >= RETRY_CONFIG.totalTimeout;

      if (shouldRetry && !timeoutReached) {
        const delay = Math.min(
          RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, context.attempt),
          RETRY_CONFIG.maxDelay
        );

        console.log(
          `⚠️  Request failed (${response.status}), retrying in ${delay}ms... ` +
          `(attempt ${context.attempt + 1}/${RETRY_CONFIG.maxRetries})`
        );

        // Wait exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));

        // Retry
        return fetchWithRetry(url, options, {
          attempt: context.attempt + 1,
          totalElapsed: context.totalElapsed + (Date.now() - startTime) + delay,
          lastError: new Error(`HTTP ${response.status}`),
        });
      } else {
        console.error(
          `❌ Request failed after ${context.attempt} retries or timeout reached`
        );
      }
    }

    // 6. Return response (success or non-retryable error)
    return response;

  } catch (error) {
    // Network error (fetch failed completely)
    const shouldRetry = context.attempt < RETRY_CONFIG.maxRetries;
    const timeoutReached = context.totalElapsed >= RETRY_CONFIG.totalTimeout;

    if (shouldRetry && !timeoutReached) {
      const delay = Math.min(
        RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, context.attempt),
        RETRY_CONFIG.maxDelay
      );

      console.log(
        `⚠️  Network error, retrying in ${delay}ms... ` +
        `(attempt ${context.attempt + 1}/${RETRY_CONFIG.maxRetries})`
      );

      await new Promise(resolve => setTimeout(resolve, delay));

      return fetchWithRetry(url, options, {
        attempt: context.attempt + 1,
        totalElapsed: context.totalElapsed + (Date.now() - startTime) + delay,
        lastError: error as Error,
      });
    }

    // Max retries reached or timeout
    console.error('❌ Request failed after all retries:', error);
    throw error;
  }
}

/**
 * Tenta silent re-login usando credenziali salvate
 * @returns true se re-login successful, false altrimenti
 */
async function attemptSilentRelogin(): Promise<boolean> {
  try {
    // 1. Get last user credentials
    const lastUserStr = localStorage.getItem('archibald_last_user');
    if (!lastUserStr) {
      console.log('⚠️  No saved credentials found');
      return false;
    }

    const lastUser = JSON.parse(lastUserStr);
    if (!lastUser.username || !lastUser.password) {
      console.log('⚠️  Saved credentials incomplete');
      return false;
    }

    // 2. Attempt login
    console.log(`🔄 Attempting silent re-login for user: ${lastUser.username}`);

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: lastUser.username,
        password: lastUser.password,
      }),
    });

    if (!response.ok) {
      console.log('❌ Silent re-login failed:', response.status);
      return false;
    }

    const data = await response.json();

    if (data.success && data.token) {
      // 3. Update JWT token
      localStorage.setItem('archibald_jwt', data.token);
      console.log('✅ Silent re-login successful!');
      return true;
    }

    return false;
  } catch (error) {
    console.error('❌ Silent re-login error:', error);
    return false;
  }
}
```

#### Task 2.2: Update Login Flow per Salvare Credenziali

**File**: `frontend/src/hooks/useAuth.ts`

**Modificare metodo `login`**:
```typescript
const login = async (username: string, password: string, rememberMe: boolean) => {
  try {
    setLoading(true);
    setError(null);

    const response = await authApi.login({ username, password });

    if (response.success && response.token) {
      // 1. Salva JWT token
      localStorage.setItem('archibald_jwt', response.token);

      // 2. 🆕 SEMPRE salva credenziali per silent re-login
      // (anche se rememberMe è false, servono per auto-retry)
      localStorage.setItem('archibald_last_user', JSON.stringify({
        username,
        password,  // ⚠️ Salvato in plaintext in localStorage
        rememberMe,
      }));

      // 3. Update auth state
      setUser(response.user);
      setIsAuthenticated(true);

      // 4. Setup PIN se richiesto (optional)
      if (rememberMe) {
        // ... existing PIN setup logic ...
      }

      return { success: true };
    }

    return { success: false, error: 'Login failed' };
  } catch (error) {
    console.error('Login error:', error);
    setError('Errore durante il login');
    return { success: false, error: 'Login error' };
  } finally {
    setLoading(false);
  }
};
```

**⚠️ Security Note**:
Password salvata in `localStorage` in plaintext. Questo è un trade-off:
- **Pro**: Silent re-login funziona sempre, UX perfetta
- **Contro**: Se qualcuno ha accesso fisico al device + dev tools aperti, può vedere password
- **Mitigazione**:
  - HTTPS only (no MITM)
  - localStorage è sandboxed per domain
  - User può disabilitare "Ricorda credenziali" se device condiviso

**Alternative più sicure** (se richiesto):
1. IndexedDB con Web Crypto API encryption
2. Chiedere password ogni sessione (peggiora UX)

---

### Phase 3: Frontend - JWT Auto-Refresh

**Tempo stimato**: 1 ora

#### Task 3.1: Background JWT Monitor

**File**: `frontend/src/services/jwt-refresh-service.ts` (nuovo)

```typescript
import { jwtDecode } from 'jwt-decode';
import { fetchWithRetry } from '../utils/fetch-with-retry';

interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  iat: number;  // Issued at (seconds)
  exp: number;  // Expiry (seconds)
}

const JWT_REFRESH_CONFIG = {
  checkInterval: 5 * 60 * 1000,      // Check ogni 5 minuti
  refreshThreshold: 30 * 60 * 1000,  // Refresh se < 30 min a expiry
};

class JWTRefreshService {
  private intervalId: number | null = null;
  private isRefreshing = false;

  /**
   * Start background JWT monitoring
   */
  start() {
    if (this.intervalId) {
      console.log('JWT refresh service already running');
      return;
    }

    console.log('🚀 Starting JWT auto-refresh service...');

    // Check immediately
    this.checkAndRefresh();

    // Then check every 5 minutes
    this.intervalId = window.setInterval(
      () => this.checkAndRefresh(),
      JWT_REFRESH_CONFIG.checkInterval
    );
  }

  /**
   * Stop background monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('JWT auto-refresh service stopped');
    }
  }

  /**
   * Check JWT expiry e refresh se necessario
   */
  private async checkAndRefresh() {
    try {
      // 1. Get current JWT
      const token = localStorage.getItem('archibald_jwt');
      if (!token) {
        console.log('No JWT token found, skipping refresh check');
        return;
      }

      // 2. Decode e check expiry
      const payload = jwtDecode<JWTPayload>(token);
      const now = Date.now();
      const expiryTime = payload.exp * 1000;  // Convert to milliseconds
      const timeUntilExpiry = expiryTime - now;

      console.log(
        `JWT expires in ${Math.round(timeUntilExpiry / 1000 / 60)} minutes`
      );

      // 3. Refresh se < 30 min a expiry
      if (timeUntilExpiry < JWT_REFRESH_CONFIG.refreshThreshold && timeUntilExpiry > 0) {
        console.log('🔄 JWT expiring soon, refreshing...');
        await this.refreshToken();
      } else if (timeUntilExpiry <= 0) {
        console.log('⚠️  JWT already expired, redirecting to login...');
        localStorage.removeItem('archibald_jwt');
        window.location.href = '/login?reason=token_expired';
      }
    } catch (error) {
      console.error('JWT refresh check error:', error);
      // Non blocca, retry al prossimo interval
    }
  }

  /**
   * Refresh JWT token via API
   */
  private async refreshToken() {
    if (this.isRefreshing) {
      console.log('Refresh already in progress, skipping...');
      return;
    }

    this.isRefreshing = true;

    try {
      const response = await fetchWithRetry('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.token) {
        // Update token
        localStorage.setItem('archibald_jwt', data.token);
        console.log('✅ JWT refreshed successfully');
      } else {
        throw new Error('Refresh response invalid');
      }
    } catch (error) {
      console.error('❌ JWT refresh failed:', error);
      // Non redirect a login, lascio che expiry naturale lo gestisca
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Force immediate refresh (per testing)
   */
  async forceRefresh() {
    console.log('🔄 Forcing JWT refresh...');
    await this.refreshToken();
  }
}

// Singleton instance
export const jwtRefreshService = new JWTRefreshService();
```

#### Task 3.2: Integrate JWT Refresh Service in App

**File**: `frontend/src/main.tsx`

**Aggiungere dopo inizializzazione**:
```typescript
import { jwtRefreshService } from './services/jwt-refresh-service';

// ... existing initialization ...

// Start JWT auto-refresh service
const token = localStorage.getItem('archibald_jwt');
if (token) {
  jwtRefreshService.start();
  console.log('✅ JWT auto-refresh service started');
}

// Stop service on logout
window.addEventListener('storage', (event) => {
  if (event.key === 'archibald_jwt' && !event.newValue) {
    // Token removed = logout
    jwtRefreshService.stop();
    console.log('JWT auto-refresh service stopped (logout)');
  }
});
```

**File**: `frontend/src/hooks/useAuth.ts`

**Update logout per fermare refresh service**:
```typescript
import { jwtRefreshService } from '../services/jwt-refresh-service';

const logout = async () => {
  try {
    // 1. Stop JWT refresh service
    jwtRefreshService.stop();

    // 2. Call logout API
    await authApi.logout();

    // 3. Clear localStorage
    localStorage.removeItem('archibald_jwt');
    localStorage.removeItem('archibald_last_user');

    // 4. Update state
    setUser(null);
    setIsAuthenticated(false);
  } catch (error) {
    console.error('Logout error:', error);
  }
};
```

---

### Phase 4: Testing & Validation

**Tempo stimato**: 2-3 ore

#### Test Suite 1: Password Encryption Service

**File**: `backend/src/services/__tests__/password-encryption-service.spec.ts` (nuovo)

```typescript
import { describe, expect, test, beforeEach } from 'vitest';
import { PasswordEncryptionService } from '../password-encryption-service';

describe('PasswordEncryptionService', () => {
  let service: PasswordEncryptionService;
  const testSecret = 'test-jwt-secret-for-testing';
  const userId = 'user-123';
  const password = 'MySecurePassword123!';

  beforeEach(() => {
    service = new PasswordEncryptionService(testSecret);
  });

  describe('encrypt', () => {
    test('should encrypt password successfully', () => {
      const encrypted = service.encrypt(password, userId);

      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('authTag');
      expect(encrypted).toHaveProperty('version');
      expect(encrypted.version).toBe(1);
    });

    test('should produce different ciphertext for same password (different IV)', () => {
      const encrypted1 = service.encrypt(password, userId);
      const encrypted2 = service.encrypt(password, userId);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    test('should produce different ciphertext for different users', () => {
      const encrypted1 = service.encrypt(password, 'user-1');
      const encrypted2 = service.encrypt(password, 'user-2');

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });
  });

  describe('decrypt', () => {
    test('should decrypt password successfully', () => {
      const encrypted = service.encrypt(password, userId);
      const decrypted = service.decrypt(encrypted, userId);

      expect(decrypted).toBe(password);
    });

    test('should handle special characters', () => {
      const specialPassword = 'P@ssw0rd!#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = service.encrypt(specialPassword, userId);
      const decrypted = service.decrypt(encrypted, userId);

      expect(decrypted).toBe(specialPassword);
    });

    test('should handle unicode characters', () => {
      const unicodePassword = 'пароль密码🔐';
      const encrypted = service.encrypt(unicodePassword, userId);
      const decrypted = service.decrypt(encrypted, userId);

      expect(decrypted).toBe(unicodePassword);
    });

    test('should throw error for invalid auth tag', () => {
      const encrypted = service.encrypt(password, userId);

      // Tamper with auth tag
      encrypted.authTag = Buffer.from('invalid-tag').toString('base64');

      expect(() => service.decrypt(encrypted, userId)).toThrow();
    });

    test('should throw error for tampered ciphertext', () => {
      const encrypted = service.encrypt(password, userId);

      // Tamper with ciphertext
      const tamperedCiphertext = Buffer.from(encrypted.ciphertext, 'base64');
      tamperedCiphertext[0] = tamperedCiphertext[0] ^ 0xFF;  // Flip bits
      encrypted.ciphertext = tamperedCiphertext.toString('base64');

      expect(() => service.decrypt(encrypted, userId)).toThrow();
    });

    test('should fail decryption with wrong user ID', () => {
      const encrypted = service.encrypt(password, 'user-1');

      expect(() => service.decrypt(encrypted, 'user-2')).toThrow();
    });

    test('should fail decryption with wrong JWT secret', () => {
      const encrypted = service.encrypt(password, userId);

      const wrongService = new PasswordEncryptionService('wrong-secret');

      expect(() => wrongService.decrypt(encrypted, userId)).toThrow();
    });
  });

  describe('round-trip consistency', () => {
    test('encrypt → decrypt should preserve original password', () => {
      const passwords = [
        'simple',
        'With Spaces',
        'With\nNewlines\r\nAndTabs\t',
        '日本語パスワード',
        '🔐🔑🛡️',
        'a'.repeat(1000),  // Long password
      ];

      passwords.forEach((pwd) => {
        const encrypted = service.encrypt(pwd, userId);
        const decrypted = service.decrypt(encrypted, userId);
        expect(decrypted).toBe(pwd);
      });
    });
  });
});
```

**Run tests**:
```bash
cd backend
npm test -- password-encryption-service.spec.ts
```

#### Test Suite 2: Integration Tests

**File**: `backend/test/autologin-integration.spec.ts` (nuovo)

```typescript
import { describe, expect, test, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index';  // Express app
import { userDb } from '../src/database/user-database';
import { PasswordCache } from '../src/password-cache';

describe('Auto-Login Integration Tests', () => {
  let authToken: string;
  let testUserId: string;
  const testCredentials = {
    username: 'testuser',
    password: 'TestPassword123!',
  };

  beforeAll(async () => {
    // Setup test user
    testUserId = userDb.createUser({
      username: testCredentials.username,
      fullName: 'Test User',
      role: 'agent',
      isWhitelisted: true,
    });
  });

  afterAll(async () => {
    // Cleanup
    userDb.deleteUser(testUserId);
  });

  describe('Login with Password Encryption', () => {
    test('should login and encrypt password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send(testCredentials);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();

      authToken = response.body.token;

      // Verify password encrypted in DB
      const encryptedPassword = userDb.getEncryptedPassword(testUserId);
      expect(encryptedPassword).not.toBeNull();
      expect(encryptedPassword?.ciphertext).toBeDefined();
      expect(encryptedPassword?.iv).toBeDefined();
      expect(encryptedPassword?.authTag).toBeDefined();

      // Verify password in cache
      const cachedPassword = PasswordCache.get(testUserId);
      expect(cachedPassword).toBe(testCredentials.password);
    });
  });

  describe('JWT Refresh', () => {
    test('should refresh JWT token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.token).not.toBe(authToken);  // New token

      // Update token per next tests
      authToken = response.body.token;
    });

    test('should fail refresh without valid token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    test('should fail refresh if password not in cache', async () => {
      // Clear cache
      PasswordCache.clear(testUserId);

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('CREDENTIALS_EXPIRED');

      // Restore cache per next tests
      PasswordCache.set(testUserId, testCredentials.password);
    });
  });

  describe('Password Cache Auto-Restore', () => {
    test('should restore password cache from DB', async () => {
      // Clear cache (simula backend restart)
      PasswordCache.clear(testUserId);

      // Verify cache cleared
      expect(PasswordCache.get(testUserId)).toBeNull();

      // Simulate boot: load passwords from DB
      const { loadEncryptedPasswordsAtBoot } = await import('../src/boot-loader');
      await loadEncryptedPasswordsAtBoot();

      // Verify cache restored
      const restoredPassword = PasswordCache.get(testUserId);
      expect(restoredPassword).toBe(testCredentials.password);
    });
  });

  describe('Silent Re-login Flow', () => {
    test('should handle CREDENTIALS_EXPIRED and allow re-login', async () => {
      // Clear cache (simula password expired)
      PasswordCache.clear(testUserId);

      // Try operation che richiede password
      const response = await request(app)
        .post('/api/orders/draft/place')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ /* order data */ });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('CREDENTIALS_EXPIRED');

      // Frontend ora fa silent re-login
      const reloginResponse = await request(app)
        .post('/api/auth/login')
        .send(testCredentials);

      expect(reloginResponse.status).toBe(200);
      expect(reloginResponse.body.success).toBe(true);

      // Verify password back in cache
      const cachedPassword = PasswordCache.get(testUserId);
      expect(cachedPassword).toBe(testCredentials.password);
    });
  });
});
```

**Run integration tests**:
```bash
cd backend
npm test -- autologin-integration.spec.ts
```

#### Manual Testing Checklist

**Scenario 1: Backend Restart**
```
1. Login come utente normale
2. Verifica operazione funziona (es. crea ordine bozza)
3. Restart backend: `pm2 restart archibald-backend`
4. Senza riloggare, prova stessa operazione
5. ✅ Expected: Operazione funziona, nessun errore
6. Check logs: "Loaded X passwords from database"
```

**Scenario 2: JWT Expiry**
```
1. Login come utente
2. Mock JWT expiry: modifica JWT_EXPIRY in config a 30 secondi
3. Aspetta 35 secondi
4. Prova operazione
5. ✅ Expected: JWT auto-refreshed, operazione successo
6. Check logs: "JWT refreshed for user: ..."
```

**Scenario 3: Timeout Archibald**
```
1. Login come utente
2. Simula timeout: blocca connessione Archibald (firewall)
3. Prova operazione (es. sync ordini)
4. ✅ Expected: Spinner, retry 3 volte, poi errore chiaro
5. Check logs: "Retrying in Xms... (attempt Y/3)"
```

**Scenario 4: Password Cambio**
```
1. Login con password A
2. Cambio password in Archibald (direttamente nel ERP)
3. Logout dalla PWA
4. Login con password B (nuova)
5. ✅ Expected: Login successo, password B encrypted e cached
6. Restart backend
7. Prova operazione
8. ✅ Expected: Funziona con password B
```

**Scenario 5: Multiple Users**
```
1. Login utente A
2. Crea ordine (verifica successo)
3. Logout
4. Login utente B
5. Crea ordine (verifica successo)
6. Restart backend
7. Login utente A → operazione
8. ✅ Expected: Funziona (password A restored)
9. Login utente B → operazione
10. ✅ Expected: Funziona (password B restored)
```

---

## 📊 Monitoring e Logging

### Log Events da Tracciare

**Backend Logs**:
```typescript
// 1. Password encryption
logger.info('Password encrypted', {
  userId,
  username,
  ivLength: encrypted.iv.length,
  // ❌ MAI loggare: password, ciphertext completo
});

// 2. Password decryption
logger.info('Password decrypted', {
  userId,
  username,
  success: true,
});

// 3. Cache operations
logger.info('Password cache loaded', {
  totalUsers: users.length,
  successCount: loadedCount,
  failedCount: users.length - loadedCount,
});

// 4. JWT refresh
logger.info('JWT refreshed', {
  userId,
  username,
  expiryTime: new Date(payload.exp * 1000).toISOString(),
});

// 5. Silent re-login
logger.info('Silent re-login attempt', {
  userId,
  username,
  success: true,
  duration: Date.now() - startTime,
});

// 6. Encryption errors
logger.error('Encryption failed', {
  userId,
  username,
  error: error.message,
  // ❌ NO stack trace completo (può contenere sensitive data)
});
```

**Frontend Logs** (console + optional remote logging):
```typescript
// 1. Silent re-login
console.log('🔄 Silent re-login triggered', { username, reason: 'CREDENTIALS_EXPIRED' });

// 2. JWT refresh
console.log('🔄 JWT auto-refresh', { expiresIn: timeUntilExpiry });

// 3. Retry attempts
console.log('⚠️  Request retry', { attempt, maxRetries, delay, url });

// 4. Success
console.log('✅ Auto-recovery successful', { operation: 'create-order', retries: 2 });

// 5. Failures
console.error('❌ Auto-recovery failed', { operation, error: error.message });
```

### Metriche da Monitorare

**Backend Metrics**:
```typescript
// Prometheus/Grafana metrics
const metrics = {
  // Counter: Quante volte password decrypted at boot
  password_cache_restores_total: counter(),

  // Counter: JWT refresh requests
  jwt_refresh_total: counter({ labels: ['success', 'failure'] }),

  // Counter: Silent re-login attempts
  silent_relogin_total: counter({ labels: ['success', 'failure'] }),

  // Histogram: Decryption time
  password_decrypt_duration_ms: histogram({ buckets: [1, 5, 10, 50, 100] }),

  // Gauge: Password cache size
  password_cache_size: gauge(),
};
```

**Alerts da Configurare**:
```yaml
# Alert 1: High decryption failure rate
- alert: PasswordDecryptionFailureRate
  expr: rate(password_decrypt_failures_total[5m]) > 0.1
  for: 5m
  annotations:
    summary: "High password decryption failure rate"
    description: "{{ $value }} decryptions failing per second"

# Alert 2: JWT refresh failures
- alert: JWTRefreshFailureRate
  expr: rate(jwt_refresh_failures_total[5m]) > 0.05
  for: 5m
  annotations:
    summary: "JWT refresh failing frequently"

# Alert 3: Silent re-login failures
- alert: SilentReloginFailureRate
  expr: rate(silent_relogin_failures_total[5m]) > 0.1
  for: 10m
  annotations:
    summary: "Silent re-login failing, users may need manual login"
```

---

## 🚀 Deployment e Rollback

### Pre-Deployment Checklist

```
□ Run tutti i test: npm test
□ Run linting: npm run lint
□ Run type checking: npm run typecheck
□ Verify JWT_SECRET in production .env (non default!)
□ Verify .env permissions: chmod 600 .env
□ Backup database: cp users.db users.db.backup-$(date +%s)
□ Review migration 021: verificare SQL syntax
□ Test migration rollback localmente
□ Deploy in staging first, poi production
```

### Deployment Steps

```bash
# 1. Backup
ssh user@vps
cd /path/to/archibald-web-app
cp backend/users.db backend/users.db.backup-$(date +%s)

# 2. Pull changes
git pull origin master

# 3. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 4. Build frontend
cd frontend
npm run build

# 5. Run migration (auto-runs at boot, but verify)
cd ../backend
npm run migrate  # Se hai script di migration

# 6. Restart backend
pm2 restart archibald-backend

# 7. Verify logs
pm2 logs archibald-backend --lines 100

# Expected logs:
# ✅ Migration 021 complete
# ✅ Loaded X passwords from database
# ✅ Server running on port 3000

# 8. Test login
curl -X POST https://your-vps/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass"}'

# Expected response: {"success":true,"token":"..."}

# 9. Verify password encrypted in DB
sqlite3 backend/users.db "SELECT username, encrypted_password IS NOT NULL as has_password FROM users LIMIT 5;"

# Expected: has_password = 1 per utenti che hanno fatto login
```

### Rollback Plan

**Se qualcosa va storto**:

```bash
# 1. Stop backend
pm2 stop archibald-backend

# 2. Restore database backup
cd /path/to/archibald-web-app/backend
cp users.db users.db.broken
cp users.db.backup-TIMESTAMP users.db

# 3. Revert code
git revert <commit-hash>  # O git reset --hard <previous-commit>

# 4. Rebuild
cd frontend && npm run build

# 5. Restart backend
pm2 restart archibald-backend

# 6. Verify
curl https://your-vps/api/auth/login ...

# 7. Notify team
echo "Rollback completato, sistema tornato a stato precedente"
```

**Se solo migration è problema**:
```bash
# Rollback migration 021
sqlite3 backend/users.db

# Dentro sqlite:
BEGIN TRANSACTION;

CREATE TABLE users_backup AS SELECT
  id, username, fullName, role, isWhitelisted, lastLoginAt, createdAt
FROM users;

DROP TABLE users;

ALTER TABLE users_backup RENAME TO users;

COMMIT;

.quit
```

---

## ✅ Checklist Completa Implementazione

### Phase 1: Backend - Password Encryption ✅

- [ ] Creare `password-encryption-service.ts` con metodi encrypt/decrypt
- [ ] Implementare key derivation con PBKDF2
- [ ] Implementare AES-256-GCM encryption
- [ ] Aggiungere metodo `rotateAllKeys()` per key rotation
- [ ] Scrivere unit tests per encryption service
- [ ] Creare migration 021 per aggiungere colonne DB
- [ ] Testare migration up/down
- [ ] Aggiungere metodi `UserDatabase`:
  - [ ] `saveEncryptedPassword()`
  - [ ] `getEncryptedPassword()`
  - [ ] `getAllUsersWithEncryptedPasswords()`
  - [ ] `clearEncryptedPassword()`
- [ ] Update login endpoint per encrypt password
- [ ] Implementare `loadEncryptedPasswordsAtBoot()`
- [ ] Aggiungere chiamata a `loadEncryptedPasswordsAtBoot()` in boot sequence
- [ ] Creare endpoint `/api/auth/refresh`
- [ ] Testare refresh endpoint con JWT valido
- [ ] Testare refresh endpoint con password non in cache
- [ ] Verificare logs durante boot: password loaded

### Phase 2: Frontend - Enhanced Fetch Interceptor ✅

- [ ] Update `fetchWithRetry` con retry config
- [ ] Implementare handling 401 CREDENTIALS_EXPIRED
- [ ] Implementare `attemptSilentRelogin()`
- [ ] Aggiungere retry logic per 500/502/503/504
- [ ] Implementare exponential backoff
- [ ] Aggiungere timeout totale (20s)
- [ ] Update `useAuth.login()` per salvare credenziali in localStorage
- [ ] Testare silent re-login dopo backend restart
- [ ] Testare retry su timeout Archibald
- [ ] Verificare logging di retry attempts

### Phase 3: Frontend - JWT Auto-Refresh ✅

- [ ] Creare `jwt-refresh-service.ts`
- [ ] Implementare background check ogni 5 min
- [ ] Implementare `checkAndRefresh()` method
- [ ] Implementare `refreshToken()` method
- [ ] Aggiungere `forceRefresh()` per testing
- [ ] Integrare service in `main.tsx`
- [ ] Start service al boot se JWT presente
- [ ] Stop service on logout
- [ ] Testare auto-refresh con JWT mock expiry
- [ ] Verificare logging di refresh attempts

### Phase 4: Testing ✅

- [ ] Run unit tests: `password-encryption-service.spec.ts`
- [ ] Run integration tests: `autologin-integration.spec.ts`
- [ ] Manual test: Backend restart scenario
- [ ] Manual test: JWT expiry scenario
- [ ] Manual test: Timeout Archibald scenario
- [ ] Manual test: Password change scenario
- [ ] Manual test: Multiple users scenario
- [ ] Load testing: 10+ concurrent users
- [ ] Security audit: Review encryption implementation
- [ ] Code review: Peer review di tutto il codice

### Phase 5: Deployment ✅

- [ ] Backup production database
- [ ] Deploy in staging environment
- [ ] Run smoke tests in staging
- [ ] Deploy in production
- [ ] Verify logs: migration + password loading
- [ ] Test login production
- [ ] Monitor error rates per 24h
- [ ] Rollback plan documentato e testato

### Phase 6: Monitoring ✅

- [ ] Setup logging backend (structured logs)
- [ ] Setup logging frontend (console + remote)
- [ ] Configure Prometheus metrics (se disponibile)
- [ ] Configure Grafana dashboard (se disponibile)
- [ ] Setup alerts per decryption failures
- [ ] Setup alerts per JWT refresh failures
- [ ] Setup alerts per silent relogin failures
- [ ] Document monitoring playbook

---

## 🔧 Configuration Reference

### Environment Variables

**Backend `.env`**:
```bash
# Existing
ARCHIBALD_URL=https://4.231.124.90/Archibald
ARCHIBALD_USERNAME=ikiA0930
ARCHIBALD_PASSWORD=Fresis26@
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-change-this  # ⚠️  MUST CHANGE IN PRODUCTION!
JWT_EXPIRY=8h  # Default: 8 hours

# Password Cache Configuration
PASSWORD_CACHE_TTL=24h  # Default: 24 hours (match JWT expiry)

# Browser Pool Configuration
BROWSER_POOL_MAX_SIZE=2  # Max concurrent Puppeteer contexts
BROWSER_POOL_CONTEXT_TIMEOUT=3600000  # 1 hour in ms
```

**Frontend Environment** (if needed):
```bash
VITE_API_URL=https://your-vps.com/api
VITE_ENABLE_LOGGING=true  # Enable console logs in production
```

### Security Hardening

**VPS Firewall** (ufw):
```bash
# Allow only necessary ports
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Rate limiting SSH
sudo ufw limit 22/tcp
```

**File Permissions**:
```bash
# Secure .env file
chmod 600 backend/.env
chown node-user:node-user backend/.env

# Secure database
chmod 600 backend/users.db
chown node-user:node-user backend/users.db

# Secure logs directory
chmod 700 backend/logs
chown node-user:node-user backend/logs
```

**Nginx Configuration** (HTTPS enforcement):
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;  # Force HTTPS
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.3 TLSv1.2;  # Only secure protocols
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 📚 Riferimenti e Risorse

### Security Standards

- **NIST Encryption Guidelines**: https://csrc.nist.gov/publications/fips
- **OWASP Password Storage Cheat Sheet**: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- **AES-GCM Specification**: https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf

### Libraries Documentation

- **Node.js Crypto Module**: https://nodejs.org/api/crypto.html
- **jwt-decode**: https://github.com/auth0/jwt-decode
- **better-sqlite3**: https://github.com/WiseLibs/better-sqlite3

### Testing Resources

- **Vitest Documentation**: https://vitest.dev/
- **Supertest for API Testing**: https://github.com/visionmedia/supertest

---

## 🎯 Success Criteria

Implementation è considerata **successful** quando:

✅ **Funzionalità**:
- Backend restart NON invalida sessioni utenti
- Timeout Archibald gestiti con retry automatico
- JWT refresh automatico prima expiry
- Silent re-login funziona in <5s
- Zero interruzioni UX per utenti

✅ **Sicurezza**:
- Password encrypted at rest con AES-256-GCM
- Auth tag verification funziona
- Tampering detection funziona
- JWT_SECRET non è default value in production
- File permissions corretti (.env chmod 600)

✅ **Reliability**:
- Tutti i test passano (unit + integration)
- Manual test scenarios passano
- Load test con 10+ concurrent users passa
- Logs strutturati e informativi
- Zero errori in production per 24h dopo deploy

✅ **Monitoring**:
- Logs backend catturano tutti gli eventi
- Logs frontend catturano retry/refresh
- Alerts configurati per failure rates
- Dashboard monitoring (se disponibile)

---

## 📝 Note Finali

### Trade-offs Accettati

1. **Password in localStorage**:
   - **Pro**: Silent re-login seamless, UX perfetta
   - **Contro**: Vulnerable se device compromesso + dev tools open
   - **Mitigazione**: User può disabilitare "Ricorda credenziali"

2. **Password encrypted in backend DB**:
   - **Pro**: Automatic recovery dopo restart
   - **Contro**: Se VPS compromesso + JWT_SECRET leak = password decryptabili
   - **Mitigazione**: Key rotation, VPS hardening, monitoring

3. **Retry automatico con exponential backoff**:
   - **Pro**: Resiliente a timeout transient
   - **Contro**: Può ritardare error feedback all'utente (max 20s)
   - **Mitigazione**: Spinner durante retry, timeout totale 20s

### Future Enhancements

Se necessario in futuro, si può implementare:

1. **Hardware Security Module (HSM)**: Encryption key stored in hardware device
2. **Web Crypto API**: Client-side encryption invece di localStorage plaintext
3. **Biometric Authentication**: FaceID/TouchID per unlock credentials
4. **Multi-Factor Authentication (MFA)**: TOTP per login aggiuntivo
5. **Audit Log**: Track tutti gli accessi e operazioni sensibili
6. **Rate Limiting**: Prevent brute force su login endpoint
7. **Captcha**: Su login dopo N failed attempts

---

**Fine del documento**

*Versione 1.0 - 2026-02-03*
*Ultimo aggiornamento: [Data]*
*Stato implementazione: [In Progress / Testing / Completed]*
