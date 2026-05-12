export async function fetchIsLikelyRainNow(lat: number, lng: number): Promise<boolean | undefined> {
  try {
    const q = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      current: 'precipitation,rain,weather_code',
      timezone: 'auto',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q.toString()}`);
    if (!res.ok) return undefined;
    const j = (await res.json()) as {
      current?: { rain?: number; precipitation?: number; weather_code?: number };
    };
    const c = j?.current;
    if (!c) return undefined;
    const rain = Number(c.rain ?? 0);
    const prec = Number(c.precipitation ?? 0);
    const code = Number(c.weather_code ?? 0);
    if (rain > 0.05 || prec > 0.05) return true;
    if (code >= 51 && code <= 67) return true;
    if (code >= 80 && code <= 99) return true;
    return false;
  } catch {
    return undefined;
  }
}
