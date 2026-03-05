import { Browser } from '@wailsio/runtime';

const HTTPS_PROTOCOL = 'https:';
const HTTP_PROTOCOL = 'http:';

interface OpenExternalUrlOptions {
  allowHttpLocalhost?: boolean;
}

interface UrlCheckResult {
  isAllowed: boolean;
  normalizedUrl?: string;
  reason?: string;
}

function isLocalhostHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
}

export function canOpenExternalUrl(rawUrl: string, options: OpenExternalUrlOptions = {}): UrlCheckResult {
  const trimmedUrl = rawUrl?.trim();

  if (!trimmedUrl) {
    return { isAllowed: false, reason: 'URL is empty' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    return { isAllowed: false, reason: 'URL is invalid' };
  }

  if (parsedUrl.protocol === HTTPS_PROTOCOL) {
    return { isAllowed: true, normalizedUrl: parsedUrl.toString() };
  }

  if (
    parsedUrl.protocol === HTTP_PROTOCOL
    && options.allowHttpLocalhost
    && isLocalhostHost(parsedUrl.hostname)
  ) {
    return { isAllowed: true, normalizedUrl: parsedUrl.toString() };
  }

  return {
    isAllowed: false,
    reason: `Disallowed URL protocol: ${parsedUrl.protocol}`,
  };
}

export async function openExternalUrl(rawUrl: string, options: OpenExternalUrlOptions = {}): Promise<boolean> {
  const { isAllowed, normalizedUrl, reason } = canOpenExternalUrl(rawUrl, options);

  if (!isAllowed || !normalizedUrl) {
    console.warn('[browser] Blocked unsafe URL open attempt', { rawUrl, reason });
    return false;
  }

  try {
    await Browser.OpenURL(normalizedUrl);
    return true;
  } catch (error) {
    console.error('[browser] Failed to open external URL', { normalizedUrl, error });
    return false;
  }
}
