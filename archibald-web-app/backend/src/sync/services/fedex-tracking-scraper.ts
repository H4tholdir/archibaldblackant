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

  const results: FedExTrackingResult[] = [];
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
    ],
  });

  try {
    const page = await browser.newPage();

    for (let i = 0; i < trackingNumbers.length; i++) {
      const trackingNumber = trackingNumbers[i];

      try {
        const responsePromise = new Promise<FedExTrackingResult>(
          (resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Timeout waiting for FedEx tracking API response'));
            }, 15_000);

            const handler = async (response: { url: () => string; json: () => Promise<Record<string, unknown>> }) => {
              if (response.url().includes('api.fedex.com/track/v2/shipments')) {
                clearTimeout(timeout);
                try {
                  const json = await response.json();
                  resolve(parseTrackingResponse(trackingNumber, json));
                } catch (err) {
                  reject(err);
                }
              }
            };

            page.on('response', handler);
          },
        );

        await page.goto(
          `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
          { waitUntil: 'domcontentloaded', timeout: 30_000 },
        );

        const result = await responsePromise;
        results.push(result);
      } catch (err) {
        results.push({
          trackingNumber,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        page.removeAllListeners('response');
      }

      onProgress?.(i + 1, trackingNumbers.length);

      if (i < trackingNumbers.length - 1) {
        const delay = 2000 + Math.random() * 3000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

export {
  parseTrackingResponse,
  scrapeFedExTracking,
};
export type { FedExScanEvent, FedExTrackingResult };
