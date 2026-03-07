const DEFAULT_TIMEOUT_MS = 3500;

const withTimeout = async (promise: Promise<Response>, timeoutMs: number): Promise<Response> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Network probe timeout'));
    }, timeoutMs);

    promise
      .then((response) => {
        clearTimeout(timeout);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
};

const probe = async (url: string, noCors = false): Promise<boolean> => {
  try {
    const response = await withTimeout(
      fetch(url, {
        method: 'GET',
        cache: 'no-store',
        mode: noCors ? 'no-cors' : 'cors',
      }),
      DEFAULT_TIMEOUT_MS,
    );

    // Opaque response pada no-cors tetap menandakan jaringan dapat menjangkau target.
    if (response.type === 'opaque') {
      return true;
    }

    return response.ok;
  } catch {
    return false;
  }
};

export const checkInternetConnection = async (preferredUrl?: string): Promise<boolean> => {
  // Jika browser menyatakan offline, tetap coba satu probe ringan untuk menangani false negative.
  const checks: Array<{ url: string; noCors: boolean }> = [];

  if (preferredUrl && /^https?:\/\//i.test(preferredUrl)) {
    checks.push({ url: preferredUrl, noCors: true });
  }

  checks.push({ url: 'https://www.gstatic.com/generate_204', noCors: true });
  checks.push({ url: 'https://www.google.com/generate_204', noCors: true });

  for (const item of checks) {
    const ok = await probe(item.url, item.noCors);
    if (ok) {
      return true;
    }
  }

  // Fallback agar tidak terlalu ketat pada jaringan yang memblokir endpoint probe tertentu.
  return navigator.onLine;
};
