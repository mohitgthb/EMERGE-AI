import { useEffect, useState } from 'react';
import { dispatchApi } from '@/services/api';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { cn } from '@/lib/utils';

interface GreenCorridorIndicatorProps {
  vehicleId?: string;
  vehicleType?: 'AMBULANCE' | 'FIRE_BRIGADE' | 'POLICE';
  className?: string;
  compact?: boolean;
}

export function GreenCorridorIndicator({
  vehicleId,
  vehicleType,
  className,
  compact = false,
}: GreenCorridorIndicatorProps) {
  const {
    greenCorridorActive,
    greenCorridorVehicleId,
    greenCorridorSignals,
  } = useEmergencyStore();

  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActiveForThisVehicle =
    greenCorridorActive &&
    (!vehicleId || greenCorridorVehicleId === vehicleId);

  const handleActivate = async () => {
    if (!vehicleId || !vehicleType) return;
    setActivating(true);
    setError(null);
    try {
      await dispatchApi.activateGreenCorridor(vehicleId, vehicleType);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to activate corridor');
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    setDeactivating(true);
    setError(null);
    try {
      await dispatchApi.deactivateGreenCorridor();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to deactivate corridor');
    } finally {
      setDeactivating(false);
    }
  };

  if (compact) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
          isActiveForThisVehicle
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
            : 'bg-muted/30 text-muted-foreground border border-border',
          className
        )}
      >
        <span
          className={cn(
            'w-2 h-2 rounded-full',
            isActiveForThisVehicle ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'
          )}
        />
        {isActiveForThisVehicle ? (
          <>
            GREEN CORRIDOR
            <span className="font-mono text-[10px] text-emerald-500">
              {greenCorridorSignals.length}
            </span>
          </>
        ) : (
          'Corridor Off'
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-5 transition-all duration-300',
        isActiveForThisVehicle
          ? 'bg-emerald-950/30 border-emerald-500/40 shadow-lg shadow-emerald-500/5'
          : 'bg-card border-border',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center text-lg',
            isActiveForThisVehicle ? 'bg-emerald-500/20' : 'bg-muted/50'
          )}
        >
          🚦
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-card-foreground">Green Corridor</h4>
          <p className="text-xs text-muted-foreground">
            {isActiveForThisVehicle
              ? 'Traffic signals prioritized for emergency vehicle'
              : 'Activate to clear traffic signals along route'}
          </p>
        </div>
        <span
          className={cn(
            'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full',
            isActiveForThisVehicle
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-muted/30 text-muted-foreground'
          )}
        >
          {isActiveForThisVehicle ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Signal indicators */}
      {isActiveForThisVehicle && greenCorridorSignals.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
            Active Signals ({greenCorridorSignals.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {greenCorridorSignals.map((signal) => (
              <div
                key={signal.id}
                className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-1"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono text-emerald-300">
                  {signal.junctionId}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats bar */}
      {isActiveForThisVehicle && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-background/50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
              Signals
            </p>
            <p className="text-lg font-bold text-emerald-400">{greenCorridorSignals.length}</p>
          </div>
          <div className="bg-background/50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
              Status
            </p>
            <p className="text-lg font-bold text-emerald-400">🟢</p>
          </div>
        </div>
      )}

      {/* Action button */}
      {vehicleId && vehicleType && (
        <div>
          {isActiveForThisVehicle ? (
            <button
              onClick={handleDeactivate}
              disabled={deactivating}
              className="w-full py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {deactivating ? 'Deactivating...' : 'Deactivate Corridor'}
            </button>
          ) : (
            <button
              onClick={handleActivate}
              disabled={activating}
              className="w-full py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              {activating ? 'Activating...' : 'Activate Green Corridor'}
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mt-2 text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
