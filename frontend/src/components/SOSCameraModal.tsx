import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, X, RotateCcw, Upload, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SOSCameraModalProps {
  open: boolean;
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

export default function SOSCameraModal({ open, onCapture, onClose }: SOSCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    setCameraError(null);
    setCameraReady(false);

    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
        };
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera permission denied. You can upload a photo instead.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found on this device. You can upload a photo instead.');
      } else {
        setCameraError('Unable to access camera. You can upload a photo instead.');
      }
    }
  }, []);

  useEffect(() => {
    if (open) {
      startCamera(facingMode);
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, facingMode, startCamera]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          // Stop camera after capture
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
          onCapture(blob);
        }
      },
      'image/jpeg',
      0.85
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture(file);
    }
  };

  const switchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleClose = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10">
        <h2 className="text-sm font-bold text-white/90 tracking-wider">CAPTURE EMERGENCY</h2>
        <button onClick={handleClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Camera Preview */}
      <div className="relative w-full max-w-lg flex-1 flex items-center justify-center px-4">
        {cameraError ? (
          <div className="text-center space-y-4 p-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-status-warning/10 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-status-warning" />
            </div>
            <p className="text-sm text-white/80">{cameraError}</p>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Photo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full max-h-[70vh] rounded-xl object-cover"
              style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
            />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      {!cameraError && (
        <div className="flex items-center justify-center gap-8 pb-8 pt-4">
          {/* Switch camera */}
          <button
            onClick={switchCamera}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            title="Switch camera"
          >
            <RotateCcw className="w-5 h-5 text-white" />
          </button>

          {/* Capture button */}
          <button
            onClick={handleCapture}
            disabled={!cameraReady}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center
                       bg-status-critical hover:bg-status-critical/90 active:scale-95
                       transition-all disabled:opacity-40 disabled:cursor-not-allowed glow-critical"
          >
            <Camera className="w-8 h-8 text-white" />
          </button>

          {/* Upload fallback */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            title="Upload photo"
          >
            <Upload className="w-5 h-5 text-white" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
