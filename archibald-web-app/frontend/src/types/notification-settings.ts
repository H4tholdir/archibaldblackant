export type EscalationStep = {
  days_after_due: number;
  tone: 'cordiale' | 'formale' | 'urgente';
  channels: ('email' | 'whatsapp')[];
};

export type NotificationProfile = {
  id: number;
  name: string;
  isDefault: boolean;
  steps: EscalationStep[];
};

export type NotificationSettings = {
  id?: string;
  enabled: boolean;
  profileId: number | null;
  overrideSteps: EscalationStep[] | null;
  emailOverride: string | null;
  whatsappOverride: string | null;
  notifyNewInvoice: boolean;
  notifyPreDue: boolean;
  preDueDays: number;
  periodicStatementEnabled: boolean;
  periodicStatementDays: number;
  periodicStatementContent: Record<string, boolean>;
  effectiveEmail: string | null;
  effectiveWhatsapp: string | null;
};

export type AgentNotificationProfile = {
  notification_display_name: string | null;
  notification_reply_to_email: string | null;
  notification_phone: string | null;
  notification_title: string | null;
};
