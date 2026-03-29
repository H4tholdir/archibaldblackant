import { describe, expect, test } from 'vitest';
import { getNotificationRoute } from './notifications.service';
import type { Notification } from './notifications.service';

const makeNotif = (type: string, data?: Record<string, string>): Notification =>
  ({
    id: 1,
    userId: 'user-1',
    type,
    data: data ?? null,
    severity: 'info',
    title: '',
    body: '',
    readAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    expiresAt: '2027-01-01T00:00:00Z',
  }) as Notification;

describe('getNotificationRoute', () => {
  test('fedex_exception con orderNumber → /orders?highlight=ORD-001', () => {
    expect(getNotificationRoute(makeNotif('fedex_exception', { orderNumber: 'ORD-001' })))
      .toBe('/orders?highlight=ORD-001');
  });

  test('fedex_delivered con orderNumber → /orders?highlight=ORD-002', () => {
    expect(getNotificationRoute(makeNotif('fedex_delivered', { orderNumber: 'ORD-002' })))
      .toBe('/orders?highlight=ORD-002');
  });

  test('fedex_exception senza orderNumber → /orders', () => {
    expect(getNotificationRoute(makeNotif('fedex_exception')))
      .toBe('/orders');
  });

  test('fedex_delivered senza orderNumber → /orders', () => {
    expect(getNotificationRoute(makeNotif('fedex_delivered')))
      .toBe('/orders');
  });

  test('customer_inactive con erpId e customerName → /customers?highlight=...&search=...', () => {
    expect(getNotificationRoute(makeNotif('customer_inactive', { erpId: '55.261', customerName: 'Acme Srl' })))
      .toBe('/customers?highlight=55.261&search=Acme%20Srl');
  });

  test('customer_inactive senza data → /customers', () => {
    expect(getNotificationRoute(makeNotif('customer_inactive'))).toBe('/customers');
  });

  test('order_expiring con orderNumber → /orders?highlight=ORD-003', () => {
    expect(getNotificationRoute(makeNotif('order_expiring', { orderNumber: 'ORD-003' })))
      .toBe('/orders?highlight=ORD-003');
  });

  test('order_expiring senza orderNumber → /orders', () => {
    expect(getNotificationRoute(makeNotif('order_expiring'))).toBe('/orders');
  });

  test('altri tipi non fedex non sono influenzati', () => {
    expect(getNotificationRoute(makeNotif('price_change'))).toBe('/prezzi-variazioni');
  });
});
