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
  const modules = readModulesFromJWT();
  return {
    hasModule: (name: string): boolean => modules.includes(name),
  };
}
