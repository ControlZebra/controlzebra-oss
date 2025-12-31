/**
 * Sonner Toaster - Toast notification component with countdown progress.
 * Wraps sonner library with custom styling for dark theme.
 */
import { Toaster as Sonner } from "sonner";
import {
  CircleCheck,
  Info,
  Loader2,
  OctagonX,
  TriangleAlert,
} from "lucide-react";

const TOAST_DURATION = 5000;

function Toaster(props) {
  return (
    <Sonner
      theme="dark"
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
            "group toast group-[.toaster]:bg-gray-800 group-[.toaster]:text-gray-100 group-[.toaster]:border-gray-700 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-gray-400",
          actionButton:
            "group-[.toast]:bg-blue-600 group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-gray-700 group-[.toast]:text-gray-300",
          closeButton:
            "group-[.toast]:bg-gray-700 group-[.toast]:text-gray-300 group-[.toast]:border-gray-600",
          success:
            "group-[.toaster]:bg-green-900/50 group-[.toaster]:border-green-700 group-[.toaster]:text-green-100",
          error:
            "group-[.toaster]:bg-red-900/50 group-[.toaster]:border-red-700 group-[.toaster]:text-red-100",
          info:
            "group-[.toaster]:bg-blue-900/50 group-[.toaster]:border-blue-700 group-[.toaster]:text-blue-100",
          warning:
            "group-[.toaster]:bg-yellow-900/50 group-[.toaster]:border-yellow-700 group-[.toaster]:text-yellow-100",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
