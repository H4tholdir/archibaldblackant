/**
 * Test suite for Product Audit Log and Sync Session tracking
 *
 * Tests:
 * - Sync session creation and lifecycle
 * - Product change tracking (created/updated/deleted)
 * - Field-level change detection
 * - Sync session counters and statistics
 * - Change history retrieval
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProductDatabase } from "./product-db";
import type { Product, SyncSession, ProductChange } from "./product-db";
import fs from "fs";
import path from "path";

describe("Product Audit Log System", () => {
  let db: ProductDatabase;
  let testDbPath: string;

  beforeEach(() => {
    // Create temporary test database
    testDbPath = path.join(__dirname, `../data/test-products-${Date.now()}.db`);
    db = new ProductDatabase(testDbPath);
  });

  afterEach(() => {
    // Clean up test database
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe("Sync Session Management", () => {
    it("should create a new sync session with correct mode", () => {
      const sessionId = db.createSyncSession("full");

      expect(sessionId).toMatch(/^sync-\d+-[a-z0-9]+$/);

      const session = db.getSyncSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.syncType).toBe("products");
      expect(session?.syncMode).toBe("full");
      expect(session?.status).toBe("running");
      expect(session?.startedAt).toBeGreaterThan(0);
      expect(session?.completedAt).toBeNull();
    });

    it("should update sync session progress counters", () => {
      const sessionId = db.createSyncSession("incremental");

      db.updateSyncSession(sessionId, {
        totalPages: 150,
        pagesProcessed: 75,
        itemsProcessed: 2250,
        itemsCreated: 10,
        itemsUpdated: 50,
        imagesDownloaded: 60,
      });

      const session = db.getSyncSession(sessionId);
      expect(session?.totalPages).toBe(150);
      expect(session?.pagesProcessed).toBe(75);
      expect(session?.itemsProcessed).toBe(2250);
      expect(session?.itemsCreated).toBe(10);
      expect(session?.itemsUpdated).toBe(50);
      expect(session?.imagesDownloaded).toBe(60);
    });

    it("should complete sync session successfully", () => {
      const sessionId = db.createSyncSession("full");

      db.completeSyncSession(sessionId, "completed");

      const session = db.getSyncSession(sessionId);
      expect(session?.status).toBe("completed");
      expect(session?.completedAt).toBeGreaterThan(0);
      expect(session?.errorMessage).toBeNull();
    });

    it("should complete sync session with error", () => {
      const sessionId = db.createSyncSession("full");

      db.completeSyncSession(sessionId, "failed", "Network timeout");

      const session = db.getSyncSession(sessionId);
      expect(session?.status).toBe("failed");
      expect(session?.errorMessage).toBe("Network timeout");
    });

    it("should retrieve recent sync sessions in order", () => {
      // Create 3 sessions
      const session1 = db.createSyncSession("full");
      const session2 = db.createSyncSession("incremental");
      const session3 = db.createSyncSession("full");

      const recentSessions = db.getRecentSyncSessions(2);

      expect(recentSessions).toHaveLength(2);
      expect(recentSessions[0].id).toBe(session3); // Most recent first
      expect(recentSessions[1].id).toBe(session2);
    });
  });

  describe("Product Change Tracking", () => {
    it("should track product creation with syncSessionId", () => {
      const sessionId = db.createSyncSession("full");

      const newProduct = {
        id: "TEST001",
        name: "Test Product",
        description: "Test Description",
        groupCode: "GRP001",
      };

      const result = db.upsertProducts([newProduct], sessionId);

      expect(result.inserted).toBe(1);
      expect(result.updated).toBe(0);

      // Check change log
      const changes = db.getProductChangeHistory("TEST001");
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe("created");
      expect(changes[0].syncSessionId).toBe(sessionId);
      expect(changes[0].fieldChanged).toBeNull();
    });

    it("should track field-level changes on update", () => {
      const sessionId1 = db.createSyncSession("full");

      // Create product
      const product = {
        id: "TEST002",
        name: "Original Name",
        description: "Original Description",
        price: 10.5,
      };
      db.upsertProducts([product], sessionId1);

      // Update product
      const sessionId2 = db.createSyncSession("incremental");
      const updatedProduct = {
        id: "TEST002",
        name: "Updated Name",
        description: "Original Description", // Unchanged
        price: 12.0,
      };
      const result = db.upsertProducts([updatedProduct], sessionId2);

      expect(result.updated).toBe(1);

      // Check change log
      const changes = db.getProductChangeHistory("TEST002");

      // Should have: 1 created + 2 field updates (name, price)
      expect(changes.length).toBeGreaterThanOrEqual(2);

      const nameChange = changes.find((c) => c.fieldChanged === "name");
      expect(nameChange).toBeDefined();
      expect(nameChange?.oldValue).toBe("Original Name");
      expect(nameChange?.newValue).toBe("Updated Name");

      const priceChange = changes.find((c) => c.fieldChanged === "price");
      expect(priceChange).toBeDefined();
      expect(priceChange?.oldValue).toBe("10.5");
      expect(priceChange?.newValue).toBe("12");
    });

    it("should not track changes when hash is unchanged", () => {
      const sessionId1 = db.createSyncSession("full");

      const product = {
        id: "TEST003",
        name: "Unchanged Product",
      };
      db.upsertProducts([product], sessionId1);

      const sessionId2 = db.createSyncSession("incremental");
      const result = db.upsertProducts([product], sessionId2);

      expect(result.unchanged).toBe(1);
      expect(result.updated).toBe(0);

      // Should only have creation change
      const changes = db.getProductChangeHistory("TEST003");
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe("created");
    });

    it("should track changes across multiple fields", () => {
      const sessionId1 = db.createSyncSession("full");

      const product = {
        id: "TEST004",
        name: "Product",
        description: "Desc",
        groupCode: "GRP001",
        minQty: 1,
        maxQty: 10,
        price: 5.0,
      };
      db.upsertProducts([product], sessionId1);

      const sessionId2 = db.createSyncSession("incremental");
      const updated = {
        ...product,
        description: "New Desc",
        minQty: 2,
        price: 6.0,
      };
      db.upsertProducts([updated], sessionId2);

      const changes = db.getProductChangeHistory("TEST004");
      const updateChanges = changes.filter((c) => c.changeType === "updated");

      // Should have at least 3 field changes
      expect(updateChanges.length).toBeGreaterThanOrEqual(3);

      const changedFields = updateChanges.map((c) => c.fieldChanged);
      expect(changedFields).toContain("description");
      expect(changedFields).toContain("minQty");
      expect(changedFields).toContain("price");
    });
  });

  describe("Change History Retrieval", () => {
    it("should retrieve changes for a specific product", () => {
      const sessionId = db.createSyncSession("full");

      db.upsertProducts(
        [
          { id: "PROD1", name: "Product 1" },
          { id: "PROD2", name: "Product 2" },
        ],
        sessionId,
      );

      const prod1Changes = db.getProductChangeHistory("PROD1");
      const prod2Changes = db.getProductChangeHistory("PROD2");

      expect(prod1Changes).toHaveLength(1);
      expect(prod2Changes).toHaveLength(1);
      expect(prod1Changes[0].productId).toBe("PROD1");
      expect(prod2Changes[0].productId).toBe("PROD2");
    });

    it("should retrieve all changes for a sync session", () => {
      const sessionId = db.createSyncSession("full");

      db.upsertProducts(
        [
          { id: "PROD1", name: "Product 1" },
          { id: "PROD2", name: "Product 2" },
          { id: "PROD3", name: "Product 3" },
        ],
        sessionId,
      );

      const sessionChanges = db.getChangesForSession(sessionId);

      expect(sessionChanges).toHaveLength(3);
      expect(sessionChanges.every((c) => c.syncSessionId === sessionId)).toBe(
        true,
      );
    });

    it("should limit change history results", async () => {
      const sessionId = db.createSyncSession("full");

      // Create product
      db.upsertProducts([{ id: "PROD1", name: "Product 1" }], sessionId);

      // Update 10 times with delays to ensure different timestamps
      const delay = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      for (let i = 0; i < 10; i++) {
        const updateSession = db.createSyncSession("incremental");
        db.upsertProducts(
          [{ id: "PROD1", name: `Product ${i + 2}` }],
          updateSession,
        );
        await delay(2);
      }

      const limitedChanges = db.getProductChangeHistory("PROD1", 5);
      expect(limitedChanges).toHaveLength(5);

      // Should be most recent first (DESC order)
      expect(limitedChanges[0].changedAt).toBeGreaterThanOrEqual(
        limitedChanges[4].changedAt,
      );
    });
  });

  describe("Image URL Change Detection", () => {
    it("should detect imageUrl changes", () => {
      const sessionId1 = db.createSyncSession("full");

      const product = {
        id: "IMG001",
        name: "Product with Image",
        imageUrl: "/Archibald/image1.jpg",
      };
      db.upsertProducts([product], sessionId1);

      const sessionId2 = db.createSyncSession("incremental");
      const updated = {
        ...product,
        imageUrl: "/Archibald/image2.jpg",
      };
      db.upsertProducts([updated], sessionId2);

      const changes = db.getProductChangeHistory("IMG001");
      const imageChange = changes.find((c) => c.fieldChanged === "imageUrl");

      expect(imageChange).toBeDefined();
      expect(imageChange?.oldValue).toBe("/Archibald/image1.jpg");
      expect(imageChange?.newValue).toBe("/Archibald/image2.jpg");
    });
  });

  describe("Sync Session Counters Integration", () => {
    it("should track cumulative counters across pages", () => {
      const sessionId = db.createSyncSession("full");

      // Page 1
      db.upsertProducts(
        [
          { id: "P1", name: "Product 1" },
          { id: "P2", name: "Product 2" },
        ],
        sessionId,
      );
      db.updateSyncSession(sessionId, {
        pagesProcessed: 1,
        itemsCreated: 2,
      });

      // Page 2
      db.upsertProducts(
        [
          { id: "P3", name: "Product 3" },
          { id: "P1", name: "Product 1 Updated" },
        ],
        sessionId,
      );
      db.updateSyncSession(sessionId, {
        pagesProcessed: 2,
        itemsCreated: 3, // Cumulative: 2 + 1
        itemsUpdated: 1,
      });

      const session = db.getSyncSession(sessionId);
      expect(session?.pagesProcessed).toBe(2);
      expect(session?.itemsCreated).toBe(3);
      expect(session?.itemsUpdated).toBe(1);
    });
  });

  describe("Hash Calculation with Image URL", () => {
    it("should include imageUrl in hash calculation", () => {
      const product1 = {
        id: "HASH001",
        name: "Product",
        imageUrl: "/image1.jpg",
      };

      const product2 = {
        id: "HASH001",
        name: "Product",
        imageUrl: "/image2.jpg",
      };

      const hash1 = ProductDatabase.calculateHash(product1);
      const hash2 = ProductDatabase.calculateHash(product2);

      expect(hash1).not.toBe(hash2);
    });

    it("should detect changes when only imageUrl changes", () => {
      const sessionId1 = db.createSyncSession("full");
      db.upsertProducts(
        [{ id: "HASH002", name: "Product", imageUrl: "/image1.jpg" }],
        sessionId1,
      );

      const sessionId2 = db.createSyncSession("incremental");
      const result = db.upsertProducts(
        [{ id: "HASH002", name: "Product", imageUrl: "/image2.jpg" }],
        sessionId2,
      );

      expect(result.updated).toBe(1);
    });
  });
});
