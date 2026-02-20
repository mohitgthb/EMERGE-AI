import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;
  icon?: string;
  popupHtml?: string;
}

interface ReusableMapProps {
  markers?: MapMarker[];
  center?: [number, number];
  zoom?: number;
  className?: string;
  height?: string;
  routePoints?: [number, number][];
}

export function ReusableMap({
  markers = [],
  center = [34.0522, -118.2437],
  zoom = 14,
  className,
  height = '400px',
  routePoints,
}: ReusableMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const { theme } = useTheme();

  const tileUrl = theme === 'light'
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, { center, zoom, zoomControl: true });

    tileLayerRef.current = L.tileLayer(tileUrl, {
      attribution: '&copy; OSM &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  // Swap tile layer when theme changes
  useEffect(() => {
    if (!mapInstance.current || !tileLayerRef.current) return;
    tileLayerRef.current.setUrl(tileUrl);
  }, [tileUrl]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear existing markers & layers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    markers.forEach((m) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:28px;height:28px;border-radius:50%;
          background:${m.color}22;border:2px solid ${m.color};
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 0 12px ${m.color}66;font-size:14px;
        ">${m.icon || '<div style="width:10px;height:10px;border-radius:50%;background:' + m.color + '"></div>'}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([m.lat, m.lng], { icon }).addTo(map);
      if (m.popupHtml) {
        marker.bindPopup(m.popupHtml);
      }
    });

    if (routePoints && routePoints.length > 1) {
      L.polyline(routePoints, {
        color: 'hsl(210, 100%, 52%)',
        weight: 3,
        opacity: 0.7,
        dashArray: '8 8',
      }).addTo(map);
    }
  }, [markers, routePoints]);

  return (
    <div
      ref={mapRef}
      className={cn('w-full rounded-lg border border-border overflow-hidden', className)}
      style={{ height }}
    />
  );
}
