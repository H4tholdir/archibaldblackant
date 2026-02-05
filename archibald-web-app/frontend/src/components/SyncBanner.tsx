'use client';

import { useEffect, useState } from 'react';

interface SyncProgress {
  status: 'idle' | 'syncing' | 'completed' | 'error';
  currentPage: number;
  totalPages: number;
  customersProcessed: number;
  message: string;
  error?: string;
}

export default function SyncBanner() {
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  useEffect(() => {
    // DISABLED: Old WebSocket endpoint - sync progress now handled by real-time system
    // TODO: Re-implement with new WebSocket architecture if batch sync progress needed
    /*
    let websocket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      try {
        websocket = new WebSocket('ws://localhost:3000/ws/sync');
        // ... rest of old code ...
      } catch (error) {
        console.error('Errore creazione WebSocket:', error);
      }
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (websocket) websocket.close();
    };
    */
  }, []);

  // Non mostrare nulla se sync non è in corso o è completato da più di 5 secondi
  if (!progress || progress.status === 'idle') {
    return null;
  }

  if (progress.status === 'completed') {
    // Mostra messaggio di successo per 5 secondi poi nascondi
    setTimeout(() => setProgress(null), 5000);
  }

  const getBackgroundColor = () => {
    switch (progress.status) {
      case 'syncing':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const calculateProgress = () => {
    if (progress.totalPages === 0) return 0;
    return Math.round((progress.currentPage / progress.totalPages) * 100);
  };

  return (
    <div className={`fixed top-1 right-2 z-50 ${getBackgroundColor()} text-white shadow-sm rounded px-2 py-1 text-xs opacity-90 hover:opacity-100 transition-opacity`}>
      <div className="flex items-center space-x-1">
        <div className="w-2 h-2 flex-shrink-0">
          {progress.status === 'syncing' && (
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          )}
          {progress.status === 'completed' && (
            <div className="w-2 h-2 bg-white rounded-full"></div>
          )}
        </div>
        <span className="whitespace-nowrap">
          {progress.status === 'syncing' && `Sync ${calculateProgress()}%`}
          {progress.status === 'completed' && '✓ Sync OK'}
          {progress.status === 'error' && '✗ Errore'}
        </span>
      </div>
    </div>
  );
}
