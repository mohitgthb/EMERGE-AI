import { RotateCcw, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PhotoPreviewCardProps {
  imageUrl: string;
  onRetake: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export default function PhotoPreviewCard({ imageUrl, onRetake, onConfirm, loading }: PhotoPreviewCardProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">
        {/* Preview header */}
        <div className="text-center">
          <h2 className="text-lg font-bold text-white">Review Photo</h2>
          <p className="text-xs text-white/60 mt-1">
            Confirm this image to send with your SOS alert
          </p>
        </div>

        {/* Image preview */}
        <div className="relative rounded-xl overflow-hidden border-2 border-white/10">
          <img
            src={imageUrl}
            alt="SOS Capture"
            className="w-full max-h-[60vh] object-contain bg-black"
          />
          {loading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={onRetake}
            disabled={loading}
            variant="outline"
            size="lg"
            className="flex-1 border-white/20 text-white hover:bg-white/10"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Retake
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            size="lg"
            className="flex-1 bg-status-critical hover:bg-status-critical/90 text-white font-bold"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Confirm SOS
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
