import { logger } from '../../logger';

type FedExScanEvent = {
  date: string;
  time: string;
  gmtOffset: string;
  status: string;
  statusCD: string;
  scanLocation: string;
  delivered: boolean;
  exception: boolean;
  exceptionDescription: string;
  exceptionCode: string;
};

type FedExTrackingResult = {
  trackingNumber: string;
  success: boolean;
  error?: string;
  keyStatus?: string;
  keyStatusCD?: string;
  statusBarCD?: string;
  lastScanStatus?: string;
  lastScanDateTime?: string;
  lastScanLocation?: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  receivedByName?: string;
  origin?: string;
  destination?: string;
  serviceDesc?: string;
  scanEvents?: FedExScanEvent[];
  delayReason?: string;
  deliveryAttempts?: number;
  attemptedDeliveryAt?: string;
};

type FedExOAuthToken = {
  accessToken: string;
  expiresAt: number;
};

let cachedToken: FedExOAuthToken | null = null;

async function getAccessToken(apiKey: string, secretKey: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const response = await fetch('https://apis.fedex.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FedEx OAuth failed: HTTP ${response.status} - ${text}`);
  }

  const json = (await response.json()) as { access_token: string; expires_in: number };

  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 300) * 1000,
  };

  logger.info('FedEx API: OAuth token obtained', { expiresIn: json.expires_in });
  return cachedToken.accessToken;
}

type FedExApiAddress = {
  city?: string;
  stateOrProvinceCode?: string;
  countryCode?: string;
};

type FedExApiScanEvent = {
  date?: string;
  derivedStatus?: string;
  eventDescription?: string;
  eventType?: string;
  derivedStatusCode?: string;
  scanLocation?: FedExApiAddress;
  exceptionCode?: string;
  exceptionDescription?: string;
};

type FedExApiTrackResult = {
  trackingNumberInfo?: { trackingNumber?: string };
  latestStatusDetail?: {
    code?: string;
    derivedCode?: string;
    statusByLocale?: string;
    description?: string;
    scanLocation?: FedExApiAddress;
    delayDetail?: { type?: string; subType?: string; status?: string };
  };
  dateAndTimes?: Array<{ type?: string; dateTime?: string }>;
  serviceDetail?: { description?: string; type?: string };
  shipperInformation?: { address?: FedExApiAddress };
  recipientInformation?: { address?: FedExApiAddress };
  originLocation?: { locationContactAndAddress?: { address?: FedExApiAddress } };
  destinationLocation?: { locationContactAndAddress?: { address?: FedExApiAddress } };
  deliveryDetails?: {
    receivedByName?: string;
    actualDeliveryAddress?: FedExApiAddress;
    deliveryAttempts?: string;
  };
  scanEvents?: FedExApiScanEvent[];
  error?: { code?: string; message?: string };
};

type FedExApiResponse = {
  output?: {
    completeTrackResults?: Array<{
      trackingNumber?: string;
      trackResults?: FedExApiTrackResult[];
    }>;
  };
  errors?: Array<{ code?: string; message?: string }>;
};

function buildLocation(addr: FedExApiAddress | undefined): string | undefined {
  if (addr?.city && addr?.countryCode) {
    return `${addr.city}, ${addr.countryCode}`;
  }
  return undefined;
}

function findDateTime(
  dateAndTimes: Array<{ type?: string; dateTime?: string }> | undefined,
  type: string,
): string | undefined {
  const entry = dateAndTimes?.find((d) => d.type === type);
  return entry?.dateTime ?? undefined;
}

function parseApiTrackResult(
  trackingNumber: string,
  result: FedExApiTrackResult,
): FedExTrackingResult {
  if (result.error?.code) {
    return {
      trackingNumber,
      success: false,
      error: `${result.error.code}: ${result.error.message ?? 'Unknown error'}`,
    };
  }

  const latest = result.latestStatusDetail;
  const scanEvents: FedExScanEvent[] = (result.scanEvents ?? []).map((e) => ({
    date: e.date?.split('T')[0] ?? '',
    time: e.date?.split('T')[1]?.split(/[+-]/)[0] ?? '',
    gmtOffset: '',
    status: e.eventDescription ?? e.derivedStatus ?? '',
    statusCD: e.derivedStatusCode ?? e.eventType ?? '',
    scanLocation: buildLocation(e.scanLocation) ?? '',
    delivered: e.derivedStatusCode === 'DL',
    exception: e.derivedStatusCode === 'DE' || Boolean(e.exceptionDescription),
    exceptionDescription: e.exceptionDescription ?? '',
    exceptionCode: e.exceptionCode ?? '',
  }));

  const shipperAddr =
    result.shipperInformation?.address ??
    result.originLocation?.locationContactAndAddress?.address;
  const recipientAddr =
    result.recipientInformation?.address ??
    result.destinationLocation?.locationContactAndAddress?.address;

  const lastScanLocation =
    buildLocation(latest?.scanLocation) ??
    (scanEvents.length > 0 ? scanEvents[0].scanLocation : undefined);

  return {
    trackingNumber,
    success: true,
    keyStatus: latest?.statusByLocale,
    keyStatusCD: latest?.derivedCode,
    statusBarCD: latest?.code,
    lastScanStatus: latest?.description,
    lastScanDateTime: scanEvents.length > 0
      ? `${scanEvents[0].date} ${scanEvents[0].time}`
      : undefined,
    lastScanLocation,
    estimatedDelivery: findDateTime(result.dateAndTimes, 'ESTIMATED_DELIVERY'),
    actualDelivery: findDateTime(result.dateAndTimes, 'ACTUAL_DELIVERY'),
    receivedByName: result.deliveryDetails?.receivedByName,
    origin: buildLocation(shipperAddr),
    destination: buildLocation(recipientAddr),
    serviceDesc: result.serviceDetail?.description,
    scanEvents,
    delayReason: result.latestStatusDetail?.delayDetail?.type,
    deliveryAttempts: result.deliveryDetails?.deliveryAttempts
      ? parseInt(result.deliveryDetails.deliveryAttempts, 10)
      : undefined,
    attemptedDeliveryAt: findDateTime(result.dateAndTimes, 'ATTEMPTED_DELIVERY'),
  };
}

const API_BATCH_SIZE = 30;

async function trackViaFedExApi(
  trackingNumbers: string[],
  onProgress?: (processed: number, total: number) => void,
): Promise<FedExTrackingResult[]> {
  if (trackingNumbers.length === 0) return [];

  const apiKey = process.env.FEDEX_API_KEY;
  const secretKey = process.env.FEDEX_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('FEDEX_API_KEY and FEDEX_SECRET_KEY environment variables are required');
  }

  const token = await getAccessToken(apiKey, secretKey);
  const results: FedExTrackingResult[] = [];

  for (let i = 0; i < trackingNumbers.length; i += API_BATCH_SIZE) {
    const batch = trackingNumbers.slice(i, i + API_BATCH_SIZE);

    const requestBody = {
      includeDetailedScans: true,
      trackingInfo: batch.map((tn) => ({
        trackingNumberInfo: { trackingNumber: tn },
      })),
    };

    const response = await fetch(
      'https://apis.fedex.com/track/v1/trackingnumbers',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-locale': 'it_IT',
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      logger.error('FedEx Track API error', { status: response.status, body: text });

      for (const tn of batch) {
        results.push({
          trackingNumber: tn,
          success: false,
          error: `FedEx API HTTP ${response.status}`,
        });
      }

      onProgress?.(i + batch.length, trackingNumbers.length);
      continue;
    }

    const json = (await response.json()) as FedExApiResponse;

    if (json.errors && json.errors.length > 0) {
      const errMsg = json.errors.map((e) => `${e.code}: ${e.message}`).join('; ');
      logger.error('FedEx Track API returned errors', { errors: errMsg });

      for (const tn of batch) {
        results.push({ trackingNumber: tn, success: false, error: errMsg });
      }

      onProgress?.(i + batch.length, trackingNumbers.length);
      continue;
    }

    const completeResults = json.output?.completeTrackResults ?? [];

    const resultMap = new Map<string, FedExTrackingResult>();
    for (const cr of completeResults) {
      const tn = cr.trackingNumber ?? '';
      const trackResults = cr.trackResults ?? [];
      if (trackResults.length > 0) {
        resultMap.set(tn, parseApiTrackResult(tn, trackResults[0]));
      }
    }

    for (const tn of batch) {
      const parsed = resultMap.get(tn);
      if (parsed) {
        results.push(parsed);
      } else {
        results.push({ trackingNumber: tn, success: false, error: 'No result from API' });
      }
    }

    onProgress?.(i + batch.length, trackingNumbers.length);
  }

  return results;
}

function resetTokenCache(): void {
  cachedToken = null;
}

export { trackViaFedExApi, parseApiTrackResult, resetTokenCache };
export type { FedExScanEvent, FedExTrackingResult };
