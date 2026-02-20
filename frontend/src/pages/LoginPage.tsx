import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle, Truck, Flame, Siren, ArrowLeftRight } from 'lucide-react';

type LoginMode = 'vehicle' | 'operator';

export default function LoginPage() {
  const { login, loginWithVehicle, loading, error } = useAuthStore();
  const navigate = useNavigate();

  const [mode, setMode] = useState<LoginMode>('vehicle');
  const [vehicleNo, setVehicleNo] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let success: boolean;
    if (mode === 'vehicle') {
      success = await loginWithVehicle(vehicleNo.trim(), password);
    } else {
      success = await login(operatorId.trim(), password);
    }
    if (success) {
      navigate('/dashboard');
    }
  };

  const toggleMode = () => {
    setMode((prev) => (prev === 'vehicle' ? 'operator' : 'vehicle'));
    setVehicleNo('');
    setOperatorId('');
    setPassword('');
  };

  const isDisabled =
    loading ||
    !password ||
    (mode === 'vehicle' ? !vehicleNo.trim() : !operatorId.trim());

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">EMERGE-AI</h1>
          <p className="text-sm text-muted-foreground mt-1 font-mono">
            {mode === 'vehicle' ? 'VEHICLE LOGIN' : 'OPERATOR LOGIN'}
          </p>
        </div>

        {/* Role indicators */}
        <div className="flex justify-center gap-6 mb-6">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Truck className="w-4 h-4 text-blue-500" />
            <span>Ambulance</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Flame className="w-4 h-4 text-orange-500" />
            <span>Fire</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Siren className="w-4 h-4 text-red-500" />
            <span>Police</span>
          </div>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-6 space-y-5 shadow-lg">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'vehicle' ? (
            <div>
              <label htmlFor="vehicleNo" className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                Vehicle ID
              </label>
              <input
                id="vehicleNo"
                type="text"
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                placeholder="e.g. MH-12-AMB-001"
                required
                autoFocus
                autoComplete="username"
                className="w-full px-4 py-2.5 rounded-lg border bg-background text-foreground text-sm font-mono
                           placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                           transition-all"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="operatorId" className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
                Operator ID
              </label>
              <input
                id="operatorId"
                type="text"
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                placeholder="e.g. AMB-001"
                required
                autoFocus
                autoComplete="username"
                className="w-full px-4 py-2.5 rounded-lg border bg-background text-foreground text-sm font-mono
                           placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                           transition-all"
              />
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                autoComplete="current-password"
                className="w-full px-4 py-2.5 pr-10 rounded-lg border bg-background text-foreground text-sm
                           placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                           transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isDisabled}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm
                       hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all
                       flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Authenticating...
              </>
            ) : (
              'Sign In'
            )}
          </button>

          {/* Mode toggle */}
          <button
            type="button"
            onClick={toggleMode}
            className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {mode === 'vehicle' ? 'Login with Operator ID instead' : 'Login with Vehicle ID instead'}
          </button>

          <p className="text-center text-[11px] text-muted-foreground">
            Credentials are assigned by the system administrator.
          </p>
        </form>
      </div>
    </div>
  );
}
