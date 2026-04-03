import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import type { CustomerSnapshot } from '../../types';
import { logger } from '../../logger';

type CreateCustomerData = {
  erpId?: string;
  name: string;
  vatNumber?: string;
  pec?: string;
  sdi?: string;
  street?: string;
  postalCode?: string;
  postalCodeCity?: string;
  postalCodeCountry?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  url?: string;
  deliveryMode?: string;
  paymentTerms?: string;
  lineDiscount?: string;
  fiscalCode?: string;
  sector?: string;
  attentionTo?: string;
  notes?: string;
  county?: string;
  state?: string;
  country?: string;
  addresses?: { tipo: string; nome?: string; via?: string; cap?: string; citta?: string; contea?: string; stato?: string; idRegione?: string; contra?: string }[];
};


type CreateCustomerBot = {
  createCustomer: (customerData: CreateCustomerData) => Promise<string>;
  buildCustomerSnapshot: (erpId: string) => Promise<CustomerSnapshot>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

async function handleCreateCustomer(
  pool: DbPool,
  bot: CreateCustomerBot,
  data: CreateCustomerData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ erpId: string }> {
  logger.info('handleCreateCustomer: BullMQ handler deprecated — use interactive route instead', {
    userId,
    customerName: data.name,
  });

  onProgress(100, 'Handler deprecated — use interactive route /customer/save');

  return { erpId: 'STUB' };
}

function createCreateCustomerHandler(pool: DbPool, createBot: (userId: string) => CreateCustomerBot): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as CreateCustomerData;
    const result = await handleCreateCustomer(pool, bot, typedData, userId, onProgress);
    return result as unknown as Record<string, unknown>;
  };
}

export { handleCreateCustomer, createCreateCustomerHandler, type CreateCustomerData, type CreateCustomerBot };
