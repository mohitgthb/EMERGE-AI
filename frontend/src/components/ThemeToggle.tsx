import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const isDark = theme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'relative inline-flex h-7 w-[52px] items-center rounded-full border transition-colors duration-300',
        isDark
          ? 'bg-secondary border-border'
          : 'bg-primary/10 border-primary/20',
        className
      )}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
    >
      {/* Track icons */}
      <Sun className={cn(
        'absolute left-1.5 w-3 h-3 transition-opacity duration-200',
        isDark ? 'opacity-30 text-muted-foreground' : 'opacity-100 text-amber-500'
      )} />
      <Moon className={cn(
        'absolute right-1.5 w-3 h-3 transition-opacity duration-200',
        isDark ? 'opacity-100 text-blue-400' : 'opacity-30 text-muted-foreground'
      )} />

      {/* Thumb */}
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-foreground/90 shadow-sm transition-transform duration-300',
          isDark ? 'translate-x-[26px]' : 'translate-x-[3px]'
        )}
      />
    </button>
  );
}

/** Compact icon-only toggle for tight spaces */
export function ThemeToggleIcon({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
        'hover:bg-accent text-muted-foreground hover:text-foreground',
        className
      )}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
