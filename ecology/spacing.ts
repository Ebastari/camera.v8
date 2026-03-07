import type { TreeRecord } from './density';

export interface SpacingResult {
  meanDistance: number;
  stdDeviation: number;
  conformityPercent: number;
}

const EARTH_RADIUS_M = 6371000;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

const round = (value: number, decimals = 2): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
};

const haversineDistanceMeters = (a: TreeRecord, b: TreeRecord): number => {
  const lat1 = toRadians(a.lat);
  const lon1 = toRadians(a.lon);
  const lat2 = toRadians(b.lat);
  const lon2 = toRadians(b.lon);

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
};

const getPairDistances = (trees: TreeRecord[]): number[] => {
  const distances: number[] = [];
  for (let i = 0; i < trees.length - 1; i += 1) {
    for (let j = i + 1; j < trees.length; j += 1) {
      const distance = haversineDistanceMeters(trees[i], trees[j]);
      if (Number.isFinite(distance)) {
        distances.push(distance);
      }
    }
  }
  return distances;
};

export const calculateTreeSpacing = (
  trees: TreeRecord[],
  idealSpacing: number,
): SpacingResult => {
  if (trees.length < 2) {
    return {
      meanDistance: 0,
      stdDeviation: 0,
      conformityPercent: 0,
    };
  }

  const distances = getPairDistances(trees);
  if (distances.length === 0) {
    return {
      meanDistance: 0,
      stdDeviation: 0,
      conformityPercent: 0,
    };
  }

  const meanDistance = distances.reduce((acc, cur) => acc + cur, 0) / distances.length;
  const variance =
    distances.reduce((acc, cur) => acc + (cur - meanDistance) ** 2, 0) / distances.length;
  const stdDeviation = Math.sqrt(variance);

  const safeIdeal = Number.isFinite(idealSpacing) && idealSpacing > 0 ? idealSpacing : meanDistance;
  const minIdeal = safeIdeal * 0.75;
  const maxIdeal = safeIdeal * 1.25;

  const conformed = distances.filter((d) => d >= minIdeal && d <= maxIdeal).length;
  const conformityPercent = (conformed / distances.length) * 100;

  return {
    meanDistance: round(meanDistance),
    stdDeviation: round(stdDeviation),
    conformityPercent: round(conformityPercent),
  };
};
