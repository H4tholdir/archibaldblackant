import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { Subclient } from '../db/repositories/subclients';
import { logger } from '../logger';

const searchSchema = z.object({
  search: z.string().min(1).max(200).optional(),
});

const codiceSchema = z.object({
  codice: z.string().min(1).max(50),
});

const matchSchema = z.object({
  customerProfileId: z.string().min(1),
});

const subclientUpdateSchema = z.object({
  ragioneSociale: z.string().min(1).optional(),
  supplRagioneSociale: z.string().nullable().optional(),
  indirizzo: z.string().nullable().optional(),
  cap: z.string().nullable().optional(),
  localita: z.string().nullable().optional(),
  prov: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  fax: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  partitaIva: z.string().nullable().optional(),
  codFiscale: z.string().nullable().optional(),
  zona: z.string().nullable().optional(),
  persDaContattare: z.string().nullable().optional(),
  emailAmministraz: z.string().nullable().optional(),
  agente: z.string().nullable().optional(),
  agente2: z.string().nullable().optional(),
  settore: z.string().nullable().optional(),
  classe: z.string().nullable().optional(),
  pag: z.string().nullable().optional(),
  listino: z.string().nullable().optional(),
  banca: z.string().nullable().optional(),
  valuta: z.string().nullable().optional(),
  codNazione: z.string().nullable().optional(),
  aliiva: z.string().nullable().optional(),
  contoscar: z.string().nullable().optional(),
  tipofatt: z.string().nullable().optional(),
  telefono2: z.string().nullable().optional(),
  telefono3: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  cbNazione: z.string().nullable().optional(),
  cbBic: z.string().nullable().optional(),
  cbCinUe: z.string().nullable().optional(),
  cbCinIt: z.string().nullable().optional(),
  abicab: z.string().nullable().optional(),
  contocorr: z.string().nullable().optional(),
});

const subclientCreateSchema = subclientUpdateSchema.extend({
  codice: z.string().min(1).max(50),
  ragioneSociale: z.string().min(1),
});

type SubclientsRouterDeps = {
  getAllSubclients: () => Promise<Subclient[]>;
  searchSubclients: (query: string) => Promise<Subclient[]>;
  getHiddenSubclients: () => Promise<Subclient[]>;
  setSubclientHidden: (codice: string, hidden: boolean) => Promise<boolean>;
  getSubclientByCodice: (codice: string) => Promise<Subclient | null>;
  getSubclientByCustomerProfile: (profileId: string) => Promise<Subclient | null>;
  deleteSubclient: (codice: string) => Promise<boolean>;
  setSubclientMatch: (codice: string, customerProfileId: string, confidence: string) => Promise<boolean>;
  clearSubclientMatch: (codice: string) => Promise<boolean>;
  upsertSubclients: (subclients: Subclient[]) => Promise<number>;
};

function createSubclientsRouter(deps: SubclientsRouterDeps) {
  const {
    getAllSubclients, searchSubclients, getHiddenSubclients, setSubclientHidden,
    getSubclientByCodice, getSubclientByCustomerProfile,
    deleteSubclient, setSubclientMatch, clearSubclientMatch, upsertSubclients,
  } = deps;
  const router = Router();

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const parsed = searchSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues });
      }
      const { search } = parsed.data;
      const data = search ? await searchSubclients(search) : await getAllSubclients();
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error fetching subclients', { error });
      res.status(500).json({ success: false, error: 'Errore recupero sottoclienti' });
    }
  });

  router.get('/hidden', async (_req, res) => {
    try {
      const data = await getHiddenSubclients();
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error fetching hidden subclients', { error });
      res.status(500).json({ success: false, error: 'Errore recupero sottoclienti nascosti' });
    }
  });

  router.patch('/:codice/hidden', async (req: AuthRequest, res) => {
    try {
      const parsed = codiceSchema.safeParse(req.params);
      if (!parsed.success) return res.status(400).json({ success: false, error: 'Codice non valido' });
      const hidden = Boolean(req.body?.hidden);
      const updated = await setSubclientHidden(parsed.data.codice, hidden);
      if (!updated) return res.status(404).json({ success: false, error: 'Sottocliente non trovato' });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error setting subclient hidden', { error });
      res.status(500).json({ success: false, error: 'Errore aggiornamento sottocliente' });
    }
  });

  router.get('/:codice', async (req: AuthRequest, res) => {
    try {
      const parsed = codiceSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Codice non valido' });
      }
      const client = await getSubclientByCodice(parsed.data.codice);
      if (!client) {
        return res.status(404).json({ success: false, error: 'Sottocliente non trovato' });
      }
      res.json({ success: true, data: client });
    } catch (error) {
      logger.error('Error fetching subclient', { error });
      res.status(500).json({ success: false, error: 'Errore recupero sottocliente' });
    }
  });

  router.delete('/:codice', async (req: AuthRequest, res) => {
    try {
      const parsed = codiceSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Codice non valido' });
      }
      const deleted = await deleteSubclient(parsed.data.codice);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Sottocliente non trovato' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting subclient', { error });
      res.status(500).json({ success: false, error: 'Errore cancellazione sottocliente' });
    }
  });

  router.post('/:codice/match', async (req: AuthRequest, res) => {
    try {
      const paramsParsed = codiceSchema.safeParse(req.params);
      if (!paramsParsed.success) {
        return res.status(400).json({ success: false, error: 'Codice non valido' });
      }
      const bodyParsed = matchSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        return res.status(400).json({ success: false, error: bodyParsed.error.issues });
      }
      const updated = await setSubclientMatch(
        paramsParsed.data.codice,
        bodyParsed.data.customerProfileId,
        'manual',
      );
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Sottocliente non trovato' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error('Error setting subclient match', { error });
      res.status(500).json({ success: false, error: 'Errore impostazione match' });
    }
  });

  router.delete('/:codice/match', async (req: AuthRequest, res) => {
    try {
      const parsed = codiceSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Codice non valido' });
      }
      const cleared = await clearSubclientMatch(parsed.data.codice);
      if (!cleared) {
        return res.status(404).json({ success: false, error: 'Sottocliente non trovato' });
      }
      res.json({ success: true });
    } catch (error) {
      logger.error('Error clearing subclient match', { error });
      res.status(500).json({ success: false, error: 'Errore rimozione match' });
    }
  });

  router.put('/:codice', async (req: AuthRequest, res) => {
    try {
      const paramsParsed = codiceSchema.safeParse(req.params);
      if (!paramsParsed.success) {
        return res.status(400).json({ success: false, error: 'Codice non valido' });
      }
      const bodyParsed = subclientUpdateSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        return res.status(400).json({ success: false, error: bodyParsed.error.issues });
      }

      const existing = await getSubclientByCodice(paramsParsed.data.codice);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Sottocliente non trovato' });
      }

      const updated: Subclient = { ...existing, ...bodyParsed.data };
      await upsertSubclients([updated]);
      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error('Error updating subclient', { error });
      res.status(500).json({ success: false, error: 'Errore aggiornamento sottocliente' });
    }
  });

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const bodyParsed = subclientCreateSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        return res.status(400).json({ success: false, error: bodyParsed.error.issues });
      }

      const existing = await getSubclientByCodice(bodyParsed.data.codice);
      if (existing) {
        return res.status(409).json({ success: false, error: 'Sottocliente con questo codice esiste già' });
      }

      const newSubclient: Subclient = {
        codice: bodyParsed.data.codice,
        ragioneSociale: bodyParsed.data.ragioneSociale,
        supplRagioneSociale: bodyParsed.data.supplRagioneSociale ?? null,
        indirizzo: bodyParsed.data.indirizzo ?? null,
        cap: bodyParsed.data.cap ?? null,
        localita: bodyParsed.data.localita ?? null,
        prov: bodyParsed.data.prov ?? null,
        telefono: bodyParsed.data.telefono ?? null,
        fax: bodyParsed.data.fax ?? null,
        email: bodyParsed.data.email ?? null,
        partitaIva: bodyParsed.data.partitaIva ?? null,
        codFiscale: bodyParsed.data.codFiscale ?? null,
        zona: bodyParsed.data.zona ?? null,
        persDaContattare: bodyParsed.data.persDaContattare ?? null,
        emailAmministraz: bodyParsed.data.emailAmministraz ?? null,
        agente: bodyParsed.data.agente ?? null,
        agente2: bodyParsed.data.agente2 ?? null,
        settore: bodyParsed.data.settore ?? null,
        classe: bodyParsed.data.classe ?? null,
        pag: bodyParsed.data.pag ?? null,
        listino: bodyParsed.data.listino ?? null,
        banca: bodyParsed.data.banca ?? null,
        valuta: bodyParsed.data.valuta ?? null,
        codNazione: bodyParsed.data.codNazione ?? null,
        aliiva: bodyParsed.data.aliiva ?? null,
        contoscar: bodyParsed.data.contoscar ?? null,
        tipofatt: bodyParsed.data.tipofatt ?? null,
        telefono2: bodyParsed.data.telefono2 ?? null,
        telefono3: bodyParsed.data.telefono3 ?? null,
        url: bodyParsed.data.url ?? null,
        cbNazione: bodyParsed.data.cbNazione ?? null,
        cbBic: bodyParsed.data.cbBic ?? null,
        cbCinUe: bodyParsed.data.cbCinUe ?? null,
        cbCinIt: bodyParsed.data.cbCinIt ?? null,
        abicab: bodyParsed.data.abicab ?? null,
        contocorr: bodyParsed.data.contocorr ?? null,
        matchedCustomerProfileId: null,
        matchConfidence: null,
        arcaSyncedAt: null,
        customerMatchCount: 0,
        subClientMatchCount: 0,
      };

      await upsertSubclients([newSubclient]);
      res.status(201).json({ success: true, data: newSubclient });
    } catch (error) {
      logger.error('Error creating subclient', { error });
      res.status(500).json({ success: false, error: 'Errore creazione sottocliente' });
    }
  });

  router.get('/by-customer/:profileId', async (req, res) => {
    try {
      const subclient = await getSubclientByCustomerProfile(req.params.profileId);
      res.json({ subclient: subclient ?? null });
    } catch {
      res.status(500).json({ error: 'Errore nel recupero del sottocliente' });
    }
  });

  return router;
}

export { createSubclientsRouter, type SubclientsRouterDeps };
