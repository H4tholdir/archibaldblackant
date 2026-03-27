export type DeliveryMode = { value: string; label: string };

// Source: Archibald ERP DLVMODE dropdown — certified 2026-03-27
export const DELIVERY_MODES: DeliveryMode[] = [
  { value: '', label: 'N/A' },
  { value: 'Airenterprise', label: 'Airenterprise' },
  { value: 'Destinatario', label: 'Destinatario' },
  { value: 'FedEx', label: 'FedEx' },
  { value: 'General Logistic Systems Spa', label: 'GLS' },
  { value: 'Mittente', label: 'Mittente' },
  { value: 'Mototaxi', label: 'Mototaxi' },
  { value: 'Poste Italiane', label: 'Poste Italiane' },
  { value: 'UPS - International Express Saver', label: 'UPS International' },
  { value: 'UPS Italia', label: 'UPS Italia' },
];

export const DEFAULT_DELIVERY_MODE = 'FedEx';
