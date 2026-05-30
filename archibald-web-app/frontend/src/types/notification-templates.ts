export type NotificationTemplate = {
  id?: number;
  customer_erp_id?: string | null;
  event_type: 'overdue_step' | 'new_invoice' | 'pre_due' | 'periodic_statement';
  tone: 'cordiale' | 'formale' | 'urgente';
  channel: 'email' | 'whatsapp';
  subject_tmpl: string | null;
  body_tmpl: string;
};
