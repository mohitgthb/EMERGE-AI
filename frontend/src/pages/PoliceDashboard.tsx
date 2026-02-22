import { useState, useMemo, useEffect } from 'react';
import { StatusBadge, SeverityBadge } from '@/components/StatusBadge';
import { ReusableMap } from '@/components/ReusableMap';
import { Button } from '@/components/ui/button';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { useAuthStore } from '@/stores/authStore';
import { policeApi } from '@/services/api';
import { LoadingState, EmptyState, BackendUnavailable } from '@/components/ErrorBoundary';
import { ReassignmentMonitor } from '@/components/ReassignmentMonitor';
import { IncidentClusterBadge } from '@/components/IncidentClusterBadge';
import { getSocket } from '@/services/socket';
import type { MapMarker } from '@/types';
import { Shield, MapPin, CheckCircle, User, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import PoliceAlertBanner from '@/components/PoliceAlertBanner';
import DispatchAssignmentHandler from '@/components/DispatchAssignmentHandler';
import { AccountSwitchModal } from '@/components/AccountSwitchModal';

const policeStatusFlow = ['AVAILABLE', 'EN_ROUTE', 'ARRIVED', 'BUSY', 'COMPLETED'] as const;

export default function PoliceDashboard() {
  const { sosEvents, policeUnits, dispatches, loading, connected, fetchAll } = useEmergencyStore();
  const { operator } = useAuthStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newDispatchAlert, setNewDispatchAlert] = useState(false);

  // The operator's assigned vehicle ID
  const myVehicleId = operator?.vehicleId;

  // Listen for dispatch events targeting this specific police unit
  useEffect(() => {
    if (!myVehicleId) return;

    const socket = getSocket();

    const handleDispatchAssigned = (data: any) => {
      setNewDispatchAlert(true);
      fetchAll();
      setTimeout(() => setNewDispatchAlert(false), 10000);
    };

    socket.on('DISPATCH_ASSIGNED', handleDispatchAssigned);

    return () => {
      socket.off('DISPATCH_ASSIGNED', handleDispatchAssigned);
    };
  }, [myVehicleId, fetchAll]);

  // Filter police dispatches to this operator's unit
  const myPoliceDispatches = useMemo(() => {
    if (!dispatches) return [];
    // If operator is logged in, strictly show only their assigned dispatches
    if (myVehicleId) {
      return dispatches.policeDispatches.filter(
        (d) => d.policeUnitId === myVehicleId
      );
    }
    // Unauthenticated / admin fallback — show all
    return dispatches.policeDispatches;
  }, [dispatches, myVehicleId]);

  // Show SOS events that are in this officer's dispatches, or all if no vehicle scoping
  const relevantSosIds = useMemo(
    () => new Set(myPoliceDispatches.map((d) => d.sosEventId)),
    [myPoliceDispatches]
  );

  const allSOS = useMemo(() => {
    if (!myVehicleId) return sosEvents;
    // Show SOS events assigned to this officer, plus unassigned events
    return sosEvents.filter((s) => relevantSosIds.has(s.id) || s.status === 'PENDING');
  }, [sosEvents, myVehicleId, relevantSosIds]);

  const selected = allSOS.find((s) => s.id === selectedId) || allSOS[0];

  if (loading && policeUnits.length === 0) return <LoadingState label="Loading police data..." />;
  if (!connected && policeUnits.length === 0 && !loading) return <BackendUnavailable />;

  const myUnit = myVehicleId ? policeUnits.find((p) => p.id === myVehicleId) : undefined;

  const mapMarkers: MapMarker[] = [
    ...allSOS.map((s) => ({
      id: s.id, lat: s.latitude, lng: s.longitude,
      label: s.emergencyType, color: s.severity === 'CRITICAL' ? '#ef4444' : s.severity === 'HIGH' ? '#f59e0b' : '#3b82f6',
      popupHtml: `<div style="font-family:Inter;font-size:12px"><b>${s.emergencyType}</b><br/>Status: ${s.status}</div>`,
    })),
    ...policeUnits.map((p) => ({
      id: p.id, lat: p.latitude, lng: p.longitude,
      label: p.vehicleNo, color: '#a855f7', icon: '??',
    })),
  ];

  const handleStatusUpdate = async (unitId: string, status: string) => {
    try {
      await policeApi.updateStatus(unitId, { status });
    } catch (err) {
      console.error('Failed to update police status:', err);
    }
  };

  if (allSOS.length === 0 && policeUnits.length === 0) {
    return (
      <div className="space-y-6">
        <PoliceHeader operator={operator} vehicleNo={myUnit?.vehicleNo} count={0} />
        <EmptyState title="No incidents" description="No police-relevant incidents at this time." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PoliceHeader operator={operator} vehicleNo={myUnit?.vehicleNo} count={myPoliceDispatches.length} />
      <p className="text-xs text-muted-foreground font-mono">
        {allSOS.filter((s) => s.status !== 'REJECTED').length} ACTIVE SOS &middot; {policeUnits.length} UNITS
      </p>
      {/* Police Crime Alert Banner */}
      <PoliceAlertBanner />

      {/* Dispatch Assignment Handler */}
      <DispatchAssignmentHandler vehicleId={myVehicleId || undefined} />

      {newDispatchAlert && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30 animate-pulse">
          <Bell className="w-5 h-5 text-purple-500" />
          <span className="text-sm font-semibold text-purple-500">New police dispatch assigned!</span>
          <button onClick={() => setNewDispatchAlert(false)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
            Dismiss
          </button>
        </div>
      )}

      {/* Reassignment Monitor */}
      <ReassignmentMonitor vehicleId={myVehicleId || undefined} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground mb-3">SOS Events</h3>
          {allSOS.length === 0 ? (
            <EmptyState title="No events" description="No SOS events." />
          ) : (
            allSOS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={cn(
                  'w-full text-left rounded-lg border p-4 transition-all',
                  selected?.id === s.id ? 'border-primary bg-primary/5' : 'bg-card hover:border-primary/30'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-foreground uppercase">{s.emergencyType}</span>
                  <div className="flex items-center gap-2">
                    <IncidentClusterBadge event={s} />
                    <SeverityBadge severity={(s.severity?.toLowerCase() || 'medium') as any} />
                  </div>
                </div>
                <p className="text-sm text-foreground/80 truncate">
                  {s.status} � SOS #{s.sosCount}
                </p>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                  <MapPin className="w-3 h-3" />{s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {policeUnits.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Police Unit Status</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {policeUnits.map((pu) => (
                  <div key={pu.id} className="flex items-center justify-between p-2 rounded bg-secondary/50">
                    <span className="text-xs font-mono font-medium text-foreground">{pu.vehicleNo}</span>
                    <StatusBadge variant={pu.status.toLowerCase() as any}>{pu.status}</StatusBadge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ReusableMap
            markers={mapMarkers}
            center={selected ? [selected.latitude, selected.longitude] : undefined}
            zoom={15}
            height="300px"
          />

          {selected && (
            <div className="rounded-lg border bg-card p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">SOS Details</p>
              <div className="space-y-2">
                <p className="text-sm text-foreground">
                  <strong>Type:</strong> {selected.emergencyType} | <strong>Status:</strong> {selected.status}
                </p>
                <p className="text-sm text-foreground">
                  <strong>Severity:</strong> {selected.severity} | <strong>Verified:</strong> {selected.isVerified ? 'Yes' : 'No'}
                </p>
                <p className="text-[11px] font-mono text-muted-foreground">
                  Created: {new Date(selected.createdAt).toLocaleString()}
                </p>
                {/* Cluster details for clustered events */}
                <IncidentClusterBadge event={selected} showDetails />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PoliceHeader({ operator, vehicleNo, count }: { operator: any; vehicleNo?: string; count: number }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Shield className="w-5 h-5 text-status-pending" /> Police Dashboard
        </h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {count} ACTIVE ASSIGNMENTS
        </p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {operator && (
          <div className="flex items-center gap-3 px-3 sm:px-4 py-2 rounded-lg bg-card border">
            <User className="w-4 h-4 text-purple-500" />
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