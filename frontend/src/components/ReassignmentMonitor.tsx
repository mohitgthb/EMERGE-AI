import { useEffect, useState, useRef } from 'react';
import { getSocket, SOCKET_EVENTS } from '@/services/socket';
import type { ReassignmentPayload, ReassignmentFailedPayload } from '@/types';
import { cn } from '@/lib/utils';
import { RefreshCw, AlertTriangle, ArrowRight, X } from 'lucide-react';

interface ReassignmentEvent {
  id: string;
  type: 'reassigned' | 'failed';
  data: ReassignmentPayload | ReassignmentFailedPayload;
  timestamp: Date;
}

interface ReassignmentMonitorProps {
  vehicleId?: string;
  className?: string;
  maxEvents?: number;
}

export function ReassignmentMonitor({
  vehicleId,
  className,
  maxEvents = 5,
}: ReassignmentMonitorProps) {
  const [events, setEvents] = useState<ReassignmentEvent[]>([]);
  const [expanded, setExpanded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const handleReassigned = (data: ReassignmentPayload) => {
      // Filter by vehicleId if provided
      if (vehicleId && data.oldVehicleId !== vehicleId && data.newVehicleId !== vehicleId) {
        return;
      }

      const event: ReassignmentEvent = {
        id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'reassigned',
        data,
        timestamp: new Date(),
      };

      setEvents((prev) => [event, ...prev].slice(0, maxEvents));

      // Play alert sound
      try {
        audioRef.current = new Audio('data:audio/wav;base64,UklGRlgBAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YTQBAABkAHgAjACeAKoAsACwAKoAnACIAG4ATgAoAAAA4P+8/5j/eP9c/0T/NP8o/yT/JP8s/zj/SP9c/3T/jP+o/8T/4P/8/xgANABMAGQAdACEAIgAiACCAHYAZABMADIAFAD0/9T/tP+U/3j/YP9M/zz/NP8w/zD/NP88/0z/YP94/5T/tP/U//T/FAA=');
        audioRef.current.volume = 0.3;
        audioRef.current.play().catch(() => {});
      } catch {}
    };

    const handleFailed = (data: ReassignmentFailedPayload) => {
      if (vehicleId && data.vehicleId !== vehicleId) return;

      const event: ReassignmentEvent = {
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'failed',
        data,
        timestamp: new Date(),
      };

      setEvents((prev) => [event, ...prev].slice(0, maxEvents));
    };

    socket.on(SOCKET_EVENTS.DISPATCH_REASSIGNED, handleReassigned);
    socket.on(SOCKET_EVENTS.REASSIGNMENT_FAILED, handleFailed);

    return () => {
      socket.off(SOCKET_EVENTS.DISPATCH_REASSIGNED, handleReassigned);
      socket.off(SOCKET_EVENTS.REASSIGNMENT_FAILED, handleFailed);
    };
  }, [vehicleId, maxEvents]);

  if (events.length === 0) return null;

  const latestEvent = events[0];
  const hasFailure = events.some((e) => e.type === 'failed');

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden transition-all',
        hasFailure
          ? 'border-red-500/40 bg-red-950/20'
          : 'border-amber-500/40 bg-amber-950/20',
        className
      )}
    >
      {/* Header badge */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'p-1.5 rounded-md',
              hasFailure ? 'bg-red-500/20' : 'bg-amber-500/20'
            )}
          >
            {hasFailure ? (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            ) : (
              <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '3s' }} />
            )}
          </div>
          <div className="text-left">
            <p className="text-xs font-bold text-foreground uppercase">
              {latestEvent.type === 'failed'
                ? 'Reassignment Failed'
                : 'Vehicle Reassigned'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {events.length} event{events.length !== 1 ? 's' : ''} &middot;{' '}
              {latestEvent.timestamp.toLocaleTimeString('en-US', { hour12: false })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {latestEvent.type === 'reassigned' && (
            <ReassignmentBadge data={latestEvent.data as ReassignmentPayload} />
          )}
          <span className="text-[10px] text-muted-foreground">
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {/* Expanded event list */}
      {expanded && (
        <div className="border-t border-border/50 divide-y divide-border/30">
          {events.map((event) => (
            <div key={event.id} className="px-4 py-3">
              {event.type === 'reassigned' ? (
                <ReassignedDetail data={event.data as ReassignmentPayload} time={event.timestamp} />
              ) : (
                <FailedDetail data={event.data as ReassignmentFailedPayload} time={event.timestamp} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReassignmentBadge({ data }: { data: ReassignmentPayload }) {
  return (
    <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1">
      <span className="text-[10px] font-mono text-amber-300">
        {data.oldVehicleNo || data.oldVehicleId?.slice(0, 6)}
      </span>
      <ArrowRight className="w-3 h-3 text-amber-400" />
      <span className="text-[10px] font-mono text-amber-300 font-bold">
        {data.newVehicleNo || data.newVehicleId?.slice(0, 6)}
      </span>
      <span className="text-[9px] text-amber-500 ml-1">
        #{data.attemptNumber || data.attempt}
      </span>
    </div>
  );
}

function ReassignedDetail({ data, time }: { data: ReassignmentPayload; time: Date }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <RefreshCw className="w-3 h-3 text-amber-400" />
        <span className="text-xs font-semibold text-foreground">Vehicle Reassigned</span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {time.toLocaleTimeString('en-US', { hour12: false })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <div>
          <span className="text-muted-foreground">Previous:</span>{' '}
          <span className="font-mono text-red-400 line-through">
            {data.oldVehicleNo || data.oldVehicleId?.slice(0, 8)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">New:</span>{' '}
          <span className="font-mono text-green-400 font-bold">
            {data.newVehicleNo || data.newVehicleId?.slice(0, 8)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Attempt:</span>{' '}
          <span className="text-foreground">{data.attemptNumber || data.attempt} / 2</span>
        </div>
        <div>
          <span className="text-muted-foreground">Reason:</span>{' '}
          <span className="text-foreground">{data.reason || 'No movement detected'}</span>
        </div>
      </div>
      {(data.newRoute || data.route) && (
        <div className="text-[10px] text-muted-foreground">
          New route: {(data.newRoute || data.route)?.distanceKm?.toFixed(1)} km &middot;{' '}
          {(data.newRoute || data.route)?.durationSec ? `${Math.ceil(((data.newRoute || data.route)?.durationSec || 0) / 60)} min` : '--'}
        </div>
      )}
    </div>
  );
}

function FailedDetail({ data, time }: { data: ReassignmentFailedPayload; time: Date }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3 h-3 text-red-400" />
        <span className="text-xs font-semibold text-red-400">Reassignment Failed</span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {time.toLocaleTimeString('en-US', { hour12: false })}
        </span>
      </div>
      <div className="text-[11px]">
        <span className="text-muted-foreground">Dispatch:</span>{' '}
        <span className="font-mono text-foreground">{data.dispatchId?.slice(0, 12)}</span>
      </div>
      <p className="text-[11px] text-red-400">
        {data.reason || 'No available vehicles for reassignment'}
      </p>
    </div>
  );
}
