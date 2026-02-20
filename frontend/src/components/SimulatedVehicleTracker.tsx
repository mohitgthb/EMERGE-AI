import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useDemoStore } from '@/stores/demoStore';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { getSocket, SOCKET_EVENTS } from '@/services/socket';
import { getRouteSimulator } from '@/services/routeSimulatorService';
import type { VehicleStatusEvent } from '@/types';
import { cn } from '@/lib/utils';

// ── vehicle icons ───────────────────────────────────────────────────────────

function makeVehicleIcon(emoji: string, heading = 0, isSimulated = false) {
  return L.divIcon({
    html: `
      <div style="
        font-size: 32px;
        text-align: center;
        line-height: 32px;
        transform: rotate(${heading}deg);
        transition: transform 0.3s ease;
        filter: ${isSimulated ? 'drop-shadow(0 0 8px rgba(245,158,11,0.6))' : 'none'};
        position: relative;
      ">
        ${emoji}
        ${isSimulated ? '<div style="position:absolute;top:-6px;right:-6px;width:8px;height:8px;border-radius:50%;background:#f59e0b;border:1px solid #000;animation:pulse 1.5s infinite"></div>' : ''}
      </div>
    `,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

const vehicleEmojis: Record<string, string> = {
  AMBULANCE: '🚑',
  FIRE_BRIGADE: '🚒',
  POLICE: '🚔',
};

// ── component ───────────────────────────────────────────────────────────────

interface SimulatedVehicleTrackerProps {
  /** Filter to only show specific vehicle IDs */
  vehicleIds?: string[];
  /** Show trail of previous positions */
  showTrail?: boolean;
  /** Show ETA label on markers */
  showEta?: boolean;
}

interface TrackedVehicle {
  vehicleId: string;
  vehicleNo: string;
  vehicleType: string;
  latitude: number;
  longitude: number;
  heading: number;
  status: string;
  etaSeconds: number;
  phase: string;
  dispatchId: string;
  trail: [number, number][];
}

/**
 * SimulatedVehicleTracker
 *
 * Renders animated vehicle markers on a Leaflet map for demo simulation.
 * Must be used inside a <MapContainer>.
 *
 * Listens to VEHICLE_LOCATION_UPDATE events and uses RouteSimulatorService
 * for smooth interpolation between coordinate updates.
 */
export function SimulatedVehicleTracker({
  vehicleIds,
  showTrail = true,
  showEta = true,
}: SimulatedVehicleTrackerProps) {
  const map = useMap();
  const { enabled, progressMap } = useDemoStore();
  const [vehicles, setVehicles] = useState<Map<string, TrackedVehicle>>(new Map());
  const simulatorRef = useRef(getRouteSimulator());
  const vehiclesRef = useRef(vehicles);
  vehiclesRef.current = vehicles;

  // Listen for simulated location updates
  useEffect(() => {
    if (!enabled) return;

    const socket = getSocket();
    const simulator = simulatorRef.current;

    const handleLocationUpdate = (data: VehicleStatusEvent & { isSimulated?: boolean; etaSeconds?: number; phase?: string; dispatchId?: string }) => {
      if (!data.isSimulated) return;
      if (vehicleIds && !vehicleIds.includes(data.vehicleId)) return;

      // Push to interpolation service
      simulator.pushPosition(data.vehicleId, data.latitude, data.longitude);

      // Update tracked vehicle state
      setVehicles((prev) => {
        const next = new Map(prev);
        const existing = next.get(data.vehicleId);
        const trail = existing?.trail || [];

        // Add to trail (limit to last 30 points)
        const point: [number, number] = [data.latitude, data.longitude];
        const newTrail = [...trail, point].slice(-30);

        next.set(data.vehicleId, {
          vehicleId: data.vehicleId,
          vehicleNo: data.vehicleNo || existing?.vehicleNo || 'SIM',
          vehicleType: data.vehicleType || existing?.vehicleType || 'AMBULANCE',
          latitude: data.latitude,
          longitude: data.longitude,
          heading: existing?.heading || 0,
          status: data.status || 'EN_ROUTE',
          etaSeconds: data.etaSeconds ?? existing?.etaSeconds ?? 0,
          phase: data.phase ?? existing?.phase ?? 'TO_INCIDENT',
          dispatchId: data.dispatchId ?? existing?.dispatchId ?? '',
          trail: newTrail,
        });
        return next;
      });
    };

    // Listen to smooth interpolated positions for heading updates
    const unsubInterpolated = simulator.onPositionUpdate((pos) => {
      setVehicles((prev) => {
        const existing = prev.get(pos.vehicleId);
        if (!existing) return prev;
        if (
          Math.abs(existing.latitude - pos.latitude) < 0.000001 &&
          Math.abs(existing.longitude - pos.longitude) < 0.000001
        ) {
          return prev; // No change
        }
        const next = new Map(prev);
        next.set(pos.vehicleId, {
          ...existing,
          latitude: pos.latitude,
          longitude: pos.longitude,
          heading: pos.heading,
        });
        return next;
      });
    });

    socket.on(SOCKET_EVENTS.VEHICLE_LOCATION_UPDATE, handleLocationUpdate);

    return () => {
      socket.off(SOCKET_EVENTS.VEHICLE_LOCATION_UPDATE, handleLocationUpdate);
      unsubInterpolated();
    };
  }, [enabled, vehicleIds]);

  // Clear vehicles when demo mode is disabled
  useEffect(() => {
    if (!enabled) {
      setVehicles(new Map());
    }
  }, [enabled]);

  if (!enabled) return null;

  const vehicleArray = Array.from(vehicles.values());

  return (
    <>
      {vehicleArray.map((v) => {
        const emoji = vehicleEmojis[v.vehicleType] || '🚑';
        const icon = makeVehicleIcon(emoji, v.heading, true);
        const progress = progressMap[v.dispatchId];

        return (
          <div key={v.vehicleId}>
            {/* Trail polyline */}
            {showTrail && v.trail.length > 1 && (
              <Polyline
                positions={v.trail}
                pathOptions={{
                  color: v.vehicleType === 'FIRE_BRIGADE' ? '#ef4444'
                    : v.vehicleType === 'POLICE' ? '#a855f7'
                    : '#3b82f6',
                  weight: 2,
                  opacity: 0.4,
                  dashArray: '4 4',
                }}
              />
            )}

            {/* Vehicle marker */}
            <Marker
              position={[v.latitude, v.longitude]}
              icon={icon}
            >
              <Popup>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', minWidth: '160px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                    {emoji} {v.vehicleNo}
                    <span style={{ marginLeft: '8px', fontSize: '10px', color: '#f59e0b' }}>
                      [SIMULATED]
                    </span>
                  </div>
                  <div style={{ color: '#888', fontSize: '11px', lineHeight: '1.6' }}>
                    Status: <strong>{v.status}</strong><br />
                    Phase: {v.phase?.replace('_', ' ')}<br />
                    {showEta && v.etaSeconds > 0 && (
                      <>ETA: <strong>{v.etaSeconds > 60 ? `${Math.ceil(v.etaSeconds / 60)}m` : `${v.etaSeconds}s`}</strong><br /></>
                    )}
                    {progress && (
                      <>Progress: <strong>{progress.progress}%</strong><br /></>
                    )}
                    Coords: {v.latitude.toFixed(5)}, {v.longitude.toFixed(5)}
                  </div>
                </div>
              </Popup>
            </Marker>
          </div>
        );
      })}
    </>
  );
}

// ── ETA Badge overlay (non-map) ─────────────────────────────────────────────

interface SimulatedVehicleETAProps {
  vehicleId: string;
  className?: string;
}

/**
 * Displays an ETA countdown badge for a simulated vehicle.
 * Use outside of a map context.
 */
export function SimulatedVehicleETA({ vehicleId, className }: SimulatedVehicleETAProps) {
  const { enabled, progressMap } = useDemoStore();
  const [eta, setEta] = useState<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const socket = getSocket();
    const handler = (data: any) => {
      if (data.vehicleId === vehicleId && data.etaSeconds != null) {
        setEta(data.etaSeconds);
      }
    };

    socket.on('DEMO_SIMULATION_PROGRESS', handler);
    return () => { socket.off('DEMO_SIMULATION_PROGRESS', handler); };
  }, [enabled, vehicleId]);

  if (!enabled || eta <= 0) return null;

  const minutes = Math.floor(eta / 60);
  const seconds = eta % 60;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold',
        'bg-amber-500/15 text-amber-400 border border-amber-500/30',
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      ETA {minutes > 0 ? `${minutes}m ` : ''}{seconds}s
      <span className="text-[9px] font-normal text-amber-500/70">(sim)</span>
    </div>
  );
}
