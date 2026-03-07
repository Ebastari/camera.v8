export interface TreeRecord {
  lat: number;
  lon: number;
  health: string;
  accuracy?: number;
}

export interface DensityResult {
  treesPerHa: number;
  healthyTrees: number;
  unhealthyTrees: number;
}

const isHealthy = (health: string): boolean => health.toLowerCase() === 'sehat';

const round = (value: number, decimals = 2): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
};

export const calculateTreeDensity = (
  trees: TreeRecord[],
  areaHa: number,
): DensityResult => {
  const safeAreaHa = Number.isFinite(areaHa) && areaHa > 0 ? areaHa : 1;
  const healthyTrees = trees.filter((tree) => isHealthy(tree.health)).length;
  const unhealthyTrees = Math.max(0, trees.length - healthyTrees);

  // Kepadatan ekologi dihitung dari pohon sehat sesuai spesifikasi.
  const treesPerHa = round(healthyTrees / safeAreaHa);

  return {
    treesPerHa,
    healthyTrees,
    unhealthyTrees,
  };
};
