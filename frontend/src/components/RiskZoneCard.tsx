import { cn } from '@/lib/utils';
import { AlertTriangle, MapPin, Clock, TrendingUp } from 'lucide-react';
import type { RiskZone } from '@/types';

interface RiskZoneCardProps {
  zone: RiskZone;
  rank: number;
  className?: string;
}

const rankColors: Record<number, string> = {
  1: 'border-red-500/40 bg-red-500/5',
  2: 'border-orange-500/40 bg-orange-500/5',
  3: 'border-yellow-500/40 bg-yellow-500/5',
};

const rankBadge: Record<number, string> = {
  1: 'bg-red-500 text-white',
  2: 'bg-orange-500 text-white',
  3: 'bg-yellow-500 text-black',
};

export function RiskZoneCard({ zone, rank, className }: RiskZoneCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all hover:shadow-md',
        rankColors[rank] || 'border-border bg-card',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold', rankBadge[rank] || 'bg-muted text-muted-foreground')}>
            {rank}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Risk Zone</p>
            <p className="text-[11px] text-muted-foreground font-mono">
              {zone.centerLat.toFixed(4)}, {zone.centerLng.toFixed(4)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold font-mono text-foreground">{zone.riskScore.toFixed(1)}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Risk Score</p>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <ScorePill label="Incidents" value={zone.incidentScore} icon={AlertTriangle} max={40} />
        <ScorePill label="Density" value={zone.densityScore} icon={TrendingUp} max={30} />
        <ScorePill label="Time" value={zone.timeScore} icon={Clock} max={30} />
      </div>

      {/* Reasons */}
      <div className="flex flex-wrap gap-1.5">
        {zone.reasons.map((reason, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-[11px] font-medium text-muted-foreground"
          >
            <MapPin className="w-3 h-3" />
            {reason}
          </span>
        ))}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
        <span>{zone.incidentCount} incidents</span>
        <span>Avg density: {zone.avgDensity}</span>
        {zone.peakHour != null && <span>Peak: {zone.peakHour}:00</span>}
      </div>
    </div>
  );
}

function ScorePill({ label, value, icon: Icon, max }: { label: string; value: number; icon: typeof AlertTriangle; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="rounded-md bg-secondary/50 p-2 text-center">
      <Icon className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
      <p className="text-xs font-bold font-mono text-foreground">{value.toFixed(1)}</p>
      <div className="w-full h-1 rounded-full bg-muted mt-1 overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[9px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
