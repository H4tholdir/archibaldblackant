import { useEffect } from 'react';

interface ErpViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  url: string;
}

export function ErpViewerModal({ isOpen, onClose, title, url }: ErpViewerModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
      }}
    >
      <div
        style={{
          width: '96vw',
          height: '95vh',
          background: '#fff',
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
            flexShrink: 0,
            gap: 8,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
            {title}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                fontSize: 13,
                fontWeight: 600,
                color: '#2563eb',
                border: '1.5px solid #2563eb',
                borderRadius: 6,
                textDecoration: 'none',
              }}
            >
              {'↗'} Apri in nuova scheda
            </a>
            <button
              onClick={onClose}
              aria-label="Chiudi"
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 20,
                cursor: 'pointer',
                color: '#64748b',
                padding: '4px 8px',
                lineHeight: 1,
                borderRadius: 4,
              }}
            >
              {'✕'}
            </button>
          </div>
        </div>
        <iframe
          src={url}
          title={title}
          style={{ flex: 1, border: 'none', width: '100%' }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  );
}
