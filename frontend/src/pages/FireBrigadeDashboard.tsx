import { useState, useMemo, useEffect } from 'react';
import { StatusBadge, SeverityBadge } from '@/components/StatusBadge';
import { VehicleStatusPanel } from '@/components/VehicleStatusPanel';
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
import { Flame, MapPin, User, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import DispatchAssignmentHandler from '@/components/DispatchAssignmentHandler';
import { AccountSwitchModal } from '@/components/AccountSwitchModal';

export default function FireBrigadeDashboard() {
  const { fireIncidents, fireBrigades, dispatches, loading, connected, fetchAll } = useEmergencyStore();
  const { operator } = useAuthStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newDispatchAlert, setNewDispatchAlert] = useState(false);

  // The operator's assigned vehicle ID
  const myVehicleId = operator?.vehicleId;

  // Listen for dispatch events targeting this specific fire brigade
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

  // Filter dispatches to only show this operator's fire brigade assignments
  const activeDispatches = useMemo(() => {
    if (!dispatches) return [];
    // If operator is logged in, strictly show only their assigned dispatches
    if (myVehicleId) {
      return dispatches.fireDispatches
        .filter((d) => d.fireBrigadeId === myVehicleId)
        .map((d) => {
        const fire = fireIncidents.find((f) => f.id === d.fireIncidentId) || d.fireIncident;
        const brigade = fireBrigades.find((f) => f.id === d.fireBrigadeId) || d.fireBrigade;
        return { ...d, fire, brigade };
      });
    }
    // Unauthenticated / admin fallback — show all
    return dispatches.fireDispatches
      .map((d) => {
      const fire = fireIncidents.find((f) => f.id === d.fireIncidentId) || d.fireIncident;
      const brigade = fireBrigades.find((f) => f.id === d.fireBrigadeId) || d.fireBrigade;
      return { ...d, fire, brigade };
    });
  }, [dispatches, fireIncidents, fireBrigades]);

  const selected = activeDispatches.find((d) => d.id === selectedId) || activeDispatches[0];
  const selectedFire = selected?.fire;
  const selectedBrigade = selected?.brigade;

  // Route segments for selected dispatch
  const routeSegments = useMemo(() => {
    if (!selected?.routeGeometry) return [];
    return [{
      id: `route-fire-${selected.id}`,
      geometry: selected.routeGeometry as GeoJSONLineString,
      color: '#ef4444',
      label: `${selectedBrigade?.vehicleNo || 'Fire Brigade'} to Incident`,
    }];
  }, [selected, selectedBrigade]);

  const vehicleMarkers = useMemo(() => {
    if (!selectedBrigade) return [];
    return [{
      id: selectedBrigade.id,
      lat: selectedBrigade.latitude,
      lng: selectedBrigade.longitude,
      label: selectedBrigade.vehicleNo,
      vehicleNo: selectedBrigade.vehicleNo,
      status: selectedBrigade.status,
      type: 'fire_brigade' as const,
    }];
  }, [selectedBrigade]);

  const incidentMarkers = useMemo(() => {
    if (!selectedFire) return [];
    return [{
      id: selectedFire.id,
      lat: selectedFire.latitude,
      lng: selectedFire.longitude,
      severity: selectedFire.severity,
      type: 'FIRE',
      label: `Fire - ${selectedFire.severity}`,
    }];
  }, [selectedFire]);

  if (loading && fireIncidents.length === 0) return <LoadingState message="Loading fire data..." />;
  if (!connected && fireIncidents.length === 0 && !loading) return <BackendUnavailable />;

  // Empty state: no incidents but maybe units
  if (fireIncidents.length === 0 && activeDispatches.length === 0) {
    return (
      <div className="space-y-6">
        <FireBrigadeHeader operator={operator} vehicleNo={selectedBrigade?.vehicleNo} count={0} />
        <EmptyState message="No fire incidents" description="No fire incidents detected at this time." />
        {fireBrigades.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Fire Brigade Units</h3>
            <div className="space-y-2">
              {fireBrigades.map((fb) => (
                <div key={fb.id} className="flex items-center justify-between p-2 rounded bg-secondary/50">
                  <span className="text-sm font-mono font-medium text-foreground">{fb.vehicleNo}</span>
                  <StatusBadge variant={fb.status.toLowerCase() as any}>{fb.status}</StatusBadge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FireBrigadeHeader operator={operator} vehicleNo={selectedBrigade?.vehicleNo} count={activeDispatches.length} />

      {/* Dispatch Assignment Handler for real-time assignment details */}
      <DispatchAssignmentHandler vehicleId={myVehicleId || undefined} />

      {newDispatchAlert && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 animate-pulse">
          <Bell className="w-5 h-5 text-red-500" />
          <span className="text-sm font-semibold text-red-500">New fire dispatch assigned!</span>
          <button onClick={() => setNewDispatchAlert(false)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Incident list */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground mb-3">Active Dispatches</h3>
          {activeDispatches.length === 0 ? (
            <p className="text-xs text-muted-foreground">No dispatches for current fire incidents.</p>
          ) : (
            activeDispatches.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedId(d.id)}
                className={cn(
                  'w-full text-left rounded-lg border p-4 transition-all',
                  selected?.id === d.id ? 'border-red-500/50 bg-red-500/5' : 'bg-card hover:border-red-500/30'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <SeverityBadge severity={(d.fire?.severity?.toLowerCase() || 'medium') as any} />
                  <StatusBadge variant={d.brigade?.status?.toLowerCase() as any}>
                    {d.brigade?.status?.replace('_', ' ') || 'N/A'}
                  </StatusBadge>
                </div>
                <p className="text-sm text-foreground/80 truncate mt-1">
                  {d.brigade?.vehicleNo || 'Unit'} &rarr; Fire Incident
                </p>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                  <MapPin className="w-3 h-3" />
                  {d.fire?.latitude.toFixed(4)}, {d.fire?.longitude.toFixed(4)}
                </div>
                {d.routeDistanceKm && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {d.routeDistanceKm.toFixed(1)} km
                    {d.routeDurationSec && ` - ETA ${Math.ceil(d.routeDurationSec / 60)} min`}
                  </p>
                )}
              </button>
            ))
          )}

          {/* Unassigned units */}
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">All Units</p>
            <div className="space-y-1">
              {fireBrigades.map((fb) => (
                <div key={fb.id} className="flex items-center justify-between p-2 rounded bg-secondary/30">
                  <span className="text-xs font-mono text-foreground">{fb.vehicleNo}</span>
                  <StatusBadge variant={fb.status.toLowerCase() as any}>{fb.status}</StatusBadge>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Detail panels */}
        <div className="lg:col-span-2 space-y-4">
          {selected && (
            <DispatchSummaryCard
              dispatch={selected}
              dispatchType="FIRE"
              vehicle={selectedBrigade}
              incidentLocation={selectedFire ? { lat: selectedFire.latitude, lng: selectedFire.longitude } : null}
            />
          )}

          {/* Reassignment Monitor */}
          <ReassignmentMonitor />

          {selectedBrigade && (
            <VehicleStatusPanel
              vehicleId={selectedBrigade.id}
              vehicleNo={selectedBrigade.vehicleNo}
              vehicleType="FIRE_BRIGADE"
              currentStatus={selectedBrigade.status}
              latitude={selectedBrigade.latitude}
              longitude={selectedBrigade.longitude}
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
              vehicleType="FIRE_BRIGADE"
              height="320px"
            />
          )}

          {selectedBrigade && (
            <GreenCorridorIndicator
              vehicleId={selectedBrigade.id}
              vehicleType="FIRE_BRIGADE"
            />
          )}

          {selectedFire && (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Incident Details</p>
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-4 h-4 rounded-full',
                  selectedFire.severity === 'CRITICAL' && 'bg-red-500 animate-pulse',
                  selectedFire.severity === 'HIGH' && 'bg-amber-500',
                  selectedFire.severity === 'MEDIUM' && 'bg-blue-500',
                  selectedFire.severity === 'LOW' && 'bg-green-500',
                )} />
                <span className="text-sm font-bold text-foreground uppercase">{selectedFire.severity}</span>
                <span className="text-xs text-muted-foreground">
                  Detected by {selectedFire.detectedBy || 'Unknown'}
                </span>
              </div>
              {selectedFire.confidence != null && (
                <p className="text-xs text-muted-foreground">
                  Confidence: {(selectedFire.confidence * 100).toFixed(0)}%
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FireBrigadeHeader({ operator, vehicleNo, count }: { operator: any; vehicleNo?: string; count: number }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Flame className="w-5 h-5 text-status-critical" /> Fire Brigade Dashboard
        </h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {count} ACTIVE ASSIGNMENTS
        </p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {operator && (
          <div className="flex items-center gap-3 px-3 sm:px-4 py-2 rounded-lg bg-card border">
            <User className="w-4 h-4 text-orange-500" />
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