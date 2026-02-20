import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'click',
];

/**
 * Auto-logout after 30 minutes of user inactivity.
 * Only active when the user is authenticated.
 */
export function useInactivityTimeout() {
  const { isAuthenticated, logout } = useAuthStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!isAuthenticated) return;

    // Update last-activity timestamp in storage for cross-tab awareness
    localStorage.setItem('emerge-ai-last-activity', Date.now().toString());

    timerRef.current = setTimeout(() => {
      console.warn('[Session] Inactivity timeout — logging out');
      logout();
      // Navigate to login — the LoginGuard in App.tsx will handle this
      // on next render cycle since isAuthenticated becomes false
      window.location.href = '/login';
    }, INACTIVITY_TIMEOUT_MS);
  }, [isAuthenticated, logout]);

  useEffect(() => {
    if (!isAuthenticated) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // Check if session should already be expired (e.g., tab was sleeping)
    const lastActivity = localStorage.getItem('emerge-ai-last-activity');
    if (lastActivity) {
      const elapsed = Date.now() - parseInt(lastActivity, 10);
      if (elapsed > INACTIVITY_TIMEOUT_MS) {
        console.warn('[Session] Session expired during inactivity — logging out');
        logout();
        window.location.href = '/login';
        return;
      }
    }

    // Start the timer
    resetTimer();

    // Listen for user activity
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [isAuthenticated, resetTimer, logout]);
}
