import { useEffect, useState, useCallback } from 'react';
import { CircleMarker, Popup } from 'react-leaflet';
import { useDemoStore } from '@/stores/demoStore';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { signalApi } from '@/services/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DemoStatusController, PhaseTimeline } from '@/components/DemoStatusController';
import type { Dispatch } from '@/types';

// ── Traffic signal types ──────────────────────────────────────────────────────
interface TrafficSignalData {
  id: string;
  junctionId: string;
  latitude: number;
  longitude: number;
  state: 'GREEN' | 'RED' | 'NORMAL' | string;
}

// ── Traffic Signal Map Layer (use inside <MapContainer>) ──────────────────────
export function TrafficSignalLayer() {
  const [signals, setSignals] = useState<TrafficSignalData[]>([]);
  const { greenCorridorSignals, greenCorridorActive } = useEmergencyStore();
  const { corridorOverlayVisible } = useDemoStore();

  useEffect(() => {
    signalApi.list()
      .then(setSignals)
      .catch(() => {}); // non-critical
  }, []);

  // Refresh signals when corridor activates
  useEffect(() => {
    if (greenCorridorActive || corridorOverlayVisible) {
      signalApi.list().then(setSignals).catch(() => {});
    }
  }, [greenCorridorActive, corridorOverlayVisible]);

  if (signals.length === 0) return null;

  const corridorIds = new Set(greenCorridorSignals.map((s: any) => s.id));

  return (
    <>
      {signals.map((signal) => {
        const isGreen = signal.state === 'GREEN' || corridorIds.has(signal.id);
        const isRed = signal.state === 'RED';

        // Color logic
        const color = isGreen ? '#22c55e' : isRed ? '#ef4444' : '#f59e0b';
        const fillColor = isGreen ? '#4ade80' : isRed ? '#f87171' : '#fbbf24';

        return (
          <CircleMarker
            key={signal.id}
            center={[signal.latitude, signal.longitude]}
            radius={isGreen ? 7 : 5}
            pathOptions={{
              color,
              fillColor,
              fillOpacity: isGreen ? 0.8 : 0.5,
              weight: isGreen ? 2.5 : 1.5,
            }}
          >
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', lineHeight: '1.6' }}>
                <strong>🚦 {signal.junctionId}</strong><br />
                State:{' '}
                <span style={{ color, fontWeight: 700 }}>
                  {isGreen ? '🟢 GREEN' : isRed ? '🔴 RED' : '🟡 NORMAL'}
                </span>
                {corridorIds.has(signal.id) && (
                  <><br /><span style={{ color: '#22c55e', fontSize: '10px' }}>✓ Green corridor active</span></>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

// ── Ambulance Demo Side Panel (non-map UI) ────────────────────────────────────
interface AmbulanceDemoPanelProps {
  /** Currently selected dispatch */
  dispatch: Dispatch & {
    accident?: any;
    ambulance?: any;
    hospital?: any;
  } | null;
  className?: string;
}

/**
 * AmbulanceDemoPanel
 *
 * Collapsible sidebar section for the Ambulance Dashboard.
 * Shows demo mode toggle, simulation controls for the selected dispatch,
 * real-time phase timeline, ETA, and green corridor status.
 */
export function AmbulanceDemoPanel({ dispatch, className }: AmbulanceDemoPanelProps) {
  const {
    enabled,
    toggleDemoMode,
    startSimulation,
    stopSimulation,
    simulations,
    progressMap,
    loading,
    error,
    corridorOverlayVisible,
    corridorMessage,
  } = useDemoStore();

  const { greenCorridorActive, greenCorridorSignals } = useEmergencyStore();
  const [expanded, setExpanded] = useState(false);

  const activeSimulation = dispatch ? simulations.find((s) => s.dispatchId === dispatch.id) : null;
  const progress = dispatch ? progressMap[dispatch.id] : null;
  const isSimulating = !!activeSimulation;
  const corridorOn = corridorOverlayVisible || greenCorridorActive;

  const handleToggleDemoMode = useCallback(() => {
    toggleDemoMode(!enabled);
  }, [enabled, toggleDemoMode]);

  const handleStartSim = useCallback(async () => {
    if (!dispatch) return;
    await startSimulation(dispatch.id);
  }, [dispatch, startSimulation]);

  const handleStopSim = useCallback(async () => {
    if (!dispatch) return;
    await stopSimulation(dispatch.id);
  }, [dispatch, stopSimulation]);

  return (
    <div className={cn('rounded-lg border bg-card overflow-hidden', className)}>
      {/* Header toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🎮</span>
          <span className="text-xs font-bold text-foreground uppercase tracking-wide">Demo Simulation</span>
          {enabled && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse inline-block" />
              ON
            </span>
          )}
          {isSimulating && enabled && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse">
              RUNNING
            </span>
          )}
        </div>
        <span className="text-muted-foreground text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expandable body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50">
          {/* Demo Mode Toggle */}
          <div className="flex items-center justify-between pt-3">
            <div>
              <p className="text-xs font-semibold text-foreground">Demo Mode</p>
              <p className="text-[10px] text-muted-foreground">Simulate vehicle movement along real routes</p>
            </div>
            <button
              onClick={handleToggleDemoMode}
              disabled={loading}
              className={cn(
                'relative w-11 h-6 rounded-full border-2 transition-all duration-200 focus:outline-none',
                enabled
                  ? 'bg-amber-500 border-amber-400'
                  : 'bg-muted/50 border-muted-foreground/30'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200',
                  enabled ? 'left-5' : 'left-0.5'
                )}
              />
            </button>
          </div>

          {error && (
            <p className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
              ⚠ {error}
            </p>
          )}

          {!enabled && (
            <p className="text-[10px] text-muted-foreground text-center py-2">
              Enable demo mode to simulate dispatch routes
            </p>
          )}

          {enabled && (
            <>
              {/* Selected dispatch info */}
              {dispatch ? (
                <div className="p-2.5 rounded-lg bg-background/50 border border-border/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-foreground">
                      🚑 {dispatch.ambulance?.vehicleNo || 'Ambulance'}
                    </span>
                    <span className="text-[9px] font-mono text-muted-foreground">
                      {dispatch.id.slice(0, 8)}…
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    → {dispatch.hospital?.name || 'Hospital'} •{' '}
                    {dispatch.accident?.emergencyType || 'ACCIDENT'} — {dispatch.accident?.severity}
                  </p>

                  {/* Phase timeline when simulating */}
                  {isSimulating && progress && (
                    <div className="space-y-1.5">
                      <PhaseTimeline currentPhase={progress.phase} className="scale-90 origin-left" />
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground">Progress</span>
                        <span className="text-[9px] font-mono text-blue-400">{progress.progress}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted/30">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all duration-700"
                          style={{ width: `${progress.progress}%` }}
                        />
                      </div>
                      {progress.etaSeconds > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          <span className="text-[10px] text-amber-400 font-mono">
                            ETA {progress.etaSeconds > 60
                              ? `${Math.ceil(progress.etaSeconds / 60)}m`
                              : `${progress.etaSeconds}s`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Start / Stop button */}
                  {!isSimulating ? (
                    <Button
                      size="sm"
                      className="w-full h-7 text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold"
                      onClick={handleStartSim}
                      disabled={loading}
                    >
                      {loading ? '…' : '▶ Start Simulation'}
                    </Button>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      <DemoStatusController
                        compact
                        dispatchId={dispatch.id}
                        currentPhase={progress?.phase}
                        vehicleNo={dispatch.ambulance?.vehicleNo}
                        vehicleType="AMBULANCE"
                        className="col-span-2"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full h-7 text-[10px] text-red-400 hover:bg-red-500/10 col-span-2"
                        onClick={handleStopSim}
                      >
                        ⏹ Stop
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground text-center py-1">
                  Select a dispatch to simulate
                </p>
              )}

              {/* Green Corridor Status */}
              <div
                className={cn(
                  'flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors',
                  corridorOn
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-muted/20 border-border/30'
                )}
              >
                <span className={cn('text-lg', corridorOn ? '' : 'opacity-30')}>🟢</span>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-[10px] font-bold uppercase', corridorOn ? 'text-emerald-400' : 'text-muted-foreground')}>
                    Green Corridor
                  </p>
                  <p className="text-[9px] text-muted-foreground truncate">
                    {corridorOn
                      ? corridorMessage || `${greenCorridorSignals.length} signals prioritized`
                      : 'Activates when simulation starts'}
                  </p>
                </div>
                {corridorOn && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                )}
              </div>

              {/* Traffic signals summary */}
              {greenCorridorSignals.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[9px] text-muted-foreground uppercase font-semibold">
                    Prioritized Signals ({greenCorridorSignals.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(greenCorridorSignals as any[]).slice(0, 6).map((s: any) => (
                      <span
                        key={s.id}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-[9px] font-mono text-emerald-300"
                      >
                        <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse inline-block" />
                        {s.junctionId}
                      </span>
                    ))}
                    {greenCorridorSignals.length > 6 && (
                      <span className="text-[9px] text-muted-foreground self-center">
                        +{greenCorridorSignals.length - 6}
                      </span>
                    )}
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
