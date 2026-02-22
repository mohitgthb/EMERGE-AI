import { useState, useEffect, useCallback } from 'react';
import { vehicleCrashApi } from '@/services/api';
import type { VehicleCrashResponse } from '@/types';
import { cn } from '@/lib/utils';
import {
  Car,
  MapPin,
  AlertTriangle,
  Shield,
  Send,
  X,
  CheckCircle2,
  Loader2,
  Navigation,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CrashTriggerFormProps {
  onCrashTriggered?: (response: VehicleCrashResponse) => void;
}

const SEVERITY_OPTIONS = [
  { value: 'LOW', label: 'Low', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  { value: 'MEDIUM', label: 'Medium', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  { value: 'HIGH', label: 'High', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  { value: 'CRITICAL', label: 'Critical', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
];

/**
 * Form to simulate a connected vehicle crash event.
 * Captures vehicle ID, live GPS, crash severity, airbag toggle,
 * and sends POST /api/vehicle/crash.
 */
export function CrashTriggerForm({ onCrashTriggered }: CrashTriggerFormProps) {
  const [vehicleId, setVehicleId] = useState('MH-12-CAR-009');
  const [severity, setSeverity] = useState('HIGH');
  const [airbagDeployed, setAirbagDeployed] = useState(true);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cancel window state
  const [lastResponse, setLastResponse] = useState<VehicleCrashResponse | null>(null);
  const [cancelCountdown, setCancelCountdown] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  // ── GPS capture ───────────────────────────────────────────────
  const captureLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation not supported');
      // Fallback to Pune
      setLatitude(18.5204);
      setLongitude(73.8567);
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.message);
        // Fallback
        setLatitude(18.5204 + (Math.random() - 0.5) * 0.04);
        setLongitude(73.8567 + (Math.random() - 0.5) * 0.04);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  useEffect(() => {
    captureLocation();
  }, [captureLocation]);

  // ── Cancel countdown ──────────────────────────────────────────
  useEffect(() => {
    if (cancelCountdown <= 0) return;
    const timer = setInterval(() => {
      setCancelCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cancelCountdown]);

  // ── Submit crash ──────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!vehicleId.trim()) {
      setError('Vehicle ID is required');
      return;
    }
    if (!airbagDeployed) {
      setError('Airbag must be deployed to trigger crash alert');
      return;
    }

    setSubmitting(true);
    setError(null);
    setCancelled(false);
    setLastResponse(null);

    try {
      const result = await vehicleCrashApi.trigger({
        vehicleId: vehicleId.trim(),
        latitude: latitude ?? 18.5204,
        longitude: longitude ?? 73.8567,
        severity,
        airbagDeployed,
        timestamp: new Date().toISOString(),
      });

      setLastResponse(result);
      setCancelCountdown(Math.floor((result.cancelWindowMs || 10000) / 1000));
      onCrashTriggered?.(result);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to trigger crash';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Cancel ────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!lastResponse?.crash?.id) return;
    setCancelling(true);
    try {
      await vehicleCrashApi.cancel(lastResponse.crash.id);
      setCancelled(true);
      setCancelCountdown(0);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  };

  const resetForm = () => {
    setLastResponse(null);
    setCancelCountdown(0);
    setCancelled(false);
    setError(null);
    captureLocation();
  };

  // ── Render success state ──────────────────────────────────────
  if (lastResponse && !cancelled) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Emergency auto-reported banner */}
        <div className="rounded-xl border-2 border-red-500/50 bg-red-500/10 p-6 text-center space-y-3">
          <div className="flex justify-center">
            <span className="relative flex h-12 w-12">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-12 w-12 bg-red-500 items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-white" />
              </span>
            </span>
          </div>
          <h3 className="text-lg font-bold text-red-400">Emergency Auto-Reported</h3>
          <p className="text-sm text-muted-foreground">
            Crash alert from <span className="font-mono font-bold text-foreground">{lastResponse.crash.vehicleRegNo}</span> has been processed
          </p>
        </div>

        {/* Result details */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border bg-card p-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Crash ID</span>
            <p className="font-mono font-bold text-foreground text-xs mt-0.5">{lastResponse.crash.id.slice(0, 12)}...</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</span>
            <p className="font-bold text-emerald-400 mt-0.5">{lastResponse.crash.status}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Accident ID</span>
            <p className="font-mono font-bold text-foreground text-xs mt-0.5">{lastResponse.accident.id.slice(0, 12)}...</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Dispatch</span>
            <p className={cn('font-bold mt-0.5', lastResponse.dispatch ? 'text-emerald-400' : 'text-amber-400')}>
              {lastResponse.dispatch ? `#${lastResponse.dispatch.id.slice(0, 8)}` : 'Pending'}
            </p>
          </div>
        </div>

        {/* Assigned vehicle ETA */}
        {lastResponse.dispatch && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Navigation className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-blue-300">Ambulance Dispatched</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                ETA: {lastResponse.dispatch.routeDurationSec
                  ? `${Math.ceil(lastResponse.dispatch.routeDurationSec / 60)} min`
                  : 'Calculating...'}
                {lastResponse.dispatch.routeDistanceKm && (
                  <span className="ml-2">• {lastResponse.dispatch.routeDistanceKm.toFixed(1)} km</span>
                )}
              </p>
            </div>
          </div>
        )}

        {!lastResponse.gpsAvailable && (
          <div className="text-[10px] text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            GPS unavailable — using fallback location
          </div>
        )}

        {/* Cancel window */}
        {cancelCountdown > 0 && (
          <div className="flex items-center gap-3">
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Cancel Alert ({cancelCountdown}s)
            </Button>
          </div>
        )}

        {cancelCountdown === 0 && (
          <Button variant="outline" className="w-full" onClick={resetForm}>
            New Crash Alert
          </Button>
        )}
      </div>
    );
  }

  if (cancelled) {
    return (
      <div className="space-y-4 text-center animate-in fade-in">
        <CheckCircle2 className="w-12 h-12 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">Alert cancelled successfully</p>
        <Button variant="outline" onClick={resetForm}>New Crash Alert</Button>
      </div>
    );
  }

  // ── Render form ───────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Vehicle ID */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Car className="w-3.5 h-3.5" />
          Vehicle Registration
        </label>
        <input
          type="text"
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          placeholder="MH-12-CAR-009"
          className="w-full px-4 py-3 rounded-lg border bg-card text-foreground font-mono text-lg placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        />
      </div>

      {/* GPS Location */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          Live Location
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-4 py-3 rounded-lg border bg-card text-sm font-mono text-muted-foreground">
            {gpsLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Acquiring GPS...
              </span>
            ) : latitude && longitude ? (
              <span>
                {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </span>
            ) : (
              'No location'
            )}
          </div>
          <Button variant="outline" size="sm" onClick={captureLocation} disabled={gpsLoading}>
            <Navigation className="w-3.5 h-3.5" />
          </Button>
        </div>
        {gpsError && (
          <p className="text-[10px] text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {gpsError} — using fallback
          </p>
        )}
      </div>

      {/* Severity */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          Crash Severity
        </label>
        <div className="grid grid-cols-4 gap-2">
          {SEVERITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSeverity(opt.value)}
              className={cn(
                'px-3 py-2.5 rounded-lg border text-xs font-bold transition-all',
                severity === opt.value
                  ? cn(opt.color, 'ring-2 ring-offset-1 ring-offset-background')
                  : 'border-border text-muted-foreground hover:border-muted-foreground/50'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Airbag Toggle */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" />
          Airbag Status
        </label>
        <button
          onClick={() => setAirbagDeployed(!airbagDeployed)}
          className={cn(
            'w-full px-4 py-3 rounded-lg border text-sm font-bold transition-all flex items-center justify-between',
            airbagDeployed
              ? 'border-red-500/40 bg-red-500/10 text-red-400'
              : 'border-border bg-card text-muted-foreground'
          )}
        >
          <span>Airbag {airbagDeployed ? 'DEPLOYED' : 'Not Deployed'}</span>
          <span
            className={cn(
              'w-10 h-5 rounded-full relative transition-colors',
              airbagDeployed ? 'bg-red-500' : 'bg-muted'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
                airbagDeployed ? 'left-5' : 'left-0.5'
              )}
            />
          </span>
        </button>
        {!airbagDeployed && (
          <p className="text-[10px] text-amber-400">Airbag must be deployed to trigger crash alert</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Submit */}
      <Button
        className="w-full h-14 text-base font-bold gap-2 bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20"
        onClick={handleSubmit}
        disabled={submitting || !airbagDeployed || !vehicleId.trim()}
      >
        {submitting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Send className="w-5 h-5" />
        )}
        Trigger Crash Event
      </Button>
    </div>
  );
}

export default CrashTriggerForm;
