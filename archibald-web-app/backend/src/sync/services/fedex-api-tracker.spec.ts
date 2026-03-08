import { describe, expect, test, vi, beforeEach } from 'vitest';
import { parseApiTrackResult, resetTokenCache } from './fedex-api-tracker';

describe('parseApiTrackResult', () => {
  test('parses a delivered shipment correctly', () => {
    const trackingNumber = '445291921845';
    const apiResult = {
      trackingNumberInfo: { trackingNumber },
      latestStatusDetail: {
        code: 'DL',
        derivedCode: 'DL',
        statusByLocale: 'Delivered',
        description: 'Delivered',
        scanLocation: { city: 'MILANO', countryCode: 'IT' },
      },
      dateAndTimes: [
        { type: 'ESTIMATED_DELIVERY', dateTime: '2026-03-05T10:00:00' },
        { type: 'ACTUAL_DELIVERY', dateTime: '2026-03-05T09:30:00' },
      ],
      serviceDetail: { description: 'FedEx International Priority', type: 'INTERNATIONAL_PRIORITY' },
      shipperInformation: { address: { city: 'VERONA', countryCode: 'IT' } },
      recipientInformation: { address: { city: 'NAPOLI', countryCode: 'IT' } },
      deliveryDetails: { receivedByName: 'Mario Rossi' },
      scanEvents: [
        {
          date: '2026-03-05T09:30:00+01:00',
          derivedStatus: 'Delivered',
          eventDescription: 'Delivered',
          eventType: 'DL',
          derivedStatusCode: 'DL',
          scanLocation: { city: 'NAPOLI', countryCode: 'IT' },
        },
        {
          date: '2026-03-04T14:00:00+01:00',
          derivedStatus: 'In transit',
          eventDescription: 'In transit',
          eventType: 'IT',
          derivedStatusCode: 'IT',
          scanLocation: { city: 'MILANO', countryCode: 'IT' },
        },
      ],
    };

    const result = parseApiTrackResult(trackingNumber, apiResult);

    expect(result).toEqual({
      trackingNumber,
      success: true,
      keyStatus: 'Delivered',
      keyStatusCD: 'DL',
      statusBarCD: 'DL',
      lastScanStatus: 'Delivered',
      lastScanDateTime: '2026-03-05 09:30:00',
      lastScanLocation: 'MILANO, IT',
      estimatedDelivery: '2026-03-05T10:00:00',
      actualDelivery: '2026-03-05T09:30:00',
      receivedByName: 'Mario Rossi',
      origin: 'VERONA, IT',
      destination: 'NAPOLI, IT',
      serviceDesc: 'FedEx International Priority',
      scanEvents: [
        {
          date: '2026-03-05',
          time: '09:30:00',
          gmtOffset: '',
          status: 'Delivered',
          statusCD: 'DL',
          scanLocation: 'NAPOLI, IT',
          delivered: true,
          exception: false,
          exceptionDescription: '',
        },
        {
          date: '2026-03-04',
          time: '14:00:00',
          gmtOffset: '',
          status: 'In transit',
          statusCD: 'IT',
          scanLocation: 'MILANO, IT',
          delivered: false,
          exception: false,
          exceptionDescription: '',
        },
      ],
    });
  });

  test('parses an in-transit shipment with no scan events', () => {
    const result = parseApiTrackResult('999999999999', {
      latestStatusDetail: {
        code: 'IT',
        derivedCode: 'IT',
        statusByLocale: 'In transito',
        description: 'In transit',
      },
      serviceDetail: { description: 'FedEx Economy' },
    });

    expect(result).toEqual({
      trackingNumber: '999999999999',
      success: true,
      keyStatus: 'In transito',
      keyStatusCD: 'IT',
      statusBarCD: 'IT',
      lastScanStatus: 'In transit',
      lastScanDateTime: undefined,
      lastScanLocation: undefined,
      estimatedDelivery: undefined,
      actualDelivery: undefined,
      receivedByName: undefined,
      origin: undefined,
      destination: undefined,
      serviceDesc: 'FedEx Economy',
      scanEvents: [],
    });
  });

  test('returns failure for API error result', () => {
    const result = parseApiTrackResult('BADTRACK', {
      error: { code: 'TRACKING.TRACKINGNUMBER.NOTFOUND', message: 'Tracking number not found' },
    });

    expect(result).toEqual({
      trackingNumber: 'BADTRACK',
      success: false,
      error: 'TRACKING.TRACKINGNUMBER.NOTFOUND: Tracking number not found',
    });
  });

  test('parses exception status correctly', () => {
    const result = parseApiTrackResult('111111111111', {
      latestStatusDetail: {
        code: 'DE',
        derivedCode: 'DE',
        statusByLocale: 'Eccezione di consegna',
        description: 'Delivery Exception',
      },
      scanEvents: [
        {
          date: '2026-03-06T08:00:00+01:00',
          derivedStatus: 'Delivery Exception',
          eventDescription: 'Customer not available',
          eventType: 'DE',
          derivedStatusCode: 'DE',
          exceptionDescription: 'Customer not available or business closed',
          scanLocation: { city: 'ROMA', countryCode: 'IT' },
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.statusBarCD).toBe('DE');
    expect(result.scanEvents![0].exception).toBe(true);
    expect(result.scanEvents![0].exceptionDescription).toBe('Customer not available or business closed');
    expect(result.scanEvents![0].delivered).toBe(false);
  });

  test('uses originLocation fallback when shipperInformation is missing', () => {
    const result = parseApiTrackResult('222222222222', {
      latestStatusDetail: { code: 'PU', derivedCode: 'PU' },
      originLocation: {
        locationContactAndAddress: {
          address: { city: 'BOLOGNA', countryCode: 'IT' },
        },
      },
    });

    expect(result.origin).toBe('BOLOGNA, IT');
  });
});
