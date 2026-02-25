/**
 * Script per preparare utente di test con password encrypted
 * Permette testing autonomo del lazy-load senza Puppeteer
 */

import { PasswordEncryptionService } from "../services/password-encryption-service";
import { createPool } from "../db/pool";
import { getUserByUsername, saveEncryptedPassword } from "../db/repositories/users";
import { config } from "../config";

async function prepareTestUser() {
  const pool = createPool(config.database);

  try {
    console.log("Preparazione utente di test...\n");

    const username = "ikiA0930";
    const user = await getUserByUsername(pool, username);

    if (!user) {
      console.error(`Utente ${username} non trovato nel DB`);
      process.exit(1);
    }

    console.log(`Utente trovato: ${user.username} (${user.fullName})`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Role: ${user.role}`);

    const realPassword = process.env.ARCHIBALD_PASSWORD || "test123";
    const encryptionService = new PasswordEncryptionService();
    const encrypted = encryptionService.encrypt(realPassword, user.id);

    console.log(`\nPassword encrypted con AES-256-GCM`);
    console.log(`   Password: ${"*".repeat(realPassword.length)} (masked)`);
    console.log(`   Ciphertext: ${encrypted.ciphertext.substring(0, 20)}...`);
    console.log(`   IV: ${encrypted.iv}`);
    console.log(`   Auth Tag: ${encrypted.authTag}`);

    await saveEncryptedPassword(pool, user.id, {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      version: encrypted.version,
    });

    console.log(`\nPassword salvata nel DB per ${username}`);
    console.log(`\nCredenziali configurate:`);
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${"*".repeat(realPassword.length)} (from .env)`);
    console.log(`\nPuoi ora testare il sistema con le credenziali dal .env!`);
    console.log(`   curl -X POST http://localhost:3001/api/auth/login \\`);
    console.log(`        -H "Content-Type: application/json" \\`);
    console.log(`        -d '{"username":"${username}","password":"***"}'`);
  } catch (error) {
    console.error("Errore durante preparazione:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

prepareTestUser();
