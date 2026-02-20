import React, { Component, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import { SimulatedVehicleTracker } from '@/components/SimulatedVehicleTracker';
import { DemoGreenCorridorOverlay } from '@/components/GreenCorridorVisualizer';
import { TrafficSignalLayer } from '@/components/AmbulanceDemoPanel';
import { useDemoStore } from '@/stores/demoStore';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from 'next-themes';
import { dispatchApi } from '@/services/api';
import { getSocket, SOCKET_EVENTS } from '@/services/socket';
import type { DualRouteResponse, GeoJSONLineString, VehicleStatusEvent } from '@/types';

/** Theme-aware TileLayer that swaps between dark/light tiles */
function ThemeTileLayer() {
  const { theme } = useTheme();
  const url = theme === 'light'
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  return <TileLayer url={url} attribution='&copy; <a href="https://carto.com">CARTO</a>' />;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Convert GeoJSON [lng, lat] coordinates to Leaflet [lat, lng] LatLng tuples */
function geoToLatLngs(geometry: GeoJSONLineString | null | undefined): [number, number][] | null {
  if (!geometry?.coordinates?.length) return null;
  try {
    // Downsample very large routes (>2000 coords) to avoid perf issues
    const coords = geometry.coordinates;
    const step = coords.length > 2000 ? Math.ceil(coords.length / 2000) : 1;
    const result: [number, number][] = [];
    for (let i = 0; i < coords.length; i += step) {
      const c = coords[i];
      if (Array.isArray(c) && c.length >= 2 && isFinite(c[0]) && isFinite(c[1])) {
        result.push([c[1], c[0]]);
      }
    }
    // Always include last point
    if (coords.length > 1) {
      const last = coords[coords.length - 1];
      if (Array.isArray(last) && last.length >= 2 && isFinite(last[0]) && isFinite(last[1])) {
        result.push([last[1], last[0]]);
      }
    }
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

/** Validate a [lat, lng] pair */
function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number' && isFinite(lat) && isFinite(lng);
}

// ─── Custom icons (created lazily to avoid SSR issues) ───────────────────────
function makeIcon(emoji: string, size = 32) {
  return L.divIcon({
    html: `<div style="font-size:${size}px;text-align:center;line-height:${size}px">${emoji}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

let _vehicleIcons: Record<string, L.DivIcon> | null = null;
let _incidentIcon: L.DivIcon | null = null;
let _hospitalIcon: L.DivIcon | null = null;

function getVehicleIcon(type: string) {
  if (!_vehicleIcons) {
    _vehicleIcons = {
      AMBULANCE: makeIcon('🚑', 36),
      FIRE_BRIGADE: makeIcon('🚒', 36),
      POLICE: makeIcon('🚔', 36),
    };
  }
  return _vehicleIcons[type] || _vehicleIcons.AMBULANCE;
}
function getIncidentIcon() {
  if (!_incidentIcon) _incidentIcon = makeIcon('🔴', 28);
  return _incidentIcon;
}
function getHospitalIcon() {
  if (!_hospitalIcon) _hospitalIcon = makeIcon('🏥', 32);
  return _hospitalIcon;
}

// ─── Inline error boundary ──────────────────────────────────────────────────
class MapErrorBoundary extends Component<
  { children: React.ReactNode; height: string; onRetry: () => void },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err.message || 'Map rendering failed' };
  }
  render() {
    if (this.state.error) {
      return (
        <div
          className="flex items-center justify-center bg-gray-900 rounded-lg border border-red-500/30"
          style={{ height: this.props.height }}
        >
          <div className="text-center text-red-400 text-sm">
            <p>⚠ Map render error</p>
            <p className="text-gray-500 mt-1 max-w-xs">{this.state.error}</p>
            <button
              onClick={() => { this.setState({ error: null }); this.props.onRetry(); }}
              className="mt-2 text-xs text-blue-400 hover:underline"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Auto-fit bounds ─────────────────────────────────────────────────────────
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    try {
      const bounds = L.latLngBounds(points);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
    } catch {
      // Ignore bounds error
    }
  }, [points, map]);
  return null;
}

// ─── Map inner content (rendered inside MapContainer) ────────────────────────
function MapContent({
  vehicleRouteLatLngs,
  hospitalRouteLatLngs,
  vehicleRouteColor,
  hospitalRouteColor,
  vehicleStatus,
  currentVehiclePos,
  vehicleType,
  incident,
  hospital,
}: {
  vehicleRouteLatLngs: [number, number][] | null;
  hospitalRouteLatLngs: [number, number][] | null;
  vehicleRouteColor: string;
  hospitalRouteColor: string;
  vehicleStatus: string;
  currentVehiclePos: [number, number];
  vehicleType: string;
  incident: { latitude: number; longitude: number };
  hospital: { name?: string; beds?: number; latitude: number; longitude: number };
}) {
  const fitPoints = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    if (isValidLatLng(currentVehiclePos[0], currentVehiclePos[1])) pts.push(currentVehiclePos);
    if (isValidLatLng(incident.latitude, incident.longitude)) pts.push([incident.latitude, incident.longitude]);
    if (isValidLatLng(hospital.latitude, hospital.longitude)) pts.push([hospital.latitude, hospital.longitude]);
    return pts;
  }, [currentVehiclePos, incident.latitude, incident.longitude, hospital.latitude, hospital.longitude]);

  return (
    <>
      <ThemeTileLayer />
      <FitBounds points={fitPoints} />

      {/* Vehicle → Incident route */}
      {vehicleRouteLatLngs && vehicleRouteLatLngs.length > 1 && (
        <Polyline
          positions={vehicleRouteLatLngs}
          pathOptions={{
            color: vehicleRouteColor,
            weight: 4,
            opacity: 0.85,
            dashArray: vehicleStatus === 'EN_ROUTE' ? undefined : '8 6',
          }}
        />
      )}

      {/* Incident → Hospital route */}
      {hospitalRouteLatLngs && hospitalRouteLatLngs.length > 1 && (
        <Polyline
          positions={hospitalRouteLatLngs}
          pathOptions={{
            color: hospitalRouteColor,
            weight: 3,
            opacity: 0.7,
            dashArray: '6 4',
          }}
        />
      )}

      {/* Vehicle marker */}
      {isValidLatLng(currentVehiclePos[0], currentVehiclePos[1]) && (
        <Marker position={currentVehiclePos} icon={getVehicleIcon(vehicleType)}>
          <Popup>
            <strong>{vehicleType}</strong><br />
            Status: {vehicleStatus || 'DISPATCHED'}<br />
            {currentVehiclePos[0].toFixed(5)}, {currentVehiclePos[1].toFixed(5)}
          </Popup>
        </Marker>
      )}

      {/* Incident marker */}
      {isValidLatLng(incident.latitude, incident.longitude) && (
        <Marker position={[incident.latitude, incident.longitude]} icon={getIncidentIcon()}>
          <Popup>
            <strong>Incident Location</strong><br />
            {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}
          </Popup>
        </Marker>
      )}

      {/* Hospital marker */}
      {isValidLatLng(hospital.latitude, hospital.longitude) && (
        <Marker position={[hospital.latitude, hospital.longitude]} icon={getHospitalIcon()}>
          <Popup>
            <strong>{hospital.name || 'Hospital'}</strong><br />
            Beds: {hospital.beds ?? '—'}
          </Popup>
        </Marker>
      )}
    </>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
interface DispatchRouteLayerProps {
  dispatchId: string;
  vehicleType?: string;
  height?: string;
  showLabels?: boolean;
}

export default function DispatchRouteLayer({
  dispatchId,
  vehicleType = 'AMBULANCE',
  height = '400px',
  showLabels = true,
}: DispatchRouteLayerProps) {
  const [dualRoutes, setDualRoutes] = useState<DualRouteResponse | null>(null);
  const [vehiclePos, setVehiclePos] = useState<[number, number] | null>(null);
  const [vehicleStatus, setVehicleStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const routeFetchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const lastRouteFetch = useRef(0);

  // Fetch dual routes
  const fetchRoutes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dispatchApi.getDualRoutes(dispatchId);
      if (!data?.vehicle || !data?.incident || !data?.vehicleToIncident || !data?.incidentToHospital) {
        throw new Error('Incomplete route data from server');
      }
      setDualRoutes(data);
      if (isValidLatLng(data.vehicle.latitude, data.vehicle.longitude)) {
        setVehiclePos([data.vehicle.latitude, data.vehicle.longitude]);
      }
      setError(null);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to load routes';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [dispatchId]);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  // Subscribe to vehicle location updates — debounce route recalculation
  useEffect(() => {
    const socket = getSocket();

    const handleLocationUpdate = (data: VehicleStatusEvent) => {
      if (!dualRoutes) return;
      if (!data?.latitude || !data?.longitude) return;

      setVehiclePos([data.latitude, data.longitude]);
      if (data.status) setVehicleStatus(data.status);

      // Debounced route recalculation (max once per 10s)
      const now = Date.now();
      if (now - lastRouteFetch.current > 10000) {
        lastRouteFetch.current = now;
        if (routeFetchTimeout.current) clearTimeout(routeFetchTimeout.current);
        routeFetchTimeout.current = setTimeout(fetchRoutes, 2000);
      }
    };

    socket.on(SOCKET_EVENTS.VEHICLE_LOCATION_UPDATE, handleLocationUpdate);
    socket.on(SOCKET_EVENTS.VEHICLE_STATUS_UPDATED, handleLocationUpdate);

    return () => {
      socket.off(SOCKET_EVENTS.VEHICLE_LOCATION_UPDATE, handleLocationUpdate);
      socket.off(SOCKET_EVENTS.VEHICLE_STATUS_UPDATED, handleLocationUpdate);
      if (routeFetchTimeout.current) clearTimeout(routeFetchTimeout.current);
    };
  }, [dualRoutes, fetchRoutes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-gray-900 rounded-lg" style={{ height }}>
        <div className="text-center text-gray-400">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
          Loading routes...
        </div>
      </div>
    );
  }

  if (error || !dualRoutes) {
    return (
      <div className="flex items-center justify-center bg-gray-900 rounded-lg border border-red-500/30" style={{ height }}>
        <div className="text-center text-red-400 text-sm">
          <p>⚠ Route data unavailable</p>
          <p className="text-gray-500 mt-1">{error}</p>
          <button onClick={fetchRoutes} className="mt-2 text-xs text-blue-400 hover:underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const vehicle = dualRoutes.vehicle;
  const incident = dualRoutes.incident;
  const hospital = dualRoutes.hospital || { latitude: 0, longitude: 0, name: 'Unknown', beds: 0, id: '' };
  const vehicleToIncident = dualRoutes.vehicleToIncident;
  const incidentToHospital = dualRoutes.incidentToHospital;

  const currentVehiclePos: [number, number] = vehiclePos
    ?? (isValidLatLng(vehicle?.latitude, vehicle?.longitude)
      ? [vehicle.latitude, vehicle.longitude]
      : [incident?.latitude ?? 0, incident?.longitude ?? 0]);

  // Convert GeoJSON to Leaflet coordinates
  const vehicleRouteLatLngs = geoToLatLngs(vehicleToIncident?.geometry as GeoJSONLineString | null);
  const hospitalRouteLatLngs = geoToLatLngs(incidentToHospital?.geometry as GeoJSONLineString | null);

  // Route colors
  const vehicleRouteColor = vehicleType === 'FIRE_BRIGADE' ? '#ef4444' : vehicleType === 'POLICE' ? '#3b82f6' : '#22c55e';
  const hospitalRouteColor = '#a855f7';

  // Map center — prefer incident coords
  const mapCenter: [number, number] = isValidLatLng(incident?.latitude, incident?.longitude)
    ? [incident.latitude, incident.longitude]
    : currentVehiclePos;

  return (
    <MapErrorBoundary height={height} onRetry={fetchRoutes}>
      <div className="relative rounded-lg overflow-hidden border border-gray-700" style={{ height }}>
        {/* Route info overlay */}
        {showLabels && (
          <div className="absolute top-2 left-2 z-[1000] space-y-1">
            <div className="flex items-center gap-2 bg-black/80 backdrop-blur rounded px-2 py-1 text-xs">
              <div className="w-3 h-0.5 rounded" style={{ background: vehicleRouteColor }} />
              <span className="text-white">
                Vehicle → Incident: {vehicleToIncident?.distanceKm?.toFixed(1) ?? '?'} km
                {vehicleToIncident?.durationSec ? ` • ${Math.ceil(vehicleToIncident.durationSec / 60)} min` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-black/80 backdrop-blur rounded px-2 py-1 text-xs">
              <div className="w-3 h-0.5 rounded" style={{ background: hospitalRouteColor }} />
              <span className="text-white">
                Incident → Hospital: {incidentToHospital?.distanceKm?.toFixed(1) ?? '?'} km
                {incidentToHospital?.durationSec ? ` • ${Math.ceil(incidentToHospital.durationSec / 60)} min` : ''}
              </span>
            </div>
          </div>
        )}

        <MapContainer
          center={mapCenter}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <MapContent
            vehicleRouteLatLngs={vehicleRouteLatLngs}
            hospitalRouteLatLngs={hospitalRouteLatLngs}
            vehicleRouteColor={vehicleRouteColor}
            hospitalRouteColor={hospitalRouteColor}
            vehicleStatus={vehicleStatus}
            currentVehiclePos={currentVehiclePos}
            vehicleType={vehicleType}
            incident={incident}
            hospital={hospital}
          />
          {/* Demo simulation overlays */}
          <SimulatedVehicleTracker showTrail showEta />
          <DemoGreenCorridorOverlay />
          {/* Traffic signal markers */}
          <TrafficSignalLayer />
        </MapContainer>
      </div>
    </MapErrorBoundary>
  );
}
