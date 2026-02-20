import { useState, useCallback } from 'react';
import { useDemoStore } from '@/stores/demoStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Phase timeline visualization ────────────────────────────────────────────

const PHASES = [
  { key: 'ACCEPTED', label: 'Accepted', icon: '✅' },
  { key: 'EN_ROUTE', label: 'En Route', icon: '🚗' },
  { key: 'AT_INCIDENT', label: 'At Scene', icon: '📍' },
  { key: 'TO_HOSPITAL', label: 'To Hospital', icon: '🏥' },
  { key: 'COMPLETED', label: 'Completed', icon: '✔️' },
] as const;

function getPhaseIndex(phase: string): number {
  const idx = PHASES.findIndex((p) => p.key === phase);
  return idx >= 0 ? idx : 0;
}

interface PhaseTimelineProps {
  currentPhase: string;
  className?: string;
}

function PhaseTimeline({ currentPhase, className }: PhaseTimelineProps) {
  const activeIdx = getPhaseIndex(currentPhase);

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {PHASES.map((p, i) => {
        const isPast = i < activeIdx;
        const isCurrent = i === activeIdx;
        const isFuture = i > activeIdx;

        return (
          <div key={p.key} className="flex items-center">
            <div
              className={cn(
                'flex flex-col items-center gap-0.5',
                isCurrent && 'scale-110 transition-transform'
              )}
            >
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs border-2 transition-colors',
                  isPast && 'bg-emerald-500/20 border-emerald-500 text-emerald-400',
                  isCurrent && 'bg-blue-500/20 border-blue-500 text-blue-400 ring-2 ring-blue-500/30',
                  isFuture && 'bg-muted/30 border-muted-foreground/20 text-muted-foreground/50'
                )}
              >
                {p.icon}
              </div>
              <span
                className={cn(
                  'text-[8px] font-medium leading-none whitespace-nowrap',
                  isPast && 'text-emerald-400',
                  isCurrent && 'text-blue-400 font-bold',
                  isFuture && 'text-muted-foreground/40'
                )}
              >
                {p.label}
              </span>
            </div>
            {/* Connector line */}
            {i < PHASES.length - 1 && (
              <div
                className={cn(
                  'w-3 h-0.5 mx-0.5',
                  i < activeIdx ? 'bg-emerald-500' : 'bg-muted-foreground/20'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Status override controller ──────────────────────────────────────────────

const STATUS_OPTIONS = [
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'TRANSPORTING',
  'AT_HOSPITAL',
  'COMPLETED',
] as const;

interface DemoStatusControllerProps {
  dispatchId: string;
  currentPhase?: string;
  vehicleNo?: string;
  vehicleType?: string;
  className?: string;
  /** Compact mode for inline use */
  compact?: boolean;
}

/**
 * DemoStatusController
 *
 * Provides manual control over the simulation lifecycle for a specific dispatch.
 * Shows a phase timeline and allows jumping to any phase/status.
 */
export function DemoStatusController({
  dispatchId,
  currentPhase,
  vehicleNo,
  vehicleType,
  className,
  compact = false,
}: DemoStatusControllerProps) {
  const {
    enabled,
    overrideStatus,
    stopSimulation,
    progressMap,
    loading,
  } = useDemoStore();

  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [overriding, setOverriding] = useState(false);

  const progress = progressMap[dispatchId];
  const phase = currentPhase || progress?.phase || 'ACCEPTED';

  const handleOverride = useCallback(async () => {
    if (!selectedStatus || overriding) return;
    setOverriding(true);
    try {
      await overrideStatus(dispatchId, selectedStatus);
    } finally {
      setOverriding(false);
    }
  }, [dispatchId, selectedStatus, overriding, overrideStatus]);

  const handleStop = useCallback(async () => {
    await stopSimulation(dispatchId);
  }, [dispatchId, stopSimulation]);

  if (!enabled) return null;

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <PhaseTimeline currentPhase={phase} />
        <div className="flex items-center gap-1.5 ml-2">
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue placeholder="Jump to..." />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {s.replace('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2"
            disabled={!selectedStatus || overriding}
            onClick={handleOverride}
          >
            {overriding ? '...' : 'Go'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2 text-red-400 hover:text-red-300"
            onClick={handleStop}
          >
            ⏹
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-amber-500/20 bg-amber-950/10 p-4 space-y-4',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">🎮</span>
          <span className="text-xs font-bold text-amber-400 uppercase">
            Simulation Control
          </span>
        </div>
        {vehicleNo && (
          <span className="text-xs text-muted-foreground font-mono">
            {vehicleType === 'FIRE_BRIGADE' ? '🚒' : vehicleType === 'POLICE' ? '🚔' : '🚑'}{' '}
            {vehicleNo}
          </span>
        )}
      </div>

      {/* Phase timeline */}
      <PhaseTimeline currentPhase={phase} />

      {/* Progress info */}
      {progress && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded bg-background/30">
            <p className="text-[10px] text-muted-foreground">Progress</p>
            <p className="text-sm font-bold font-mono">{progress.progress}%</p>
          </div>
          <div className="p-2 rounded bg-background/30">
            <p className="text-[10px] text-muted-foreground">ETA</p>
            <p className="text-sm font-bold font-mono">
              {progress.etaSeconds > 60
                ? `${Math.ceil(progress.etaSeconds / 60)}m`
                : `${progress.etaSeconds}s`}
            </p>
          </div>
          <div className="p-2 rounded bg-background/30">
            <p className="text-[10px] text-muted-foreground">Phase</p>
            <p className="text-[10px] font-bold text-blue-400">
              {phase.replace('_', ' ')}
            </p>
          </div>
        </div>
      )}

      {/* Override controls */}
      <div className="flex items-center gap-2">
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue placeholder="Jump to status..." />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {s.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs border-amber-500/30 hover:bg-amber-500/10"
          disabled={!selectedStatus || overriding || loading}
          onClick={handleOverride}
        >
          {overriding ? 'Applying...' : 'Override'}
        </Button>
      </div>

      {/* Stop button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full h-8 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
        onClick={handleStop}
      >
        ⏹ Stop Simulation
      </Button>
    </div>
  );
}

// ── Exports ─────────────────────────────────────────────────────────────────
export { PhaseTimeline };
