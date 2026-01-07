/**
 * Sonner Toaster - Toast notification component with countdown progress.
 * Wraps sonner library with custom styling that respects theme.
 */
import { Toaster as Sonner } from "sonner";
import {
  CircleCheck,
  Info,
  Loader2,
  OctagonX,
  TriangleAlert,
} from "lucide-react";
import { useLayout } from "../../context";

const TOAST_DURATION = 5000;

function Toaster(props) {
  const { theme } = useLayout();
  
  // Determine effective theme (resolve 'system' to actual preference)
  const effectiveTheme = theme === 'system' 
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
    
  return (
    <Sonner
      theme={effectiveTheme}
      className="toaster group"
      duration={TOAST_DURATION}
      position="top-center"
      expand={false}
      richColors
      closeButton
      icons={{
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <OctagonX className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-theme-surface group-[.toaster]:text-theme-primary group-[.toaster]:border-theme-default group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-theme-secondary",
          actionButton:
            "group-[.toast]:bg-blue-600 group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-theme-muted group-[.toast]:text-theme-primary",
          closeButton:
            "group-[.toast]:bg-theme-muted group-[.toast]:text-theme-secondary group-[.toast]:border-theme-default",
          success:
            "group-[.toaster]:bg-green-900/50 group-[.toaster]:border-green-700 group-[.toaster]:text-green-100 dark:group-[.toaster]:bg-green-900/50 dark:group-[.toaster]:text-green-100",
          error:
            "group-[.toaster]:bg-red-900/50 group-[.toaster]:border-red-700 group-[.toaster]:text-red-100 dark:group-[.toaster]:bg-red-900/50 dark:group-[.toaster]:text-red-100",
          info:
            "group-[.toaster]:bg-blue-900/50 group-[.toaster]:border-blue-700 group-[.toaster]:text-blue-100 dark:group-[.toaster]:bg-blue-900/50 dark:group-[.toaster]:text-blue-100",
          warning:
            "group-[.toaster]:bg-yellow-900/50 group-[.toaster]:border-yellow-700 group-[.toaster]:text-yellow-100 dark:group-[.toaster]:bg-yellow-900/50 dark:group-[.toaster]:text-yellow-100",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
