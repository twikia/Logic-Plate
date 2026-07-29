import { Linking } from 'react-native';

export function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isSafeTelUrl(url: string): boolean {
  return /^tel:[+\d()\s.-]+$/i.test(url.trim());
}

export async function openExternalUrl(url: string | null | undefined): Promise<void> {
  if (!url || !isSafeHttpUrl(url)) return;
  await Linking.openURL(url);
}

export async function openTelUrl(phone: string | null | undefined): Promise<void> {
  if (!phone) return;
  const href = phone.startsWith('tel:') ? phone : `tel:${phone}`;
  if (!isSafeTelUrl(href)) return;
  await Linking.openURL(href);
}
