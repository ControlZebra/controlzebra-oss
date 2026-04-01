import { Events, System, Window } from '@wailsio/runtime';

export type DesktopPlatform = 'windows' | 'macos' | 'linux' | 'unknown';

type WindowStateListener = (isMaximised: boolean) => void;
type CancelFn = () => void;
type WindowStateEvent = 'common:WindowMaximise' | 'common:WindowRestore' | 'common:WindowUnMaximise';

const WINDOW_STATE_EVENTS: WindowStateEvent[] = [
  'common:WindowMaximise',
  'common:WindowRestore',
  'common:WindowUnMaximise',
];

export function getDesktopPlatform(): DesktopPlatform {
  if (typeof window === 'undefined') {
    return 'unknown';
  }

  if (System.IsWindows()) {
    return 'windows';
  }

  if (System.IsMac()) {
    return 'macos';
  }

  if (System.IsLinux()) {
    return 'linux';
  }

  return 'unknown';
}

export function isWindowsDesktop(): boolean {
  return getDesktopPlatform() === 'windows';
}

export function isMacDesktop(): boolean {
  return getDesktopPlatform() === 'macos';
}

export async function minimiseCurrentWindow(): Promise<void> {
  await Window.Minimise();
}

export async function toggleCurrentWindowMaximise(): Promise<void> {
  await Window.ToggleMaximise();
}

export async function closeCurrentWindow(): Promise<void> {
  await Window.Close();
}

export async function getCurrentWindowIsMaximised(): Promise<boolean> {
  return Window.IsMaximised();
}

export function onCurrentWindowStateChange(listener: WindowStateListener): CancelFn {
  const subscriptions = WINDOW_STATE_EVENTS.map((eventName) => Events.On(eventName, async () => {
    if (eventName === 'common:WindowMaximise') {
      listener(true);
      return;
    }

    if (eventName === 'common:WindowUnMaximise') {
      listener(false);
      return;
    }

    listener(await getCurrentWindowIsMaximised());
  }));

  return () => {
    subscriptions.forEach((unsubscribe) => unsubscribe());
  };
}