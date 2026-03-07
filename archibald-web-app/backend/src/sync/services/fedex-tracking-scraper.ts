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

async function scrapeFedExTracking(
  trackingNumbers: string[],
  onProgress?: (processed: number, total: number) => void,
): Promise<FedExTrackingResult[]> {
  if (trackingNumbers.length === 0) {
    return [];
  }

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

    // Step 1: Navigate to FedEx tracking page to initialize session + OAuth
    await page.goto('https://www.fedex.com/fedextrack/?trknbr=000000000000', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    // Wait for SPA to fully initialize (OAuth, cookies, etc.)
    await new Promise((r) => setTimeout(r, 8_000));

    // Step 2: Call tracking API from within the browser context for each number
    const results: FedExTrackingResult[] = [];

    for (let i = 0; i < trackingNumbers.length; i++) {
      const trackingNumber = trackingNumbers[i];

      try {
        const json = await page.evaluate(async (trkNum: string) => {
          const resp = await fetch('https://api.fedex.com/track/v2/shipments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-locale': 'en_US' },
            body: JSON.stringify({
              appType: 'WTRK',
              uniqueKey: '',
              processingParameters: {},
              trackingInfo: [{
                trackingNumberInfo: { trackingNumber: trkNum, trackingQualifier: '', trackingCarrier: '' },
              }],
            }),
          });
          if (!resp.ok) return { error: `HTTP ${resp.status}` };
          return resp.json();
        }, trackingNumber) as Record<string, unknown>;

        if (json.error) {
          results.push({ trackingNumber, success: false, error: json.error as string });
        } else {
          results.push(parseTrackingResponse(trackingNumber, json));
        }
      } catch (err) {
        results.push({
          trackingNumber,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      onProgress?.(i + 1, trackingNumbers.length);

      // Small delay between requests
      if (i < trackingNumbers.length - 1) {
        const delay = 500 + Math.random() * 1500;
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    return results;
  } finally {
    await browser.close();
  }
}

export {
  parseTrackingResponse,
  scrapeFedExTracking,
};
export type { FedExScanEvent, FedExTrackingResult };
