import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { Severity } from '@/types';

const statusBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider font-mono',
  {
    variants: {
      variant: {
        critical: 'bg-status-critical/15 text-status-critical border border-status-critical/30',
        high: 'bg-status-warning/15 text-status-warning border border-status-warning/30',
        medium: 'bg-status-info/15 text-status-info border border-status-info/30',
        low: 'bg-status-success/15 text-status-success border border-status-success/30',
        pending: 'bg-status-warning/15 text-status-warning border border-status-warning/30',
        confirmed: 'bg-status-info/15 text-status-info border border-status-info/30',
        rejected: 'bg-status-critical/15 text-status-critical border border-status-critical/30',
        escalated: 'bg-status-pending/15 text-status-pending border border-status-pending/30',
        available: 'bg-status-success/15 text-status-success border border-status-success/30',
        dispatched: 'bg-status-info/15 text-status-info border border-status-info/30',
        en_route: 'bg-status-warning/15 text-status-warning border border-status-warning/30',
        on_scene: 'bg-status-critical/15 text-status-critical border border-status-critical/30',
        returning: 'bg-muted text-muted-foreground border border-border',
        resolved: 'bg-status-success/15 text-status-success border border-status-success/30',
        cancelled: 'bg-muted text-muted-foreground border border-border',
      },
    },
    defaultVariants: {
      variant: 'medium',
    },
  }
);

interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
  children: React.ReactNode;
  pulse?: boolean;
  className?: string;
}

export function StatusBadge({ variant, children, pulse, className }: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ variant }), className)}>
      {pulse && (
        <span className={cn(
          'w-1.5 h-1.5 rounded-full animate-pulse-glow',
          variant === 'critical' && 'bg-status-critical',
          variant === 'high' && 'bg-status-warning',
          variant === 'pending' && 'bg-status-warning',
          variant === 'confirmed' || variant === 'dispatched' ? 'bg-status-info' : '',
          variant === 'available' || variant === 'resolved' ? 'bg-status-success' : '',
        )} />
      )}
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <StatusBadge variant={severity} pulse={severity === 'critical'}>{severity}</StatusBadge>;
}
