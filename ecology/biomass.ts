const round = (value: number, decimals = 3): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
};

export const estimateBiomass = (height: number): number => {
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 0;
  const biomass = 0.25 * safeHeight ** 2;
  return round(biomass);
};
