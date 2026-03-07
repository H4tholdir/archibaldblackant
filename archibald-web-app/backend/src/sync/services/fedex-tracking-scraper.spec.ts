import { describe, expect, test } from 'vitest';
import { parseTrackingResponse } from './fedex-tracking-scraper';

const IN_TRANSIT_RESPONSE = {
  transactionId: 'tx-001',
  output: {
    packages: [
      {
        trackingNbr: '445291931033',
        trackingQualifier: '2461106000~445291931033~FX',
        trackingCarrierDesc: 'FedEx Express',
        keyStatus: 'On the way',
        keyStatusCD: 'DP',
        statusBarCD: 'OW',
        lastScanStatus: 'Departed FedEx hub',
        lastScanDateTime: '2026-03-07T04:57:00+01:00',
        mainStatus: 'Departed FedEx location',
        statusWithDetails:
          'Departed FedEx location; ROISSY CHARLES DE GAULLE CEDEX, FR',
        shipperAddress: { city: 'LEMGO', countryCode: 'DE' },
        recipientAddress: {
          city: 'PONTECAGNANO FAIANO',
          countryCode: 'IT',
        },
        statusLocationAddress: {
          city: 'ROISSY CHARLES DE GAULLE CEDEX',
          countryCode: 'FR',
        },
        estDeliveryDt: '2026-03-09T20:00:00+01:00',
        actDeliveryDt: '',
        receivedByNm: '',
        serviceDesc: 'FedEx International Priority',
        scanEventList: [
          {
            date: '2026-03-07',
            time: '04:57:00',
            gmtOffset: '+01:00',
            status: 'Departed FedEx hub',
            statusCD: 'DP',
            scanLocation: 'ROISSY CHARLES DE GAULLE CEDEX FR',
            scanDetails: '',
            delivered: false,
            exception: false,
          },
          {
            date: '2026-03-07',
            time: '01:23:00',
            gmtOffset: '+01:00',
            status: 'Arrived at FedEx hub',
            statusCD: 'AR',
            scanLocation: 'ROISSY CHARLES DE GAULLE CEDEX FR',
            scanDetails: '',
            delivered: false,
            exception: false,
          },
        ],
      },
    ],
  },
};

const DELIVERED_RESPONSE = {
  transactionId: 'tx-002',
  output: {
    packages: [
      {
        trackingNbr: '789012345678',
        keyStatus: 'Delivered',
        keyStatusCD: 'DL',
        statusBarCD: 'DL',
        lastScanStatus: 'Delivered',
        lastScanDateTime: '2026-03-06T14:30:00+01:00',
        shipperAddress: { city: 'MUNICH', countryCode: 'DE' },
        recipientAddress: { city: 'NAPOLI', countryCode: 'IT' },
        statusLocationAddress: { city: 'NAPOLI', countryCode: 'IT' },
        estDeliveryDt: '2026-03-06T20:00:00+01:00',
        actDeliveryDt: '2026-03-06T14:30:00+01:00',
        receivedByNm: 'M. ROSSI',
        serviceDesc: 'FedEx International Economy',
        scanEventList: [
          {
            date: '2026-03-06',
            time: '14:30:00',
            gmtOffset: '+01:00',
            status: 'Delivered',
            statusCD: 'DL',
            scanLocation: 'NAPOLI IT',
            scanDetails: 'Left at front door',
            delivered: true,
            exception: false,
          },
        ],
      },
    ],
  },
};

describe('parseTrackingResponse', () => {
  test('parses in-transit response with all fields', () => {
    const trackingNumber = '445291931033';
    const result = parseTrackingResponse(trackingNumber, IN_TRANSIT_RESPONSE);

    expect(result).toEqual({
      trackingNumber: '445291931033',
      success: true,
      keyStatus: 'On the way',
      keyStatusCD: 'DP',
      statusBarCD: 'OW',
      lastScanStatus: 'Departed FedEx hub',
      lastScanDateTime: '2026-03-07T04:57:00+01:00',
      lastScanLocation: 'ROISSY CHARLES DE GAULLE CEDEX, FR',
      estimatedDelivery: '2026-03-09T20:00:00+01:00',
      actualDelivery: undefined,
      receivedByName: undefined,
      origin: 'LEMGO, DE',
      destination: 'PONTECAGNANO FAIANO, IT',
      serviceDesc: 'FedEx International Priority',
      scanEvents: [
        {
          date: '2026-03-07',
          time: '04:57:00',
          gmtOffset: '+01:00',
          status: 'Departed FedEx hub',
          statusCD: 'DP',
          scanLocation: 'ROISSY CHARLES DE GAULLE CEDEX FR',
          delivered: false,
          exception: false,
        },
        {
          date: '2026-03-07',
          time: '01:23:00',
          gmtOffset: '+01:00',
          status: 'Arrived at FedEx hub',
          statusCD: 'AR',
          scanLocation: 'ROISSY CHARLES DE GAULLE CEDEX FR',
          delivered: false,
          exception: false,
        },
      ],
    });
  });

  test('parses delivered response with actualDelivery and receivedByName', () => {
    const trackingNumber = '789012345678';
    const result = parseTrackingResponse(trackingNumber, DELIVERED_RESPONSE);

    expect(result).toEqual({
      trackingNumber: '789012345678',
      success: true,
      keyStatus: 'Delivered',
      keyStatusCD: 'DL',
      statusBarCD: 'DL',
      lastScanStatus: 'Delivered',
      lastScanDateTime: '2026-03-06T14:30:00+01:00',
      lastScanLocation: 'NAPOLI, IT',
      estimatedDelivery: '2026-03-06T20:00:00+01:00',
      actualDelivery: '2026-03-06T14:30:00+01:00',
      receivedByName: 'M. ROSSI',
      origin: 'MUNICH, DE',
      destination: 'NAPOLI, IT',
      serviceDesc: 'FedEx International Economy',
      scanEvents: [
        {
          date: '2026-03-06',
          time: '14:30:00',
          gmtOffset: '+01:00',
          status: 'Delivered',
          statusCD: 'DL',
          scanLocation: 'NAPOLI IT',
          delivered: true,
          exception: false,
        },
      ],
    });
  });

  test('returns failure for empty packages array', () => {
    const result = parseTrackingResponse('000000000000', {
      output: { packages: [] },
    });

    expect(result).toEqual({
      trackingNumber: '000000000000',
      success: false,
      error: 'No packages found',
    });
  });

  test('returns failure for missing output', () => {
    const result = parseTrackingResponse('000000000000', {});

    expect(result).toEqual({
      trackingNumber: '000000000000',
      success: false,
      error: 'No packages found',
    });
  });

  test('returns success with empty scanEvents when scanEventList is missing', () => {
    const response = {
      output: {
        packages: [
          {
            trackingNbr: '111111111111',
            keyStatus: 'In transit',
            keyStatusCD: 'IT',
            statusBarCD: 'IT',
            lastScanStatus: 'In transit',
            lastScanDateTime: '2026-03-07T10:00:00+01:00',
            shipperAddress: { city: 'BERLIN', countryCode: 'DE' },
            recipientAddress: { city: 'ROMA', countryCode: 'IT' },
            estDeliveryDt: '2026-03-10T20:00:00+01:00',
            actDeliveryDt: '',
            receivedByNm: '',
            serviceDesc: 'FedEx Standard',
          },
        ],
      },
    };

    const result = parseTrackingResponse('111111111111', response);

    expect(result).toEqual({
      trackingNumber: '111111111111',
      success: true,
      keyStatus: 'In transit',
      keyStatusCD: 'IT',
      statusBarCD: 'IT',
      lastScanStatus: 'In transit',
      lastScanDateTime: '2026-03-07T10:00:00+01:00',
      lastScanLocation: undefined,
      estimatedDelivery: '2026-03-10T20:00:00+01:00',
      actualDelivery: undefined,
      receivedByName: undefined,
      origin: 'BERLIN, DE',
      destination: 'ROMA, IT',
      serviceDesc: 'FedEx Standard',
      scanEvents: [],
    });
  });
});
