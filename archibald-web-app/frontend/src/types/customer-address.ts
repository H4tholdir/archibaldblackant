type CustomerAddress = {
  id: number;
  customerProfile: string;
  tipo: string;
  nome: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  contea: string | null;
  stato: string | null;
  idRegione: string | null;
  contra: string | null;
};

export type { CustomerAddress };
