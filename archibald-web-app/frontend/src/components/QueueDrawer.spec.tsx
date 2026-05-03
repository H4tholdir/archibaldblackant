import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueueDrawer } from './QueueDrawer';
import type { AgentQueueTask } from '../api/agent-queue';

const makeTask = (overrides: Partial<AgentQueueTask> = {}): AgentQueueTask => ({
  taskId: '1',
  userId: 'user-1',
  taskType: 'submit-order',
  status: 'enqueued',
  enqueuedAt: '2026-05-02T10:00:00Z',
  startedAt: null,
  completedAt: null,
  payload: { customerName: 'Dr. Rossi' },
  ...overrides,
});

describe('QueueDrawer', () => {
  it('renders nothing when isOpen=false', () => {
    const { container } = render(
      <QueueDrawer isOpen={false} tasks={[makeTask()]} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders task list when open', () => {
    render(
      <QueueDrawer isOpen={true} tasks={[makeTask()]} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/Piazza ordine/)).toBeDefined();
    expect(screen.getByText(/Dr. Rossi/)).toBeDefined();
  });

  it('shows correct status label for enqueued task', () => {
    render(
      <QueueDrawer isOpen={true} tasks={[makeTask({ status: 'enqueued' })]} onClose={vi.fn()} />,
    );
    expect(screen.getByText('in attesa')).toBeDefined();
  });

  it('shows correct status label for running task', () => {
    render(
      <QueueDrawer isOpen={true} tasks={[makeTask({ status: 'running' })]} onClose={vi.fn()} />,
    );
    // Running status shows percentage (e.g. "50%") at the top right, not "in corso"
    expect(screen.getByText(/\d+%/)).toBeDefined();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<QueueDrawer isOpen={true} tasks={[]} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Chiudi'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows empty state when no tasks', () => {
    render(<QueueDrawer isOpen={true} tasks={[]} onClose={vi.fn()} />);
    expect(screen.getByText('Nessuna operazione in coda')).toBeDefined();
  });
});
