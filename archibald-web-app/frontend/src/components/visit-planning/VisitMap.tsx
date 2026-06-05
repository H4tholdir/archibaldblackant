import { useEffect, useRef } from 'react';
import type { VisitPlanningStop } from '../../types/visit-planning';
import { STOP_STATUS_COLORS } from '../../types/visit-planning';

type Props = {
  stops:        VisitPlanningStop[];
  height?:      number | string;
  onStopClick?: (stop: VisitPlanningStop) => void;
};

// Fallback centroidi per città comuni — usato solo se il geocoding non è disponibile
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

export function VisitMap({ stops, height = 220, onStopClick }: Props) {
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

      const points: [number, number][] = [];

      visibleStops.forEach((stop, i) => {
        // Usa coordinate geocodificate reali; fallback sul centroide della città
        let lat: number | null = stop.lat ?? null;
        let lng: number | null = stop.lng ?? null;
        if (lat == null || lng == null) {
          const cityKey = stop.recommendationReasons
            .find(r => r.startsWith('Zona '))
            ?.replace(/^Zona /, '')
            .replace(/ — .*$/, '')
            .toUpperCase() ?? '';
          const centroid = CITY_CENTROIDS[cityKey] ?? null;
          if (!centroid) return;
          [lat, lng] = centroid;
        }
        points.push([lat, lng]);

        const color = STOP_STATUS_COLORS[stop.status];
        const icon = L.divIcon({
          html: `<div style="background:${color};color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3)">${stop.sequence ?? i + 1}</div>`,
          className: '',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = L.marker([lat, lng], { icon }).addTo(map);
        marker.bindPopup(`<b>${stop.displayName}</b><br>${stop.status}`);
        if (onStopClick) marker.on('click', () => onStopClick(stop));
      });

      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points), { padding: [20, 20], maxZoom: 13 });
      } else {
        map.setView([40.85, 14.27], 8);
      }

      if (points.length > 1) {
        L.polyline(points, { color: '#2563eb', weight: 2, opacity: 0.6, dashArray: '5,8' }).addTo(map);
      }
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
