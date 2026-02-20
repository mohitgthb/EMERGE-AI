import { CheckCircle, MapPin, Truck, Shield, Clock, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface IncidentSuccessScreenProps {
  incidentId: string;
  eventType: 'ACCIDENT' | 'FIRE' | 'CRIME';
  confidence: number;
  dispatchCreated: boolean;
  latitude: number;
  longitude: number;
  onViewMap: () => void;
  onNewSOS: () => void;
  onClose: () => void;
  vehicleEnRoute?: boolean;
}

export default function IncidentSuccessScreen({
  incidentId,
  eventType,
  confidence,
  dispatchCreated,
  latitude,
  longitude,
  onViewMap,
  onNewSOS,
  onClose,
  vehicleEnRoute,
}: IncidentSuccessScreenProps) {
  return (
    <div className="fixed inset-0 z-50 bg-background/98 flex flex-col items-center justify-center p-6 overflow-y-auto">
      <div className="w-full max-w-md space-y-6">
        {/* Success checkmark */}
        <div className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-status-success/10 border-2 border-status-success/30 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-status-success" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Emergency Confirmed</h2>
          <p className="text-sm text-muted-foreground">
            Your SOS has been verified and emergency services have been notified.
          </p>
        </div>

        {/* Incident details card */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Incident ID</span>
            <span className="text-xs font-mono text-foreground">{incidentId.slice(0, 12).toUpperCase()}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Type</p>
              <div className={cn(
                'text-sm font-bold',
                eventType === 'FIRE' ? 'text-status-critical' : eventType === 'CRIME' ? 'text-blue-600' : 'text-status-warning'
              )}>
                {eventType === 'CRIME' ? '🚨 CRIME' : eventType}
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Confidence</p>
              <div className="text-sm font-bold text-foreground">{(confidence * 100).toFixed(0)}%</div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" />
            <span className="font-mono">{latitude.toFixed(6)}, {longitude.toFixed(6)}</span>
          </div>

          {/* Status timeline */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-status-success/10 flex items-center justify-center">
                <Shield className="w-3.5 h-3.5 text-status-success" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground">Incident Confirmed</p>
                <p className="text-[10px] text-muted-foreground">AI verified the emergency scene</p>
              </div>
              <Clock className="w-3 h-3 text-status-success" />
            </div>

            <div className="flex items-center gap-3">
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center',
                dispatchCreated ? 'bg-status-success/10' : 'bg-muted/50'
              )}>
                <Truck className={cn('w-3.5 h-3.5', dispatchCreated ? 'text-status-success' : 'text-muted-foreground')} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground">
                  {dispatchCreated ? 'Help Dispatched' : 'Dispatching…'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {dispatchCreated ? 'Emergency vehicle assigned' : 'Finding nearest available unit'}
                </p>
              </div>
              {dispatchCreated && <Clock className="w-3 h-3 text-status-success" />}
            </div>

            {vehicleEnRoute && (
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-status-info/10 flex items-center justify-center">
                  <Navigation className="w-3.5 h-3.5 text-status-info animate-pulse" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">Vehicle En Route</p>
                  <p className="text-[10px] text-muted-foreground">Heading to your location</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Safety tips */}
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">While You Wait</h4>
          {[
            'Stay at your current location if safe',
            'Keep your phone on and accessible',
            'If injured, avoid unnecessary movement',
            'Signal responders when they arrive',
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-2">
              <Shield className="w-3 h-3 text-status-success mt-0.5 shrink-0" />
              <span className="text-xs text-muted-foreground">{tip}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={onViewMap} className="flex-1" variant="default" size="lg">
            <MapPin className="w-4 h-4 mr-2" />
            View on Map
          </Button>
          <Button onClick={onClose} variant="outline" size="lg" className="flex-1">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
