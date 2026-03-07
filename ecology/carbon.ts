const round = (value: number, decimals = 3): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
};

export const estimateCarbon = (biomass: number): number => {
  const safeBiomass = Number.isFinite(biomass) && biomass > 0 ? biomass : 0;
  return round(safeBiomass * 0.47);
};
