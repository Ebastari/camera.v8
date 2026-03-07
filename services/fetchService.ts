
export interface CloudFetchResult {
  data: any[];
  source: 'network' | 'cache';
  cachedAt?: string;
}

interface CloudCachePayload {
  updatedAt: string;
  data: any[];
}

const getCloudCacheKey = (url: string): string => `cloud_cache:${url.trim()}`;

const readCloudCache = (url: string): CloudCachePayload | null => {
  try {
    const raw = localStorage.getItem(getCloudCacheKey(url));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CloudCachePayload;
    if (!parsed || !Array.isArray(parsed.data)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeCloudCache = (url: string, data: any[]): void => {
  try {
    const payload: CloudCachePayload = {
      updatedAt: new Date().toISOString(),
      data,
    };
    localStorage.setItem(getCloudCacheKey(url), JSON.stringify(payload));
  } catch {
    // Abaikan jika storage penuh/tidak tersedia.
  }
};

export const fetchCloudDataSmart = async (url: string): Promise<CloudFetchResult> => {
  // Jangan mencoba melakukan fetch jika URL masih berupa placeholder atau kosong.
  if (!url || url === '' || url.includes('/s/.../exec')) {
    const cached = readCloudCache(url || 'unknown');
    return {
      data: cached?.data || [],
      source: 'cache',
      cachedAt: cached?.updatedAt,
    };
  }

  try {
    const response = await fetch(url, {
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }

    const result = await response.json();

    // Validasi apakah result adalah array.
    if (Array.isArray(result)) {
      writeCloudCache(url, result);
      return {
        data: result,
        source: 'network',
      };
    }

    if (result && result.status === 'error') {
      throw new Error(result.message || 'Script mengembalikan error');
    }

    return {
      data: [],
      source: 'network',
    };
  } catch (error) {
    const cached = readCloudCache(url);
    if (cached) {
      return {
        data: cached.data,
        source: 'cache',
        cachedAt: cached.updatedAt,
      };
    }

    console.error('Fetch Cloud Data Error:', error);
    throw error;
  }
};

export const fetchCloudData = async (url: string): Promise<any[]> => {
  const result = await fetchCloudDataSmart(url);
  return result.data;
};
