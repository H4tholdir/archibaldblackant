export const FRESIS_CUSTOMER_PROFILE = "55.261";
export const FRESIS_CUSTOMER_PROFILE_LEGACY = "57.213";
export const FRESIS_VAT_NUMBER = "08246131216";
export const FRESIS_DEFAULT_DISCOUNT = 63;

export const isFresis = (
  customer: { id: string; taxCode?: string } | null,
): boolean =>
  customer?.id === FRESIS_CUSTOMER_PROFILE ||
  customer?.id === FRESIS_CUSTOMER_PROFILE_LEGACY ||
  customer?.taxCode === FRESIS_VAT_NUMBER;

export const FRESIS_SUBCLIENT_CODE = "1000";

export const isSubClientFresis = (
  subClient: { codice: string; ragioneSociale: string } | null,
): boolean =>
  subClient?.codice === FRESIS_SUBCLIENT_CODE ||
  subClient?.ragioneSociale.toUpperCase() === "FRESIS";
