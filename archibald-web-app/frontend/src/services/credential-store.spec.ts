import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { CredentialStore } from "./credential-store";

describe("CredentialStore", () => {
  let store: CredentialStore;

  beforeEach(async () => {
    // Use very few iterations for fast tests (100 instead of 100000)
    store = new CredentialStore(100);
    await store.initialize();
  });

  afterEach(() => {
    // Close the database connection before cleanup
    if (store) {
      store.close();
    }
    // Clean up IndexedDB after each test
    indexedDB.deleteDatabase("ArchibaldCredentials");
  });

  describe("initialize", () => {
    test("creates IndexedDB database successfully", async () => {
      const newStore = new CredentialStore(100);
      await newStore.initialize();

      // Verify database exists by trying to use it
      const hasCredentials = await newStore.hasCredentials("test-user");
      expect(hasCredentials).toBe(false);
    });
  });

  describe("hasCredentials", () => {
    test("returns false when no credentials stored", async () => {
      const userId = "user-no-creds";
      const hasCredentials = await store.hasCredentials(userId);
      expect(hasCredentials).toBe(false);
    });

    test("returns true when credentials exist for userId", async () => {
      const userId = "user-with-creds";
      await store.storeCredentials(userId, "testuser", "testpass", "123456");

      const hasCredentials = await store.hasCredentials(userId);
      expect(hasCredentials).toBe(true);
    });
  });

  describe("storeCredentials", () => {
    test("encrypts and stores credentials with valid PIN", async () => {
      const userId = "user1";
      const username = "testuser";
      const password = "testpass";
      const pin = "123456";

      await store.storeCredentials(userId, username, password, pin);

      // Verify credentials exist
      const hasCredentials = await store.hasCredentials(userId);
      expect(hasCredentials).toBe(true);

      // Verify we can retrieve them with correct PIN
      const retrieved = await store.getCredentials(userId, pin);
      expect(retrieved).toEqual({ username, password });
    });

    test("stores credentials for different users independently", async () => {
      const user1Id = "user1";
      const user2Id = "user2";

      await store.storeCredentials(user1Id, "user1name", "user1pass", "111111");
      await store.storeCredentials(user2Id, "user2name", "user2pass", "222222");

      // Verify each user's credentials are independent
      const user1Creds = await store.getCredentials(user1Id, "111111");
      const user2Creds = await store.getCredentials(user2Id, "222222");

      expect(user1Creds).toEqual({
        username: "user1name",
        password: "user1pass",
      });
      expect(user2Creds).toEqual({
        username: "user2name",
        password: "user2pass",
      });

      // Verify wrong PIN doesn't work cross-user
      const wrongCreds = await store.getCredentials(user1Id, "222222");
      expect(wrongCreds).toBe(null);
    });

    test("overwrites existing credentials when storing again", async () => {
      const userId = "user-overwrite";

      // Store initial credentials
      await store.storeCredentials(userId, "olduser", "oldpass", "123456");

      // Store new credentials (same PIN)
      await store.storeCredentials(userId, "newuser", "newpass", "123456");

      // Retrieve should get new credentials
      const creds = await store.getCredentials(userId, "123456");
      expect(creds).toEqual({ username: "newuser", password: "newpass" });
    });
  });

  describe("getCredentials", () => {
    test("decrypts credentials with correct PIN", async () => {
      const userId = "user1";
      const username = "testuser";
      const password = "testpass";
      const pin = "123456";

      await store.storeCredentials(userId, username, password, pin);

      const creds = await store.getCredentials(userId, pin);
      expect(creds).toEqual({ username, password });
    });

    test("returns null with incorrect PIN", async () => {
      const userId = "user1";
      await store.storeCredentials(userId, "testuser", "testpass", "123456");

      const creds = await store.getCredentials(userId, "999999");
      expect(creds).toBe(null);
    });

    test("returns null for non-existent userId", async () => {
      const creds = await store.getCredentials("nonexistent", "123456");
      expect(creds).toBe(null);
    });
  });

  describe("deleteCredentials", () => {
    test("removes credentials from storage", async () => {
      const userId = "user1";
      await store.storeCredentials(userId, "testuser", "testpass", "123456");

      // Verify credentials exist
      const hasBefore = await store.hasCredentials(userId);
      expect(hasBefore).toBe(true);

      // Delete credentials
      await store.deleteCredentials(userId);

      // Verify credentials are gone
      const hasAfter = await store.hasCredentials(userId);
      expect(hasAfter).toBe(false);
    });

    test("succeeds silently when deleting non-existent credentials", async () => {
      const userId = "nonexistent";

      // Should not throw
      await expect(store.deleteCredentials(userId)).resolves.toBeUndefined();
    });
  });

  describe("touchCredentials", () => {
    test("succeeds silently when touching non-existent credentials", async () => {
      const userId = "nonexistent";

      // Should not throw
      await expect(store.touchCredentials(userId)).resolves.toBeUndefined();
    });
  });

  describe("security", () => {
    test("credentials cannot be decrypted with wrong PIN", async () => {
      const userId = "user-security";
      const username = "testuser";
      const password = "testpass";
      const correctPIN = "123456";
      const wrongPIN = "654321";

      await store.storeCredentials(userId, username, password, correctPIN);

      // Correct PIN works
      const correctCreds = await store.getCredentials(userId, correctPIN);
      expect(correctCreds).toEqual({ username, password });

      // Wrong PIN fails
      const wrongCreds = await store.getCredentials(userId, wrongPIN);
      expect(wrongCreds).toBe(null);
    });

    test("different PINs produce different encryption keys", async () => {
      const userId = "user-pin-test";

      // Store with first PIN
      await store.storeCredentials(userId, "user1", "pass1", "111111");

      // Try to retrieve with different PIN - should fail
      const wrongPINResult = await store.getCredentials(userId, "222222");
      expect(wrongPINResult).toBe(null);

      // Correct PIN should work
      const correctPINResult = await store.getCredentials(userId, "111111");
      expect(correctPINResult).toEqual({
        username: "user1",
        password: "pass1",
      });
    });
  });
});
