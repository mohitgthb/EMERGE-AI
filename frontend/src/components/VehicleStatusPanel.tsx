import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { dispatchApi } from '@/services/api';
import { cn } from '@/lib/utils';
import {
  CheckCircle,
  Navigation,
  MapPin,
  XCircle,
  Loader2,
  Truck,
  Flame,
  Shield,
} from 'lucide-react';

type VehicleType = 'AMBULANCE' | 'FIRE_BRIGADE' | 'POLICE';

const STATUS_FLOW: Record<VehicleType, string[]> = {
  AMBULANCE: ['EN_ROUTE', 'ARRIVED', 'COMPLETED'],
  FIRE_BRIGADE: ['EN_ROUTE', 'ARRIVED', 'COMPLETED'],
  POLICE: ['EN_ROUTE', 'ARRIVED', 'COMPLETED'],
};

const statusColors: Record<string, string> = {
  AVAILABLE: 'bg-emerald-600 hover:bg-emerald-700',
  EN_ROUTE: 'bg-amber-600 hover:bg-amber-700',
  ARRIVED: 'bg-blue-600 hover:bg-blue-700',
  COMPLETED: 'bg-green-600 hover:bg-green-700',
  BUSY: 'bg-red-600 hover:bg-red-700',
};

const typeIcons: Record<VehicleType, typeof Truck> = {
  AMBULANCE: Truck,
  FIRE_BRIGADE: Flame,
  POLICE: Shield,
};

interface VehicleStatusPanelProps {
  vehicleId: string;
  vehicleNo: string;
  vehicleType: VehicleType;
  currentStatus: string;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  dispatchId?: string;
  onStatusChange?: (newStatus: string) => void;
  className?: string;
}

export function VehicleStatusPanel({
  vehicleId,
  vehicleNo,
  vehicleType,
  currentStatus,
  latitude,
  longitude,
  dispatchId,
  onStatusChange,
  className,
}: VehicleStatusPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flow = STATUS_FLOW[vehicleType] || STATUS_FLOW.AMBULANCE;
  const currentIndex = flow.indexOf(currentStatus);
  const Icon = typeIcons[vehicleType] || Truck;

  const handleStatusUpdate = useCallback(
    async (status: string) => {
      setLoading(status);
      setError(null);
      try {
        await dispatchApi.updateVehicleStatus({
          vehicleId,
          vehicleType,
          status,
          latitude: latitude ?? 0,
          longitude: longitude ?? 0,
          dispatchId,
        });
        onStatusChange?.(status);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to update status');
      } finally {
        setLoading(null);
      }
    },
    [vehicleId, vehicleType, latitude, longitude, dispatchId, onStatusChange]
  );

  return (
    <div className={cn('rounded-lg border bg-card p-4 space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold font-mono text-foreground">{vehicleNo}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {vehicleType.replace('_', ' ')}
            </p>
          </div>
        </div>
        <StatusBadge
          variant={currentStatus.toLowerCase() as any}
          pulse={currentStatus === 'EN_ROUTE'}
        >
          {currentStatus.replace('_', ' ')}
        </StatusBadge>
      </div>

      {/* Location */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
        <MapPin className="w-3 h-3" />
        {latitude != null ? latitude.toFixed(4) : '—'}, {longitude != null ? longitude.toFixed(4) : '—'}
      </div>

      {/* Status flow buttons */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Update Status</p>
        <div className="grid grid-cols-3 gap-2">
          {flow.map((status, idx) => {
            const isCompleted = idx < currentIndex || (idx === currentIndex && currentStatus !== 'AVAILABLE');
            const isCurrent = status === currentStatus;
            const isNext = idx === currentIndex + 1;
            const isDisabled = loading !== null || (idx > currentIndex + 1 && !isCurrent);

            return (
              <Button
                key={status}
                size="sm"
                disabled={isDisabled}
                onClick={() => handleStatusUpdate(status)}
                className={cn(
                  'h-12 text-xs font-bold uppercase transition-all relative',
                  isCurrent
                    ? statusColors[status] + ' ring-2 ring-offset-1 ring-offset-background ring-primary'
                    : isCompleted
                      ? 'bg-emerald-800/50 text-emerald-300'
                      : isNext
                        ? 'bg-secondary text-foreground hover:bg-accent animate-pulse'
                        : 'bg-secondary/50 text-muted-foreground',
                )}
              >
                {loading === status ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : isCompleted ? (
                  <CheckCircle className="w-3 h-3 mr-1" />
                ) : isNext ? (
                  <Navigation className="w-3 h-3 mr-1" />
                ) : null}
                {status.replace('_', ' ')}
              </Button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded p-2">
          <XCircle className="w-3 h-3 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
