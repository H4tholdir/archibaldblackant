export type VisitHorizon  = 'day' | 'week';
export type VisitMode     = 'balanced' | 'profitability' | 'coverage' | 'constrained' | 'manual_assist';
export type VisitStatus   = 'draft' | 'planned' | 'in_progress' | 'completed' | 'cancelled';
export type StopStatus    = 'suggested' | 'to_call' | 'confirmed' | 'planned' | 'backup' | 'visited' | 'skipped' | 'removed';
export type CustomerSourceType = 'archibald' | 'arca';
export type GeoQuality    = 'unknown' | 'erp_unverified' | 'geocoded' | 'manually_confirmed' | 'failed';
export type VisitOutcome  = 'visited' | 'order_created' | 'no_order' | 'closed' | 'not_available' | 'phone_order' | 'rescheduled';

export type VisitPlanningSession = {
  id:                  string;
  userId:              string;
  title:               string;
  horizon:             VisitHorizon;
  mode:                VisitMode;
  status:              VisitStatus;
  startDate:           string;
  endDate:             string;
  startLocationLabel:  string | null;
  startLat:            number | null;
  startLng:            number | null;
  endLocationLabel:    string | null;
  endLat:              number | null;
  endLng:              number | null;
  constraintsJson:     Record<string, unknown>;
  metricsJson:         Record<string, unknown>;
  navigationStartedAt: string | null;
  activeStopId:        string | null;
  generatedAt:         string | null;
  createdAt:           string;
  updatedAt:           string;
};

export type VisitPlanningStop = {
  id:                        string;
  sessionId:                 string;
  userId:                    string;
  sourceType:                CustomerSourceType;
  sourceId:                  string;
  displayName:               string;
  appointmentId:             string | null;
  stopDate:                  string;
  sequence:                  number | null;
  status:                    StopStatus;
  locked:                    boolean;
  estimatedArrival:          string | null;
  estimatedDeparture:        string | null;
  visitMinutes:              number;
  travelMinutesFromPrevious: number | null;
  distanceKmFromPrevious:    number | null;
  scoreTotal:                number | null;
  scoreBreakdownJson:        Record<string, number>;
  recommendationReasons:     string[];
  alerts:                    string[];
  manualNote:                string | null;
  skipReason:                string | null;
  visitedAt:                 string | null;
  createdAt:                 string;
  updatedAt:                 string;
};

export type VisitBriefOrder = {
  docRef:           string;
  date:             string;
  amountImponibile: number;
  source:           'archibald' | 'fresis';
  items:            Array<{ code: string; description: string; qty: number }>;
};

export type VisitBriefPromotion = {
  id: string; name: string; tagline: string | null; validTo: string;
};

export type VisitBriefReminder = {
  id: number; note: string | null; dueAt: string;
};

export type VisitBrief = {
  sourceType:          CustomerSourceType;
  sourceId:            string;
  displayName:         string;
  street:              string | null;
  postalCode:          string | null;
  city:                string | null;
  phone:               string | null;
  email:               string | null;
  lat:                 number | null;
  lng:                 number | null;
  geoQuality:          GeoQuality;
  isDistributor:       boolean;
  matchedSources:      Array<{ type: CustomerSourceType; id: string; name: string }>;
  lastOrders:          VisitBriefOrder[];
  reorderCycleDays:    number | null;
  daysSinceLastOrder:  number | null;
  reorderProbability:  'high' | 'medium' | 'low' | 'unknown';
  suggestedCategories: string[];
  activePromotions:    VisitBriefPromotion[];
  openReminders:       VisitBriefReminder[];
};

export type CreateSessionInput = {
  title:            string;
  horizon:          VisitHorizon;
  mode:             VisitMode;
  startDate:        string;
  endDate:          string;
  startLocationLabel?: string | null;
  startLat?:        number | null;
  startLng?:        number | null;
  endLocationLabel?: string | null;
  endLat?:          number | null;
  endLng?:          number | null;
  constraintsJson?: Record<string, unknown>;
};

export const VISIT_MODE_LABELS: Record<VisitMode, string> = {
  balanced:      'Bilanciato',
  profitability: 'Redditività',
  coverage:      'Copertura',
  constrained:   'Vincolato',
  manual_assist: 'Manuale',
};

export const STOP_STATUS_LABELS: Record<StopStatus, string> = {
  suggested: 'Suggerito',
  to_call:   'Da chiamare',
  confirmed: 'Confermato',
  planned:   'Pianificato',
  backup:    'Backup',
  visited:   'Visitato',
  skipped:   'Saltato',
  removed:   'Rimosso',
};

export const STOP_STATUS_COLORS: Record<StopStatus, string> = {
  suggested: '#94a3b8',
  to_call:   '#f59e0b',
  confirmed: '#2563eb',
  planned:   '#6366f1',
  backup:    '#64748b',
  visited:   '#16a34a',
  skipped:   '#ef4444',
  removed:   '#e5e7eb',
};

export const SOURCE_BADGE: Record<CustomerSourceType, string> = {
  archibald: 'A',
  arca:      'F',
};
