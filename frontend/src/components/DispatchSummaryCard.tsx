import { useMemo } from 'react';
import { StatusBadge, SeverityBadge } from '@/components/StatusBadge';
import { MapPin, Clock, Navigation, Truck, Flame, Shield } from 'lucide-react';
import type { Dispatch, FireDispatch, PoliceDispatch, Ambulance, FireBrigade, PoliceUnit, Hospital } from '@/types';
import { cn } from '@/lib/utils';

interface DispatchSummaryCardProps {
  dispatch: Dispatch | FireDispatch | PoliceDispatch;
  dispatchType: 'ACCIDENT' | 'FIRE' | 'POLICE';
  vehicle?: Ambulance | FireBrigade | PoliceUnit | null;
  hospital?: Hospital | null;
  incidentLocation?: { lat: number; lng: number } | null;
  onClick?: () => void;
  selected?: boolean;
}

const typeConfig = {
  ACCIDENT: { icon: Truck, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', label: 'Ambulance Dispatch' },
  FIRE: { icon: Flame, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'Fire Brigade Dispatch' },
  POLICE: { icon: Shield, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', label: 'Police Dispatch' },
};

export function DispatchSummaryCard({
  dispatch,
  dispatchType,
  vehicle,
  hospital,
  incidentLocation,
  onClick,
  selected,
}: DispatchSummaryCardProps) {
  const config = typeConfig[dispatchType];
  const Icon = config.icon;

  const distKm = dispatch.routeDistanceKm;
  const durSec = dispatch.routeDurationSec;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border p-4 transition-all space-y-3',
        selected ? 'border-primary bg-primary/5 shadow-md' : 'bg-card hover:border-primary/30',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('p-1.5 rounded-md', config.bg)}>
            <Icon className={cn('w-4 h-4', config.color)} />
          </div>
          <div>
            <p className="text-xs font-bold text-foreground uppercase">{config.label}</p>
            <p className="text-[10px] font-mono text-muted-foreground">{dispatch.id.slice(0, 12).toUpperCase()}</p>
          </div>
        </div>
        {vehicle && (
          <StatusBadge
            variant={vehicle.status.toLowerCase() as any}
            pulse={vehicle.status === 'EN_ROUTE'}
          >
            {vehicle.status.replace('_', ' ')}
          </StatusBadge>
        )}
      </div>

      {/* Vehicle info */}
      {vehicle && (
        <div className="flex items-center gap-4 text-sm">
          <span className="font-mono font-bold text-foreground">{vehicle.vehicleNo}</span>
          {distKm != null && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Navigation className="w-3 h-3" />
              {distKm.toFixed(1)} km
            </span>
          )}
          {durSec != null && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {Math.ceil(durSec / 60)} min
            </span>
          )}
        </div>
      )}

      {/* Hospital (for ambulance dispatches) */}
      {hospital && (
        <div className="text-xs text-muted-foreground">
          → {hospital.name} ({hospital.beds} beds)
        </div>
      )}

      {/* Location */}
      {incidentLocation && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
          <MapPin className="w-3 h-3" />
          {incidentLocation.lat.toFixed(4)}, {incidentLocation.lng.toFixed(4)}
        </div>
      )}

      {/* Time */}
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
        <Clock className="w-3 h-3" />
        {new Date(dispatch.startTime).toLocaleTimeString('en-US', { hour12: false })}
      </div>
    </button>
  );
}
