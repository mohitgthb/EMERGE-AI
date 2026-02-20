import { useState, useEffect } from 'react';
import { useDemoStore } from '@/stores/demoStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { Play, Square, Radio, Zap, AlertTriangle } from 'lucide-react';

interface DemoModeToggleProps {
  className?: string;
  compact?: boolean;
}

/**
 * DemoModeToggle — Admin-only toggle for enabling/disabling demo simulation mode.
 * Shows simulation status and quick controls when enabled.
 */
export function DemoModeToggle({ className, compact = false }: DemoModeToggleProps) {
  const { enabled, loading, error, simulations, toggleDemoMode, fetchStatus, initDemoSocket } = useDemoStore();
  const { operator } = useAuthStore();

  useEffect(() => {
    initDemoSocket();
    fetchStatus();
  }, [initDemoSocket, fetchStatus]);

  const isAdmin = !operator || operator.role === 'ADMIN';

  if (compact) {
    return (
      <button
        onClick={() => isAdmin && toggleDemoMode(!enabled)}
        disabled={loading || !isAdmin}
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all border',
          enabled
            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
            : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted/50',
          loading && 'opacity-50 cursor-wait',
          !isAdmin && 'opacity-50 cursor-not-allowed',
          className
        )}
        title={enabled ? 'Demo Mode Active — Click to disable' : 'Enable Demo Mode'}
      >
        <Radio className={cn('w-3 h-3', enabled && 'animate-pulse')} />
        {enabled ? 'DEMO' : 'Demo Off'}
        {simulations.length > 0 && (
          <span className="font-mono text-[10px] bg-amber-500/20 px-1.5 rounded-full">
            {simulations.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-5 transition-all duration-300',
        enabled
          ? 'bg-amber-950/20 border-amber-500/40 shadow-lg shadow-amber-500/5'
          : 'bg-card border-border',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              enabled ? 'bg-amber-500/20' : 'bg-muted/50'
            )}
          >
            <Radio className={cn('w-5 h-5', enabled ? 'text-amber-400' : 'text-muted-foreground')} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-card-foreground">Demo Simulation Mode</h4>
            <p className="text-[11px] text-muted-foreground">
              {enabled
                ? 'Simulating vehicle movement with real dispatch data'
                : 'Simulate live vehicle tracking without GPS hardware'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full',
              enabled ? 'bg-amber-500/20 text-amber-300' : 'bg-muted/30 text-muted-foreground'
            )}
          >
            {enabled ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Toggle switch */}
      {isAdmin && (
        <div className="flex items-center justify-between mb-4 p-3 rounded-lg bg-background/50">
          <div>
            <p className="text-xs font-medium text-foreground">Enable Demo Mode</p>
            <p className="text-[10px] text-muted-foreground">
              Vehicle locations will be simulated along dispatch routes
            </p>
          </div>
          <button
            onClick={() => toggleDemoMode(!enabled)}
            disabled={loading}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
              enabled ? 'bg-amber-500' : 'bg-muted',
              loading && 'opacity-50 cursor-wait'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                enabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
      )}

      {/* Active simulations */}
      {enabled && simulations.length > 0 && (
        <div className="space-y-2 mb-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Active Simulations ({simulations.length})
          </p>
          {simulations.map((sim) => (
            <div
              key={sim.dispatchId}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-background/50 border border-border/50"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {sim.vehicleNo}
                  </span>
                  <span
                    className={cn(
                      'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full',
                      sim.phase === 'TO_INCIDENT' && 'bg-blue-500/15 text-blue-400',
                      sim.phase === 'AT_INCIDENT' && 'bg-purple-500/15 text-purple-400',
                      sim.phase === 'TO_HOSPITAL' && 'bg-amber-500/15 text-amber-400',
                      sim.phase === 'COMPLETED' && 'bg-green-500/15 text-green-400'
                    )}
                  >
                    {sim.phase.replace('_', ' ')}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${sim.progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">
                    {sim.progress}%
                  </span>
                </div>

                {/* ETA */}
                {sim.etaSeconds > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    ETA: {sim.etaSeconds > 60 ? `${Math.ceil(sim.etaSeconds / 60)}m` : `${sim.etaSeconds}s`}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No active simulations message */}
      {enabled && simulations.length === 0 && (
        <div className="p-3 rounded-lg bg-background/50 text-center mb-3">
          <p className="text-xs text-muted-foreground">
            No active simulations. Start one from the Dispatches tab or use "Simulate All".
          </p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Not admin warning */}
      {!isAdmin && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 text-xs text-muted-foreground">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Only admins can toggle demo mode
        </div>
      )}
    </div>
  );
}
