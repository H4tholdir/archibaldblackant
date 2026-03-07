import puppeteer from 'puppeteer';

type FedExScanEvent = {
  date: string;
  time: string;
  gmtOffset: string;
  status: string;
  statusCD: string;
  scanLocation: string;
  delivered: boolean;
  exception: boolean;
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
};

function parseTrackingResponse(
  trackingNumber: string,
  json: Record<string, unknown>,
): FedExTrackingResult {
  const output = json.output as Record<string, unknown> | undefined;
  const packages = output?.packages as Record<string, unknown>[] | undefined;

  if (!packages || packages.length === 0) {
    return { trackingNumber, success: false, error: 'No packages found' };
  }

  const pkg = packages[0];

  const shipperAddress = pkg.shipperAddress as
    | { city?: string; countryCode?: string }
    | undefined;
  const recipientAddress = pkg.recipientAddress as
    | { city?: string; countryCode?: string }
    | undefined;
  const statusLocationAddress = pkg.statusLocationAddress as
    | { city?: string; countryCode?: string }
    | undefined;

  const rawScanEvents = (pkg.scanEventList ?? []) as Record<string, unknown>[];
  const scanEvents: FedExScanEvent[] = rawScanEvents.map((e) => ({
    date: String(e.date ?? ''),
    time: String(e.time ?? ''),
    gmtOffset: String(e.gmtOffset ?? ''),
    status: String(e.status ?? ''),
    statusCD: String(e.statusCD ?? ''),
    scanLocation: String(e.scanLocation ?? ''),
    delivered: Boolean(e.delivered),
    exception: Boolean(e.exception),
  }));

  const buildLocation = (
    addr: { city?: string; countryCode?: string } | undefined,
  ): string | undefined => {
    if (addr?.city && addr?.countryCode) {
      return `${addr.city}, ${addr.countryCode}`;
    }
    return undefined;
  };

  const lastScanLocation =
    buildLocation(statusLocationAddress) ??
    (scanEvents.length > 0 ? scanEvents[0].scanLocation : undefined);

  const actDeliveryDt = pkg.actDeliveryDt as string | undefined;
  const receivedByNm = pkg.receivedByNm as string | undefined;

  return {
    trackingNumber,
    success: true,
    keyStatus: pkg.keyStatus as string | undefined,
    keyStatusCD: pkg.keyStatusCD as string | undefined,
    statusBarCD: pkg.statusBarCD as string | undefined,
    lastScanStatus: pkg.lastScanStatus as string | undefined,
    lastScanDateTime: pkg.lastScanDateTime as string | undefined,
    lastScanLocation,
    estimatedDelivery: (pkg.estDeliveryDt as string | undefined) || undefined,
    actualDelivery: actDeliveryDt || undefined,
    receivedByName: receivedByNm || undefined,
    origin: buildLocation(shipperAddress),
    destination: buildLocation(recipientAddress),
    serviceDesc: pkg.serviceDesc as string | undefined,
    scanEvents,
  };
}

async function obtainFedExToken(): Promise<string> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    let authToken: string | null = null;

    page.on('response', async (response: { url: () => string; json: () => Promise<Record<string, unknown>> }) => {
      if (response.url().includes('api.fedex.com/auth/oauth/v2/token') && authToken === null) {
        try {
          const json = await response.json();
          authToken = json.access_token as string;
        } catch {
          // ignore
        }
      }
    });

    await page.goto('https://www.fedex.com/fedextrack/?trknbr=000000000000', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Wait for OAuth token to be captured
    for (let i = 0; i < 20; i++) {
      if (authToken) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!authToken) {
      throw new Error('Failed to obtain FedEx OAuth token');
    }

    return authToken;
  } finally {
    await browser.close();
  }
}

async function fetchTrackingDirect(
  token: string,
  trackingNumber: string,
): Promise<FedExTrackingResult> {
  const resp = await fetch('https://api.fedex.com/track/v2/shipments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-locale': 'en_US',
    },
    body: JSON.stringify({
      appType: 'WTRK',
      uniqueKey: '',
      processingParameters: {},
      trackingInfo: [{
        trackingNumberInfo: {
          trackingNumber,
          trackingQualifier: '',
          trackingCarrier: '',
        },
      }],
    }),
  });

  if (!resp.ok) {
    return { trackingNumber, success: false, error: `HTTP ${resp.status}` };
  }

  const json = await resp.json() as Record<string, unknown>;
  return parseTrackingResponse(trackingNumber, json);
}

async function scrapeFedExTracking(
  trackingNumbers: string[],
  onProgress?: (processed: number, total: number) => void,
): Promise<FedExTrackingResult[]> {
  if (trackingNumbers.length === 0) {
    return [];
  }

  // Step 1: Obtain OAuth token via browser (one-time)
  const token = await obtainFedExToken();

  // Step 2: Call tracking API directly for each number (no browser needed)
  const results: FedExTrackingResult[] = [];

  for (let i = 0; i < trackingNumbers.length; i++) {
    const trackingNumber = trackingNumbers[i];

    try {
      const result = await fetchTrackingDirect(token, trackingNumber);
      results.push(result);
    } catch (err) {
      results.push({
        trackingNumber,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    onProgress?.(i + 1, trackingNumbers.length);

    // Small delay between requests to avoid rate limiting
    if (i < trackingNumbers.length - 1) {
      const delay = 500 + Math.random() * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return results;
}

export {
  parseTrackingResponse,
  scrapeFedExTracking,
};
export type { FedExScanEvent, FedExTrackingResult };
