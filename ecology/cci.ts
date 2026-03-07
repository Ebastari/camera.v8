export interface CCIResult {
  capacity: number;
  efficiencyPercent: number;
  grade: 'Optimal' | 'Baik' | 'Cukup' | 'Buruk';
}

const round = (value: number, decimals = 2): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
};

const classifyCCI = (cci: number): CCIResult['grade'] => {
  if (cci >= 80) {
    return 'Optimal';
  }
  if (cci >= 60) {
    return 'Baik';
  }
  if (cci >= 40) {
    return 'Cukup';
  }
  return 'Buruk';
};

export const calculateCCI = (density: number, idealDensity: number): CCIResult => {
  const safeDensity = Number.isFinite(density) && density > 0 ? density : 0;
  const safeIdeal = Number.isFinite(idealDensity) && idealDensity > 0 ? idealDensity : 1;

  const rawCapacity = (safeDensity / safeIdeal) * 100;
  const efficiencyPercent = Math.max(0, Math.min(100, rawCapacity));

  return {
    capacity: round(rawCapacity),
    efficiencyPercent: round(efficiencyPercent),
    grade: classifyCCI(efficiencyPercent),
  };
};
