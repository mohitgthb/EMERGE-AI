import { useEffect, useMemo, useRef } from 'react';
import { Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useDemoStore } from '@/stores/demoStore';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { cn } from '@/lib/utils';

// ── Map overlay component ───────────────────────────────────────────────────

/**
 * DemoGreenCorridorOverlay
 *
 * Enhanced green corridor visualization specifically for demo simulation mode.
 * Highlights the corridor route with a glowing green polyline, animated signal
 * markers, and a pulsing leading edge.
 *
 * Must be used inside a <MapContainer>.
 */
export function DemoGreenCorridorOverlay() {
  const map = useMap();
  const {
    enabled,
    corridorRouteCoords,
    corridorOverlayVisible,
  } = useDemoStore();
  const { greenCorridorSignals } = useEmergencyStore();

  const routeCoords: [number, number][] = useMemo(() => {
    if (!corridorRouteCoords || corridorRouteCoords.length === 0) return [];
    // Coords come as [lat, lng] from the store
    return corridorRouteCoords.map((c: [number, number]) => [c[0], c[1]]);
  }, [corridorRouteCoords]);

  if (!enabled || !corridorOverlayVisible || routeCoords.length < 2) return null;

  return (
    <>
      {/* Wide semi-transparent corridor backdrop */}
      <Polyline
        positions={routeCoords}
        pathOptions={{
          color: '#22c55e',
          weight: 28,
          opacity: 0.12,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      {/* Medium green corridor */}
      <Polyline
        positions={routeCoords}
        pathOptions={{
          color: '#22c55e',
          weight: 8,
          opacity: 0.35,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      {/* Bright center line */}
      <Polyline
        positions={routeCoords}
        pathOptions={{
          color: '#4ade80',
          weight: 3,
          opacity: 0.7,
          dashArray: '12 6',
          lineCap: 'round',
        }}
      />

      {/* Signal markers along corridor */}
      {greenCorridorSignals.map((signal) => (
        <CircleMarker
          key={signal.id}
          center={[signal.latitude, signal.longitude]}
          radius={7}
          pathOptions={{
            color: '#22c55e',
            fillColor: '#4ade80',
            fillOpacity: 0.6,
            weight: 2,
          }}
        >
          <Popup>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px' }}>
              <strong>🚦 {signal.junctionId}</strong><br/>
              <span style={{ color: '#22c55e', fontWeight: 700 }}>GREEN</span>
              <span style={{ color: '#999', fontSize: '10px', marginLeft: '4px' }}>(simulated)</span>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

// ── Non-map corridor banner ─────────────────────────────────────────────────

interface DemoCorridorBannerProps {
  className?: string;
}

/**
 * Non-map banner component that shows when demo green corridor is active.
 * Place at the top of dashboard layouts.
 */
export function DemoCorridorBanner({ className }: DemoCorridorBannerProps) {
  const { enabled, corridorOverlayVisible, corridorMessage } = useDemoStore();
  const { greenCorridorSignals } = useEmergencyStore();

  if (!enabled || !corridorOverlayVisible) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 rounded-lg',
        'bg-emerald-500/10 border border-emerald-500/30',
        'animate-in fade-in slide-in-from-top-2 duration-300',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
        </span>
        <span className="text-sm font-semibold text-emerald-400">
          Green Corridor Active
        </span>
      </div>
      <span className="text-xs text-emerald-300/70">
        {corridorMessage || `${greenCorridorSignals.length} traffic signals prioritized`}
      </span>
      <span className="ml-auto text-[10px] font-mono text-amber-400/60 uppercase">
        simulated
      </span>
    </div>
  );
}
