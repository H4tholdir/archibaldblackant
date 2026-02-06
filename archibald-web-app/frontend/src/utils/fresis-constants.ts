export const FRESIS_CUSTOMER_PROFILE = "57.213";
export const FRESIS_VAT_NUMBER = "08246131216";
export const FRESIS_DEFAULT_DISCOUNT = 63;

export const isFresis = (customer: { id: string } | null): boolean =>
  customer?.id === FRESIS_CUSTOMER_PROFILE;
