export interface GPSRecord {
  accuracy: number;
}

export interface GPSQuality {
  medianAccuracy: number;
  quality: 'Tinggi' | 'Sedang' | 'Rendah';
}

const round = (value: number, decimals = 2): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
};

const classifyGPS = (medianAccuracy: number): GPSQuality['quality'] => {
  if (medianAccuracy < 5) {
    return 'Tinggi';
  }
  if (medianAccuracy <= 10) {
    return 'Sedang';
  }
  return 'Rendah';
};

export const analyzeGPSAccuracy = (records: GPSRecord[]): GPSQuality => {
  const sorted = records
    .map((r) => r.accuracy)
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return {
      medianAccuracy: 0,
      quality: 'Rendah',
    };
  }

  const mid = Math.floor(sorted.length / 2);
  const medianAccuracy =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    medianAccuracy: round(medianAccuracy),
    quality: classifyGPS(medianAccuracy),
  };
};
