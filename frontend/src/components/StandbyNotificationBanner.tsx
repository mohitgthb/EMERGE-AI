import { useEffect, useState } from 'react';
import { useDemoStore, type StandbyNotification } from '@/stores/demoStore';
import { cn } from '@/lib/utils';
import { Bell, MapPin, Clock, CheckCircle2, X, Navigation, AlertTriangle, Ambulance, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Real-time standby notification banner for the Demo section.
 * Shows incoming vehicle reposition suggestions from the predictive readiness
 * service with accept/dismiss actions and expiry countdown.
 */
export function StandbyNotificationBanner() {
  const {
    standbyNotifications,
    acceptStandby,
    dismissStandby,
    clearResolvedNotifications,
  } = useDemoStore();

  const activeNotifications = standbyNotifications.filter((n) => !n.resolved);
  const resolvedNotifications = standbyNotifications.filter((n) => !!n.resolved);

  if (standbyNotifications.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-amber-400" />
          Standby Notifications
          {activeNotifications.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[9px] font-bold animate-pulse">
              {activeNotifications.length} NEW
            </span>
          )}
        </h3>
        {resolvedNotifications.length > 0 && (
          <button
            onClick={clearResolvedNotifications}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear resolved ({resolvedNotifications.length})
          </button>
        )}
      </div>

      {/* Active notifications */}
      {activeNotifications.map((n) => (
        <NotificationCard key={n.suggestionId} notification={n} onAccept={acceptStandby} onDismiss={dismissStandby} />
      ))}

      {/* Resolved notifications (collapsed) */}
      {resolvedNotifications.length > 0 && (
        <div className="space-y-2">
          {resolvedNotifications.slice(0, 3).map((n) => (
            <ResolvedCard key={n.suggestionId} notification={n} />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationCard({
  notification: n,
  onAccept,
  onDismiss,
}: {
  notification: StandbyNotification;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const update = () => {
      const remaining = new Date(n.expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setExpired(true);
        setTimeLeft('Expired');
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [n.expiresAt]);

  const isAmb = n.vehicleType === 'AMBULANCE';
  const VehicleIcon = isAmb ? Ambulance : Flame;
  const riskScore = n.riskZone?.riskScore ?? 0;

  return (
    <div
      className={cn(
        'relative rounded-lg border p-4 space-y-3 transition-all duration-300',
        expired
          ? 'border-muted bg-muted/20 opacity-60'
          : 'border-amber-500/40 bg-amber-500/5 shadow-lg shadow-amber-500/5 animate-in slide-in-from-top-2'
      )}
    >
      {/* Pulse indicator */}
      {!expired && (
        <span className="absolute top-3 right-3 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
        </span>
      )}

      {/* Vehicle info & risk */}
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
          isAmb ? 'bg-blue-500/15 text-blue-400' : 'bg-red-500/15 text-red-400'
        )}>
          <VehicleIcon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-foreground">{n.vehicleNo}</span>
            <span className={cn(
              'text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase',
              isAmb
                ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                : 'bg-red-500/15 border-red-500/30 text-red-400'
            )}>
              {n.vehicleType.replace('_', ' ')}
            </span>
            {riskScore > 0 && (
              <span className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5',
                riskScore >= 70
                  ? 'bg-red-500/15 border-red-500/30 text-red-400'
                  : riskScore >= 40
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              )}>
                <AlertTriangle className="w-2.5 h-2.5" />
                Risk {riskScore}
              </span>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground mt-1">
            Reposition to high-risk zone for faster response
          </p>
        </div>
      </div>

      {/* Route info */}
      <div className="grid grid-cols-2 gap-3 text-[11px]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="w-3 h-3 text-blue-400 flex-shrink-0" />
          <span>Current: {n.currentLat.toFixed(4)}, {n.currentLng.toFixed(4)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Navigation className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span>Move to: {n.suggestedLat.toFixed(4)}, {n.suggestedLng.toFixed(4)}</span>
        </div>
      </div>

      {/* Metrics strip */}
      <div className="flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-1">
          <MapPin className="w-3 h-3 text-muted-foreground" />
          <span className="font-mono font-bold text-foreground">{n.distanceKm} km</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-emerald-400" />
          <span className="font-mono font-bold text-emerald-400">-{n.responseTimeImprove}s</span>
          <span className="text-muted-foreground">response</span>
        </div>
        <div className={cn(
          'flex items-center gap-1 ml-auto font-mono',
          expired ? 'text-red-400' : 'text-amber-400'
        )}>
          <Clock className="w-3 h-3" />
          <span className="font-bold">{timeLeft}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1 h-8 text-[11px] bg-amber-500 hover:bg-amber-400 text-black font-bold gap-1.5"
          onClick={() => onAccept(n.suggestionId)}
          disabled={expired || n.accepting}
        >
          {n.accepting ? (
            <span className="w-3 h-3 border-2 border-black/40 border-t-black rounded-full animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          Move to Standby
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-[11px] text-muted-foreground hover:text-red-400 hover:bg-red-500/10 px-3"
          onClick={() => onDismiss(n.suggestionId)}
          disabled={expired || n.dismissing}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ResolvedCard({ notification: n }: { notification: StandbyNotification }) {
  const isAccepted = n.resolved === 'accepted';
  const isAmb = n.vehicleType === 'AMBULANCE';
  const VehicleIcon = isAmb ? Ambulance : Flame;

  return (
    <div className={cn(
      'rounded-lg border px-3 py-2 flex items-center gap-3 text-[11px]',
      isAccepted
        ? 'border-emerald-500/20 bg-emerald-500/5'
        : 'border-muted bg-muted/10'
    )}>
      <VehicleIcon className={cn(
        'w-4 h-4 flex-shrink-0',
        isAmb ? 'text-blue-400/60' : 'text-red-400/60'
      )} />
      <span className="font-mono font-bold text-foreground/80">{n.vehicleNo}</span>
      <span className="text-muted-foreground">→ {n.distanceKm} km</span>
      <span className={cn(
        'ml-auto font-bold uppercase tracking-wider',
        isAccepted ? 'text-emerald-400' : 'text-muted-foreground'
      )}>
        {isAccepted ? '✓ Moved' : '✗ Dismissed'}
      </span>
    </div>
  );
}
