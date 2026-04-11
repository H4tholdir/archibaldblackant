import { fetchWithRetry } from '../utils/fetch-with-retry';
import type { UserRole } from './auth';

export type { UserRole };

export type ModuleDefault = {
  module_name: string;
  role: UserRole;
  enabled: boolean;
};

export type ModuleUserOverride = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  modulesGranted: string[];
  modulesRevoked: string[];
};

export async function getModuleDefaults(): Promise<ModuleDefault[]> {
  const res = await fetchWithRetry('/api/admin/module-defaults');
  const data = await res.json();
  return data.defaults ?? [];
}

export async function updateModuleDefault(
  module_name: string,
  role: UserRole,
  enabled: boolean,
): Promise<void> {
  await fetchWithRetry('/api/admin/module-defaults', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ module_name, role, enabled }),
  });
}

export async function updateUserModules(
  userId: string,
  modulesGranted: string[],
  modulesRevoked: string[],
): Promise<void> {
  await fetchWithRetry(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modules_granted: modulesGranted, modules_revoked: modulesRevoked }),
  });
}
