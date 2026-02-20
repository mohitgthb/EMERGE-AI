import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  variant?: 'default' | 'critical' | 'success' | 'warning';
}

export function KPICard({ title, value, subtitle, icon: Icon, variant = 'default' }: KPICardProps) {
  return (
    <div className={cn(
      'relative overflow-hidden rounded-lg border bg-card p-5 transition-all hover:border-primary/30',
      variant === 'critical' && 'border-status-critical/30 glow-critical',
      variant === 'success' && 'border-status-success/30',
      variant === 'warning' && 'border-status-warning/30',
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold font-mono text-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={cn(
          'p-2.5 rounded-lg',
          variant === 'default' && 'bg-primary/10 text-primary',
          variant === 'critical' && 'bg-status-critical/10 text-status-critical',
          variant === 'success' && 'bg-status-success/10 text-status-success',
          variant === 'warning' && 'bg-status-warning/10 text-status-warning',
        )}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {/* Grid overlay */}
      <div className="absolute inset-0 grid-ops opacity-30 pointer-events-none" />
    </div>
  );
}
