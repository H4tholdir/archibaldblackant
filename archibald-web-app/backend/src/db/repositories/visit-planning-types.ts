import type { DbPool } from '../pool';

// ── Branded IDs ──────────────────────────────────────────────────────────
type Brand<T, B> = T & { __brand: B };
export type VisitPlanningSessionId = Brand<string, 'VisitPlanningSessionId'>;
export type VisitPlanningStopId    = Brand<string, 'VisitPlanningStopId'>;
export type VisitLogId             = Brand<string, 'VisitLogId'>;

// ── Enums ────────────────────────────────────────────────────────────────
export type VisitHorizon  = 'day' | 'week';
export type VisitMode     = 'balanced' | 'profitability' | 'coverage' | 'constrained' | 'manual_assist';
export type VisitStatus   = 'draft' | 'planned' | 'in_progress' | 'completed' | 'cancelled';
export type StopStatus    = 'suggested' | 'to_call' | 'confirmed' | 'planned' | 'backup' | 'visited' | 'skipped' | 'removed';
export type CustomerSourceType = 'archibald' | 'arca';
export type GeoQuality    = 'unknown' | 'erp_unverified' | 'geocoded' | 'manually_confirmed' | 'failed';
export type HolidayConfidence = 'verified' | 'dataset' | 'manual';
export type VisitOutcome  = 'visited' | 'order_created' | 'no_order' | 'closed' | 'not_available' | 'phone_order' | 'rescheduled';

// ── Domain types ─────────────────────────────────────────────────────────
export type VisitPlanningSession = {
  id:                  VisitPlanningSessionId;
  userId:              string;
  title:               string;
  horizon:             VisitHorizon;
  mode:                VisitMode;
  status:              VisitStatus;
  startDate:           string; // YYYY-MM-DD
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
  activeStopId:        VisitPlanningStopId | null;
  generatedAt:         string | null;
  createdAt:           string;
  updatedAt:           string;
};

export type VisitPlanningStop = {
  id:                        VisitPlanningStopId;
  sessionId:                 VisitPlanningSessionId;
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

export type CustomerGeoStatus = {
  userId:               string;
  sourceType:           CustomerSourceType;
  sourceId:             string;
  lat:                  number | null;
  lng:                  number | null;
  normalizedAddress:    string | null;
  quality:              GeoQuality;
  provider:             string | null;
  geocodedAt:           string | null;
  manuallyConfirmedAt:  string | null;
  createdAt:            string;
  updatedAt:            string;
};

export type MunicipalHoliday = {
  id:           number;
  comune:       string;
  provincia:    string;
  regione:      string | null;
  dateMonth:    number;
  dateDay:      number;
  holidayName:  string;
  confidence:   HolidayConfidence;
  source:       string | null;
};

export type CustomerVisitPreference = {
  userId:               string;
  sourceType:           CustomerSourceType;
  sourceId:             string;
  typicalVisitMinutes:  number;
  preferredDays:        number[];
  avoidDays:            number[];
  preferredTimeStart:   string | null;
  preferredTimeEnd:     string | null;
  requiresAppointment:  boolean;
  notes:                string | null;
};

// ── Score types ──────────────────────────────────────────────────────────
export type ScoreBreakdown = {
  valore:          number;
  riordino:        number;
  urgenza:         number;
  zona:            number;
  crossSell:       number;
  promozioni:      number;
  rischioClosure:  number;
  penalitaDati:    number;
  total:           number;
};

// ── Customer profile (unified view) ─────────────────────────────────────
export type CustomerProfile = {
  sourceType:   CustomerSourceType;
  sourceId:     string;
  displayName:  string;
  street:       string | null;
  postalCode:   string | null;
  city:         string | null;
  province:     string | null;
  phone:        string | null;
  email:        string | null;
  vatNumber:    string | null;
  lat:          number | null;
  lng:          number | null;
  geoQuality:   GeoQuality;
  isDistributor: boolean;
  matchedSources: Array<{ type: CustomerSourceType; id: string; name: string }>;
};

export type { DbPool };
