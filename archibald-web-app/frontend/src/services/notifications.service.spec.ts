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

  test('customer_inactive con erpId naviga al profilo diretto', () => {
    expect(getNotificationRoute(makeNotif('customer_inactive', { erpId: '55.261', customerName: 'Acme Srl' })))
      .toBe('/customers/55.261');
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

  test('price_change naviga a /products con param openPriceVariations', () => {
    expect(getNotificationRoute(makeNotif('price_change'))).toBe('/products?openPriceVariations=true');
  });

  test('product_change new naviga a /products con param openVariations', () => {
    expect(getNotificationRoute(makeNotif('product_change', { changeType: 'new', count: '3' })))
      .toBe('/products?openVariations=true');
  });

  test('product_change modified naviga a /products con param openVariations', () => {
    expect(getNotificationRoute(makeNotif('product_change', { changeType: 'modified', count: '5' })))
      .toBe('/products?openVariations=true');
  });

  test('product_change removed naviga a /products con param openVariations', () => {
    expect(getNotificationRoute(makeNotif('product_change', { changeType: 'removed', count: '1' })))
      .toBe('/products?openVariations=true');
  });

  test('customer_reminder con action_url naviga al profilo cliente', () => {
    expect(getNotificationRoute(makeNotif('customer_reminder', { customerErpId: '42.001', reminderId: '7', action_url: '/customers/42.001' })))
      .toBe('/customers/42.001');
  });

  test('customer_reminder senza action_url fallback a /notifications', () => {
    expect(getNotificationRoute(makeNotif('customer_reminder'))).toBe('/notifications');
  });

  test('order_documents_missing con orderNumber → /orders?highlight=ORD/26004189', () => {
    expect(getNotificationRoute(makeNotif('order_documents_missing', { orderNumber: 'ORD/26004189' })))
      .toBe('/orders?highlight=ORD/26004189');
  });

  test('order_documents_missing senza orderNumber → /orders', () => {
    expect(getNotificationRoute(makeNotif('order_documents_missing'))).toBe('/orders');
  });
});
