import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useRoleStore } from '@/stores/roleStore';
import { useNavigate } from 'react-router-dom';
import {
  LogOut,
  ArrowLeftRight,
  User,
  Truck,
  Flame,
  Shield,
  Hospital,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const roleIcons: Record<string, typeof Truck> = {
  AMBULANCE: Truck,
  FIRE_BRIGADE: Flame,
  POLICE: Shield,
  HOSPITAL: Hospital,
  ADMIN: User,
};

const roleColors: Record<string, string> = {
  AMBULANCE: 'text-blue-500',
  FIRE_BRIGADE: 'text-orange-500',
  POLICE: 'text-purple-500',
  HOSPITAL: 'text-green-500',
  ADMIN: 'text-emerald-500',
};

interface AccountSwitchModalProps {
  className?: string;
}

export function AccountSwitchModal({ className }: AccountSwitchModalProps) {
  const { operator, switchAccount, logout } = useAuthStore();
  const setRole = useRoleStore((s) => s.setRole);
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  if (!operator) return null;

  const RoleIcon = roleIcons[operator.role] || User;
  const roleColor = roleColors[operator.role] || 'text-primary';
  const vehicleNo = operator.vehicle
    ? (operator.vehicle as any).vehicleNo
    : null;

  const handleSwitch = () => {
    setShowModal(false);
    switchAccount();
    setRole('public');
    navigate('/login');
  };

  const handleLogout = () => {
    setShowModal(false);
    logout();
    setRole('public');
    navigate('/login');
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setShowModal(true)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card hover:bg-accent transition-colors text-sm',
          className
        )}
      >
        <RoleIcon className={cn('w-4 h-4', roleColor)} />
        <span className="font-mono text-xs text-foreground truncate max-w-[120px]">
          {vehicleNo || operator.operatorId}
        </span>
        <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />
      </button>

      {/* Modal overlay */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-xl border bg-card shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-sm font-bold text-foreground">Account</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-md hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Current session */}
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                <div className="p-2 rounded-md bg-primary/10">
                  <RoleIcon className={cn('w-5 h-5', roleColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {operator.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {operator.operatorId}
                    {vehicleNo ? ` · ${vehicleNo}` : ''}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    {operator.role.replace('_', ' ')}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <button
                  onClick={handleSwitch}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border hover:bg-accent transition-colors text-sm"
                >
                  <ArrowLeftRight className="w-4 h-4 text-primary" />
                  <div className="text-left">
                    <p className="font-medium text-foreground">Switch Vehicle</p>
                    <p className="text-[11px] text-muted-foreground">
                      Sign in with a different vehicle ID
                    </p>
                  </div>
                </button>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-destructive/30 hover:bg-destructive/10 transition-colors text-sm"
                >
                  <LogOut className="w-4 h-4 text-destructive" />
                  <div className="text-left">
                    <p className="font-medium text-destructive">Sign Out</p>
                    <p className="text-[11px] text-muted-foreground">
                      End your current session
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
