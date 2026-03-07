import { calculateCCI } from './cci';
import { calculateTreeDensity, type TreeRecord } from './density';
import { analyzeGPSAccuracy } from './gpsQuality';
import { calculateTreeSpacing } from './spacing';

export interface EcologyReport {
  totalTrees: number;
  healthyTrees: number;
  unhealthyTrees: number;
  density: number;
  cci: number;
  spacingMean: number;
  spacingStd: number;
  spacingConformity: number;
  gpsAccuracy: number;
}

export const analyzeEcology = (trees: TreeRecord[], areaHa: number): EcologyReport => {
  const densityResult = calculateTreeDensity(trees, areaHa);

  // Nilai ideal default dapat dikonfigurasi dari UI/dashboard saat integrasi.
  const defaultIdealDensity = 625; // contoh 4m x 4m
  const defaultIdealSpacing = 4; // meter

  const cciResult = calculateCCI(densityResult.treesPerHa, defaultIdealDensity);
  const spacingResult = calculateTreeSpacing(trees, defaultIdealSpacing);

  const gpsRecords = trees
    .map((tree) => ({ accuracy: tree.accuracy }))
    .filter(
      (record): record is { accuracy: number } =>
        Number.isFinite(record.accuracy) && (record.accuracy ?? 0) >= 0,
    );
  const gpsResult = analyzeGPSAccuracy(gpsRecords);

  return {
    totalTrees: trees.length,
    healthyTrees: densityResult.healthyTrees,
    unhealthyTrees: densityResult.unhealthyTrees,
    density: densityResult.treesPerHa,
    cci: cciResult.efficiencyPercent,
    spacingMean: spacingResult.meanDistance,
    spacingStd: spacingResult.stdDeviation,
    spacingConformity: spacingResult.conformityPercent,
    gpsAccuracy: gpsResult.medianAccuracy,
  };
};
