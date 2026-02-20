import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useRoleStore } from '@/stores/roleStore';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { sosApi } from '@/services/api';
import type { SOSVerifyResponse } from '@/services/api';
import { AlertTriangle, Shield, Clock, Phone, MapPin, Radio, Siren, CheckCircle, ChevronRight, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import SOSCameraModal from '@/components/SOSCameraModal';
import PhotoPreviewCard from '@/components/PhotoPreviewCard';
import VerificationStatusOverlay from '@/components/VerificationStatusOverlay';
import type { VerificationPhase, VerificationResult } from '@/components/VerificationStatusOverlay';
import IncidentSuccessScreen from '@/components/IncidentSuccessScreen';
import EmergencyTypeSelector from '@/components/EmergencyTypeSelector';
import { compressToMaxSize } from '@/lib/imageCompression';
import type { SOSEmergencyType } from '@/types';

const SOS_COOLDOWN_MS = 30_000;

type SOSStep = 'idle' | 'type_select' | 'camera' | 'preview' | 'verifying' | 'result' | 'success';

export default function LandingPage() {
  const navigate = useNavigate();
  const setRole = useRoleStore((s) => s.setRole);
  const liveEvents = useEmergencyStore((s) => s.liveEvents);
  const { fetchSOSEvents, fetchDispatches } = useEmergencyStore();

  // SOS camera flow
  const [step, setStep] = useState<SOSStep>('idle');
  const [selectedEmergencyType, setSelectedEmergencyType] = useState<SOSEmergencyType>('ACCIDENT');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Verification
  const [verifyPhase, setVerifyPhase] = useState<VerificationPhase>('uploading');
  const [verifyResult, setVerifyResult] = useState<VerificationResult>(null);
  const [confidence, setConfidence] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [successData, setSuccessData] = useState<SOSVerifyResponse | null>(null);

  // Cooldown
  const [lastSOSTime, setLastSOSTime] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (lastSOSTime === 0) return;
    cooldownRef.current = setInterval(() => {
      const remaining = Math.max(0, SOS_COOLDOWN_MS - (Date.now() - lastSOSTime));
      setCooldownRemaining(remaining);
      if (remaining === 0 && cooldownRef.current) clearInterval(cooldownRef.current);
    }, 1000);
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [lastSOSTime]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const startSOS = useCallback(async () => {
    if (cooldownRemaining > 0) return;
    setLocationError(null);
    setLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
      });
      setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      setStep('type_select');
    } catch {
      setLocationError('Could not determine location. Enable GPS and try again.');
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
    setPreviewUrl(URL.createObjectURL(blob));
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
      const compressed = await compressToMaxSize(capturedBlob, 2 * 1024 * 1024);
      const formData = new FormData();
      formData.append('emergencyImage', compressed, 'sos-capture.jpg');
      formData.append('latitude', userLocation.lat.toString());
      formData.append('longitude', userLocation.lng.toString());
      formData.append('timestamp', new Date().toISOString());
      formData.append('emergencyType', selectedEmergencyType);

      const result = await sosApi.verifyWithImage(formData, (progress) => {
        setUploadProgress(progress);
        if (progress >= 100) setVerifyPhase('analyzing');
      });

      if (!result || !result.event_type || typeof result.confidence !== 'number' || !result.incident_id) {
        throw new Error('Invalid verification response');
      }

      setVerifyResult(result.event_type);
      setConfidence(result.confidence);
      setVerifyPhase('result');
      setLastSOSTime(Date.now());
      setCooldownRemaining(SOS_COOLDOWN_MS);

      if (result.event_type !== 'NONE') {
        setSuccessData(result);
        setTimeout(() => setStep('success'), 2500);
      }

      fetchSOSEvents();
      fetchDispatches();
    } catch (err) {
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
    setUploadProgress(0);
    setSelectedEmergencyType('ACCIDENT');
  }, [previewUrl]);

  const enterDashboard = (role: 'ambulance' | 'hospital' | 'fire_brigade' | 'police' | 'admin') => {
    setRole(role);
    navigate('/dashboard');
  };

  // ─── Render overlays ────────────────────────────────────────────
  if (step === 'type_select') {
    return (
      <div className="fixed inset-0 z-50 bg-background/98 flex items-center justify-center p-6">
        <EmergencyTypeSelector
          onSelect={handleTypeSelected}
          onCancel={() => setStep('idle')}
        />
      </div>
    );
  }

  if (step === 'camera') {
    return <SOSCameraModal open={true} onCapture={handleCapture} onClose={() => setStep('idle')} />;
  }
  if (step === 'preview' && previewUrl) {
    return <PhotoPreviewCard imageUrl={previewUrl} onRetake={handleRetake} onConfirm={handleConfirmSOS} />;
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
        vehicleEnRoute={false}
        onViewMap={() => { resetSOS(); navigate('/map'); }}
        onNewSOS={resetSOS}
        onClose={resetSOS}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center glow-primary">
              <Radio className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold tracking-wide text-foreground">EMERGE-AI</span>
          </div>
          <div className="flex items-center gap-2">
            {(['admin', 'ambulance', 'hospital', 'fire_brigade', 'police'] as const).map((role) => (
              <button
                key={role}
                onClick={() => enterDashboard(role)}
                className="px-3 py-1.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors capitalize"
              >
                {role.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-ops opacity-20" />
        <div className="max-w-7xl mx-auto px-6 py-24 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-status-critical/10 border border-status-critical/20 mb-8">
            <span className="w-2 h-2 rounded-full bg-status-critical animate-pulse-glow" />
            <span className="text-xs font-mono text-status-critical">AI-POWERED EMERGENCY RESPONSE</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-foreground tracking-tight leading-tight">
            Every Second<br />
            <span className="text-primary">Counts</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            EMERGE-AI uses artificial intelligence to detect, verify, and coordinate emergency responses in real-time. One tap connects you to the help you need.
          </p>

          <div className="mt-12">
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={startSOS}
                disabled={locating || cooldownRemaining > 0}
                className={cn(
                  'relative w-40 h-40 rounded-full border-4 border-status-critical text-status-critical-foreground font-bold text-xl transition-all',
                  'bg-status-critical hover:scale-105 active:scale-95',
                  locating && 'animate-pulse opacity-80',
                  'glow-critical',
                  (cooldownRemaining > 0) && 'opacity-50 cursor-not-allowed hover:scale-100 active:scale-100'
                )}
              >
                {locating ? (
                  <span className="flex flex-col items-center gap-1">
                    <MapPin className="w-6 h-6 animate-bounce" />
                    <span className="text-sm">Locating...</span>
                  </span>
                ) : cooldownRemaining > 0 ? (
                  <span className="flex flex-col items-center gap-1">
                    <Clock className="w-6 h-6" />
                    <span className="text-sm">{Math.ceil(cooldownRemaining / 1000)}s</span>
                  </span>
                ) : (
                  <span className="flex flex-col items-center gap-1">
                    <Camera className="w-8 h-8" />
                    <span>SOS</span>
                  </span>
                )}
              </button>
              {locationError && (
                <p className="text-xs text-status-critical">{locationError}</p>
              )}
              {cooldownRemaining > 0 && (
                <p className="text-xs text-muted-foreground">Cooldown active — please wait</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Tap to capture photo &amp; send AI-verified SOS
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: AlertTriangle, title: 'AI Detection', desc: 'Automatic accident and fire detection via camera networks and sensors.' },
            { icon: Clock, title: 'Sub-4min Response', desc: 'Average response time under 4 minutes with AI-optimized dispatch routing.' },
            { icon: Phone, title: 'One-Tap SOS', desc: 'Instant emergency activation with automatic location sharing.' },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-6 space-y-3 hover:border-primary/30 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-sm font-bold text-foreground">{f.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-20">
        <h2 className="text-lg font-bold text-foreground mb-4">Recent Emergency Activity</h2>
        <div className="rounded-xl border bg-card divide-y">
          {liveEvents.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No recent activity. Events will appear here in real-time.
            </div>
          ) : (
            liveEvents.slice(0, 5).map((ev) => (
              <div key={ev.id} className="px-5 py-3 flex items-center gap-3">
                <span className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  ev.severity === 'CRITICAL' && 'bg-status-critical',
                  ev.severity === 'HIGH' && 'bg-status-warning',
                  ev.severity === 'MEDIUM' && 'bg-status-info',
                  ev.severity === 'LOW' && 'bg-muted-foreground',
                )} />
                <span className="text-sm text-foreground flex-1">{ev.message}</span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {new Date(ev.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
