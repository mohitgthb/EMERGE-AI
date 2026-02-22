import { cn } from '@/lib/utils';
import type { VehicleCrash } from '@/types';
import {
  Car,
  MapPin,
  Shield,
  AlertTriangle,
  Clock,
  Navigation,
  Ban,
} from 'lucide-react';

interface VehicleTelemetryCardProps {
  crash: VehicleCrash;
  className?: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  REPORTED: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Reported' },
  DISPATCHED: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Dispatched' },
  CANCELLED: { bg: 'bg-zinc-500/15', text: 'text-zinc-400', label: 'Cancelled' },
  DUPLICATE: { bg: 'bg-purple-500/15', text: 'text-purple-400', label: 'Duplicate' },
};

const SEVERITY_COLORS: Record<string, string> = {
  LOW: 'text-blue-400',
  MEDIUM: 'text-amber-400',
  HIGH: 'text-orange-400',
  CRITICAL: 'text-red-400',
};

/**
 * Displays crash telemetry data for a VehicleCrash record.
 */
export function VehicleTelemetryCard({ crash, className }: VehicleTelemetryCardProps) {
  const statusStyle = STATUS_STYLES[crash.status] || STATUS_STYLES.REPORTED;
  const severityColor = SEVERITY_COLORS[crash.severity] || 'text-foreground';

  const timeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return new Date(date).toLocaleDateString();
  };

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4 space-y-3 transition-all hover:shadow-md',
        crash.status === 'CANCELLED' && 'opacity-60',
        className
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
            <Car className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <p className="font-mono font-bold text-sm text-foreground">{crash.vehicleRegNo}</p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {timeAgo(crash.createdAt)}
            </p>
          </div>
        </div>
        <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full', statusStyle.bg, statusStyle.text)}>
          {statusStyle.label}
        </span>
      </div>

      {/* Telemetry grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="font-mono truncate">
            {crash.latitude.toFixed(4)}, {crash.longitude.toFixed(4)}
          </span>
        </div>
        <div className={cn('flex items-center gap-1.5 font-bold', severityColor)}>
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          {crash.severity}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Shield className="w-3 h-3 flex-shrink-0" />
          Airbag: {crash.airbagDeployed ? (
            <span className="text-red-400 font-bold">Deployed</span>
          ) : (
            <span>No</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {crash.dispatchId ? (
            <>
              <Navigation className="w-3 h-3 flex-shrink-0 text-emerald-400" />
              <span className="font-mono text-emerald-400 truncate">
                #{crash.dispatchId.slice(0, 8)}
              </span>
            </>
          ) : crash.status === 'CANCELLED' ? (
            <>
              <Ban className="w-3 h-3 flex-shrink-0" />
              Cancelled
            </>
          ) : (
            <>
              <Navigation className="w-3 h-3 flex-shrink-0" />
              Pending
            </>
          )}
        </div>
      </div>

      {/* Idempotency key (debug, small) */}
      <p className="text-[9px] text-muted-foreground/50 font-mono truncate">
        key: {crash.idempotencyKey}
      </p>
    </div>
  );
}

export default VehicleTelemetryCard;
