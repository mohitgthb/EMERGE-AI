import { useEffect, useState, useCallback, useMemo } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { dispatchApi } from '@/services/api';
import { useEmergencyStore } from '@/stores/emergencyStore';
import type { DualRouteResponse, GeoJSONLineString } from '@/types';
import { cn } from '@/lib/utils';

/**
 * GreenCorridorOverlay
 * Renders a wide, semi-transparent green corridor along the dispatch route
 * when green corridor is active. Shows corridor along the vehicle→incident→hospital path.
 * Must be used inside a <MapContainer>.
 */
interface GreenCorridorOverlayProps {
  dispatchId?: string;
  className?: string;
}

export function GreenCorridorOverlay({ dispatchId }: GreenCorridorOverlayProps) {
  const map = useMap();
  const { greenCorridorActive, greenCorridorSignals } = useEmergencyStore();
  const [routeData, setRouteData] = useState<DualRouteResponse | null>(null);

  // Fetch route if dispatch is provided
  const fetchRoute = useCallback(async () => {
    if (!dispatchId) return;
    try {
      const data = await dispatchApi.getDualRoutes(dispatchId);
      setRouteData(data);
    } catch (err) {
      console.error('GreenCorridorOverlay: Failed to fetch routes', err);
    }
  }, [dispatchId]);

  useEffect(() => {
    if (greenCorridorActive && dispatchId) {
      fetchRoute();
    }
  }, [greenCorridorActive, dispatchId, fetchRoute]);

  // Add signal markers for green corridor intersections
  useEffect(() => {
    if (!greenCorridorActive || greenCorridorSignals.length === 0) return;

    const markers: L.CircleMarker[] = [];

    greenCorridorSignals.forEach((signal) => {
      const marker = L.circleMarker([signal.latitude, signal.longitude], {
        radius: 10,
        color: '#22c55e',
        fillColor: '#22c55e',
        fillOpacity: 0.5,
        weight: 2,
        className: 'green-corridor-signal',
      }).bindPopup(
        `<div style="font-family:Inter;font-size:12px">
          <b>🚦 Green Signal</b><br/>
          Junction: ${signal.junctionId}<br/>
          Status: <span style="color:#22c55e;font-weight:bold">GREEN</span>
        </div>`
      );
      marker.addTo(map);
      markers.push(marker);
    });

    return () => {
      markers.forEach((m) => m.remove());
    };
  }, [map, greenCorridorActive, greenCorridorSignals]);

  if (!greenCorridorActive) return null;

  // Render corridor along both routes
  const corridorStyle: L.PathOptions = {
    color: '#22c55e',
    weight: 20,
    opacity: 0.2,
    lineCap: 'round',
    lineJoin: 'round',
  };

  const vehicleRouteGeo = routeData?.vehicleToIncident?.geometry as GeoJSONLineString | null;
  const hospitalRouteGeo = routeData?.incidentToHospital?.geometry as GeoJSONLineString | null;

  return (
    <>
      {vehicleRouteGeo && (
        <GeoJSON
          key={`gc-v2i-${dispatchId}-${Date.now()}`}
          data={{
            type: 'Feature' as const,
            geometry: vehicleRouteGeo,
          } as any}
          style={corridorStyle}
        />
      )}
      {hospitalRouteGeo && (
        <GeoJSON
          key={`gc-i2h-${dispatchId}-${Date.now()}`}
          data={{
            type: 'Feature' as const,
            geometry: hospitalRouteGeo,
          } as any}
          style={corridorStyle}
        />
      )}
    </>
  );
}

/**
 * Standalone green corridor status panel (non-map component)
 * Shows corridor state, affected signals count, and route coverage.
 */
interface GreenCorridorStatusProps {
  dispatchId?: string;
  vehicleId?: string;
  vehicleType?: string;
  className?: string;
}

export function GreenCorridorStatus({
  dispatchId,
  vehicleId,
  vehicleType,
  className,
}: GreenCorridorStatusProps) {
  const {
    greenCorridorActive,
    greenCorridorVehicleId,
    greenCorridorSignals,
  } = useEmergencyStore();

  const isActiveForVehicle =
    greenCorridorActive &&
    (!vehicleId || greenCorridorVehicleId === vehicleId);

  const [routeData, setRouteData] = useState<DualRouteResponse | null>(null);

  useEffect(() => {
    if (isActiveForVehicle && dispatchId) {
      dispatchApi.getDualRoutes(dispatchId).then(setRouteData).catch(() => {});
    }
  }, [isActiveForVehicle, dispatchId]);

  if (!isActiveForVehicle) return null;

  const totalRouteKm =
    (routeData?.vehicleToIncident?.distanceKm || 0) +
    (routeData?.incidentToHospital?.distanceKm || 0);

  return (
    <div
      className={cn(
        'rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-4 space-y-3',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-500/20">
          <span className="text-xl">🟢</span>
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold text-emerald-400 uppercase">
            Green Corridor Active
          </p>
          <p className="text-[10px] text-muted-foreground">
            Traffic signals prioritized along route
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-emerald-400 font-mono">
            {greenCorridorSignals.length}
          </p>
          <p className="text-[9px] text-muted-foreground uppercase">Signals</p>
        </div>
      </div>

      {totalRouteKm > 0 && (
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="p-2 rounded bg-background/30">
            <p className="text-[10px] text-muted-foreground">Route Coverage</p>
            <p className="text-sm font-bold text-foreground font-mono">
              {totalRouteKm.toFixed(1)} km
            </p>
          </div>
          <div className="p-2 rounded bg-background/30">
            <p className="text-[10px] text-muted-foreground">Signal Density</p>
            <p className="text-sm font-bold text-foreground font-mono">
              {totalRouteKm > 0
                ? (greenCorridorSignals.length / totalRouteKm).toFixed(1)
                : '0'}{' '}
              /km
            </p>
          </div>
        </div>
      )}

      {/* Signal list */}
      {greenCorridorSignals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {greenCorridorSignals.slice(0, 8).map((signal) => (
            <div
              key={signal.id}
              className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono text-emerald-300">
                {signal.junctionId}
              </span>
            </div>
          ))}
          {greenCorridorSignals.length > 8 && (
            <span className="text-[10px] text-muted-foreground self-center">
              +{greenCorridorSignals.length - 8} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
