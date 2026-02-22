import { cn } from '@/lib/utils';
import { Car, Wifi, WifiOff, Shield, AlertTriangle } from 'lucide-react';

interface CrashSourceBadgeProps {
  source: string;
  className?: string;
}

/**
 * Reusable badge that labels the detection source of an incident.
 * "Vehicle Crash Alert" for VEHICLE_SENSOR, generic labels for others.
 */
export function CrashSourceBadge({ source, className }: CrashSourceBadgeProps) {
  const config = sourceConfig[source] || sourceConfig.DEFAULT;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider',
        config.colors,
        className
      )}
    >
      <config.icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

const sourceConfig: Record<string, { label: string; icon: React.ElementType; colors: string }> = {
  VEHICLE_SENSOR: {
    label: 'Vehicle Crash Alert',
    icon: Car,
    colors: 'bg-orange-500/15 border-orange-500/30 text-orange-400',
  },
  AI_DETECTION: {
    label: 'AI Detection',
    icon: Shield,
    colors: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
  },
  CAMERA: {
    label: 'Camera',
    icon: Wifi,
    colors: 'bg-purple-500/15 border-purple-500/30 text-purple-400',
  },
  MANUAL: {
    label: 'Manual Report',
    icon: AlertTriangle,
    colors: 'bg-zinc-500/15 border-zinc-500/30 text-zinc-400',
  },
  DEFAULT: {
    label: 'Unknown',
    icon: WifiOff,
    colors: 'bg-muted border-border text-muted-foreground',
  },
};

export default CrashSourceBadge;
