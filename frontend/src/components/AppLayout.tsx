import { ReactNode, useMemo, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useRoleStore, type UserRole } from '@/stores/roleStore';
import { useEmergencyStore } from '@/stores/emergencyStore';
import { useAuthStore } from '@/stores/authStore';
import {
  Map, AlertTriangle, Truck, Radio, Clock, Car,
  Hospital, Flame, Shield, Settings, Home, User, Zap, Menu, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/GlobalAlertProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AccountSwitchModal } from '@/components/AccountSwitchModal';
import { useIsMobile } from '@/hooks/use-mobile';

type NavItem = { path: string; label: string; icon: React.ElementType; badge?: number };

function operatorRoleToUserRole(role: string): Exclude<UserRole, 'public'> {
  const map: Record<string, Exclude<UserRole, 'public'>> = {
    AMBULANCE: 'ambulance',
    FIRE_BRIGADE: 'fire_brigade',
    POLICE: 'police',
    HOSPITAL: 'hospital',
    ADMIN: 'admin',
  };
  return map[role] || 'admin';
}

function useEffectiveRole(): UserRole {
  const { isAuthenticated, operator } = useAuthStore();
  const storeRole = useRoleStore((s) => s.currentRole);
  if (isAuthenticated && operator) return operatorRoleToUserRole(operator.role);
  return storeRole;
}

function useNavItems(role: Exclude<UserRole, 'public'>): NavItem[] {
  const pendingSOS = useEmergencyStore((s) =>
    s.analytics?.pendingSOS ?? s.sosEvents.filter((e) => e.status === 'PENDING').length
  );

  return useMemo(() => {
    const map: Record<Exclude<UserRole, 'public'>, NavItem[]> = {
      admin: [
        { path: '/dashboard', label: 'Admin Center', icon: Settings },
        { path: '/map', label: 'Live Map', icon: Map },
        { path: '/sos', label: 'SOS Events', icon: AlertTriangle, badge: pendingSOS || undefined },
        { path: '/dispatch', label: 'Dispatch', icon: Truck },
        { path: '/vehicle-crash', label: 'Crash Alert', icon: Car },
        { path: '/demo', label: 'Demo', icon: Zap },
      ],
      ambulance: [
        { path: '/dashboard', label: 'My Assignments', icon: Truck },
        { path: '/map', label: 'Navigation', icon: Map },
        { path: '/dispatch', label: 'My Dispatches', icon: Truck },
        { path: '/vehicle-crash', label: 'Crash Alert', icon: Car },
        { path: '/demo', label: 'Demo', icon: Zap },
      ],
      hospital: [
        { path: '/dashboard', label: 'Patient Alerts', icon: Hospital },
        { path: '/map', label: 'Incident Map', icon: Map },
        { path: '/dispatch', label: 'Dispatches', icon: Truck },
        { path: '/demo', label: 'Demo', icon: Zap },
      ],
      fire_brigade: [
        { path: '/dashboard', label: 'Fire Incidents', icon: Flame },
        { path: '/map', label: 'Navigation', icon: Map },
        { path: '/dispatch', label: 'My Dispatches', icon: Truck },
        { path: '/demo', label: 'Demo', icon: Zap },
      ],
      police: [
        { path: '/dashboard', label: 'Incidents', icon: Shield },
        { path: '/map', label: 'Area Map', icon: Map },
        { path: '/dispatch', label: 'My Dispatches', icon: Truck },
        { path: '/demo', label: 'Demo', icon: Zap },
      ],
    };
    return map[role] || [];
  }, [role, pendingSOS]);
}

const roleLabels: Record<Exclude<UserRole, 'public'>, string> = {
  admin: 'Admin Ops',
  ambulance: 'Ambulance',
  hospital: 'Hospital',
  fire_brigade: 'Fire Brigade',
  police: 'Police',
};

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname } = useLocation();
  const role = useEffectiveRole();
  const setRole = useRoleStore((s) => s.setRole);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (role === 'public') return null;

  const navItems = useNavItems(role);

  return (
    <>
      {isMobile && open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 bottom-0 w-60 bg-sidebar border-r border-sidebar-border flex flex-col z-50 transition-transform duration-200',
          isMobile && !open && '-translate-x-full',
          isMobile && open && 'translate-x-0',
        )}
      >
        <div className="h-14 flex items-center gap-3 px-5 border-b border-sidebar-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center glow-primary">
            <Radio className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-sidebar-accent-foreground tracking-wide">EMERGE-AI</h1>
            <p className="text-[10px] text-sidebar-foreground tracking-widest uppercase">{roleLabels[role]}</p>
          </div>
          {isMobile && (
            <button onClick={onClose} className="p-1 rounded-md hover:bg-sidebar-accent/50 transition-colors">
              <X className="w-5 h-5 text-sidebar-foreground" />
            </button>
          )}
        </div>

        <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
          <Link
            to="/"
            onClick={() => { setRole('public'); onClose(); }}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-xs text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-all mb-2"
          >
            <Home className="w-4 h-4" /> Back to Home
          </Link>

          {navItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon className={cn('w-4 h-4', isActive && 'text-primary')} />
                {item.label}
                {item.badge && (
                  <span className="ml-auto text-[10px] font-bold bg-status-critical text-status-critical-foreground px-1.5 py-0.5 rounded-full animate-pulse-glow">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <OperatorFooter />

        <div className="p-4 border-t border-sidebar-border space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground">Theme</span>
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-2 text-xs text-sidebar-foreground">
            <Clock className="w-3 h-3" />
            <span className="font-mono">SYSTEM ONLINE</span>
            <span className="ml-auto w-2 h-2 rounded-full bg-status-success animate-pulse-glow" />
          </div>
        </div>
      </aside>
    </>
  );
}

function OperatorFooter() {
  const { isAuthenticated, operator } = useAuthStore();
  if (!isAuthenticated || !operator) return null;

  return (
    <div className="px-4 py-3 border-t border-sidebar-border space-y-2 shrink-0">
      <div className="flex items-center gap-2 text-xs text-sidebar-foreground">
        <User className="w-3.5 h-3.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sidebar-accent-foreground truncate">{operator.name}</p>
          <p className="text-[10px] font-mono text-sidebar-foreground">{operator.operatorId}</p>
        </div>
      </div>
      <AccountSwitchModal className="w-full justify-center" />
    </div>
  );
}

function Topbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const role = useEffectiveRole();
  const isMobile = useIsMobile();
  const criticalCount = useEmergencyStore((s) => {
    const critAccidents = s.accidents.filter((a) => a.severity === 'CRITICAL').length;
    const critSOS = s.sosEvents.filter((e) => e.severity === 'CRITICAL' && e.status === 'PENDING').length;
    return critAccidents + critSOS;
  });
  if (role === 'public') return null;

  return (
    <header className="h-12 bg-card border-b border-border flex items-center justify-between px-3 sm:px-6">
      <div className="flex items-center gap-3">
        {isMobile && (
          <button
            onClick={onMenuToggle}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
        )}
        <span className="text-xs font-mono text-muted-foreground hidden sm:inline">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
        <span className="text-xs font-mono text-primary hidden sm:inline">
          {new Date().toLocaleTimeString('en-US', { hour12: false })}
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 rounded-md bg-status-critical/10 border border-status-critical/20">
          <span className="w-2 h-2 rounded-full bg-status-critical animate-pulse-glow" />
          <span className="text-xs font-mono text-status-critical">{criticalCount} CRITICAL</span>
        </div>
        <NotificationBell />
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-secondary-foreground uppercase">
          {role.slice(0, 2)}
        </div>
      </div>
    </header>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const role = useEffectiveRole();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (role === 'public') return <>{children}</>;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={cn(isMobile ? 'ml-0' : 'ml-60')}>
        <Topbar onMenuToggle={() => setSidebarOpen((v) => !v)} />
        <main className="p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
