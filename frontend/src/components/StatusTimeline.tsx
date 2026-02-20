import { useEffect, useState, useCallback } from 'react';
import { dispatchApi } from '@/services/api';
import { getSocket, SOCKET_EVENTS } from '@/services/socket';
import type { StatusHistoryEntry } from '@/types';
import { cn } from '@/lib/utils';
import {
  CheckCircle,
  Navigation,
  MapPin,
  Clock,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';

const statusConfig: Record<string, {
  icon: typeof CheckCircle;
  color: string;
  bgColor: string;
  label: string;
}> = {
  ACCEPTED: {
    icon: CheckCircle,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    label: 'Accepted',
  },
  EN_ROUTE: {
    icon: Navigation,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    label: 'En Route',
  },
  ARRIVED: {
    icon: MapPin,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    label: 'Arrived',
  },
  COMPLETED: {
    icon: CheckCircle,
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    label: 'Completed',
  },
  FAILED_ASSIGNMENT: {
    icon: AlertCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    label: 'Failed',
  },
  REASSIGNED: {
    icon: RefreshCw,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    label: 'Reassigned',
  },
};

const EXPECTED_FLOW = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'];

interface StatusTimelineProps {
  dispatchId: string;
  className?: string;
  compact?: boolean;
}

export function StatusTimeline({
  dispatchId,
  className,
  compact = false,
}: StatusTimelineProps) {
  const [entries, setEntries] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    try {
      const data = await dispatchApi.getStatusTimeline(dispatchId);
      setEntries(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [dispatchId]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  // Listen for status updates to refresh timeline
  useEffect(() => {
    const socket = getSocket();

    const handleStatusUpdate = (data: any) => {
      // Refresh timeline when our dispatch/vehicle status changes
      if (data.dispatchId === dispatchId) {
        fetchTimeline();
      }
    };

    socket.on(SOCKET_EVENTS.VEHICLE_STATUS_UPDATED, handleStatusUpdate);

    return () => {
      socket.off(SOCKET_EVENTS.VEHICLE_STATUS_UPDATED, handleStatusUpdate);
    };
  }, [dispatchId, fetchTimeline]);

  if (loading) {
    return (
      <div className={cn('rounded-lg border bg-card p-4', className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading timeline...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border bg-card p-4', className)}>
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      </div>
    );
  }

  // Determine completed statuses from entries
  const completedStatuses = new Set(entries.map((e) => e.status));
  const lastStatus = entries.length > 0 ? entries[entries.length - 1].status : null;

  if (compact) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        {EXPECTED_FLOW.map((status, idx) => {
          const isCompleted = completedStatuses.has(status);
          const isCurrent = status === lastStatus;
          const config = statusConfig[status] || statusConfig.ACCEPTED;

          return (
            <div key={status} className="flex items-center">
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center transition-all',
                  isCompleted || isCurrent
                    ? config.bgColor
                    : 'bg-muted/30'
                )}
                title={config.label}
              >
                <config.icon
                  className={cn(
                    'w-3 h-3',
                    isCompleted || isCurrent ? config.color : 'text-muted-foreground/50'
                  )}
                />
              </div>
              {idx < EXPECTED_FLOW.length - 1 && (
                <div
                  className={cn(
                    'w-4 h-0.5 mx-0.5',
                    completedStatuses.has(EXPECTED_FLOW[idx + 1])
                      ? 'bg-green-500/50'
                      : 'bg-muted/30'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border bg-card p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Status Timeline</h4>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          {entries.length} updates
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-1 mb-5">
        {EXPECTED_FLOW.map((status, idx) => {
          const isCompleted = completedStatuses.has(status);
          const isCurrent = status === lastStatus;
          const config = statusConfig[status] || statusConfig.ACCEPTED;

          return (
            <div key={status} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                    isCurrent
                      ? `${config.bgColor} ring-2 ring-offset-1 ring-offset-background ring-current`
                      : isCompleted
                        ? config.bgColor
                        : 'bg-muted/20'
                  )}
                >
                  <config.icon
                    className={cn(
                      'w-4 h-4',
                      isCompleted || isCurrent ? config.color : 'text-muted-foreground/40'
                    )}
                  />
                </div>
                <span
                  className={cn(
                    'text-[9px] uppercase tracking-wider font-medium',
                    isCurrent ? config.color : isCompleted ? 'text-foreground/70' : 'text-muted-foreground/40'
                  )}
                >
                  {config.label}
                </span>
              </div>
              {idx < EXPECTED_FLOW.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-1 mt-[-16px]',
                    completedStatuses.has(EXPECTED_FLOW[idx + 1])
                      ? 'bg-green-500/60'
                      : 'bg-muted/20'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Detailed entries */}
      {entries.length > 0 && (
        <div className="relative pl-6 space-y-3">
          {/* Vertical line */}
          <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />

          {entries.map((entry, idx) => {
            const config = statusConfig[entry.status] || statusConfig.ACCEPTED;
            const isLast = idx === entries.length - 1;
            const time = new Date(entry.timestamp);

            return (
              <div key={entry.id} className="relative flex gap-3 items-start">
                {/* Timeline dot */}
                <div
                  className={cn(
                    'absolute left-[-18px] w-4 h-4 rounded-full flex items-center justify-center z-10',
                    isLast ? config.bgColor : 'bg-card border border-border'
                  )}
                >
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full',
                      isLast ? 'bg-current animate-pulse' : 'bg-muted-foreground/50',
                      isLast && config.color
                    )}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'text-xs font-semibold uppercase',
                        isLast ? config.color : 'text-foreground/70'
                      )}
                    >
                      {config.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {time.toLocaleTimeString('en-US', { hour12: false })}
                    </span>
                  </div>
                  {entry.latitude && entry.longitude && (
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      {entry.latitude.toFixed(5)}, {entry.longitude.toFixed(5)}
                    </p>
                  )}
                  {entry.vehicleId && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Vehicle: {entry.vehicleId.slice(0, 8)}...
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No status updates recorded yet
        </p>
      )}
    </div>
  );
}
