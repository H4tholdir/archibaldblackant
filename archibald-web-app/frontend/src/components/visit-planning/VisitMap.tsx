import { useEffect, useRef } from 'react';
import type { VisitPlanningStop } from '../../types/visit-planning';
import { STOP_STATUS_COLORS } from '../../types/visit-planning';

type MapStats = { totalKm: number; geocodedCount: number; totalStops: number };

type Props = {
  stops:           VisitPlanningStop[];
  height?:         number | string;
  onStopClick?:    (stop: VisitPlanningStop) => void;
  onStatsUpdate?:  (stats: MapStats) => void;
};

// Fallback centroidi per città comuni
const CITY_CENTROIDS: Record<string, [number, number]> = {
  'NAPOLI': [40.8518, 14.2681], 'SALERNO': [40.6824, 14.7681],
  'POTENZA': [40.6416, 15.8069], 'AVELLINO': [40.9148, 14.7910],
  'CASERTA': [41.0733, 14.3331], 'BATTIPAGLIA': [40.6080, 14.9830],
  'CASTELLAMMARE DI STABIA': [40.7024, 14.4800],
  'MELFI': [40.9968, 15.6510], 'LAURIA': [40.0478, 15.8352],
  'ROMA': [41.9028, 12.4964], 'BARI': [41.1171, 16.8719],
  'FOGGIA': [41.4621, 15.5444], 'TARANTO': [40.4642, 17.2470],
  'LECCE': [40.3516, 18.1750], 'BRINDISI': [40.6327, 17.9413],
  'REGGIO CALABRIA': [38.1110, 15.6613], 'CATANZARO': [38.9098, 16.5876],
  'COSENZA': [39.3000, 16.2500], 'MATERA': [40.6664, 16.6043],
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function VisitMap({ stops, height = 220, onStopClick, onStatsUpdate }: Props) {
  const mapRef     = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<ReturnType<typeof import('leaflet')['map']> | null>(null);

  const visibleStops = stops.filter(s => s.status !== 'removed');

  useEffect(() => {
    if (!mapRef.current) return;

    async function init() {
      const L = await import('leaflet');
      // @ts-ignore
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }

      const map = L.map(mapRef.current!, { zoomControl: true });
      leafletRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      // Mappa stopId → indice nel points array (solo per stop geocodificati)
      const points: [number, number][] = [];
      const stopIndexInPoints: number[] = []; // -1 se centroide, indice se geocodificato reale

      visibleStops.forEach((stop, i) => {
        let lat: number | null = stop.lat ?? null;
        let lng: number | null = stop.lng ?? null;
        const isRealGeocode = lat != null && lng != null;

        if (!isRealGeocode) {
          const cityKey = stop.displayName.toUpperCase().trim();
          const centroid = CITY_CENTROIDS[cityKey] ?? null;
          if (!centroid) { stopIndexInPoints.push(-1); return; }
          [lat, lng] = centroid;
        }

        const pointIdx = points.length;
        points.push([lat!, lng!]);
        stopIndexInPoints.push(isRealGeocode ? pointIdx : -1);

        const color = STOP_STATUS_COLORS[stop.status];
        const icon = L.divIcon({
          html: `<div style="background:${color};color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3)">${stop.sequence ?? i + 1}</div>`,
          className: '', iconSize: [24, 24], iconAnchor: [12, 12],
        });

        const marker = L.marker([lat!, lng!], { icon }).addTo(map);
        marker.bindPopup(`<b>${stop.displayName}</b><br>${stop.status}`);
        if (onStopClick) marker.on('click', () => onStopClick(stop));
      });

      // Calcola stats distanza (fattore 1.25 per approssimare il percorso stradale)
      let totalKm = 0;
      for (let i = 0; i < points.length - 1; i++) {
        totalKm += haversineKm(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]) * 1.25;
      }
      const geocodedCount = visibleStops.filter(s => s.lat != null && s.lng != null).length;

      if (onStatsUpdate) {
        onStatsUpdate({ totalKm, geocodedCount, totalStops: visibleStops.length });
      }

      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points), { padding: [20, 20], maxZoom: 13 });
      } else {
        map.setView([40.85, 14.27], 8);
      }

      // Polyline: separa visitati da futuri
      if (points.length > 1) {
        const visitedStatuses = new Set(['visited']);
        const lastVisitedIdx = visibleStops.reduce((last, s, i) =>
          visitedStatuses.has(s.status) ? i : last, -1);

        // Polyline verde: punti fino all'ultimo visitato
        if (lastVisitedIdx >= 1 && points.length > 1) {
          const visitedPoints = points.slice(0, Math.min(lastVisitedIdx + 1, points.length));
          if (visitedPoints.length > 1) {
            L.polyline(visitedPoints, { color: '#16a34a', weight: 2.5, opacity: 0.9 }).addTo(map);
          }
        }

        // Polyline blu tratteggiato: dal punto successivo all'ultimo visitato in poi
        const futureStart = Math.max(0, lastVisitedIdx);
        const futurePoints = points.slice(futureStart);
        if (futurePoints.length > 1) {
          L.polyline(futurePoints, { color: '#2563eb', weight: 2, opacity: 0.7, dashArray: '5,8' }).addTo(map);
        }
      }

      // Legenda
      const legend = (L.control as any)({ position: 'bottomleft' });
      legend.onAdd = () => {
        const div = L.DomUtil.create('div');
        div.style.cssText = 'background:rgba(255,255,255,0.92);border-radius:8px;padding:8px 10px;font-size:10px;color:#374151;line-height:1.8;box-shadow:0 1px 4px rgba(0,0,0,.15)';
        div.innerHTML = [
          '<div><span style="color:#16a34a">●</span> Visitato &nbsp;<span style="color:#2563eb">●</span> Confermato &nbsp;<span style="color:#f59e0b">●</span> Da chiamare &nbsp;<span style="color:#9ca3af">●</span> Suggerito</div>',
          '<div style="color:#6b7280">— percorso completato &nbsp;╌ prossime tappe</div>',
        ].join('');
        return div;
      };
      legend.addTo(map);
    }

    init().catch(console.error);

    return () => {
      if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops.map(s => `${s.id}-${s.status}`).join(',')]);

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <div
        ref={mapRef}
        style={{
          height: typeof height === 'number' ? `${height}px` : height,
          width: '100%',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      />
    </>
  );
}
