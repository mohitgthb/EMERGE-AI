      import { useState, useMemo, useEffect } from 'react';
import { SeverityBadge } from '@/components/StatusBadge';
import { VehicleStatusPanel } from '@/components/VehicleStatusPanel';
import { HospitalAssignmentCard } from '@/components/HospitalAssignmentCard';
import { GreenCorridorIndicator } from '@/components/GreenCorridorIndicator';
import { RouteMapLayer } from '@/components/RouteMapLayer';
import { DispatchSummaryCard } from '@/components/DispatchSummaryCard';
import { ReassignmentMonitor } from '@/components/ReassignmentMonitor';
import { StatusTimeline } from '@/components/StatusTimeline';
import DispatchRouteLayer from '@/components/DispatchRouteLayer';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { useAuthStore } from '@/stores/authStore';
import { LoadingState, EmptyState, BackendUnavailable } from '@/components/ErrorBoundary';
import { getSocket } from '@/services/socket';
import type { GeoJSONLineString } from '@/types';
import { MapPin, Clock, Truck, User, Bell, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import DispatchAssignmentHandler from '@/components/DispatchAssignmentHandler';
import { AccountSwitchModal } from '@/components/AccountSwitchModal';
import { AmbulanceDemoPanel } from '@/components/AmbulanceDemoPanel';

const dispatchStatusStyles: Record<string, { label: string; bg: string; text: string; pulse?: boolean }> = {
  ACTIVE: { label: 'Active', bg: 'bg-blue-500/15 border-blue-500/30', text: 'text-blue-400' },
  EN_ROUTE: { label: 'En Route', bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-400', pulse: true },
  ARRIVED: { label: 'Arrived', bg: 'bg-purple-500/15 border-purple-500/30', text: 'text-purple-400' },
  COMPLETED: { label: 'Completed', bg: 'bg-green-500/15 border-green-500/30', text: 'text-green-400' },
  FAILED_ASSIGNMENT: { label: 'Failed', bg: 'bg-red-500/15 border-red-500/30', text: 'text-red-400' },
  REASSIGNED: { label: 'Reassigned', bg: 'bg-orange-500/15 border-orange-500/30', text: 'text-orange-400' },
};

function DispatchStatusBadge({ status }: { status: string }) {
  const s = dispatchStatusStyles[status] || dispatchStatusStyles.ACTIVE;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide',
      s.bg, s.text, s.pulse && 'animate-pulse'
    )}>
      <Activity className="w-2.5 h-2.5" />
      {s.label}
    </span>
  );
}

export default function AmbulanceDashboard() {
  const { accidents, ambulances, hospitals, dispatches, loading, connected, fetchAll } = useEmergencyStore();
  const { operator } = useAuthStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newDispatchAlert, setNewDispatchAlert] = useState(false);

  // The operator's assigned vehicle ID (from login)
  const myVehicleId = operator?.vehicleId;

  // Listen for dispatch events targeting this specific ambulance
  useEffect(() => {
    if (!myVehicleId) return;

    const socket = getSocket();

    const handleDispatchAssigned = (data: any) => {
      console.log('[AmbulanceDashboard] New dispatch assigned:', data);
      setNewDispatchAlert(true);
      // Refresh data from backend to pick up the new dispatch
      fetchAll();
      // Auto-dismiss alert after 10 seconds
      setTimeout(() => setNewDispatchAlert(false), 10000);
    };

    socket.on('DISPATCH_ASSIGNED', handleDispatchAssigned);

    return () => {
      socket.off('DISPATCH_ASSIGNED', handleDispatchAssigned);
    };
  }, [myVehicleId, fetchAll]);

  // Filter dispatches to only show this operator's ambulance assignments
  const activeDispatches = useMemo(() => {
    if (!dispatches) return [];
    // If operator is logged in, strictly show only their assigned dispatches
    if (myVehicleId) {
      return dispatches.accidentDispatches
        .filter((d) => d.ambulanceId === myVehicleId)
        .map((d) => {
          const accident = accidents.find((a) => a.id === d.accidentId) || d.accident;
          const ambulance = ambulances.find((a) => a.id === d.ambulanceId) || d.ambulance;
          const hospital = hospitals.find((h) => h.id === d.hospitalId) || d.hospital;
          return { ...d, accident, ambulance, hospital };
        });
    }
    // Unauthenticated / admin fallback — show all
    return dispatches.accidentDispatches
      .map((d) => {
        const accident = accidents.find((a) => a.id === d.accidentId) || d.accident;
        const ambulance = ambulances.find((a) => a.id === d.ambulanceId) || d.ambulance;
        const hospital = hospitals.find((h) => h.id === d.hospitalId) || d.hospital;
        return { ...d, accident, ambulance, hospital };
      });
  }, [dispatches, accidents, ambulances, hospitals, myVehicleId]);

  const selected = activeDispatches.find((d) => d.id === selectedId) || activeDispatches[0];

  const currentAmbulance = selected?.ambulance;
  const currentAccident = selected?.accident;
  const currentHospital = selected?.hospital;

  const routeSegments = useMemo(() => {
    if (!selected?.routeGeometry) return [];
    return [{
      id: `route-${selected.id}`,
      geometry: selected.routeGeometry as GeoJSONLineString,
      color: '#3b82f6',
      label: `${currentAmbulance?.vehicleNo || 'Ambulance'} to Incident`,
    }];
  }, [selected, currentAmbulance]);

  const vehicleMarkers = useMemo(() => {
    if (!currentAmbulance) return [];
    return [{
      id: currentAmbulance.id,
      lat: currentAmbulance.latitude,
      lng: currentAmbulance.longitude,
      label: currentAmbulance.vehicleNo,
      vehicleNo: currentAmbulance.vehicleNo,
      status: currentAmbulance.status,
      type: 'ambulance' as const,
    }];
  }, [currentAmbulance]);

  const incidentMarkers = useMemo(() => {
    if (!currentAccident) return [];
    return [{
      id: currentAccident.id,
      lat: currentAccident.latitude,
      lng: currentAccident.longitude,
      severity: currentAccident.severity,
      type: currentAccident.emergencyType || 'ACCIDENT',
      label: `Accident - ${currentAccident.severity}`,
    }];
  }, [currentAccident]);

  const hospitalMarkers = useMemo(() => {
    if (!currentHospital) return [];
    return [{
      id: currentHospital.id,
      lat: currentHospital.latitude,
      lng: currentHospital.longitude,
      name: currentHospital.name,
      beds: currentHospital.beds,
    }];
  }, [currentHospital]);

  if (loading && activeDispatches.length === 0) return <LoadingState message="Loading assignments..." />;
  if (!connected && activeDispatches.length === 0 && !loading) return <BackendUnavailable />;

  if (activeDispatches.length === 0) {
    return (
      <div className="space-y-6">
        <OperatorHeader operator={operator} vehicleNo={currentAmbulance?.vehicleNo} count={0} />
        <EmptyState message="No active assignments" description="Waiting for SOS dispatch to this ambulance." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OperatorHeader operator={operator} vehicleNo={currentAmbulance?.vehicleNo} count={activeDispatches.length} />

      {/* Dispatch Assignment Handler for real-time assignment details */}
      <DispatchAssignmentHandler vehicleId={myVehicleId || undefined} />

      {newDispatchAlert && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30 animate-pulse">
          <Bell className="w-5 h-5 text-primary" />
          <span className="text-sm font-semibold text-primary">New emergency dispatch assigned!</span>
          <button onClick={() => setNewDispatchAlert(false)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Dispatch list + Demo Panel */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground mb-3">Assigned Emergencies</h3>
          {activeDispatches.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={cn(
                'w-full text-left rounded-lg border p-4 transition-all',
                selected?.id === d.id ? 'border-primary bg-primary/5' : 'bg-card hover:border-primary/30'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-foreground uppercase">
                  {d.accident?.emergencyType || 'ACCIDENT'}
                </span>
                <div className="flex items-center gap-2">
                  <DispatchStatusBadge status={d.status} />
                  <SeverityBadge severity={(d.accident?.severity?.toLowerCase() || 'medium') as any} />
                </div>
              </div>
              <p className="text-sm text-foreground/80 truncate">
                {d.ambulance?.vehicleNo || 'Ambulance'} &rarr; {d.hospital?.name || 'Hospital'}
              </p>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                <MapPin className="w-3 h-3" />{d.accident?.latitude.toFixed(4)}, {d.accident?.longitude.toFixed(4)}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                <Clock className="w-3 h-3" />{new Date(d.startTime).toLocaleTimeString('en-US', { hour12: false })}
              </div>
            </button>
          ))}

          {/* Demo Simulation Panel */}
          <AmbulanceDemoPanel dispatch={selected ?? null} className="mt-3" />
        </div>

        {/* Right: Detail panels */}
        <div className="lg:col-span-2 space-y-4">
          {selected && (
            <DispatchSummaryCard
              dispatch={selected}
              dispatchType="ACCIDENT"
              vehicle={currentAmbulance}
              hospital={currentHospital}
              incidentLocation={currentAccident ? { lat: currentAccident.latitude, lng: currentAccident.longitude } : null}
            />
          )}

          {/* Reassignment Monitor */}
          <ReassignmentMonitor vehicleId={myVehicleId || undefined} />

          {currentAmbulance && (
            <VehicleStatusPanel
              vehicleId={currentAmbulance.id}
              vehicleNo={currentAmbulance.vehicleNo}
              vehicleType="AMBULANCE"
              currentStatus={currentAmbulance.status}
              latitude={currentAmbulance.latitude}
              longitude={currentAmbulance.longitude}
              dispatchId={selected?.id}
            />
          )}

          {/* Status Timeline */}
          {selected && (
            <StatusTimeline dispatchId={selected.id} />
          )}

          {/* Dual Route Map */}
          {selected && (
            <DispatchRouteLayer
              dispatchId={selected.id}
              vehicleType="AMBULANCE"
              height="350px"
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {currentAccident && (
              <HospitalAssignmentCard
                incidentLat={currentAccident.latitude}
                incidentLng={currentAccident.longitude}
                assignedHospitalId={selected?.hospitalId}
                assignedHospitalName={currentHospital?.name}
              />
            )}

            {currentAmbulance && (
              <GreenCorridorIndicator
                vehicleId={currentAmbulance.id}
                vehicleType="AMBULANCE"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OperatorHeader({ operator, vehicleNo, count }: { operator: any; vehicleNo?: string; count: number }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Truck className="w-5 h-5 text-primary" /> Ambulance Dashboard
        </h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {count} ACTIVE ASSIGNMENTS
        </p>
      </div>
      <div className="flex items-center gap-3">
        {operator && (
          <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-card border">
            <User className="w-4 h-4 text-primary" />
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">{operator.name}</p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {operator.operatorId} {vehicleNo ? `\u00B7 ${vehicleNo}` : ''}
              </p>
            </div>
          </div>
        )}
        <AccountSwitchModal />
      </div>
    </div>
  );
}
