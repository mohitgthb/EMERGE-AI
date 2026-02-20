import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { sosApi } from '@/services/api';
import type { SOSVerifyResponse } from '@/services/api';
import { getSocket, SOCKET_EVENTS } from '@/services/socket';
import { LoadingState, EmptyState, BackendUnavailable } from '@/components/ErrorBoundary';
import { StatusBadge, SeverityBadge } from '@/components/StatusBadge';
import { MapPin, Clock, CheckCircle, XCircle, AlertTriangle as EscalateIcon, Siren, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SOSCameraModal from '@/components/SOSCameraModal';
import PhotoPreviewCard from '@/components/PhotoPreviewCard';
import VerificationStatusOverlay from '@/components/VerificationStatusOverlay';
import type { VerificationPhase, VerificationResult } from '@/components/VerificationStatusOverlay';
import IncidentSuccessScreen from '@/components/IncidentSuccessScreen';
import EmergencyTypeSelector from '@/components/EmergencyTypeSelector';
import { compressToMaxSize } from '@/lib/imageCompression';
import type { SOSEmergencyType } from '@/types';

// SOS cooldown: 30 seconds between submissions
const SOS_COOLDOWN_MS = 30_000;

type SOSStep = 'idle' | 'type_select' | 'camera' | 'preview' | 'verifying' | 'result' | 'success';

export default function SOSPage() {
  const navigate = useNavigate();
  const { sosEvents, loading, connected, fetchSOSEvents, fetchDispatches } = useEmergencyStore();

  // Admin management state
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // SOS Camera flow state
  const [step, setStep] = useState<SOSStep>('idle');
  const [selectedEmergencyType, setSelectedEmergencyType] = useState<SOSEmergencyType>('ACCIDENT');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Verification state
  const [verifyPhase, setVerifyPhase] = useState<VerificationPhase>('uploading');
  const [verifyResult, setVerifyResult] = useState<VerificationResult>(null);
  const [confidence, setConfidence] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Success screen state
  const [successData, setSuccessData] = useState<SOSVerifyResponse | null>(null);
  const [vehicleEnRoute, setVehicleEnRoute] = useState(false);

  // Cooldown
  const [lastSOSTime, setLastSOSTime] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filtered events for admin view
  const filtered = statusFilter === 'all'
    ? sosEvents
    : sosEvents.filter((s) => s.status === statusFilter.toUpperCase());
  const selectedSOS = filtered.find((s) => s.id === selectedId) || null;

  // Cooldown timer
  useEffect(() => {
    if (lastSOSTime === 0) return;
    cooldownRef.current = setInterval(() => {
      const remaining = Math.max(0, SOS_COOLDOWN_MS - (Date.now() - lastSOSTime));
      setCooldownRemaining(remaining);
      if (remaining === 0 && cooldownRef.current) {
        clearInterval(cooldownRef.current);
      }
    }, 1000);
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [lastSOSTime]);

  // Listen for real-time vehicle updates
  useEffect(() => {
    const socket = getSocket();
    const handleVehicleEnRoute = (data: any) => {
      if (successData && data.sosEventId === successData.incident_id) {
        setVehicleEnRoute(true);
      }
    };
    socket.on(SOCKET_EVENTS.VEHICLE_EN_ROUTE, handleVehicleEnRoute);
    return () => {
      socket.off(SOCKET_EVENTS.VEHICLE_EN_ROUTE, handleVehicleEnRoute);
    };
  }, [successData]);

  // Cleanup preview URL
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ─── SOS Flow Handlers ─────────────────────────────────────────────
  const startSOS = useCallback(async () => {
    if (cooldownRemaining > 0) return;

    setLocationError(null);
    setLocating(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation not supported'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });
      setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      setStep('type_select');
    } catch (err: any) {
      setLocationError('Could not determine location. Please enable GPS.');
    } finally {
      setLocating(false);
    }
  }, [cooldownRemaining]);

  const handleTypeSelected = useCallback((type: SOSEmergencyType) => {
    setSelectedEmergencyType(type);
    setStep('camera');
  }, []);

  const handleCapture = useCallback((blob: Blob) => {
    setCapturedBlob(blob);
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    setStep('preview');
  }, []);

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedBlob(null);
    setPreviewUrl(null);
    setStep('camera');
  }, [previewUrl]);

  const handleConfirmSOS = useCallback(async () => {
    if (!capturedBlob || !userLocation) return;

    setStep('verifying');
    setVerifyPhase('uploading');
    setUploadProgress(0);
    setVerifyResult(null);

    try {
      // Compress image before upload
      const compressed = await compressToMaxSize(capturedBlob, 2 * 1024 * 1024);

      const formData = new FormData();
      formData.append('emergencyImage', compressed, 'sos-capture.jpg');
      formData.append('latitude', userLocation.lat.toString());
      formData.append('longitude', userLocation.lng.toString());
      formData.append('timestamp', new Date().toISOString());
      formData.append('emergencyType', selectedEmergencyType);

      // Upload with progress tracking
      setVerifyPhase('uploading');

      const result = await sosApi.verifyWithImage(formData, (progress) => {
        setUploadProgress(progress);
        if (progress >= 100) {
          setVerifyPhase('analyzing');
        }
      });

      // Validate response
      if (!result || !result.event_type || typeof result.confidence !== 'number' || !result.incident_id) {
        throw new Error('Invalid verification response from server');
      }

      setVerifyResult(result.event_type);
      setConfidence(result.confidence);
      setVerifyPhase('result');

      // Set cooldown
      setLastSOSTime(Date.now());
      setCooldownRemaining(SOS_COOLDOWN_MS);

      // If emergency detected, transition to success screen after delay
      if (result.event_type !== 'NONE') {
        setSuccessData(result);
        setTimeout(() => {
          setStep('success');
        }, 2500);
      }

      // Refresh store data
      fetchSOSEvents();
      fetchDispatches();
    } catch (err: any) {
      console.error('SOS verification failed:', err);
      setVerifyPhase('result');
      setVerifyResult('NONE');
      setConfidence(0);
    }
  }, [capturedBlob, userLocation, fetchSOSEvents, fetchDispatches]);

  const resetSOS = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCapturedBlob(null);
    setPreviewUrl(null);
    setStep('idle');
    setVerifyPhase('uploading');
    setVerifyResult(null);
    setSuccessData(null);
    setVehicleEnRoute(false);
    setUploadProgress(0);
    setSelectedEmergencyType('ACCIDENT');
  }, [previewUrl]);

  // ─── Admin Actions ─────────────────────────────────────────────────
  const handleVerify = async (isConfirmed: boolean) => {
    if (!selectedSOS) return;
    setActionLoading(true);
    try {
      await sosApi.verify(selectedSOS.id, { isConfirmed });
      await fetchSOSEvents();
    } catch (err) {
      console.error('Failed to verify SOS:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEscalate = async () => {
    if (!selectedSOS) return;
    setActionLoading(true);
    try {
      await sosApi.escalate(selectedSOS.id);
      await fetchSOSEvents();
    } catch (err) {
      console.error('Failed to escalate SOS:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Render Overlays ───────────────────────────────────────────────
  if (step === 'type_select') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <EmergencyTypeSelector
          onSelect={handleTypeSelected}
          onCancel={() => setStep('idle')}
        />
      </div>
    );
  }

  if (step === 'camera') {
    return (
      <SOSCameraModal
        open={true}
        onCapture={handleCapture}
        onClose={() => setStep('idle')}
      />
    );
  }

  if (step === 'preview' && previewUrl) {
    return (
      <PhotoPreviewCard
        imageUrl={previewUrl}
        onRetake={handleRetake}
        onConfirm={handleConfirmSOS}
      />
    );
  }

  if (step === 'verifying') {
    return (
      <VerificationStatusOverlay
        phase={verifyPhase}
        result={verifyResult}
        confidence={confidence}
        progress={verifyPhase === 'uploading' ? uploadProgress : undefined}
        onDismiss={verifyResult === 'NONE' ? resetSOS : undefined}
      />
    );
  }

  if (step === 'success' && successData) {
    return (
      <IncidentSuccessScreen
        incidentId={successData.incident_id}
        eventType={successData.event_type as 'ACCIDENT' | 'FIRE' | 'CRIME'}
        confidence={successData.confidence}
        dispatchCreated={successData.dispatch_created}
        latitude={successData.sosEvent.latitude}
        longitude={successData.sosEvent.longitude}
        vehicleEnRoute={vehicleEnRoute}
        onViewMap={() => {
          resetSOS();
          navigate('/map');
        }}
        onNewSOS={resetSOS}
        onClose={resetSOS}
      />
    );
  }

  // ─── Main SOS Page (idle) ──────────────────────────────────────────
  if (loading && sosEvents.length === 0) return <LoadingState label="Loading SOS events..." />;
  if (!connected && sosEvents.length === 0 && !loading) return <BackendUnavailable />;

  return (
    <div className="space-y-6">
      {/* SOS Trigger Section */}
      <div className="rounded-xl border-2 border-status-critical/20 bg-status-critical/5 p-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Siren className="w-5 h-5 text-status-critical" />
              Emergency SOS
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Capture a photo of the emergency scene for AI verification and instant dispatch
            </p>
            {locationError && (
              <p className="text-xs text-status-critical mt-2">{locationError}</p>
            )}
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              onClick={startSOS}
              disabled={locating || cooldownRemaining > 0}
              className={`relative w-28 h-28 rounded-full border-4 border-status-critical
                bg-status-critical hover:bg-status-critical/90 active:scale-95
                text-white font-bold transition-all glow-critical
                disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100`}
            >
              {locating ? (
                <span className="flex flex-col items-center gap-1">
                  <MapPin className="w-5 h-5 animate-bounce" />
                  <span className="text-[10px]">Locating…</span>
                </span>
              ) : cooldownRemaining > 0 ? (
                <span className="flex flex-col items-center gap-0.5">
                  <Clock className="w-5 h-5" />
                  <span className="text-xs">{Math.ceil(cooldownRemaining / 1000)}s</span>
                </span>
              ) : (
                <span className="flex flex-col items-center gap-1">
                  <Camera className="w-7 h-7" />
                  <span className="text-sm">SOS</span>
                </span>
              )}
            </button>
            {cooldownRemaining > 0 && (
              <p className="text-[10px] text-muted-foreground">Cooldown active</p>
            )}
          </div>
        </div>
      </div>

      {/* Admin Management Section */}
      <div>
        <h2 className="text-lg font-bold text-foreground">SOS Event Management</h2>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {sosEvents.length} TOTAL EVENTS · {sosEvents.filter((s) => s.status === 'PENDING').length} PENDING
        </p>
      </div>

      <div className="flex gap-2">
        {(['all', 'PENDING', 'CONFIRMED', 'ESCALATED', 'REJECTED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-accent'
            }`}
          >
            {s === 'all' ? 'ALL' : s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-2">
          {filtered.length === 0 ? (
            <EmptyState title="No SOS events" description={`No ${statusFilter === 'all' ? '' : statusFilter.toLowerCase()} SOS events found.`} />
          ) : (
            filtered.map((sos) => (
              <button
                key={sos.id}
                onClick={() => setSelectedId(sos.id)}
                className={`w-full text-left rounded-lg border p-4 transition-all hover:border-primary/30 ${
                  selectedSOS?.id === sos.id ? 'border-primary bg-primary/5' : 'bg-card'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-foreground">{sos.emergencyType}</span>
                      <SeverityBadge severity={(sos.severity?.toLowerCase() || 'medium') as any} />
                      <StatusBadge variant={sos.status.toLowerCase() as any} pulse={sos.status === 'PENDING'}>
                        {sos.status}
                      </StatusBadge>
                    </div>
                    <p className="text-sm text-foreground/80 truncate">
                      SOS #{sos.sosCount} · {sos.isVerified ? 'Verified' : 'Unverified'}
                      {sos.verificationMethod && ` (${sos.verificationMethod})`}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{sos.latitude.toFixed(4)}, {sos.longitude.toFixed(4)}
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />{new Date(sos.createdAt).toLocaleTimeString('en-US', { hour12: false })}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">{sos.id.slice(0, 8).toUpperCase()}</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="rounded-lg border bg-card p-5">
          {selectedSOS ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-foreground">{selectedSOS.id.slice(0, 12).toUpperCase()}</h3>
                <p className="text-xs text-muted-foreground mt-1">{selectedSOS.emergencyType} emergency</p>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Status / Severity</p>
                  <div className="flex gap-2">
                    <StatusBadge variant={selectedSOS.status.toLowerCase() as any}>{selectedSOS.status}</StatusBadge>
                    <SeverityBadge severity={(selectedSOS.severity?.toLowerCase() || 'medium') as any} />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Verification</p>
                  <p className="text-sm text-foreground">
                    {selectedSOS.isVerified ? 'Verified' : 'Not verified'}
                    {selectedSOS.verificationMethod && ` (${selectedSOS.verificationMethod})`}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Location</p>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {selectedSOS.latitude.toFixed(6)}, {selectedSOS.longitude.toFixed(6)}
                  </p>
                </div>
                {selectedSOS.imageUrl && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Evidence Image</p>
                    <img
                      src={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${selectedSOS.imageUrl}`}
                      alt="SOS Evidence"
                      className="w-full rounded-lg border object-cover max-h-48"
                    />
                  </div>
                )}
                {selectedSOS.deviceIP && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Device Info</p>
                    <p className="text-[11px] font-mono text-muted-foreground">
                      IP: {selectedSOS.deviceIP}
                      {selectedSOS.deviceMAC && ` · MAC: ${selectedSOS.deviceMAC}`}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Timeline</p>
                  <div className="text-xs font-mono text-muted-foreground space-y-1">
                    <p>Created: {new Date(selectedSOS.createdAt).toLocaleString()}</p>
                    <p>SOS Count: {selectedSOS.sosCount}</p>
                  </div>
                </div>
              </div>

              {selectedSOS.status === 'PENDING' && (
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button
                    size="sm" disabled={actionLoading}
                    className="flex-1 bg-status-success hover:bg-status-success/90 text-status-success-foreground"
                    onClick={() => handleVerify(true)}
                  >
                    <CheckCircle className="w-3 h-3 mr-1" /> Confirm
                  </Button>
                  <Button
                    size="sm" disabled={actionLoading}
                    className="flex-1 bg-status-critical hover:bg-status-critical/90 text-status-critical-foreground"
                    onClick={() => handleVerify(false)}
                  >
                    <XCircle className="w-3 h-3 mr-1" /> Reject
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" disabled={actionLoading} onClick={handleEscalate}>
                    <EscalateIcon className="w-3 h-3 mr-1" /> Escalate
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <MapPin className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">Select an SOS event</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
