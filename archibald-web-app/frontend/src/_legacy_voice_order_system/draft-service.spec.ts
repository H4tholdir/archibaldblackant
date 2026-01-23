import { describe, it, expect, beforeEach } from "vitest";
import { DraftService } from "./draft-service";
import { db } from "../db/schema";
import type { DraftOrder, DraftOrderItem } from "../db/schema";

describe("DraftService", () => {
  let service: DraftService;

  const mockCustomerId = "CUST-001";
  const mockCustomerName = "Test Customer";
  const mockItems: DraftOrderItem[] = [
    {
      productId: "PROD-001",
      productName: "Test Product",
      article: "ART-001",
      variantId: "VAR-001",
      quantity: 5,
      packageContent: "10",
    },
  ];

  beforeEach(async () => {
    service = new DraftService();
    // Clear all drafts before each test
    await db.draftOrders.clear();
  });

  describe("saveDraft", () => {
    it("should save draft with debounce", async () => {
      // Test: save new draft
      await service.saveDraft(mockCustomerId, mockCustomerName, mockItems);

      // Verify: draft was saved to IndexedDB
      const drafts = await db.draftOrders.toArray();
      expect(drafts).toHaveLength(1);
      expect(drafts[0]).toMatchObject({
        customerId: mockCustomerId,
        customerName: mockCustomerName,
        items: mockItems,
      });
      expect(drafts[0].createdAt).toBeDefined();
      expect(drafts[0].updatedAt).toBeDefined();
    });

    it("should update existing draft (upsert)", async () => {
      // Test: save initial draft
      await service.saveDraft(mockCustomerId, mockCustomerName, mockItems);
      const firstDraft = await service.getDraft();
      const firstCreatedAt = firstDraft?.createdAt;
      const firstId = firstDraft?.id;

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Test: save updated draft
      const updatedItems: DraftOrderItem[] = [
        ...mockItems,
        {
          productId: "PROD-002",
          productName: "Another Product",
          article: "ART-002",
          variantId: "VAR-002",
          quantity: 3,
          packageContent: "5",
        },
      ];
      await service.saveDraft(mockCustomerId, mockCustomerName, updatedItems);

      // Verify: only one draft exists (upsert)
      const drafts = await db.draftOrders.toArray();
      expect(drafts).toHaveLength(1);

      // Verify: draft was updated, not replaced
      expect(drafts[0].id).toBe(firstId);
      expect(drafts[0].createdAt).toBe(firstCreatedAt);
      expect(drafts[0].updatedAt).not.toBe(firstCreatedAt);
      expect(drafts[0].items).toHaveLength(2);
    });
  });

  describe("getDraft", () => {
    it("should restore most recent draft", async () => {
      // Test: save a draft
      await service.saveDraft(mockCustomerId, mockCustomerName, mockItems);

      // Test: retrieve draft
      const draft = await service.getDraft();

      // Verify: draft matches saved data
      expect(draft).not.toBeNull();
      expect(draft?.customerId).toBe(mockCustomerId);
      expect(draft?.customerName).toBe(mockCustomerName);
      expect(draft?.items).toEqual(mockItems);
    });

    it("should return null when no draft exists", async () => {
      // Test: retrieve draft when none exists
      const draft = await service.getDraft();

      // Verify: null returned
      expect(draft).toBeNull();
    });

    it("should handle multiple drafts (keep latest)", async () => {
      // Test: manually create multiple drafts (simulate old behavior)
      const oldDraft: DraftOrder = {
        customerId: "OLD-001",
        customerName: "Old Customer",
        items: [],
        createdAt: new Date(Date.now() - 10000).toISOString(),
        updatedAt: new Date(Date.now() - 10000).toISOString(),
      };
      await db.draftOrders.add(oldDraft);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Test: save new draft
      await service.saveDraft(mockCustomerId, mockCustomerName, mockItems);

      // Test: retrieve draft
      const draft = await service.getDraft();

      // Verify: returns most recent draft
      expect(draft?.customerId).toBe(mockCustomerId);
      expect(draft?.customerName).toBe(mockCustomerName);
    });
  });

  describe("clearDraft", () => {
    it("should clear draft after submission", async () => {
      // Test: save a draft
      await service.saveDraft(mockCustomerId, mockCustomerName, mockItems);
      const draftBefore = await service.getDraft();
      expect(draftBefore).not.toBeNull();

      // Test: clear draft
      await service.clearDraft();

      // Verify: draft no longer exists
      const draftAfter = await service.getDraft();
      expect(draftAfter).toBeNull();

      const allDrafts = await db.draftOrders.toArray();
      expect(allDrafts).toHaveLength(0);
    });
  });
});
