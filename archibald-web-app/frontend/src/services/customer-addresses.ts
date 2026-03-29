import type { CustomerAddress } from '../types/customer-address';
import type { AddressEntry } from '../types/customer-form-data';
import { fetchWithRetry } from '../utils/fetch-with-retry';

async function getCustomerAddresses(erpId: string): Promise<CustomerAddress[]> {
  const response = await fetchWithRetry(
    `/api/customers/${encodeURIComponent(erpId)}/addresses`,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function addCustomerAddress(
  erpId: string,
  address: AddressEntry,
): Promise<CustomerAddress> {
  const response = await fetchWithRetry(
    `/api/customers/${encodeURIComponent(erpId)}/addresses`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(address),
    },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function updateCustomerAddress(
  erpId: string,
  id: number,
  address: AddressEntry,
): Promise<CustomerAddress> {
  const response = await fetchWithRetry(
    `/api/customers/${encodeURIComponent(erpId)}/addresses/${id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(address),
    },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function deleteCustomerAddress(erpId: string, id: number): Promise<void> {
  const response = await fetchWithRetry(
    `/api/customers/${encodeURIComponent(erpId)}/addresses/${id}`,
    { method: 'DELETE' },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export { getCustomerAddresses, addCustomerAddress, updateCustomerAddress, deleteCustomerAddress };
