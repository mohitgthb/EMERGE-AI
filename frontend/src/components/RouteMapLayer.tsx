import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import type { GreenCorridorSignal, GeoJSONLineString } from '@/types';

interface RouteSegment {
  id: string;
  geometry: GeoJSONLineString | null;
  color: string;
  label: string;
  dashArray?: string;
}

interface VehicleMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  vehicleNo: string;
  status: string;
  type: 'ambulance' | 'fire_brigade' | 'police';
}

interface IncidentMarker {
  id: string;
  lat: number;
  lng: number;
  severity: string;
  type: string;
  label: string;
}

interface HospitalMarker {
  id: string;
  lat: number;
  lng: number;
  name: string;
  beds: number;
}

interface RouteMapLayerProps {
  routes?: RouteSegment[];
  vehicles?: VehicleMarker[];
  incidents?: IncidentMarker[];
  hospitals?: HospitalMarker[];
  greenCorridorSignals?: GreenCorridorSignal[];
  greenCorridorActive?: boolean;
  center?: [number, number];
  zoom?: number;
  height?: string;
  className?: string;
}

const severityColors: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f59e0b',
  MEDIUM: '#3b82f6',
  LOW: '#22c55e',
};

const vehicleColors: Record<string, string> = {
  ambulance: '#3b82f6',
  fire_brigade: '#ef4444',
  police: '#a855f7',
};

const vehicleEmojis: Record<string, string> = {
  ambulance: '🚑',
  fire_brigade: '🚒',
  police: '🚔',
};

function createVehicleIcon(type: string, status: string) {
  const color = vehicleColors[type] || '#3b82f6';
  const emoji = vehicleEmojis[type] || '🚗';
  const isMoving = status === 'EN_ROUTE';
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 36px; height: 36px; border-radius: 8px;
      background: hsl(220, 18%, 10%); border: 2px solid ${color};
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; box-shadow: 0 0 12px ${color}66;
      ${isMoving ? 'animation: pulse 1.5s infinite;' : ''}
    ">${emoji}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function createIncidentIcon(severity: string) {
  const color = severityColors[severity] || '#f59e0b';
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 30px; height: 30px; border-radius: 50%;
      background: ${color}22; border: 2px solid ${color};
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 16px ${color}88;
      animation: pulse 2s infinite;
    "><div style="width: 12px; height: 12px; border-radius: 50%; background: ${color};"></div></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function createHospitalIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 32px; height: 32px; border-radius: 8px;
      background: hsl(220, 18%, 10%); border: 2px solid #22c55e;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; box-shadow: 0 0 8px #22c55e44;
    ">🏥</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function createSignalIcon(active: boolean) {
  const color = active ? '#22c55e' : '#6b7280';
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 20px; height: 20px; border-radius: 50%;
      background: ${color}; border: 2px solid ${color}88;
      box-shadow: 0 0 ${active ? '12px' : '4px'} ${color}${active ? 'cc' : '44'};
      ${active ? 'animation: pulse 1s infinite;' : ''}
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

export function RouteMapLayer({
  routes = [],
  vehicles = [],
  incidents = [],
  hospitals = [],
  greenCorridorSignals = [],
  greenCorridorActive = false,
  center = [34.0522, -118.2437],
  zoom = 14,
  height = '450px',
  className,
}: RouteMapLayerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const vehicleMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const signalLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const { theme } = useTheme();

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center,
      zoom,
      zoomControl: true,
    });

    tileLayerRef.current = L.tileLayer(
      theme === 'light'
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; OSM &copy; CARTO', maxZoom: 19 }
    ).addTo(map);

    routeLayerRef.current = L.layerGroup().addTo(map);
    signalLayerRef.current = L.layerGroup().addTo(map);

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
      vehicleMarkersRef.current.clear();
    };
  }, []);

  // Swap tile layer on theme change
  useEffect(() => {
    if (!tileLayerRef.current) return;
    tileLayerRef.current.setUrl(
      theme === 'light'
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    );
  }, [theme]);

  // Draw routes
  useEffect(() => {
    const layer = routeLayerRef.current;
    const map = mapInstance.current;
    if (!layer || !map) return;

    layer.clearLayers();

    routes.forEach((route) => {
      if (!route.geometry?.coordinates?.length) return;

      // GeoJSON coordinates are [lng, lat], Leaflet needs [lat, lng]
      const latLngs = route.geometry.coordinates.map(
        ([lng, lat]) => [lat, lng] as [number, number]
      );

      const polyline = L.polyline(latLngs, {
        color: route.color,
        weight: 4,
        opacity: 0.85,
        dashArray: route.dashArray || undefined,
      });

      polyline.bindPopup(
        `<div style="font-family: Inter, sans-serif; font-size: 12px; min-width: 120px;">
          <b>${route.label}</b>
        </div>`
      );

      polyline.addTo(layer);
    });
  }, [routes]);

  // Update vehicle markers with smooth animation
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    const existingIds = new Set(vehicles.map((v) => v.id));

    // Remove markers no longer present
    vehicleMarkersRef.current.forEach((marker, id) => {
      if (!existingIds.has(id)) {
        map.removeLayer(marker);
        vehicleMarkersRef.current.delete(id);
      }
    });

    // Add/update markers
    vehicles.forEach((v) => {
      const existing = vehicleMarkersRef.current.get(v.id);
      if (existing) {
        // Smooth animate to new position
        const targetLatLng = L.latLng(v.lat, v.lng);
        const currentLatLng = existing.getLatLng();
        if (currentLatLng.distanceTo(targetLatLng) > 1) {
          existing.setLatLng(targetLatLng);
        }
        existing.setIcon(createVehicleIcon(v.type, v.status));
      } else {
        const marker = L.marker([v.lat, v.lng], {
          icon: createVehicleIcon(v.type, v.status),
          zIndexOffset: 1000,
        }).addTo(map);

        marker.bindPopup(
          `<div style="font-family: Inter, sans-serif; font-size: 12px; min-width: 140px;">
            <b>${v.vehicleNo}</b><br/>
            <span style="text-transform: uppercase; font-size: 11px;">${v.type.replace('_', ' ')}</span><br/>
            <span style="color: ${vehicleColors[v.type] || '#3b82f6'}; font-weight: 600;">${v.status.replace('_', ' ')}</span>
          </div>`
        );

        vehicleMarkersRef.current.set(v.id, marker);
      }
    });
  }, [vehicles]);

  // Update incidents (clear and re-add)
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // We use a temp layer for incidents
    map.eachLayer((layer) => {
      if ((layer as any)._isIncident) map.removeLayer(layer);
    });

    incidents.forEach((inc) => {
      const marker = L.marker([inc.lat, inc.lng], {
        icon: createIncidentIcon(inc.severity),
        zIndexOffset: 500,
      }).addTo(map);

      (marker as any)._isIncident = true;

      marker.bindPopup(
        `<div style="font-family: Inter, sans-serif; font-size: 12px; min-width: 160px;">
          <b>${inc.type}</b><br/>
          <span style="color: ${severityColors[inc.severity] || '#3b82f6'}; font-weight: 600;">${inc.severity}</span><br/>
          <span style="font-family: monospace; font-size: 11px;">${inc.lat.toFixed(4)}, ${inc.lng.toFixed(4)}</span>
        </div>`
      );
    });
  }, [incidents]);

  // Update hospitals
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    map.eachLayer((layer) => {
      if ((layer as any)._isHospital) map.removeLayer(layer);
    });

    hospitals.forEach((h) => {
      const marker = L.marker([h.lat, h.lng], {
        icon: createHospitalIcon(),
        zIndexOffset: 200,
      }).addTo(map);

      (marker as any)._isHospital = true;

      marker.bindPopup(
        `<div style="font-family: Inter, sans-serif; font-size: 12px; min-width: 140px;">
          <b>🏥 ${h.name}</b><br/>
          <span>Available beds: ${h.beds}</span>
        </div>`
      );
    });
  }, [hospitals]);

  // Green corridor signals
  useEffect(() => {
    const layer = signalLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    if (!greenCorridorActive) return;

    greenCorridorSignals.forEach((signal) => {
      const marker = L.marker([signal.latitude, signal.longitude], {
        icon: createSignalIcon(true),
        zIndexOffset: 800,
      }).addTo(layer);

      marker.bindPopup(
        `<div style="font-family: Inter, sans-serif; font-size: 12px;">
          <b style="color: #22c55e;">🟢 GREEN SIGNAL</b><br/>
          Junction: ${signal.junctionId}
        </div>`
      );
    });
  }, [greenCorridorSignals, greenCorridorActive]);

  // Auto-fit bounds when data changes
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    const points: [number, number][] = [
      ...vehicles.map((v) => [v.lat, v.lng] as [number, number]),
      ...incidents.map((i) => [i.lat, i.lng] as [number, number]),
      ...hospitals.map((h) => [h.lat, h.lng] as [number, number]),
    ];

    if (points.length >= 2) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    }
  }, [vehicles.length, incidents.length, hospitals.length]);

  return (
    <div className="relative">
      <div
        ref={mapRef}
        className={cn('w-full rounded-lg border border-border overflow-hidden', className)}
        style={{ height }}
      />

      {/* Green corridor overlay badge */}
      {greenCorridorActive && (
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 bg-emerald-900/90 backdrop-blur-sm border border-emerald-500/50 rounded-full px-3 py-1.5 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
            Green Corridor Active
          </span>
          <span className="text-[10px] text-emerald-400 font-mono">
            {greenCorridorSignals.length} signals
          </span>
        </div>
      )}
    </div>
  );
}
