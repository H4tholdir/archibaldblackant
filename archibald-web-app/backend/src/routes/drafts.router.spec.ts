import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDraftsRouter } from './drafts.router';

const mockGetDraftByUserId = vi.fn();
const mockCreateDraft = vi.fn();
const mockDeleteDraftByUserId = vi.fn();
const mockBroadcast = vi.fn();

vi.mock('../db/repositories/order-drafts.repo', () => ({
  getDraftByUserId: (...args: unknown[]) => mockGetDraftByUserId(...args),
  createDraft: (...args: unknown[]) => mockCreateDraft(...args),
  deleteDraftByUserId: (...args: unknown[]) => mockDeleteDraftByUserId(...args),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: 'user-test-123' };
    next();
  });
  app.use('/api/drafts', createDraftsRouter({ pool: {} as any, broadcast: mockBroadcast }));
  return app;
}

describe('GET /api/drafts/active', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns null draft when none exists', async () => {
    mockGetDraftByUserId.mockResolvedValue(null);
    const res = await request(buildApp()).get('/api/drafts/active');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ draft: null });
    expect(mockGetDraftByUserId).toHaveBeenCalledWith(expect.anything(), 'user-test-123');
  });

  it('returns existing draft', async () => {
    const fakeDraft = { id: 'draft-1', userId: 'user-test-123', payload: { items: [] }, createdAt: '2026-04-17T00:00:00Z', updatedAt: '2026-04-17T00:00:00Z' };
    mockGetDraftByUserId.mockResolvedValue(fakeDraft);
    const res = await request(buildApp()).get('/api/drafts/active');
    expect(res.status).toBe(200);
    expect(res.body.draft.id).toBe('draft-1');
  });
});

describe('POST /api/drafts', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates a draft with provided payload', async () => {
    const newDraft = { id: 'draft-new', userId: 'user-test-123', payload: { items: [], notes: '' }, createdAt: '2026-04-17T00:00:00Z', updatedAt: '2026-04-17T00:00:00Z' };
    mockCreateDraft.mockResolvedValue(newDraft);
    const res = await request(buildApp())
      .post('/api/drafts')
      .send({ payload: { items: [], notes: '' } });
    expect(res.status).toBe(201);
    expect(res.body.draft.id).toBe('draft-new');
    expect(mockCreateDraft).toHaveBeenCalledWith(expect.anything(), 'user-test-123', { items: [], notes: '' });
  });

  it('creates draft with empty payload if none provided', async () => {
    const newDraft = { id: 'draft-empty', userId: 'user-test-123', payload: {}, createdAt: '2026-04-17T00:00:00Z', updatedAt: '2026-04-17T00:00:00Z' };
    mockCreateDraft.mockResolvedValue(newDraft);
    const res = await request(buildApp()).post('/api/drafts').send({});
    expect(res.status).toBe(201);
    expect(mockCreateDraft).toHaveBeenCalledWith(expect.anything(), 'user-test-123', {});
  });
});

describe('DELETE /api/drafts/active', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('deletes draft and returns 204', async () => {
    mockDeleteDraftByUserId.mockResolvedValue(undefined);
    const res = await request(buildApp()).delete('/api/drafts/active');
    expect(res.status).toBe(204);
    expect(mockDeleteDraftByUserId).toHaveBeenCalledWith(expect.anything(), 'user-test-123');
  });

  it('broadcasts draft:submitted when ?submitted=true', async () => {
    mockDeleteDraftByUserId.mockResolvedValue(undefined);
    const res = await request(buildApp()).delete('/api/drafts/active?submitted=true');
    expect(res.status).toBe(204);
    expect(mockBroadcast).toHaveBeenCalledWith('user-test-123', expect.objectContaining({ type: 'draft:submitted' }));
  });

  it('does NOT broadcast when ?submitted is absent', async () => {
    mockDeleteDraftByUserId.mockResolvedValue(undefined);
    await request(buildApp()).delete('/api/drafts/active');
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});
