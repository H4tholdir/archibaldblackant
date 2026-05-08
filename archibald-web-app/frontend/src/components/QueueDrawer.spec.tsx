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
      <QueueDrawer isOpen={false} userOperations={[makeOp()]} bgOperations={[]} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  test('mostra sezione "Richieste da te" se ci sono userOperations', () => {
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp()]} bgOperations={[]} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.getByText('Richieste da te')).toBeTruthy();
  });

  test('NON mostra sezione "Automatiche" se bgOperations è vuoto', () => {
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp()]} bgOperations={[]} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.queryByText('Automatiche')).toBeNull();
  });

  test('mostra sezione "Automatiche" se ci sono bgOperations', () => {
    const bgOp = makeOp({ isBackground: true, operationType: 'sync-customers', customerName: 'Sync', jobId: 'bg-1' });
    render(
      <QueueDrawer isOpen={true} userOperations={[]} bgOperations={[bgOp]} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.getByText('Automatiche')).toBeTruthy();
  });

  test('mostra bottone annulla per operazione enqueued (queued)', () => {
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp({ status: 'queued' })]} bgOperations={[]} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.getByRole('button', { name: /annulla/i })).toBeTruthy();
  });

  test('NON mostra bottone annulla per operazione active', () => {
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp({ status: 'active' })]} bgOperations={[]} onClose={noop} onCancel={noopAsync} onNavigate={noop} />
    );
    expect(screen.queryByRole('button', { name: /annulla/i })).toBeNull();
  });

  test('chiama onCancel con jobId al click annulla', () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp({ status: 'queued', jobId: 'job-xyz' })]} bgOperations={[]} onClose={noop} onCancel={onCancel} onNavigate={noop} />
    );
    fireEvent.click(screen.getByRole('button', { name: /annulla/i }));
    expect(onCancel).toHaveBeenCalledWith('job-xyz');
  });

  test('chiama onNavigate con navigateTo al tap sul item utente', () => {
    const onNavigate = vi.fn();
    render(
      <QueueDrawer isOpen={true} userOperations={[makeOp({ navigateTo: '/orders/123' })]} bgOperations={[]} onClose={noop} onCancel={noopAsync} onNavigate={onNavigate} />
    );
    fireEvent.click(screen.getByText('Bianchi Srl'));
    expect(onNavigate).toHaveBeenCalledWith('/orders/123');
  });
});
