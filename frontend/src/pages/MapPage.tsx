import { useMemo, useState } from 'react';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { LoadingState, BackendUnavailable } from '@/components/ErrorBoundary';
import { RouteMapLayer } from '@/components/RouteMapLayer';
import { GreenCorridorIndicator } from '@/components/GreenCorridorIndicator';
import { DemoCorridorBanner } from '@/components/GreenCorridorVisualizer';
import { DemoModeToggle } from '@/components/DemoModeToggle';
import type { GeoJSONLineString } from '@/types';

export default function MapPage() {
  const {
    accidents, fireIncidents, sosEvents,
    ambulances, fireBrigades, policeUnits,
    hospitals, dispatches,
    greenCorridorActive, greenCorridorVehicleId, greenCorridorSignals,
    loading, connected,
  } = useEmergencyStore();

  const [showRoutes, setShowRoutes] = useState(true);

  // Build incident markers
  const incidentMarkers = useMemo(() => [
    ...accidents.map((a) => ({
      id: a.id, lat: a.latitude, lng: a.longitude,
      severity: a.severity, type: a.emergencyType || 'ACCIDENT',
      label: `Accident — ${a.severity}`,
    })),
    ...fireIncidents.map((f) => ({
      id: f.id, lat: f.latitude, lng: f.longitude,
      severity: f.severity, type: 'FIRE',
      label: `Fire — ${f.severity}`,
    })),
    ...sosEvents.filter((s) => s.status !== 'REJECTED').map((s) => ({
      id: s.id, lat: s.latitude, lng: s.longitude,
      severity: s.severity, type: s.emergencyType,
      label: `SOS ${s.emergencyType} — ${s.status}`,
    })),
  ], [accidents, fireIncidents, sosEvents]);

  // Build vehicle markers
  const vehicleMarkers = useMemo(() => [
    ...ambulances.map((a) => ({
      id: a.id, lat: a.latitude, lng: a.longitude,
      type: 'ambulance' as const, vehicleNo: a.vehicleNo,
      status: a.status, label: a.vehicleNo,
    })),
    ...fireBrigades.map((f) => ({
      id: f.id, lat: f.latitude, lng: f.longitude,
      type: 'fire_brigade' as const, vehicleNo: f.vehicleNo,
      status: f.status, label: f.vehicleNo,
    })),
    ...policeUnits.map((p) => ({
      id: p.id, lat: p.latitude, lng: p.longitude,
      type: 'police' as const, vehicleNo: p.vehicleNo,
      status: p.status, label: p.vehicleNo,
    })),
  ], [ambulances, fireBrigades, policeUnits]);

  // Build hospital markers
  const hospitalMarkers = useMemo(() =>
    hospitals.map((h) => ({
      id: h.id, lat: h.latitude, lng: h.longitude,
      name: h.name, beds: h.beds,
    })),
  [hospitals]);

  // Build route segments from active dispatches
  const routeSegments = useMemo(() => {
    if (!dispatches || !showRoutes) return [];
    const segments: { id: string; geometry: GeoJSONLineString | null; color: string; label: string; dashArray?: string }[] = [];

    dispatches.accidentDispatches.forEach((d) => {
      if (d.routeGeometry) {
        segments.push({
          id: `route-amb-${d.id}`,
          geometry: d.routeGeometry as GeoJSONLineString,
          color: '#3b82f6',
          label: `Ambulance → Incident`,
        });
      }
    });

    dispatches.fireDispatches.forEach((d) => {
      if (d.routeGeometry) {
        segments.push({
          id: `route-fire-${d.id}`,
          geometry: d.routeGeometry as GeoJSONLineString,
          color: '#ef4444',
          label: `Fire Brigade → Incident`,
        });
      }
    });

    dispatches.policeDispatches.forEach((d) => {
      if (d.routeGeometry) {
        segments.push({
          id: `route-police-${d.id}`,
          geometry: d.routeGeometry as GeoJSONLineString,
          color: '#a855f7',
          label: `Police → Incident`,
        });
      }
    });

    return segments;
  }, [dispatches, showRoutes]);

  // Find the active green corridor vehicle for the indicator
  const corridorVehicle = useMemo(() => {
    if (!greenCorridorActive || !greenCorridorVehicleId) return null;
    const amb = ambulances.find((a) => a.id === greenCorridorVehicleId);
    if (amb) return { id: amb.id, type: 'AMBULANCE' as const };
    const fb = fireBrigades.find((f) => f.id === greenCorridorVehicleId);
    if (fb) return { id: fb.id, type: 'FIRE_BRIGADE' as const };
    const pu = policeUnits.find((p) => p.id === greenCorridorVehicleId);
    if (pu) return { id: pu.id, type: 'POLICE' as const };
    return null;
  }, [greenCorridorActive, greenCorridorVehicleId, ambulances, fireBrigades, policeUnits]);

  if (loading && incidentMarkers.length === 0 && vehicleMarkers.length === 0) return <LoadingState label="Loading map data..." />;
  if (!connected && incidentMarkers.length === 0 && vehicleMarkers.length === 0 && !loading) return <BackendUnavailable />;

  return (
    <div className="space-y-4">
      {/* Demo green corridor banner */}
      <DemoCorridorBanner />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Live Operations Map</h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            LIVE — {incidentMarkers.length} INCIDENTS — {vehicleMarkers.length} UNITS — {routeSegments.length} ROUTES
          </p>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <DemoModeToggle compact />
          <button
            onClick={() => setShowRoutes(!showRoutes)}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              showRoutes
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${showRoutes ? 'bg-primary' : 'bg-muted-foreground'}`} />
            Routes
          </button>
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            {[
              { label: 'Incident', color: 'bg-amber-500' },
              { label: 'Ambulance', color: 'bg-blue-500' },
              { label: 'Police', color: 'bg-purple-500' },
              { label: 'Fire Unit', color: 'bg-red-500' },
              { label: 'Hospital', color: 'bg-emerald-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${item.color}`} />
                <span className="text-[11px] text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <RouteMapLayer
        routes={routeSegments}
        vehicles={vehicleMarkers}
        incidents={incidentMarkers}
        hospitals={hospitalMarkers}
        greenCorridorSignals={greenCorridorSignals}
        greenCorridorActive={greenCorridorActive}
        height="calc(100vh - 240px)"
      />

      {greenCorridorActive && corridorVehicle && (
        <div className="absolute right-3 sm:right-6 bottom-4 sm:bottom-8 z-[1001] w-64 sm:w-72">
          <GreenCorridorIndicator
            vehicleId={corridorVehicle.id}
            vehicleType={corridorVehicle.type}
            compact={false}
          />
        </div>
      )}
    </div>
  );
}
