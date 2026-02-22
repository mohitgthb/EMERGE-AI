import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getSocket } from '@/services/socket';
import { SOCKET_EVENTS } from '@/services/socket';
import { soundManager } from './NotificationSoundManager';
import type { SystemNotification } from '@/types';

// ─── Context ─────────────────────────────────────────────────────────────────
interface GlobalAlertContextValue {
  notifications: SystemNotification[];
  unreadCount: number;
  push: (n: Omit<SystemNotification, 'id' | 'timestamp' | 'read'>) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
}

const GlobalAlertContext = createContext<GlobalAlertContextValue | null>(null);

export function useGlobalAlerts() {
  const ctx = useContext(GlobalAlertContext);
  if (!ctx) throw new Error('useGlobalAlerts must be used within GlobalAlertProvider');
  return ctx;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MAX_NOTIFICATIONS = 50;
let idCounter = 0;
const nextId = () => `notif-${Date.now()}-${++idCounter}`;

function levelColor(level: SystemNotification['level']): string {
  switch (level) {
    case 'critical': return 'border-red-500 bg-red-50';
    case 'warning': return 'border-orange-500 bg-orange-50';
    case 'success': return 'border-green-500 bg-green-50';
    default: return 'border-blue-500 bg-blue-50';
  }
}

function levelIcon(level: SystemNotification['level']): string {
  switch (level) {
    case 'critical': return '🚨';
    case 'warning': return '⚠️';
    case 'success': return '✅';
    default: return 'ℹ️';
  }
}

// ─── Toast Component ─────────────────────────────────────────────────────────
function Toast({
  notification,
  onDismiss,
}: {
  notification: SystemNotification;
  onDismiss: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!notification.autoDismiss) return;
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(notification.id), 300);
    }, 6000);
    return () => clearTimeout(timer);
  }, [notification.id, notification.autoDismiss, onDismiss]);

  return (
    <div
      className={`
        flex items-start gap-3 p-4 rounded-lg border-l-4 shadow-lg max-w-sm w-full
        transition-all duration-300 cursor-pointer
        ${levelColor(notification.level)}
        ${exiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'}
      `}
      onClick={() => {
        setExiting(true);
        setTimeout(() => onDismiss(notification.id), 300);
      }}
      role="alert"
    >
      <span className="text-xl flex-shrink-0 mt-0.5">{levelIcon(notification.level)}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900 leading-tight">{notification.title}</p>
        <p className="text-xs text-gray-600 mt-0.5 leading-snug line-clamp-2">{notification.message}</p>
        <p className="text-[10px] text-gray-400 mt-1">
          {new Date(notification.timestamp).toLocaleTimeString()}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setExiting(true);
          setTimeout(() => onDismiss(notification.id), 300);
        }}
        className="text-gray-400 hover:text-gray-600 text-lg leading-none flex-shrink-0"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function GlobalAlertProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const listenersAttached = useRef(false);

  const push = useCallback(
    (n: Omit<SystemNotification, 'id' | 'timestamp' | 'read'>) => {
      const notification: SystemNotification = {
        ...n,
        id: nextId(),
        timestamp: new Date().toISOString(),
        read: false,
      };

      setNotifications((prev) => [notification, ...prev].slice(0, MAX_NOTIFICATIONS));

      // Play sound
      if (soundEnabled && n.soundType) {
        soundManager.play(n.soundType);
      }
    },
    [soundEnabled]
  );

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const setSoundEnabled = useCallback((v: boolean) => {
    setSoundEnabledState(v);
    soundManager.setEnabled(v);
  }, []);

  // ─── Socket listeners for global events ────────────────────────────────────
  useEffect(() => {
    if (listenersAttached.current) return;
    listenersAttached.current = true;

    const socket = getSocket();

    socket.on(SOCKET_EVENTS.NEW_INCIDENT, (data: any) => {
      push({
        type: 'NEW_INCIDENT',
        title: `New ${data.incidentType || 'Incident'} Reported`,
        message: `Location: ${data.latitude?.toFixed(4)}, ${data.longitude?.toFixed(4)} • Severity: ${data.severity || 'UNKNOWN'}`,
        level: data.severity === 'CRITICAL' ? 'critical' : 'warning',
        emergencyType: data.incidentType,
        incidentId: data.incidentId,
        autoDismiss: true,
        soundType: 'urgent',
      });
    });

    socket.on(SOCKET_EVENTS.POLICE_ALERT, (data: any) => {
      push({
        type: 'POLICE_ALERT',
        title: '🚨 CRIME ALERT — Police Dispatched',
        message: `Crime reported at ${data.latitude?.toFixed(4)}, ${data.longitude?.toFixed(4)}. Police unit en route.`,
        level: 'critical',
        emergencyType: 'SAFETY',
        incidentId: data.sosEventId,
        autoDismiss: false,
        soundType: 'police',
      });
    });

    socket.on(SOCKET_EVENTS.DISPATCH_CREATED, (data: any) => {
      push({
        type: 'DISPATCH_CREATED',
        title: 'Dispatch Created',
        message: `Dispatch #${data.dispatchId?.slice(0, 8)} assigned. Vehicle en route.`,
        level: 'success',
        incidentId: data.sosEventId || data.accidentId,
        autoDismiss: true,
        soundType: 'success',
      });
    });

    socket.on(SOCKET_EVENTS.VEHICLE_STATUS_UPDATED, (data: any) => {
      push({
        type: 'VEHICLE_STATUS_UPDATED',
        title: `Vehicle ${data.vehicleNo || 'Unit'} — ${data.status}`,
        message: `${data.vehicleType || 'Vehicle'} status changed to ${data.status}`,
        level: 'info',
        autoDismiss: true,
        soundType: 'default',
      });
    });

    socket.on(SOCKET_EVENTS.GREEN_CORRIDOR_ACTIVE, (data: any) => {
      push({
        type: 'GREEN_CORRIDOR_ACTIVE',
        title: 'Green Corridor Activated',
        message: `Signals cleared for vehicle ${data.vehicleId?.slice(0, 8)}`,
        level: 'success',
        autoDismiss: true,
        soundType: 'success',
      });
    });

    socket.on(SOCKET_EVENTS.FIRE_DETECTED, (data: any) => {
      push({
        type: 'FIRE_DETECTED',
        title: '🔥 Fire Detected',
        message: `Fire incident reported. Fire brigade dispatched.`,
        level: 'critical',
        emergencyType: 'FIRE',
        autoDismiss: false,
        soundType: 'fire',
      });
    });

    socket.on(SOCKET_EVENTS.SOS_TRIGGERED, (data: any) => {
      push({
        type: 'SOS_TRIGGERED',
        title: 'SOS Alert Received',
        message: `Emergency SOS from ${data.deviceIP || 'unknown device'}. Type: ${data.emergencyType}`,
        level: 'warning',
        emergencyType: data.emergencyType,
        incidentId: data.sosEventId,
        autoDismiss: true,
        soundType: 'urgent',
      });
    });

    socket.on(SOCKET_EVENTS.VEHICLE_CRASH_DETECTED, (data: any) => {
      push({
        type: 'VEHICLE_CRASH_DETECTED',
        title: '🚗 Vehicle Crash Alert — Airbag Deployed',
        message: `Vehicle ${data?.crash?.vehicleRegNo || 'Unknown'} reported crash. Severity: ${data?.crash?.severity || 'HIGH'}. Dispatch auto-initiated.`,
        level: 'critical',
        emergencyType: 'VEHICLE_CRASH',
        incidentId: data?.crash?.accidentId,
        autoDismiss: false,
        soundType: 'urgent',
      });
    });

    return () => {
      socket.off(SOCKET_EVENTS.NEW_INCIDENT);
      socket.off(SOCKET_EVENTS.POLICE_ALERT);
      socket.off(SOCKET_EVENTS.DISPATCH_CREATED);
      socket.off(SOCKET_EVENTS.VEHICLE_STATUS_UPDATED);
      socket.off(SOCKET_EVENTS.GREEN_CORRIDOR_ACTIVE);
      socket.off(SOCKET_EVENTS.FIRE_DETECTED);
      socket.off(SOCKET_EVENTS.SOS_TRIGGERED);
      socket.off(SOCKET_EVENTS.VEHICLE_CRASH_DETECTED);
      listenersAttached.current = false;
    };
  }, [push]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Visible toasts = most recent 5 unread
  const visibleToasts = notifications.filter((n) => !n.read).slice(0, 5);

  return (
    <GlobalAlertContext.Provider
      value={{
        notifications,
        unreadCount,
        push,
        dismiss,
        dismissAll,
        markRead,
        markAllRead,
        soundEnabled,
        setSoundEnabled,
      }}
    >
      {children}

      {/* Floating toast container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {visibleToasts.map((n) => (
          <div key={n.id} className="pointer-events-auto">
            <Toast notification={n} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </GlobalAlertContext.Provider>
  );
}

// ─── Notification Bell (for nav/header) ──────────────────────────────────────
export function NotificationBell() {
  const { unreadCount, notifications, markAllRead, soundEnabled, setSoundEnabled } = useGlobalAlerts();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
            <span className="font-semibold text-sm text-gray-700">Notifications</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="text-xs text-gray-500 hover:text-gray-700"
                title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
              >
                {soundEnabled ? '🔊' : '🔇'}
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No notifications yet</div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 text-sm ${n.read ? 'bg-white' : 'bg-blue-50/40'}`}
                >
                  <p className="font-medium text-gray-800 leading-tight">{n.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">{n.message}</p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {new Date(n.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default GlobalAlertProvider;
