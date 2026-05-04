// Set dei userId che hanno una sessione interattiva attiva.
// Usato dal Conductor per evitare race condition: i task che richiedono
// il browser context (refresh-customer, update-customer) devono aspettare
// che la sessione interattiva sia completata prima di acquisire il context.
const activeSessions = new Set<string>();

export const interactiveSessionLocks = {
  acquire: (userId: string): void => { activeSessions.add(userId); },
  release: (userId: string): void => { activeSessions.delete(userId); },
  isActive: (userId: string): boolean => activeSessions.has(userId),
};
