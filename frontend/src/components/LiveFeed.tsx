import { useEmergencyStore } from '@/stores/emergencyStore';
import { AlertTriangle, Truck, Radio, Zap, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LiveEvent } from '@/types';

const iconMap: Record<LiveEvent['type'], typeof AlertTriangle> = {
  sos: AlertTriangle,
  dispatch: Truck,
  unit_update: Radio,
  accident: Zap,
  system: Monitor,
};

const severityColor: Record<string, string> = {
  critical: 'text-status-critical',
  high: 'text-status-warning',
  medium: 'text-status-info',
  low: 'text-muted-foreground',
};

export function LiveFeed() {
  const liveEvents = useEmergencyStore((s) => s.liveEvents);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b bg-card flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-status-success animate-pulse-glow" />
        <h3 className="text-sm font-semibold text-foreground">Live Event Feed</h3>
        <span className="text-[10px] font-mono text-muted-foreground ml-auto">REAL-TIME</span>
      </div>
      <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
        {liveEvents.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            Waiting for events...
          </div>
        )}
        {liveEvents.map((event) => {
          const Icon = iconMap[event.type] ?? Monitor;
          return (
            <div key={event.id} className="px-4 py-3 flex items-start gap-3 hover:bg-accent/50 transition-colors">
              <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', severityColor[event.severity])} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground leading-tight">{event.message}</p>
                <p className="text-[10px] font-mono text-muted-foreground mt-1">
                  {new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                </p>
              </div>
              {event.severity === 'critical' && (
                <span className="w-1.5 h-1.5 rounded-full bg-status-critical animate-pulse-glow mt-1.5" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
