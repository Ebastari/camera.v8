interface HSV {
  h: number;
  s: number;
  v: number;
}

const toHSV = (r: number, g: number, b: number): HSV => {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;

  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === nr) {
      h = 60 * (((ng - nb) / delta) % 6);
    } else if (max === ng) {
      h = 60 * ((nb - nr) / delta + 2);
    } else {
      h = 60 * ((nr - ng) / delta + 4);
    }
  }

  if (h < 0) {
    h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
};

const round = (value: number, decimals = 2): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
};

const isGreenPixel = (h: number, s: number, v: number): boolean => {
  return h >= 65 && h <= 160 && s >= 0.2 && v >= 0.15;
};

export const calculateCanopyCover = (imageData: ImageData): number => {
  const pixels = imageData.data;
  const step = 4;
  let totalVisible = 0;
  let greenCount = 0;

  for (let i = 0; i < pixels.length; i += step) {
    const alpha = pixels[i + 3];
    if (alpha === 0) {
      continue;
    }

    totalVisible += 1;
    const hsv = toHSV(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (isGreenPixel(hsv.h, hsv.s, hsv.v)) {
      greenCount += 1;
    }
  }

  if (totalVisible === 0) {
    return 0;
  }

  return round((greenCount / totalVisible) * 100);
};
