export interface Customer {
  id: string;
  name: string;
  code: string;
  taxCode: string;
  address: string;
  city: string;
  province: string;
  cap: string;
  phone: string;
  email: string;
  fax: string;
  lastModified: string;
  lastOrderDate?: string;
  hash: string;
  photo?: string;
}
