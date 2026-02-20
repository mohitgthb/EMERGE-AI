import { useMemo, useState } from 'react';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { LoadingState, EmptyState, BackendUnavailable } from '@/components/ErrorBoundary';
import { StatusBadge } from '@/components/StatusBadge';
import { DispatchSummaryCard } from '@/components/DispatchSummaryCard';
import { VehicleStatusPanel } from '@/components/VehicleStatusPanel';
import { HospitalAssignmentCard } from '@/components/HospitalAssignmentCard';
import { GreenCorridorIndicator } from '@/components/GreenCorridorIndicator';
import { RouteMapLayer } from '@/components/RouteMapLayer';
import type { GeoJSONLineString, Dispatch, FireDispatch, PoliceDispatch, Ambulance, FireBrigade, PoliceUnit, Hospital } from '@/types';
import { Truck, MapPin, Clock, ArrowLeft } from 'lucide-react';

type DispatchItem = {
  id: string;
  type: 'ACCIDENT' | 'FIRE' | 'POLICE';
  severity: string;
  vehicleId: string;
  vehicleNo: string;
  vehicleType: 'AMBULANCE' | 'FIRE_BRIGADE' | 'POLICE';
  status: string;
  vehicleLat: number;
  vehicleLng: number;
  incidentLat: number;
  incidentLng: number;
  hospitalId?: string;
  hospitalName?: string;
  startTime: string;
  distKm: number | null;
  durationSec: number | null;
  routeGeometry: unknown | null;
  // Original objects for component props
  dispatchObj: Dispatch | FireDispatch | PoliceDispatch;
  vehicleObj?: Ambulance | FireBrigade | PoliceUnit | null;
  hospitalObj?: Hospital | null;
};

export default function DispatchPage() {
  const { dispatches, ambulances, fireBrigades, policeUnits, accidents, fireIncidents, sosEvents, hospitals, loading, connected } = useEmergencyStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allDispatches = useMemo<DispatchItem[]>(() => {
    if (!dispatches) return [];
    const items: DispatchItem[] = [];

    dispatches.accidentDispatches.forEach((d) => {
      const acc = accidents.find((a) => a.id === d.accidentId) || d.accident;
      const amb = ambulances.find((a) => a.id === d.ambulanceId) || d.ambulance;
      const hosp = hospitals.find((h) => h.id === d.hospitalId) || d.hospital;
      items.push({
        id: d.id, type: 'ACCIDENT', severity: acc?.severity || 'UNKNOWN',
        vehicleId: d.ambulanceId, vehicleNo: amb?.vehicleNo || 'N/A',
        vehicleType: 'AMBULANCE', status: amb?.status || 'UNKNOWN',
        vehicleLat: amb?.latitude || 0, vehicleLng: amb?.longitude || 0,
        incidentLat: acc?.latitude || 0, incidentLng: acc?.longitude || 0,
        hospitalId: d.hospitalId, hospitalName: hosp?.name,
        startTime: d.startTime, distKm: d.routeDistanceKm, durationSec: d.routeDurationSec,
        routeGeometry: d.routeGeometry,
        dispatchObj: d, vehicleObj: amb, hospitalObj: hosp,
      });
    });

    dispatches.fireDispatches.forEach((d) => {
      const fire = fireIncidents.find((f) => f.id === d.fireIncidentId) || d.fireIncident;
      const fb = fireBrigades.find((f) => f.id === d.fireBrigadeId) || d.fireBrigade;
      items.push({
        id: d.id, type: 'FIRE', severity: fire?.severity || 'UNKNOWN',
        vehicleId: d.fireBrigadeId, vehicleNo: fb?.vehicleNo || 'N/A',
        vehicleType: 'FIRE_BRIGADE', status: fb?.status || 'UNKNOWN',
        vehicleLat: fb?.latitude || 0, vehicleLng: fb?.longitude || 0,
        incidentLat: fire?.latitude || 0, incidentLng: fire?.longitude || 0,
        startTime: d.startTime, distKm: d.routeDistanceKm, durationSec: d.routeDurationSec,
        routeGeometry: d.routeGeometry,
        dispatchObj: d, vehicleObj: fb,
      });
    });

    dispatches.policeDispatches.forEach((d) => {
      const sos = sosEvents.find((s) => s.id === d.sosEventId) || d.sosEvent;
      const pu = policeUnits.find((p) => p.id === d.policeUnitId) || d.policeUnit;
      items.push({
        id: d.id, type: 'POLICE', severity: sos?.severity || 'UNKNOWN',
        vehicleId: d.policeUnitId, vehicleNo: pu?.vehicleNo || 'N/A',
        vehicleType: 'POLICE', status: pu?.status || 'UNKNOWN',
        vehicleLat: pu?.latitude || 0, vehicleLng: pu?.longitude || 0,
        incidentLat: sos?.latitude || 0, incidentLng: sos?.longitude || 0,
        startTime: d.startTime, distKm: d.routeDistanceKm, durationSec: d.routeDurationSec,
        routeGeometry: d.routeGeometry,
        dispatchObj: d, vehicleObj: pu,
      });
    });

    return items;
  }, [dispatches, accidents, fireIncidents, sosEvents, ambulances, fireBrigades, policeUnits, hospitals]);

  const selected = selectedId ? allDispatches.find((d) => d.id === selectedId) : null;

  if (loading && allDispatches.length === 0) return <LoadingState label="Loading dispatches..." />;
  if (!connected && allDispatches.length === 0 && !loading) return <BackendUnavailable />;

  // Detail view for selected dispatch
  if (selected) {
    const routeSegments = selected.routeGeometry
      ? [{
          id: `route-${selected.id}`,
          geometry: selected.routeGeometry as GeoJSONLineString,
          color: selected.type === 'ACCIDENT' ? '#3b82f6' : selected.type === 'FIRE' ? '#ef4444' : '#a855f7',
          label: `${selected.vehicleNo} → Incident`,
        }]
      : [];

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dispatches
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: dispatch info */}
          <div className="space-y-4">
            <DispatchSummaryCard
              dispatch={selected.dispatchObj}
              dispatchType={selected.type}
              vehicle={selected.vehicleObj}
              hospital={selected.hospitalObj}
              incidentLocation={{ lat: selected.incidentLat, lng: selected.incidentLng }}
            />

            <VehicleStatusPanel
              vehicleId={selected.vehicleId}
              vehicleNo={selected.vehicleNo}
              vehicleType={selected.vehicleType}
              currentStatus={selected.status}
              latitude={selected.vehicleLat}
              longitude={selected.vehicleLng}
            />

            <GreenCorridorIndicator
              vehicleId={selected.vehicleId}
              vehicleType={selected.vehicleType}
            />
          </div>

          {/* Right column: map + hospital */}
          <div className="lg:col-span-2 space-y-4">
            <RouteMapLayer
              routes={routeSegments}
              vehicles={[{
                id: selected.vehicleId,
                lat: selected.vehicleLat,
                lng: selected.vehicleLng,
                label: selected.vehicleNo,
                vehicleNo: selected.vehicleNo,
                status: selected.status,
                type: selected.vehicleType === 'AMBULANCE' ? 'ambulance'
                  : selected.vehicleType === 'FIRE_BRIGADE' ? 'fire_brigade' : 'police',
              }]}
              incidents={[{
                id: selected.id,
                lat: selected.incidentLat,
                lng: selected.incidentLng,
                severity: selected.severity,
                type: selected.type,
                label: selected.type,
              }]}
              height="380px"
            />

            {selected.type === 'ACCIDENT' && (
              <HospitalAssignmentCard
                incidentLat={selected.incidentLat}
                incidentLng={selected.incidentLng}
                assignedHospitalId={selected.hospitalId}
                assignedHospitalName={selected.hospitalName}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Dispatch & Unit Tracking</h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {allDispatches.length} ACTIVE DISPATCHES
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Active Dispatches</h3>
        {allDispatches.length === 0 ? (
          <EmptyState title="No dispatches" description="No active dispatches at this time." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {allDispatches.map((d) => (
              <DispatchSummaryCard
                key={d.id}
                dispatch={d.dispatchObj}
                dispatchType={d.type}
                vehicle={d.vehicleObj}
                hospital={d.hospitalObj}
                incidentLocation={{ lat: d.incidentLat, lng: d.incidentLng }}
                onClick={() => setSelectedId(d.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
