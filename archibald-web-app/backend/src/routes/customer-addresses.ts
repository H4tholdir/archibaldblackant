import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { DbPool } from '../db/pool';
import {
  getAddressesByCustomer,
  addAddress,
  updateAddress,
  deleteAddress,
} from '../db/repositories/customer-addresses';

const addressBodySchema = z.object({
  tipo: z.string().min(1, 'tipo obbligatorio'),
  nome: z.string().optional().nullable(),
  via: z.string().optional().nullable(),
  cap: z.string().optional().nullable(),
  citta: z.string().optional().nullable(),
  contea: z.string().optional().nullable(),
  stato: z.string().optional().nullable(),
  idRegione: z.string().optional().nullable(),
  contra: z.string().optional().nullable(),
});

function createCustomerAddressesRouter(pool: DbPool): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { customerProfile } = req.params;
      const addresses = await getAddressesByCustomer(pool, userId, customerProfile);
      res.json(addresses);
    } catch (error) {
      res.status(500).json({ success: false, error: 'Errore recupero indirizzi' });
    }
  });

  router.post('/', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { customerProfile } = req.params;
      const parsed = addressBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      }
      const address = await addAddress(pool, userId, customerProfile, {
        tipo: parsed.data.tipo,
        nome: parsed.data.nome ?? null,
        via: parsed.data.via ?? null,
        cap: parsed.data.cap ?? null,
        citta: parsed.data.citta ?? null,
        contea: parsed.data.contea ?? null,
        stato: parsed.data.stato ?? null,
        idRegione: parsed.data.idRegione ?? null,
        contra: parsed.data.contra ?? null,
      });
      res.status(201).json(address);
    } catch (error) {
      res.status(500).json({ success: false, error: 'Errore creazione indirizzo' });
    }
  });

  router.put('/:id', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = parseInt(req.params.id, 10);
      const parsed = addressBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
      }
      const updated = await updateAddress(pool, userId, id, {
        tipo: parsed.data.tipo,
        nome: parsed.data.nome ?? null,
        via: parsed.data.via ?? null,
        cap: parsed.data.cap ?? null,
        citta: parsed.data.citta ?? null,
        contea: parsed.data.contea ?? null,
        stato: parsed.data.stato ?? null,
        idRegione: parsed.data.idRegione ?? null,
        contra: parsed.data.contra ?? null,
      });
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Indirizzo non trovato' });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ success: false, error: 'Errore aggiornamento indirizzo' });
    }
  });

  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = parseInt(req.params.id, 10);
      const deleted = await deleteAddress(pool, userId, id);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Indirizzo non trovato' });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ success: false, error: 'Errore eliminazione indirizzo' });
    }
  });

  return router;
}

export { createCustomerAddressesRouter };
