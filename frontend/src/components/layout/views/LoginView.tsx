/**
 * LoginView - Modern full-screen login gate for ControlZebra.
 *
 * Uses a standalone theme hook (useLoginTheme) because LayoutContext
 * isn't available until after authentication. Theme preference is
 * persisted to localStorage so it carries over to the main app.
 */
import { memo, useState, useCallback, type FormEvent } from 'react';
import { AlertTriangle, Sun, Moon, Monitor, Mail, KeyRound, ArrowRight } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui';
import { useAuth } from '../../../context';
import { useLoginTheme } from '../../../hooks/useLoginTheme';
import Spinner from '../../common/Spinner';

/* -------------------------------------------------------------------------- */
/*  Logo                                                                      */
/* -------------------------------------------------------------------------- */

function ZebraLogo({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="24" cy="24" r="22" className="fill-blue-500/20" />
      <circle cx="24" cy="24" r="18" className="fill-neutral-900 dark:fill-neutral-100" />
      {/* Git branch nodes */}
      <circle cx="24" cy="14" r="3" className="fill-blue-500" />
      <circle cx="18" cy="24" r="3" className="fill-blue-400" />
      <circle cx="30" cy="24" r="3" className="fill-blue-400" />
      <circle cx="24" cy="34" r="3" className="fill-blue-500" />
      {/* Branch lines */}
      <path
        d="M24 17 L24 31 M21 24 L27 24 M21 21 L27 27 M27 21 L21 27"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-blue-500/60"
      />
      {/* Zebra stripes */}
      <path
        d="M15 20 L18 17 M33 20 L30 17 M15 28 L18 31 M33 28 L30 31"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="text-neutral-500 dark:text-neutral-500"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Theme toggle                                                              */
/* -------------------------------------------------------------------------- */

const THEME_ICONS = {
  system: Monitor,
  light: Sun,
  dark: Moon,
} as const;

const THEME_LABELS = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
} as const;

function ThemeToggle() {
  const { theme, cycleTheme } = useLoginTheme();
  const Icon = THEME_ICONS[theme];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={cycleTheme}
            className="rounded-full p-2 text-theme-muted hover:text-theme-primary hover-bg-theme-interactive transition-colors"
            aria-label={THEME_LABELS[theme]}
          >
            <Icon size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">{THEME_LABELS[theme]}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Login form                                                                */
/* -------------------------------------------------------------------------- */

function LoginView(): JSX.Element {
  // Activate theme on the login screen
  useLoginTheme();

  const { loginWithPassword, isLoading, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const displayError = localError || authError;

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setLocalError(null);

      if (!email || !password) {
        setLocalError('Please enter your email and password.');
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await loginWithPassword(email, password);
        if (!result.success) {
          setLocalError(result.error || 'Sign in failed.');
        }
      } catch {
        setLocalError('An unexpected error occurred. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, password, loginWithPassword],
  );

  /* ---- Full-screen wrapper ---- */
  return (
    <div className="relative h-screen w-screen flex items-center justify-center bg-theme-base text-theme-primary overflow-hidden">
      {/* Decorative background blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-blue-500/5 blur-3xl"
      />

      {/* Theme toggle – top-right corner */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      {/* Main content */}
      <div className="relative z-10 w-full max-w-sm px-4 animate-screen-enter">
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center select-none">
          <ZebraLogo className="h-12 w-12" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-theme-primary">
              Control<span className="text-blue-500">Zebra</span>
            </h1>
            <p className="mt-1 text-xs text-theme-muted">
              Version control for industrial automation
            </p>
          </div>
        </div>

        {/* Card */}
        <Card className="border-theme-default shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sign in</CardTitle>
            <CardDescription>
              Enter your credentials to continue.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Error banner */}
            {displayError && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 animate-fade-in">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{displayError}</span>
              </div>
            )}

            {isLoading ? (
              <div className="flex flex-col items-center gap-3 py-8 text-sm text-theme-muted">
                <Spinner size={20} />
                <span>Checking session…</span>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                {/* Email field */}
                <div className="space-y-1.5">
                  <Label htmlFor="auth-email">Email</Label>
                  <div className="relative">
                    <Mail
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"
                    />
                    <Input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Password field */}
                <div className="space-y-1.5">
                  <Label htmlFor="auth-password">Password</Label>
                  <div className="relative">
                    <KeyRound
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted"
                    />
                    <Input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-9 pr-16"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-theme-muted hover:text-theme-primary transition-colors select-none"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full gap-2"
                  size="lg"
                  loading={isSubmitting}
                >
                  Sign in
                  {!isSubmitting && <ArrowRight size={14} />}
                </Button>
              </form>
            )}
          </CardContent>

          <CardFooter className="justify-center border-t border-theme-muted pt-4">
            <p className="text-xs text-theme-muted text-center">
              Don't have an account?{' '}
              <a
                href="https://controlzebra.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-400 transition-colors"
              >
                Request access
              </a>
            </p>
          </CardFooter>
        </Card>

        {/* Footer legal */}
        <p className="mt-6 text-center text-[11px] text-theme-muted select-none">
          © {new Date().getFullYear()} ControlZebra. All rights reserved.
        </p>
      </div>
    </div>
  );
}

export default memo(LoginView);
