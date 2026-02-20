import { useEffect, useState, useCallback } from 'react';
import { dispatchApi } from '@/services/api';
import { getSocket, SOCKET_EVENTS } from '@/services/socket';
import type { SOSEvent, IncidentClusterInfo } from '@/types';
import { cn } from '@/lib/utils';
import { Layers, AlertTriangle, Users, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface IncidentClusterBadgeProps {
  event: SOSEvent;
  className?: string;
  showDetails?: boolean;
}

export function IncidentClusterBadge({
  event,
  className,
  showDetails = false,
}: IncidentClusterBadgeProps) {
  const [clusterInfo, setClusterInfo] = useState<IncidentClusterInfo | null>(null);
  const [clusterEvents, setClusterEvents] = useState<SOSEvent[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const isClustered = (event.clusterCount ?? 1) > 1 || !!event.clusterId;

  const fetchClusterDetails = useCallback(async () => {
    if (!isClustered) return;
    setLoading(true);
    try {
      const [info, events] = await Promise.all([
        dispatchApi.getClusterInfo(event.id),
        event.clusterId
          ? dispatchApi.getClusterEvents(event.clusterId)
          : dispatchApi.getClusterEvents(event.id),
      ]);
      setClusterInfo(info);
      setClusterEvents(events);
    } catch (err) {
      console.error('Failed to fetch cluster info:', err);
    } finally {
      setLoading(false);
    }
  }, [event.id, event.clusterId, isClustered]);

  // Listen for cluster updates
  useEffect(() => {
    const socket = getSocket();

    const handleUpdate = (data: any) => {
      if (data.clusterId === event.id || data.clusterId === event.clusterId) {
        fetchClusterDetails();
      }
    };

    socket.on(SOCKET_EVENTS.INCIDENT_UPDATED, handleUpdate);

    return () => {
      socket.off(SOCKET_EVENTS.INCIDENT_UPDATED, handleUpdate);
    };
  }, [event.id, event.clusterId, fetchClusterDetails]);

  // Fetch details when expanded or showDetails is true
  useEffect(() => {
    if ((expanded || showDetails) && isClustered && !clusterInfo) {
      fetchClusterDetails();
    }
  }, [expanded, showDetails, isClustered, clusterInfo, fetchClusterDetails]);

  // Don't render if not clustered and no special badge needed
  if (!isClustered) return null;

  const count = event.clusterCount ?? clusterInfo?.clusterCount ?? 1;
  const severity = event.severityScore ?? clusterInfo?.severityScore ?? 1;

  const severityColor =
    severity >= 5
      ? 'text-red-400 bg-red-500/15 border-red-500/30'
      : severity >= 3
        ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
        : 'text-blue-400 bg-blue-500/15 border-blue-500/30';

  // Inline badge mode
  if (!showDetails && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all hover:scale-105',
          severityColor,
          className
        )}
        title={`${count} reports merged • Severity ${severity}`}
      >
        <Layers className="w-3 h-3" />
        <span>{count}</span>
        <span className="hidden sm:inline">reports</span>
        {severity >= 3 && <AlertTriangle className="w-3 h-3" />}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden transition-all',
        severityColor.split(' ').slice(1).join(' '),
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn('p-1.5 rounded-md', severity >= 5 ? 'bg-red-500/20' : severity >= 3 ? 'bg-amber-500/20' : 'bg-blue-500/20')}>
            <Layers className={cn('w-4 h-4', severity >= 5 ? 'text-red-400' : severity >= 3 ? 'text-amber-400' : 'text-blue-400')} />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold text-foreground uppercase">
              Incident Cluster
            </p>
            <p className="text-[10px] text-muted-foreground">
              {count} merged reports &middot; Severity {severity}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn(
            'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
            severity >= 5 ? 'bg-red-500/20 text-red-300' : severity >= 3 ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'
          )}>
            <Users className="w-3 h-3" />
            {count}
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading cluster details...
            </div>
          ) : (
            <>
              {/* Cluster overview */}
              {clusterInfo && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-2 rounded bg-background/50">
                    <p className="text-[10px] text-muted-foreground uppercase">Reports</p>
                    <p className="text-lg font-bold text-foreground">{clusterInfo.clusterCount}</p>
                  </div>
                  <div className="text-center p-2 rounded bg-background/50">
                    <p className="text-[10px] text-muted-foreground uppercase">Severity</p>
                    <p className={cn(
                      'text-lg font-bold',
                      severity >= 5 ? 'text-red-400' : severity >= 3 ? 'text-amber-400' : 'text-blue-400'
                    )}>
                      {clusterInfo.severity}
                    </p>
                  </div>
                  <div className="text-center p-2 rounded bg-background/50">
                    <p className="text-[10px] text-muted-foreground uppercase">Type</p>
                    <p className="text-sm font-semibold text-foreground uppercase">{clusterInfo.emergencyType || event.emergencyType}</p>
                  </div>
                </div>
              )}

              {/* Individual reports */}
              {clusterEvents.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                    Individual Reports
                  </p>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {clusterEvents.map((evt) => (
                      <div
                        key={evt.id}
                        className="flex items-center justify-between p-2 rounded bg-background/30 text-[11px]"
                      >
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'w-2 h-2 rounded-full',
                            evt.id === event.id ? 'bg-blue-400' : 'bg-muted-foreground/50'
                          )} />
                          <span className="font-mono text-foreground">
                            SOS #{evt.sosCount}
                          </span>
                          <span className="text-muted-foreground">
                            {evt.latitude.toFixed(4)}, {evt.longitude.toFixed(4)}
                          </span>
                        </div>
                        <span className="text-muted-foreground">
                          {new Date(evt.createdAt).toLocaleTimeString('en-US', { hour12: false })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
