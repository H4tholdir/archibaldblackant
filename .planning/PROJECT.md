# Archibald PWA

## What This Is
PWA per agenti di commercio che automatizza la gestione ordini su ERP Archibald via browser automation (Puppeteer). Express backend, React 19 frontend, PostgreSQL, Redis/BullMQ.

## Core Value
Eliminare errori manuali nella creazione ordini e velocizzare il workflow degli agenti, con garanzia di correttezza degli ordini piazzati sull'ERP.

## Tech Stack
- Frontend: React 19 + Vite + TypeScript (PWA)
- Backend: Express + TypeScript + PostgreSQL + BullMQ/Redis
- Bot: Puppeteer (browser automation su ERP Archibald)
- Realtime: WebSocket + SSE
- Deploy: Docker (6 containers), Hetzner VPS
