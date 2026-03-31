import { getApiBaseUrl } from '@/services/runtime';
import { isFeatureAvailable } from '@/services/runtime-config';

export interface GlobalWeatherReading {
  city: string;
  lat: number;
  lon: number;
  tempC: number;
  feelsLikeC: number;
  humidity: number | null;
  condition: string;
  description: string;
  icon: string;
  windMps: number | null;
  visibility: number | null;
  clouds: number | null;
  updatedAt: string;
}

export async function fetchGlobalWeather(): Promise<GlobalWeatherReading[]> {
  if (!isFeatureAvailable('openWeatherMap')) return [];
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/owm-current`);
    if (!res.ok) return [];
    return (await res.json()) as GlobalWeatherReading[];
  } catch {
    return [];
  }
}
