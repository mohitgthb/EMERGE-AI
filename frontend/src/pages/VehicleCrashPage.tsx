import { useEffect, useState, useCallback } from 'react';
import { vehicleCrashApi } from '@/services/api';
import type { VehicleCrash, VehicleCrashResponse } from '@/types';
import { CrashTriggerForm } from '@/components/CrashTriggerForm';
import { VehicleTelemetryCard } from '@/components/VehicleTelemetryCard';
import { CrashSourceBadge } from '@/components/CrashSourceBadge';
import { getSocket, SOCKET_EVENTS } from '@/services/socket';
import { cn } from '@/lib/utils';
import {
  Car,
  RefreshCw,
  Activity,
  AlertTriangle,
  Radio,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Full page at /vehicle-crash — composes CrashTriggerForm, VehicleTelemetryCard,
 * and a crash history list with real-time updates via socket events.
 */
export default function VehicleCrashPage() {
  const [crashes, setCrashes] = useState<VehicleCrash[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastTriggered, setLastTriggered] = useState<VehicleCrashResponse | null>(null);

  // ── Fetch history ─────────────────────────────────────────────
  const fetchCrashes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await vehicleCrashApi.list();
      setCrashes(data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load crash history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCrashes();
  }, [fetchCrashes]);

  // ── Real-time updates ─────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();

    const onNewCrash = (data: any) => {
      if (data?.crash) {
        setCrashes((prev) => {
          // Avoid duplicate
          if (prev.some((c) => c.id === data.crash.id)) return prev;
          return [data.crash, ...prev].slice(0, 50);
        });
      }
    };

    const onCancelledCrash = (data: any) => {
      if (data?.crashId) {
        setCrashes((prev) =>
          prev.map((c) =>
            c.id === data.crashId
              ? { ...c, status: 'CANCELLED', cancelledAt: new Date().toISOString() }
              : c
          )
        );
      }
    };

    socket.on(SOCKET_EVENTS.VEHICLE_CRASH_DETECTED, onNewCrash);
    socket.on(SOCKET_EVENTS.VEHICLE_CRASH_CANCELLED, onCancelledCrash);

    return () => {
      socket.off(SOCKET_EVENTS.VEHICLE_CRASH_DETECTED, onNewCrash);
      socket.off(SOCKET_EVENTS.VEHICLE_CRASH_CANCELLED, onCancelledCrash);
    };
  }, []);

  const handleCrashTriggered = (response: VehicleCrashResponse) => {
    setLastTriggered(response);
    // Also refresh to get latest from server
    setTimeout(fetchCrashes, 500);
  };

  // ── Stats ─────────────────────────────────────────────────────
  const stats = {
    total: crashes.length,
    dispatched: crashes.filter((c) => c.status === 'DISPATCHED').length,
    reported: crashes.filter((c) => c.status === 'REPORTED').length,
    cancelled: crashes.filter((c) => c.status === 'CANCELLED').length,
    duplicate: crashes.filter((c) => c.status === 'DUPLICATE').length,
  };

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Page Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
            <Car className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              Connected Vehicle Crash Alert
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Automatic accident reporting from vehicle airbag deployment
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchCrashes} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* ── Stats strip ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Alerts', value: stats.total, icon: Activity, color: 'text-foreground' },
          { label: 'Dispatched', value: stats.dispatched, icon: Radio, color: 'text-emerald-400' },
          { label: 'Reported', value: stats.reported, icon: AlertTriangle, color: 'text-amber-400' },
          { label: 'Cancelled', value: stats.cancelled, icon: Car, color: 'text-zinc-400' },
          { label: 'Duplicate', value: stats.duplicate, icon: BarChart3, color: 'text-purple-400' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border bg-card p-3 flex items-center gap-3"
          >
            <s.icon className={cn('w-4 h-4', s.color)} />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className={cn('text-lg font-bold', s.color)}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main content: form + history ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Trigger form */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border bg-card p-5 space-y-4 sticky top-20">
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-red-400" />
              <h2 className="text-sm font-bold text-foreground">Simulate Crash Event</h2>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Simulate a connected vehicle crash alert. When airbags deploy, the vehicle automatically
              sends an emergency report — bypassing manual SOS. Dispatch is immediate with AI confidence 1.0.
            </p>
            <div className="border-t pt-4">
              <CrashTriggerForm onCrashTriggered={handleCrashTriggered} />
            </div>
          </div>
        </div>

        {/* Right: History */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              Crash History
              {crashes.length > 0 && (
                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                  {crashes.length}
                </span>
              )}
            </h2>
            <CrashSourceBadge source="VEHICLE_SENSOR" />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {loading && crashes.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              Loading crash history...
            </div>
          ) : crashes.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Car className="w-12 h-12 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">No crash alerts yet</p>
              <p className="text-xs text-muted-foreground/60">
                Use the form to simulate a vehicle crash event
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {crashes.map((crash) => (
                <VehicleTelemetryCard key={crash.id} crash={crash} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
