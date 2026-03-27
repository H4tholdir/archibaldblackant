export type AddressEntry = {
  tipo: string;
  nome?: string;
  via?: string;
  cap?: string;
  citta?: string;
  contea?: string;
  stato?: string;
  idRegione?: string;
  contra?: string;
};

export type CustomerFormData = {
  name: string;
  deliveryMode: string;
  vatNumber: string;
  paymentTerms: string;
  pec: string;
  sdi: string;
  street: string;
  postalCode: string;
  phone: string;
  mobile: string;
  email: string;
  url: string;
  postalCodeCity: string;
  postalCodeCountry: string;
  // Extended ERP fields (wizard v2)
  fiscalCode?: string;
  sector?: string;
  attentionTo?: string;
  notes?: string;
  county?: string;
  state?: string;
  country?: string;
  addresses?: AddressEntry[];
};
