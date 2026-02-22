import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Navigation, Truck, Flame, Clock, MapPin, CheckCircle, X } from 'lucide-react';
import { predictiveApi } from '@/services/api';
import type { StandbySuggestion } from '@/types';

interface StandbySuggestionPanelProps {
  suggestions: StandbySuggestion[];
  onUpdate?: () => void;
  className?: string;
}

export function StandbySuggestionPanel({ suggestions, onUpdate, className }: StandbySuggestionPanelProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);

  if (suggestions.length === 0) {
    return (
      <div className={cn('rounded-lg border bg-card p-4 text-center', className)}>
        <p className="text-xs text-muted-foreground">No standby suggestions active</p>
      </div>
    );
  }

  const handleAccept = async (id: string) => {
    setProcessingId(id);
    try {
      await predictiveApi.acceptSuggestion(id);
      onUpdate?.();
    } catch (err: any) {
      console.error('Accept failed:', err);
      alert(err?.response?.data?.message || 'Failed to accept suggestion');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDismiss = async (id: string) => {
    setProcessingId(id);
    try {
      await predictiveApi.dismissSuggestion(id);
      onUpdate?.();
    } catch (err: any) {
      console.error('Dismiss failed:', err);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Navigation className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">Standby Reposition Suggestions</h4>
        <span className="ml-auto text-[11px] text-muted-foreground font-mono">
          {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {suggestions.map((s) => {
        const isAmb = s.vehicleType === 'AMBULANCE';
        const VehicleIcon = isAmb ? Truck : Flame;
        const expired = new Date(s.expiresAt) < new Date();
        const minutesLeft = Math.max(0, Math.round((new Date(s.expiresAt).getTime() - Date.now()) / 60000));

        return (
          <div
            key={s.id}
            className={cn(
              'rounded-lg border p-4 transition-all',
              expired ? 'opacity-50 border-border bg-muted/30' : 'border-primary/20 bg-card hover:border-primary/40'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn('p-2 rounded-lg', isAmb ? 'bg-blue-500/10 text-blue-500' : 'bg-orange-500/10 text-orange-500')}>
                  <VehicleIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground font-mono">{s.vehicleNo}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">{s.vehicleType.replace('_', ' ')}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="default"
                  className="text-[11px] h-8"
                  disabled={expired || processingId === s.id}
                  onClick={() => handleAccept(s.id)}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  {processingId === s.id ? 'Moving...' : 'Move to Standby'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-muted-foreground"
                  disabled={processingId === s.id}
                  onClick={() => handleDismiss(s.id)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-3">
              <Stat icon={MapPin} label="Distance" value={`${s.distanceKm} km`} />
              <Stat icon={Clock} label="Response Improve" value={`${s.responseTimeImprove}s`} />
              <Stat icon={Clock} label="Expires" value={expired ? 'Expired' : `${minutesLeft}m`} warn={minutesLeft < 5} />
            </div>

            {s.riskZone && (
              <p className="text-[10px] text-muted-foreground mt-2">
                Target zone: {s.riskZone.centerLat.toFixed(4)}, {s.riskZone.centerLng.toFixed(4)} — score {s.riskZone.riskScore.toFixed(1)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ icon: Icon, label, value, warn }: { icon: typeof Clock; label: string; value: string; warn?: boolean }) {
  return (
    <div className="text-center">
      <Icon className={cn('w-3.5 h-3.5 mx-auto mb-0.5', warn ? 'text-amber-400' : 'text-muted-foreground')} />
      <p className={cn('text-xs font-bold font-mono', warn ? 'text-amber-400' : 'text-foreground')}>{value}</p>
      <p className="text-[9px] text-muted-foreground">{label}</p>
    </div>
  );
}
