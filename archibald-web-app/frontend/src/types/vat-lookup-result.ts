export type VatAddressInfo = {
  companyName: string;
  street: string;
  postalCode: string;
  city: string;
  vatStatus: string;
  internalId: string;
};

export type VatLookupResult = {
  lastVatCheck: string;
  vatValidated: string;
  vatAddress: string;
  parsed: VatAddressInfo;
  pec: string;
  sdi: string;
};
