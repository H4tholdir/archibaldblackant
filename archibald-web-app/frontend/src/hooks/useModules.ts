import { useState, useEffect } from 'react';

function readModulesFromJWT(): string[] {
  try {
    const token = localStorage.getItem('archibald_jwt');
    if (!token) return [];
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return [];
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    return Array.isArray(payload.modules) ? payload.modules : [];
  } catch {
    return [];
  }
}

export function useModules() {
  const [modules, setModules] = useState<string[]>(readModulesFromJWT);

  useEffect(() => {
    const handler = () => setModules(readModulesFromJWT());
    // 'storage' fires when other tabs change localStorage; 'archibald-jwt-refreshed'
    // fires in the same tab when jwt-refresh-service saves a new token.
    window.addEventListener('storage', handler);
    window.addEventListener('archibald-jwt-refreshed', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('archibald-jwt-refreshed', handler);
    };
  }, []);

  return {
    hasModule: (name: string): boolean => modules.includes(name),
  };
}
