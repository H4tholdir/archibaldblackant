import type { CSSProperties } from 'react';
import type { AgentQueueTask } from '../api/agent-queue';

type QueueDrawerProps = {
  isOpen: boolean;
  tasks: AgentQueueTask[];
  onClose: () => void;
};

const TASK_LABELS: Record<string, string> = {
  'submit-order': 'Piazza ordine',
  'send-to-verona': 'Invia a Verona',
  'edit-order': 'Modifica ordine',
  'delete-order': 'Elimina ordine',
  'batch-send-to-verona': 'Invia a Verona',
  'batch-delete-orders': 'Elimina ordini',
};

const STATUS_ICON: Record<string, string> = {
  enqueued: '⏳',
  running: '⚙',
  completed: '✓',
  failed: '⚠',
  cancelled: '✕',
};

const STATUS_COLOR: Record<string, string> = {
  enqueued: '#6b7280',
  running: '#2563eb',
  completed: '#059669',
  failed: '#dc2626',
  cancelled: '#9ca3af',
};

function formatTime(isoString: string | null): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function getTaskLabel(task: AgentQueueTask): string {
  const base = TASK_LABELS[task.taskType] ?? task.taskType;
  const customerName = (task.payload as { customerName?: string }).customerName;
  if (customerName) return `${base} — ${customerName}`;
  return base;
}

function getStatusLabel(task: AgentQueueTask): string {
  switch (task.status) {
    case 'enqueued': return 'in attesa';
    case 'running': return 'in corso';
    case 'completed': return `completato · ${formatTime(task.completedAt)}`;
    case 'failed': return 'errore — riprova';
    case 'cancelled': return 'annullato';
    default: return task.status;
  }
}

const DRAWER_BASE: CSSProperties = {
  position: 'fixed', bottom: 0, left: 0, right: 0,
  background: '#fff', borderRadius: '16px 16px 0 0',
  boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
  zIndex: 1150, maxHeight: '60vh',
  display: 'flex', flexDirection: 'column',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  transition: 'transform 0.3s ease-out',
};

export function QueueDrawer({ isOpen, tasks, onClose }: QueueDrawerProps) {
  if (!isOpen) return null;

  return (
    <div style={DRAWER_BASE} role="dialog" aria-label="Coda di lavoro">
      {/* Handle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 10px', borderBottom: '1px solid #f3f4f6' }}>
        <span style={{ fontWeight: 600, fontSize: '15px', color: '#111827' }}>Coda di lavoro</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#6b7280', lineHeight: 1 }}
          aria-label="Chiudi"
        >
          ▼
        </button>
      </div>

      {/* Task list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {tasks.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
            Nessuna operazione in coda
          </div>
        ) : (
          tasks.map(task => (
            <div
              key={task.taskId}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', borderBottom: '1px solid #f9fafb',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>{STATUS_ICON[task.status] ?? '•'}</span>
                <span style={{ fontSize: '13px', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {getTaskLabel(task)}
                </span>
              </div>
              <span style={{ fontSize: '12px', color: STATUS_COLOR[task.status] ?? '#6b7280', flexShrink: 0, marginLeft: '12px' }}>
                {getStatusLabel(task)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
