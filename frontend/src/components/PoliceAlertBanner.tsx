import { useEffect, useState } from 'react';
import { getSocket } from '@/services/socket';
import { SOCKET_EVENTS } from '@/services/socket';
import { soundManager } from './NotificationSoundManager';
import type { PoliceAlertPayload } from '@/types';

/**
 * PoliceAlertBanner
 * Persistent crime alert banner that appears on the Police Dashboard
 * when a POLICE_ALERT event is received. Plays a loud siren sound.
 */
export function PoliceAlertBanner() {
  const [alerts, setAlerts] = useState<(PoliceAlertPayload & { id: string })[]>([]);

  useEffect(() => {
    const socket = getSocket();

    const handlePoliceAlert = (data: PoliceAlertPayload) => {
      const alert = {
        ...data,
        id: `pa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      };

      setAlerts((prev) => [alert, ...prev].slice(0, 10));

      // Play loud police siren
      soundManager.play('police');
      // Play again after a short delay for emphasis
      setTimeout(() => soundManager.play('police'), 1500);
    };

    socket.on(SOCKET_EVENTS.POLICE_ALERT, handlePoliceAlert);

    return () => {
      socket.off(SOCKET_EVENTS.POLICE_ALERT, handlePoliceAlert);
    };
  }, []);

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const dismissAll = () => {
    setAlerts([]);
  };

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {alerts.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={dismissAll}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Dismiss all ({alerts.length})
          </button>
        </div>
      )}

      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="relative overflow-hidden rounded-lg border-2 border-red-500 bg-red-50 shadow-lg animate-pulse-slow"
        >
          {/* Animated red stripe */}
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 via-transparent to-red-500/10 animate-shimmer" />

          <div className="relative flex items-start gap-4 p-4">
            {/* Pulsing icon */}
            <div className="flex-shrink-0 relative">
              <span className="text-4xl">🚨</span>
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-red-800 uppercase tracking-wide">
                  Crime Alert
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold text-white bg-red-600 rounded-full uppercase">
                  {alert.severity || 'HIGH'}
                </span>
              </div>

              <p className="text-sm text-red-700 font-medium">
                Crime reported — Police unit dispatched to location
              </p>

              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-red-600">
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {alert.latitude?.toFixed(4)}, {alert.longitude?.toFixed(4)}
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </span>
                <span className="font-mono text-[10px]">SOS#{alert.sosEventId?.slice(0, 8)}</span>
              </div>
            </div>

            <button
              onClick={() => dismissAlert(alert.id)}
              className="flex-shrink-0 p-1 rounded hover:bg-red-200 transition-colors text-red-400 hover:text-red-700"
              aria-label="Dismiss alert"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s ease-in-out infinite;
        }
        .animate-pulse-slow {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
}

export default PoliceAlertBanner;
