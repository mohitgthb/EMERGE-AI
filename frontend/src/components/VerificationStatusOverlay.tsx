import { Loader2, Search, ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export type VerificationPhase = 'uploading' | 'analyzing' | 'result';
export type VerificationResult = 'ACCIDENT' | 'FIRE' | 'CRIME' | 'NONE' | null;

interface VerificationStatusOverlayProps {
  phase: VerificationPhase;
  result: VerificationResult;
  confidence: number;
  progress?: number;
  onDismiss?: () => void;
}

export default function VerificationStatusOverlay({
  phase,
  result,
  confidence,
  progress,
  onDismiss,
}: VerificationStatusOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* Uploading phase */}
        {phase === 'uploading' && (
          <>
            <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Uploading Image…</h3>
              <p className="text-sm text-white/60 mt-1">Sending to verification server</p>
            </div>
            {progress !== undefined && (
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </>
        )}

        {/* Analyzing phase */}
        {phase === 'analyzing' && (
          <>
            <div className="w-20 h-20 mx-auto rounded-full bg-status-warning/10 flex items-center justify-center">
              <Search className="w-10 h-10 text-status-warning animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Analyzing…</h3>
              <p className="text-sm text-white/60 mt-1">AI is verifying the emergency scene</p>
            </div>
            <div className="flex justify-center gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-status-warning"
                  style={{ animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }}
                />
              ))}
            </div>
          </>
        )}

        {/* Result phase */}
        {phase === 'result' && (
          <>
            <div
              className={cn(
                'w-20 h-20 mx-auto rounded-full flex items-center justify-center',
                result === 'NONE' ? 'bg-muted/20' : 'bg-status-success/10'
              )}
            >
              {result === 'NONE' ? (
                <ShieldOff className="w-10 h-10 text-muted-foreground" />
              ) : result === 'FIRE' ? (
                <ShieldAlert className="w-10 h-10 text-status-critical" />
              ) : result === 'CRIME' ? (
                <ShieldAlert className="w-10 h-10 text-blue-500" />
              ) : (
                <ShieldCheck className="w-10 h-10 text-status-success" />
              )}
            </div>

            <div>
              {result === 'NONE' ? (
                <>
                  <h3 className="text-lg font-bold text-white">No Emergency Detected</h3>
                  <p className="text-sm text-white/60 mt-1">
                    AI analysis did not identify an emergency in the image.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-white">
                    Emergency Confirmed — Help Dispatched
                  </h3>
                  <p className="text-sm text-white/60 mt-1">
                    {result === 'FIRE' ? 'Fire' : result === 'CRIME' ? 'Crime' : 'Accident'} detected with{' '}
                    {(confidence * 100).toFixed(0)}% confidence
                  </p>
                </>
              )}
            </div>

            {result !== 'NONE' && (
              <div className="flex items-center justify-center gap-2 text-xs text-status-success font-mono">
                <span className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
                DISPATCH ACTIVE
              </div>
            )}

            {onDismiss && (
              <button
                onClick={onDismiss}
                className="mt-4 px-6 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
              >
                {result === 'NONE' ? 'Close' : 'View Details'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
