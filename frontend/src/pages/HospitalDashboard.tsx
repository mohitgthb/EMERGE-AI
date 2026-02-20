import { useState, useMemo } from 'react';
import { StatusBadge, SeverityBadge } from '@/components/StatusBadge';
import { ReusableMap } from '@/components/ReusableMap';
import { Button } from '@/components/ui/button';
import { StatusTimeline } from '@/components/StatusTimeline';
import DispatchRouteLayer from '@/components/DispatchRouteLayer';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { LoadingState, EmptyState, BackendUnavailable } from '@/components/ErrorBoundary';
import type { MapMarker } from '@/types';
import { Hospital as HospitalIcon, Clock, BedDouble, CheckCircle, AlertTriangle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function HospitalDashboard() {
  const { hospitals, ambulances, dispatches, loading, connected } = useEmergencyStore();
  const [admitted, setAdmitted] = useState<Set<string>>(new Set());
  const [selectedDispatchId, setSelectedDispatchId] = useState<string | null>(null);

  const activeDispatches = useMemo(() => {
    if (!dispatches) return [];
    return dispatches.accidentDispatches.filter((d) => !d.endtime).map((d) => {
      const ambulance = ambulances.find((a) => a.id === d.ambulanceId) || d.ambulance;
      const hospital = hospitals.find((h) => h.id === d.hospitalId) || d.hospital;
      return { ...d, ambulance, hospital };
    });
  }, [dispatches, ambulances, hospitals]);

  if (loading && hospitals.length === 0) return <LoadingState label="Loading hospital data..." />;
  if (!connected && hospitals.length === 0 && !loading) return <BackendUnavailable />;

  const totalBeds = hospitals.reduce((sum, h) => sum + h.beds, 0);

  const mapMarkers: MapMarker[] = [
    ...hospitals.map((h) => ({
      id: h.id, lat: h.latitude, lng: h.longitude,
      label: h.name, color: '#22c55e', icon: '??',
    })),
    ...ambulances.filter((a) => a.status === 'EN_ROUTE').map((a) => ({
      id: a.id, lat: a.latitude, lng: a.longitude,
      label: a.vehicleNo, color: '#3b82f6', icon: '??',
    })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <HospitalIcon className="w-5 h-5 text-primary" /> Hospital Dashboard
        </h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {activeDispatches.length} INCOMING � {totalBeds} BEDS TOTAL
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {hospitals.length === 0 ? (
          <div className="col-span-3">
            <EmptyState title="No hospitals" description="No hospitals registered." />
          </div>
        ) : (
          hospitals.map((h) => (
            <div key={h.id} className={cn(
              'rounded-lg border bg-card p-4 text-center',
              h.beds === 0 && 'border-status-critical/30'
            )}>
              <BedDouble className={cn('w-6 h-6 mx-auto mb-2', h.beds > 0 ? 'text-status-success' : 'text-status-critical')} />
              <p className="text-2xl font-bold font-mono text-foreground">{h.beds}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{h.name}</p>
            </div>
          ))
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-status-warning" />
          Active Dispatches to Hospitals
        </h3>
        {activeDispatches.length === 0 ? (
          <EmptyState title="No incoming patients" description="No active ambulance dispatches at this time." />
        ) : (
          <div className="space-y-3">
            {activeDispatches.map((d) => (
              <div key={d.id} className={cn(
                'rounded-lg border bg-card p-4 cursor-pointer transition-all',
                selectedDispatchId === d.id ? 'border-primary bg-primary/5' : 'hover:border-primary/30'
              )}
              onClick={() => setSelectedDispatchId(selectedDispatchId === d.id ? null : d.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge variant={d.ambulance?.status?.toLowerCase() as any || 'pending'}>
                        {d.ambulance?.status || 'UNKNOWN'}
                      </StatusBadge>
                      <span className="text-xs font-mono text-muted-foreground">{d.ambulance?.vehicleNo || 'N/A'}</span>
                    </div>
                    <p className="text-sm text-foreground">
                      Heading to {d.hospital?.name || 'Unknown Hospital'}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {d.routeDurationSec ? `ETA ${Math.ceil(d.routeDurationSec / 60)} min` : 'ETA unknown'}
                      </span>
                      {d.routeDistanceKm && (
                        <span className="font-mono">{d.routeDistanceKm.toFixed(1)} km</span>
                      )}
                    </div>
                    {/* Compact Status Timeline */}
                    {selectedDispatchId === d.id && (
                      <div className="mt-3">
                        <StatusTimeline dispatchId={d.id} compact />
                      </div>
                    )}
                  </div>
                  <div>
                    {admitted.has(d.id) ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-status-success/10 text-status-success text-xs font-semibold">
                        <CheckCircle className="w-3 h-3" /> Admitted
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary/90"
                        onClick={(e) => { e.stopPropagation(); setAdmitted((prev) => new Set(prev).add(d.id)); }}
                      >
                        Confirm Admission
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dispatch Route visualization for selected dispatch */}
        {selectedDispatchId && (
          <div className="mt-4">
            <DispatchRouteLayer
              dispatchId={selectedDispatchId}
              vehicleType="AMBULANCE"
              height="300px"
              showLabels
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReusableMap markers={mapMarkers} height="350px" />
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Registered Hospitals</h3>
          <div className="space-y-2">
            {hospitals.map((h) => (
              <div key={h.id} className="flex items-center justify-between p-2 rounded bg-secondary/50">
                <div>
                  <p className="text-sm font-medium text-foreground">{h.name}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {h.latitude.toFixed(4)}, {h.longitude.toFixed(4)}
                  </p>
                </div>
                <span className="text-sm font-bold font-mono text-foreground">{h.beds} beds</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
