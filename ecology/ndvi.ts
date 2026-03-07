const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

const sanitizeColor = (value: number): number => clamp(value, 0, 255);

export const calculateNDVI = (r: number, g: number, b: number): number => {
  void b;

  const safeR = sanitizeColor(r);
  const safeG = sanitizeColor(g);
  const denominator = safeG + safeR;

  if (denominator === 0) {
    return 0;
  }

  const ndvi = (safeG - safeR) / denominator;
  return clamp(Math.round(ndvi * 1000) / 1000, -1, 1);
};
