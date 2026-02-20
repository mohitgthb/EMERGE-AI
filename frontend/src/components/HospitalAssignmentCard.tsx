import { useState, useEffect } from 'react';
import { dispatchApi } from '@/services/api';
import { cn } from '@/lib/utils';
import type { RouteInfo } from '@/types';

interface HospitalAssignmentCardProps {
  incidentLat: number;
  incidentLng: number;
  assignedHospitalId?: string;
  assignedHospitalName?: string;
  className?: string;
  onHospitalSelected?: (hospital: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    beds: number;
    route: RouteInfo;
  }) => void;
}

interface NearestHospitalData {
  hospital: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    beds: number;
    address?: string;
  };
  route: RouteInfo;
}

export function HospitalAssignmentCard({
  incidentLat,
  incidentLng,
  assignedHospitalId,
  assignedHospitalName,
  className,
  onHospitalSelected,
}: HospitalAssignmentCardProps) {
  const [data, setData] = useState<NearestHospitalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (assignedHospitalId) return; // Already assigned

    async function fetchNearest() {
      setLoading(true);
      setError(null);
      try {
        const result = await dispatchApi.nearestHospital(incidentLat, incidentLng);
        setData(result);
        if (onHospitalSelected && result?.hospital) {
          const h = result.hospital;
          onHospitalSelected({
            id: h.id,
            name: h.name,
            lat: h.latitude,
            lng: h.longitude,
            beds: h.beds,
            route: result.route,
          });
        }
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to find nearest hospital');
      } finally {
        setLoading(false);
      }
    }

    fetchNearest();
  }, [incidentLat, incidentLng, assignedHospitalId]);

  if (loading) {
    return (
      <div className={cn('bg-card border border-border rounded-xl p-4', className)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center animate-pulse">
            <span className="text-lg">🏥</span>
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
            <div className="h-3 w-48 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('bg-card border border-red-500/30 rounded-xl p-4', className)}>
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (assignedHospitalId) {
    return (
      <div className={cn('bg-card border border-emerald-500/30 rounded-xl p-5', className)}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <span className="text-lg">🏥</span>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-card-foreground">Assigned Hospital</h4>
            <p className="text-emerald-400 font-medium">{assignedHospitalName || 'Hospital'}</p>
          </div>
          <span className="ml-auto bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">
            Assigned
          </span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hospital = data.hospital;
  const route = data.route;

  return (
    <div className={cn('bg-card border border-emerald-500/30 rounded-xl p-5', className)}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <span className="text-lg">🏥</span>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-card-foreground">Nearest Hospital</h4>
          <p className="text-emerald-400 font-medium">{hospital.name}</p>
        </div>
        <span className="ml-auto bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">
          Recommended
        </span>
      </div>

      {hospital.address && (
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{hospital.address}</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-background/50 rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Distance</p>
          <p className="text-sm font-bold text-card-foreground">
            {route.distanceKm.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">km</span>
          </p>
        </div>
        <div className="bg-background/50 rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">ETA</p>
          <p className="text-sm font-bold text-card-foreground">
            {Math.ceil(route.durationSec / 60)} <span className="text-xs font-normal text-muted-foreground">min</span>
          </p>
        </div>
        <div className="bg-background/50 rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Beds</p>
          <p className="text-sm font-bold text-emerald-400">{hospital.beds}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
        Route via {route.provider.toUpperCase()}
      </div>
    </div>
  );
}
