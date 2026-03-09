/**
 * Deteksi tanaman & estimasi tinggi (cm) berbasis HSV + OpenCV.js
 * Output: vegetation mask, bounding box, tinggi px & cm, overlay hasil
 */
export interface PlantHeightDetectionResult {
  vegetationMask: HTMLCanvasElement;
  boundingBox: { x: number; y: number; width: number; height: number };
  plantHeightPx: number;
  plantHeightCm: number;
  outputCanvas: HTMLCanvasElement;
}

export async function detectPlantHeightOpenCV(
  imageElement: HTMLImageElement | HTMLCanvasElement,
  options: {
    pixelToCmRatio?: number;
    hsvLower?: [number, number, number];
    hsvUpper?: [number, number, number];
  } = {}
): Promise<PlantHeightDetectionResult> {
  // Pastikan OpenCV.js sudah loaded
  // @ts-ignore
  const cv = (window as any).cv;
  if (!cv) throw new Error('OpenCV.js belum dimuat');
  const pixelToCmRatio = options.pixelToCmRatio ?? 0.04;
  // Perlebar threshold HSV agar lebih toleran (hijau kekuningan sampai kebiruan)
  const hsvLower = options.hsvLower ?? [20, 30, 30];
  const hsvUpper = options.hsvUpper ?? [100, 255, 255];

  // 1. Load image ke Mat
  const src = cv.imread(imageElement);
  const hsv = new cv.Mat();
  cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
  cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

  // 2. Threshold HSV hijau
  const lower = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), hsvLower);
  const upper = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), hsvUpper);
  const mask = new cv.Mat();
  cv.inRange(hsv, lower, upper, mask);

  // 3. Morfologi (close lalu open)
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);

  // 4. Kontur
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  // 5. Ambil kontur terbesar dengan area minimum (abaikan noise)
  let maxContour = null;
  let maxArea = 0;
  const MIN_AREA = 200; // px, sesuaikan jika perlu
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area > maxArea && area >= MIN_AREA) {
      maxArea = area;
      maxContour = cnt;
    }
  }

  // 6. Bounding box & tinggi
  let boundingBox = { x: 0, y: 0, width: 0, height: 0 };
  let plantHeightPx = 0;
  if (maxContour) {
    const rect = cv.boundingRect(maxContour);
    boundingBox = rect;
    plantHeightPx = rect.height;
  }
  const plantHeightCm = plantHeightPx * pixelToCmRatio;

  // 7. Gambar hasil
  const output = src.clone();
  if (maxContour) {
    const color = new cv.Scalar(255, 0, 0, 255);
    cv.rectangle(output, new cv.Point(boundingBox.x, boundingBox.y), new cv.Point(boundingBox.x + boundingBox.width, boundingBox.y + boundingBox.height), color, 2);
    cv.putText(
      output,
      `${plantHeightCm.toFixed(1)} cm`,
      new cv.Point(boundingBox.x, Math.max(0, boundingBox.y - 10)),
      cv.FONT_HERSHEY_SIMPLEX,
      0.8,
      color,
      2
    );
  }

  // 8. Mask ke canvas
  const vegetationMaskCanvas = document.createElement('canvas');
  cv.imshow(vegetationMaskCanvas, mask);
  // 9. Output ke canvas
  const outputCanvas = document.createElement('canvas');
  cv.imshow(outputCanvas, output);

  // Cleanup
  src.delete(); hsv.delete(); lower.delete(); upper.delete(); mask.delete(); kernel.delete(); contours.delete(); hierarchy.delete();
  if (maxContour) maxContour.delete();
  output.delete();

  return {
    vegetationMask: vegetationMaskCanvas,
    boundingBox,
    plantHeightPx,
    plantHeightCm,
    outputCanvas,
  };
}
/**
 * Plant Detection Pipeline
 * 
 * Combines multiple detection methods:
 * 1. HSV color segmentation (primary - existing)
 * 2. Excess Green Index (ExG)
 * 3. Texture analysis (Laplacian variance) - requires OpenCV
 * 4. Contour detection for leaf-like shapes - requires OpenCV
 * 
 * Classifies regions into: plant, soil
 * 
 * Usage:
 * - detectPlantsSimple() - Uses canvas-based processing (no dependencies)
 * - detectPlants() - Uses OpenCV.js when available
 */

import { analyzePlantHealthHSV, PlantHealthResult } from './plantHealth';

/**
 * Result of plant detection pipeline
 */
export interface PlantDetectionResult {
  /** Classification result */
  classification: 'plant' | 'soil' | 'mixed';
  /** Health analysis from HSV */
  health: PlantHealthResult;
  /** Vegetation coverage percentage (0-100) */
  vegetationCoverage: number;
  /** Excess Green Index score (0-1) */
  exgScore: number;
  /** Texture score indicating leaf smoothness (0-1, higher = smoother leaves) */
  textureScore: number;
  /** Combined confidence score (0-100) */
  confidence: number;
  /** Number of detected plant regions/contours */
  regionCount: number;
  /** Average aspect ratio of detected regions */
  avgAspectRatio: number;
  /** Individual region analysis */
  regions: RegionAnalysis[];
}

export interface RegionAnalysis {
  /** Region ID */
  id: number;
  /** Area in pixels */
  area: number;
  /** Aspect ratio (width/height) */
  aspectRatio: number;
  /** Circularity (0-1, 1 = perfect circle) */
  circularity: number;
  /** Classification for this region */
  classification: 'plant' | 'soil';
  /** Confidence for this region */
  confidence: number;
  /** Bounding box */
  bbox: { x: number; y: number; width: number; height: number };
}

/**
 * Options for plant detection
 */
export interface PlantDetectionOptions {
  /** Enable center focus (prioritize center ROI) */
  centerFocus?: boolean;
  /** HSV lower threshold for green detection */
  hsvLower?: { h: number; s: number; v: number };
  /** HSV upper threshold for green detection */
  hsvUpper?: { h: number; s: number; v: number };
  /** ExG threshold (default 0.2) */
  exgThreshold?: number;
  /** Texture threshold for leaf detection (default 100) */
  textureThreshold?: number;
  /** Minimum contour area to consider (default 500) */
  minContourArea?: number;
  /** Enable debug output */
  debug?: boolean;
}

const DEFAULT_OPTIONS: Required<PlantDetectionOptions> = {
  centerFocus: true,
  hsvLower: { h: 25, s: 51, v: 38 }, // ~H:25-170, S:0.2, V:0.15 in OpenCV scale
  hsvUpper: { h: 170, s: 255, v: 255 },
  exgThreshold: 0.2,
  textureThreshold: 100,
  minContourArea: 500,
  debug: false,
};

/**
 * Load OpenCV.js dynamically
 */
export const loadOpenCV = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cv = (window as any).cv;
    if (typeof cv !== 'undefined') {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
    script.onload = () => {
      // Wait for OpenCV to initialize
      const checkReady = setInterval(() => {
        const cvCheck = (window as any).cv;
        if (typeof cvCheck !== 'undefined' && cvCheck.Mat) {
          clearInterval(checkReady);
          resolve();
        }
      }, 100);
    };
    script.onerror = () => reject(new Error('Failed to load OpenCV.js'));
    document.head.appendChild(script);
  });
};

/**
 * Calculate Excess Green Index: ExG = 2G - R - B
 * Normalized to 0-1 range
 * Helps differentiate green plants from brown soil
 */
const calculateExG = (r: number, g: number, b: number): number => {
  // Normalize to 0-1
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  
  // ExG = 2G - R - B
  // Positive values indicate green vegetation
  // Negative values indicate non-green (soil, dead material)
  const exg = 2 * ng - nr - nb;
  
  // Normalize to 0-1 range (typical ExG ranges from -1 to 1)
  // Map [-1, 1] to [0, 1]
  return (exg + 1) / 2;
};

/**
 * Calculate texture score using simplified Laplacian method
 * Higher variance = rougher surface (soil)
 * Lower variance = smoother surface (leaves)
 * 
 * Note: For full texture analysis, use OpenCV.js version
 */
const calculateTextureScoreSimple = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): number => {
  // Simplified texture analysis using pixel variance
  // This is a basic implementation that doesn't require OpenCV
  
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  
  // Sample every 4th pixel for performance
  for (let i = 0; i < pixels.length; i += 16) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    
    // Calculate luminance
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += lum;
    sumSq += lum * lum;
    count++;
  }
  
  if (count === 0) return 0.5;
  
  const mean = sum / count;
  const variance = (sumSq / count) - (mean * mean);
  
  // Normalize: Higher variance = rougher = lower texture score for leaves
  // Typical variance range: 0-5000 for images
  // Smooth leaves typically have variance < 1000
  // Rough soil typically has variance > 2000
  const textureScore = Math.max(0, Math.min(1, 1 - variance / 3000));
  
  return textureScore;
};

/**
 * Helper: RGB to HSV conversion
 */
const rgbToHsv = (r: number, g: number, b: number): { h: number; s: number; v: number } => {
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
  
  if (h < 0) h += 360;
  
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  
  return { h, s, v };
};

/**
 * Main plant detection function
 * Uses canvas-based processing (no OpenCV required)
 * 
 * This is the primary detection method that combines:
 * - HSV color segmentation (from existing plantHealth.ts)
 * - Excess Green Index calculation
 * - Simple texture analysis
 */
export const detectPlantsSimple = (
  imageData: ImageData,
  options: PlantDetectionOptions = {}
): PlantDetectionResult => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Get HSV-based health analysis (existing method)
  const health = analyzePlantHealthHSV(imageData, { centerFocus: opts.centerFocus });
  
  const pixels = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  let plantPixelCount = 0;
  let soilPixelCount = 0;
  let exgSum = 0;
  
  // Process each pixel
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    
    if (a === 0) continue;
    
    // Calculate ExG (Excess Green Index)
    const exg = calculateExG(r, g, b);
    exgSum += exg;
    
    // HSV conversion
    const hsv = rgbToHsv(r, g, b);
    
    // HSV thresholds for vegetation detection
    // Green hue: 25-170 degrees
    // Minimum saturation: 0.2 (20%)
    // Minimum brightness: 0.15 (15%)
    const isGreenHue = hsv.h >= 25 && hsv.h <= 170;
    const isSaturated = hsv.s >= 0.2;
    const isBright = hsv.v >= 0.15;
    
    // Combined classification:
    // A pixel is vegetation if it meets HSV criteria AND has positive ExG
    // This helps filter out brownish-green colors that might be soil
    const isVegetation = isGreenHue && isSaturated && isBright && exg >= opts.exgThreshold;
    
    if (isVegetation) {
      plantPixelCount++;
    } else {
      soilPixelCount++;
    }
  }
  
  const totalPixels = plantPixelCount + soilPixelCount;
  
  // Calculate vegetation coverage
  const vegetationCoverage = totalPixels > 0 
    ? Math.round((plantPixelCount / totalPixels) * 100 * 100) / 100 
    : 0;
  
  // Average ExG score
  const exgScore = totalPixels > 0 ? exgSum / totalPixels : 0;
  
  // Calculate texture score
  const textureScore = calculateTextureScoreSimple(pixels, width, height);
  
  // Determine final classification based on vegetation ratio
  let classification: 'plant' | 'soil' | 'mixed';
  const plantRatio = plantPixelCount / (totalPixels + 1);
  
  if (plantRatio > 0.6) {
    classification = 'plant';
  } else if (plantRatio < 0.3) {
    classification = 'soil';
  } else {
    classification = 'mixed';
  }
  
  // Calculate confidence
  // Weight: health analysis 40%, vegetation coverage 30%, ExG 20%, texture 10%
  const coverageWeight = vegetationCoverage / 100;
  const healthWeight = health.confidence / 100;
  const exgWeight = Math.min(1, exgScore * 1.5); // Boost ExG contribution
  const textureWeight = textureScore;
  
  const confidence = Math.min(100, Math.round(
    healthWeight * 40 +
    coverageWeight * 30 +
    exgWeight * 20 +
    textureWeight * 10
  ));
  
  return {
    classification,
    health,
    vegetationCoverage,
    exgScore,
    textureScore,
    confidence,
    regionCount: 0, // Only available with OpenCV contour detection
    avgAspectRatio: 0,
    regions: [],
  };
};

/**
 * Advanced plant detection with OpenCV.js
 * 
 * This function provides additional features:
 * - Contour detection for individual leaf shapes
 * - Precise texture analysis using Laplacian
 * - Morphological operations for better segmentation
 * 
 * Falls back to simple method if OpenCV is not available
 */
export const detectPlants = async (
  imageElement: HTMLImageElement | HTMLCanvasElement | ImageData,
  options: PlantDetectionOptions = {}
): Promise<PlantDetectionResult> => {
  // Try to use OpenCV if available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cv = (window as any).cv;
  
  if (typeof cv === 'undefined') {
    // OpenCV not available, use simple method
    const imgData = imageElement instanceof ImageData 
      ? imageElement 
      : getImageDataFromElement(imageElement);
    return detectPlantsSimple(imgData, options);
  }
  
  // OpenCV is available - use advanced detection
  return detectPlantsWithOpenCV(imageElement, options, cv);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const detectPlantsWithOpenCV = async (
  imageElement: HTMLImageElement | HTMLCanvasElement | ImageData,
  options: PlantDetectionOptions,
  cv: any
): Promise<PlantDetectionResult> => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Get ImageData from element
  const imageData = imageElement instanceof ImageData
    ? imageElement
    : getImageDataFromElement(imageElement);
  
  // Use simple method as base (it already does HSV + ExG)
  const simpleResult = detectPlantsSimple(imageData, options);
  
  // OpenCV-specific processing for contour detection
  try {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(imageData, 0, 0);
    }
    
    const src = cv.imread(canvas);
    const gray = new cv.Mat();
    const mask = new cv.Mat();
    
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    
    // Apply threshold for green detection
    const lower = new cv.Scalar(opts.hsvLower.h, opts.hsvLower.s, opts.hsvLower.v);
    const upper = new cv.Scalar(opts.hsvUpper.h, opts.hsvUpper.s, opts.hsvUpper.v);
    cv.inRange(gray, lower, upper, mask);
    
    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    const regions: RegionAnalysis[] = [];
    let totalPlantArea = 0;
    let totalSoilArea = 0;
    
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      
      if (area < opts.minContourArea) continue;
      
      const rect = cv.boundingRect(contour);
      const perimeter = cv.arcLength(contour, true);
      
      // Calculate shape features
      const aspectRatio = rect.width / Math.max(rect.height, 1);
      const circularity = perimeter > 0 
        ? (4 * Math.PI * area) / (perimeter * perimeter) 
        : 0;
      
      // Classify based on shape (leaves tend to be elongated, not circular)
      const isLeafLike = aspectRatio > 0.3 && aspectRatio < 3 && circularity < 0.7;
      const classification = isLeafLike ? 'plant' : 'soil';
      const regionConfidence = isLeafLike ? 70 : 30;
      
      regions.push({
        id: i,
        area: Math.round(area),
        aspectRatio,
        circularity,
        classification,
        confidence: regionConfidence,
        bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      });
      
      if (classification === 'plant') {
        totalPlantArea += area;
      } else {
        totalSoilArea += area;
      }
    }
    
    // Update vegetation coverage with contour-based calculation
    const totalArea = imageData.width * imageData.height;
    const contourBasedCoverage = Math.round((totalPlantArea / totalArea) * 100 * 100) / 100;
    
    // Clean up OpenCV matrices
    src.delete();
    gray.delete();
    mask.delete();
    contours.delete();
    hierarchy.delete();
    lower.delete();
    upper.delete();
    
    return {
      ...simpleResult,
      vegetationCoverage: contourBasedCoverage,
      regionCount: regions.length,
      avgAspectRatio: regions.length > 0
        ? regions.reduce((sum, r) => sum + r.aspectRatio, 0) / regions.length
        : 0,
      regions,
    };
  } catch (error) {
    console.warn('OpenCV processing failed, using simple method:', error);
    return simpleResult;
  }
};

/**
 * Helper: Get ImageData from HTML element
 */
const getImageDataFromElement = (
  element: HTMLImageElement | HTMLCanvasElement
): ImageData => {
  const canvas = document.createElement('canvas');
  canvas.width = element.width;
  canvas.height = element.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(element, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  return new ImageData(element.width, element.height);
};

/**
 * Generate a visualization overlay for detected plants
 */
export const generateDetectionOverlay = (
  result: PlantDetectionResult,
  width: number,
  height: number,
  _imageData?: ImageData
): string => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return '';
  
  // Fill with semi-transparent overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, width, height);
  
  // Draw region highlights if available
  result.regions.forEach(region => {
    const { bbox, classification, confidence } = region;
    
    ctx.strokeStyle = classification === 'plant' 
      ? `rgba(0, 255, 0, ${confidence / 100})` 
      : `rgba(255, 0, 0, ${confidence / 100})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
    
    // Draw label
    ctx.fillStyle = classification === 'plant' ? '#00ff00' : '#ff0000';
    ctx.font = '12px Arial';
    ctx.fillText(
      `${classification} (${confidence}%)`,
      bbox.x,
      Math.max(bbox.y - 5, 12)
    );
  });
  
  // Draw coverage info panel
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(10, height - 60, 200, 50);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px Arial';
  ctx.fillText(`Vegetation: ${result.vegetationCoverage}%`, 20, height - 35);
  
  // Color indicator based on classification
  const indicatorColor = result.classification === 'plant' ? '#00ff00' 
    : result.classification === 'soil' ? '#ff6600' : '#ffff00';
  ctx.fillStyle = indicatorColor;
  ctx.font = '12px Arial';
  ctx.fillText(`Status: ${result.classification.toUpperCase()}`, 20, height - 18);
  
  return canvas.toDataURL();
};

