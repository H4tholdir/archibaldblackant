import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { QueueDrawer } from './QueueDrawer';
import type { TrackedOperation } from '../contexts/OperationTrackingContext';

function makeOp(overrides: Partial<TrackedOperation> = {}): TrackedOperation {
  return {
    orderId: 'order-1',
    jobId: 'job-1',
    customerName: 'Bianchi Srl',
    status: 'active',
    progress: 50,
    label: 'In corso',
    startedAt: Date.now(),
    isBackground: false,
    navigateTo: '/orders',
    operationType: 'submit-order',
    ...overrides,
  };
}

const noop = () => {};
const noopAsync = async () => {};

describe('QueueDrawer', () => {
  test('non renderizza se isOpen=false', () => {
    const { container } = render(
      <QueueDrawer isOpen={false} userOperations={[makeOp()]} bgOperations={[]} hasPressure={false} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  test('mostra sezione "Tue operazioni" se ci sono userOperations', () => {
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp()]} bgOperations={[]} hasPressure={false} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.getByText('Tue operazioni')).toBeTruthy();
  });

  test('NON mostra sezione "Automatiche" se bgOperations è vuoto', () => {
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp()]} bgOperations={[]} hasPressure={false} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.queryByText('Automatiche')).toBeNull();
  });

  test('mostra sezione "Automatiche" se ci sono bgOperations e hasPressure=false', () => {
    const bgOp = makeOp({ isBackground: true, operationType: 'sync-customers', customerName: 'Sync', jobId: 'bg-1' });
    render(
      <QueueDrawer isOpen={true} userOperations={[]} bgOperations={[bgOp]} hasPressure={false} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.getByText('Automatiche')).toBeTruthy();
  });

  test('mostra bottone annulla per operazione enqueued (queued)', () => {
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp({ status: 'queued' })]} bgOperations={[]} hasPressure={false} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.getByRole('button', { name: /annulla/i })).toBeTruthy();
  });

  test('NON mostra bottone annulla per operazione active', () => {
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp({ status: 'active' })]} bgOperations={[]} hasPressure={false} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.queryByRole('button', { name: /annulla/i })).toBeNull();
  });

  test('chiama onCancel con jobId al click annulla', () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp({ status: 'queued', jobId: 'job-xyz' })]} bgOperations={[]} hasPressure={false} onClose={noop} onCancel={onCancel} onNavigate={noop} />
    );
    fireEvent.click(screen.getByRole('button', { name: /annulla/i }));
    expect(onCancel).toHaveBeenCalledWith('job-xyz');
  });

  test('chiama onNavigate con navigateTo al tap sul item utente', () => {
    const onNavigate = vi.fn();
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp({ navigateTo: '/orders/123' })]} bgOperations={[]} hasPressure={false} onClose={noop} onCancel={noopAsync} onNavigate={onNavigate} />
    );
    fireEvent.click(screen.getByText('Bianchi Srl'));
    expect(onNavigate).toHaveBeenCalledWith('/orders/123');
  });

  test('mostra sezione "In pausa" con riepilogo quando hasPressure=true e ci sono bgOperations', () => {
    const bgOp = makeOp({ isBackground: true, operationType: 'sync-orders', customerName: 'Sync', jobId: 'bg-2' });
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp()]} bgOperations={[bgOp]} hasPressure={true} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.getByText(/sync automatiche in pausa/i)).toBeTruthy();
  });

  test('NON mostra sezione "Automatiche" quando hasPressure=true', () => {
    const bgOp = makeOp({ isBackground: true, operationType: 'sync-orders', customerName: 'Sync', jobId: 'bg-3' });
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp()]} bgOperations={[bgOp]} hasPressure={true} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.queryByText('Automatiche')).toBeNull();
  });

  test('mostra ETA con prefisso ~ per operazione active con operationType noto', () => {
    const activeOp = makeOp({
      status: 'active',
      operationType: 'submit-order',
      startedAt: Date.now() - 5_000,
    });
    render(
      <QueueDrawer isOpen={true} userOperations={[activeOp]} bgOperations={[]} hasPressure={false} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    // ETA should show remaining ~40s (45s total - 5s elapsed)
    const etaEl = screen.getByText(/~\d+s/);
    expect(etaEl).toBeTruthy();
  });
});
