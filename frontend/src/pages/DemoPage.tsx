import { useEffect } from 'react';
import { useDemoStore } from '@/stores/demoStore';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { DemoStatusController, PhaseTimeline } from '@/components/DemoStatusController';
import DispatchRouteLayer from '@/components/DispatchRouteLayer';
import { cn } from '@/lib/utils';
import { Play, Square, Zap, Radio, MapPin, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DemoPage() {
  const {
    enabled,
    toggleDemoMode,
    startSimulation,
    stopSimulation,
    startAllSimulations,
    stopAllSimulations,
    simulations,
    progressMap,
    loading,
    error,
    corridorOverlayVisible,
    corridorMessage,
    fetchStatus,
  } = useDemoStore();

  const { dispatches, accidents, ambulances, hospitals, greenCorridorActive, greenCorridorSignals } =
    useEmergencyStore();

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Build enriched dispatch list (accident dispatches only)
  const allDispatches = (dispatches?.accidentDispatches ?? []).map((d) => ({
    ...d,
    accident: accidents.find((a) => a.id === d.accidentId) ?? d.accident,
    ambulance: ambulances.find((a) => a.id === d.ambulanceId) ?? d.ambulance,
    hospital: hospitals.find((h) => h.id === d.hospitalId) ?? d.hospital,
  })).filter((d) => ['ACTIVE', 'EN_ROUTE', 'ARRIVED'].includes(d.status));

  const anySimulating = simulations.length > 0;
  const corridorOn = corridorOverlayVisible || greenCorridorActive;

  // First simulating dispatch drives the main map
  const featuredDispatch = allDispatches.find((d) => simulations.some((s) => s.dispatchId === d.id))
    ?? allDispatches[0];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            Demo Simulation
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Simulate vehicle movement along real dispatch routes with green corridor activation
          </p>
        </div>

        {/* Master controls */}
        <div className="flex items-center gap-3">
          {/* Demo mode toggle */}
          <button
            onClick={() => toggleDemoMode(!enabled)}
            disabled={loading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold transition-all',
              enabled
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                : 'bg-card border-border text-muted-foreground hover:border-amber-500/40 hover:text-amber-300'
            )}
          >
            <span className={cn('w-2 h-2 rounded-full', enabled ? 'bg-amber-400 animate-pulse' : 'bg-muted-foreground')} />
            Demo Mode {enabled ? 'ON' : 'OFF'}
          </button>

          {enabled && (
            <>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold gap-1.5"
                onClick={() => startAllSimulations()}
                disabled={loading || anySimulating}
              >
                <Play className="w-3.5 h-3.5" />
                Simulate All
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 hover:bg-red-500/10 gap-1.5"
                onClick={() => stopAllSimulations()}
                disabled={loading || !anySimulating}
              >
                <Square className="w-3.5 h-3.5" />
                Stop All
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          ⚠ {error}
        </div>
      )}

      {/* ── Green corridor banner ── */}
      {corridorOn && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
          <div className="flex-1">
            <span className="text-sm font-bold text-emerald-300">Green Corridor Active</span>
            <span className="text-xs text-emerald-400/70 ml-2">
              {corridorMessage || `${greenCorridorSignals.length} signals prioritized`}
            </span>
          </div>
          {greenCorridorSignals.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {(greenCorridorSignals as any[]).slice(0, 5).map((s: any) => (
                <span key={s.id} className="px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-mono text-emerald-300">
                  {s.junctionId}
                </span>
              ))}
              {greenCorridorSignals.length > 5 && (
                <span className="text-[10px] text-emerald-400/60 self-center">+{greenCorridorSignals.length - 5}</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Dispatch cards ── */}
        <div className="xl:col-span-1 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Active Dispatches ({allDispatches.length})
          </h3>

          {allDispatches.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No active dispatches to simulate
            </div>
          )}

          {allDispatches.map((d) => {
            const sim = simulations.find((s) => s.dispatchId === d.id);
            const prog = progressMap[d.id];
            const isRunning = !!sim;

            return (
              <div
                key={d.id}
                className={cn(
                  'rounded-lg border p-4 space-y-3 transition-colors',
                  isRunning ? 'border-blue-500/40 bg-blue-500/5' : 'border-border bg-card'
                )}
              >
                {/* Dispatch header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono text-foreground">
                        🚑 {d.ambulance?.vehicleNo ?? 'Ambulance'}
                      </span>
                      <span className={cn(
                        'text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase',
                        d.status === 'EN_ROUTE'
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                          : d.status === 'ARRIVED'
                            ? 'bg-purple-500/15 border-purple-500/30 text-purple-400'
                            : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                      )}>
                        {d.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      → {d.hospital?.name ?? 'Hospital'}
                    </p>
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground font-mono">
                      <MapPin className="w-2.5 h-2.5" />
                      {d.accident?.latitude?.toFixed(4) ?? '—'}, {d.accident?.longitude?.toFixed(4) ?? '—'}
                    </div>
                  </div>

                  {/* Start / Stop */}
                  {enabled && (
                    <div className="flex-shrink-0">
                      {!isRunning ? (
                        <Button
                          size="sm"
                          className="h-7 text-[11px] bg-amber-500 hover:bg-amber-400 text-black font-bold px-2"
                          onClick={() => startSimulation(d.id)}
                          disabled={loading}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Start
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px] text-red-400 hover:bg-red-500/10 px-2"
                          onClick={() => stopSimulation(d.id)}
                          disabled={loading}
                        >
                          <Square className="w-3 h-3 mr-1" />
                          Stop
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Live progress when running */}
                {isRunning && prog && (
                  <div className="space-y-2">
                    <PhaseTimeline currentPhase={prog.phase} />
                    <div className="w-full h-1.5 rounded-full bg-muted/40">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-700"
                        style={{ width: `${prog.progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{prog.progress}% complete</span>
                      {prog.etaSeconds > 0 && (
                        <span className="text-amber-400 font-mono flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                          ETA {prog.etaSeconds > 60 ? `${Math.ceil(prog.etaSeconds / 60)}m` : `${prog.etaSeconds}s`}
                        </span>
                      )}
                    </div>
                    <DemoStatusController
                      compact
                      dispatchId={d.id}
                      currentPhase={prog.phase}
                      vehicleNo={d.ambulance?.vehicleNo}
                      vehicleType="AMBULANCE"
                    />
                  </div>
                )}

                {!enabled && (
                  <p className="text-[10px] text-muted-foreground">Enable demo mode to simulate</p>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Live Map ── */}
        <div className="xl:col-span-2 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5" />
            Live Tracking Map
            {anySimulating && (
              <span className="ml-1 px-1.5 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 text-[9px] animate-pulse">
                SIMULATING
              </span>
            )}
          </h3>

          {featuredDispatch ? (
            <DispatchRouteLayer
              dispatchId={featuredDispatch.id}
              vehicleType="AMBULANCE"
              height="560px"
              showLabels
            />
          ) : (
            <div
              className="rounded-lg border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground"
              style={{ height: '560px' }}
            >
              No dispatch selected — create a dispatch to see the map
            </div>
          )}

          {/* Traffic signal legend */}
          <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-card border text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Map Legend:</span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-400 border-2 border-emerald-500" />
              Green (corridor)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-400 border-2 border-red-500" />
              Red (stop)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-400 border-2 border-amber-500" />
              Normal
            </span>
            <span className="flex items-center gap-1.5 ml-auto">
              <span className="text-blue-400">— —</span> Vehicle route
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-orange-400">— —</span> Hospital route
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
