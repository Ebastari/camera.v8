
import { PlantEntry } from '../types';

export interface UploadResult {
  ok: boolean;
  confirmed: boolean;
  message: string;
  warning?: string;
}

const MAX_APPS_SCRIPT_BODY_BYTES = 5_000_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isLikelyAppsScriptUrl = (url: string): boolean => {
  const clean = url.trim();
  return /^https:\/\/script\.google\.com\//i.test(clean) && /\/exec(?:[/?#].*)?$/i.test(clean);
};

const normalizeUrl = (url: string): string => url.trim();

const normalizeBase64 = (value: string): string => {
  const trimmed = value.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!trimmed) {
    return '';
  }

  const remainder = trimmed.length % 4;
  if (remainder === 0) {
    return trimmed;
  }

  return `${trimmed}${'='.repeat(4 - remainder)}`;
};

const extractRawBase64 = (value: string): string => {
  if (!value) {
    return '';
  }

  const clean = value.trim();
  const commaIndex = clean.indexOf(',');
  const raw = commaIndex >= 0 ? clean.slice(commaIndex + 1) : clean;
  return normalizeBase64(raw);
};

const isValidBase64Payload = (value: string): boolean => {
  if (!value) {
    return false;
  }

  if (!/^[A-Za-z0-9+/]+=*$/.test(value)) {
    return false;
  }

  try {
    atob(value);
    return true;
  } catch {
    return false;
  }
};

const getUtf8ByteLength = (value: string): number => {
  try {
    return new TextEncoder().encode(value).length;
  } catch {
    return value.length;
  }
};

const extractDriveFileId = (linkDrive: string): string => {
  const value = String(linkDrive || '').trim();
  if (!value) {
    return '';
  }

  const patterns = [/\/d\/([^/]+)/i, /[?&]id=([^&]+)/i];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return '';
};

const buildPoopHtml = (linkDrive: string): string => {
  const value = String(linkDrive || '').trim();
  if (!value) {
    return '';
  }

  return `<a href="${value}" target="_blank" rel="noopener noreferrer">Buka Foto</a>`;
};

const isEntryPersistedInCloud = async (url: string, entryId: string): Promise<boolean> => {
  const cleanUrl = normalizeUrl(url);
  const separator = cleanUrl.includes('?') ? '&' : '?';
  const listUrl = `${cleanUrl}${separator}action=list&limit=100&offset=0&order=desc`;

  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      await sleep(1000 * attempt);
    }

    try {
      const response = await fetch(listUrl, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
      });

      if (!response.ok) {
        continue;
      }

      const result = await response.json();
      const rows = Array.isArray(result?.data)
        ? result.data
        : Array.isArray(result)
          ? result
          : [];
      const found = rows.some((row: any) => String(row?.ID || '').trim() === entryId);
      if (found) {
        return true;
      }
    } catch {
      // Abaikan kegagalan probe verifikasi, lanjut retry singkat.
    }
  }

  return false;
};

const verifyPersistedAfterCorsResponse = async (url: string, entryId: string): Promise<UploadResult> => {
  const verified = await isEntryPersistedInCloud(url, entryId);
  if (verified) {
    return {
      ok: true,
      confirmed: true,
      message: 'Data tersimpan dan terverifikasi lewat pengecekan list terbaru.',
    };
  }

  return {
    ok: true,
    confirmed: false,
    message: 'Respons server diterima, tetapi ID belum ditemukan di spreadsheet. Data tetap di antrian retry.',
  };
};

export const uploadToAppsScript = async (url: string, entry: PlantEntry): Promise<UploadResult> => {
  const cleanUrl = normalizeUrl(url);
  if (!cleanUrl) {
    return {
      ok: false,
      confirmed: false,
      message: 'URL Apps Script kosong.',
    };
  }

  if (!isLikelyAppsScriptUrl(cleanUrl)) {
    return {
      ok: false,
      confirmed: false,
      message: 'URL Apps Script tidak valid. Gunakan URL Web App script.google.com dengan endpoint /exec.',
    };
  }

  // Mengonversi titik ke koma untuk koordinat X dan Y sesuai format laporan di snippet
  const formatCoord = (num: number) => (Number.isFinite(num) ? num.toString().replace('.', ',') : '');

  const buildCoordText = (lat: number, lon: number): string => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return '';
    }
    return `${lat.toFixed(6)},${lon.toFixed(6)}`;
  };

  const safeX = Number.isFinite(entry.x) ? entry.x : NaN;
  const safeY = Number.isFinite(entry.y) ? entry.y : NaN;
  const safeCoordText = buildCoordText(safeX, safeY);
  const originalCoordText = String(entry.rawKoordinat || '').trim() || safeCoordText;
  const revisedRawText = String(entry.revisedKoordinat || '').trim();
  const revisedCoordText = entry.snappedToGrid && revisedRawText ? revisedRawText : '';
  const mainCoordText = revisedCoordText || originalCoordText;
  const linkDrive = String(entry.linkDrive || '').trim();
  const fileName = `Gambar Montana (${entry.id}).jpg`;
  const pathName = `Montana V2_Images/${fileName}`;
  const fileId = extractDriveFileId(linkDrive);
  const poopHtml = buildPoopHtml(linkDrive);

  const rawBase64 = extractRawBase64(entry.foto || '');

  if (entry.foto && !rawBase64) {
    return {
      ok: false,
      confirmed: false,
      message: 'Format foto tidak valid. Data URL gambar kosong atau rusak.',
    };
  }

  if (rawBase64 && !isValidBase64Payload(rawBase64)) {
    return {
      ok: false,
      confirmed: false,
      message: 'Format Base64 foto tidak valid sebelum dikirim ke Apps Script.',
    };
  }

  /**
   * Payload diperkecil agar upload foto real tidak mudah melewati batas ukuran Apps Script.
   * Script server V5 sudah mendukung RawBase64 sebagai sumber utama file gambar.
   */
  const payload = {
    "ID": entry.id,
    "Tanggal": entry.tanggal,
    "Lokasi": entry.lokasi?.includes('NaN') ? safeCoordText : entry.lokasi,
    "Pekerjaan": entry.pekerjaan || "",
    "Tinggi": entry.tinggi,
    "Koordinat": mainCoordText.includes('NaN') ? safeCoordText : mainCoordText,
    "Y": formatCoord(safeY), // Longitude
    "X": formatCoord(safeX), // Latitude
    "Tanaman": entry.tanaman,
    "Tahun Tanam": entry.tahunTanam,
    "Pengawas": entry.pengawas,
    "Vendor": entry.vendor,
    "Link Drive": linkDrive,
    "No Pohon": entry.noPohon,
    "Kesehatan": entry.kesehatan,
    "poop": poopHtml,
    "Status_Duplikat": entry.statusDuplikat || "UNIK",
    "Eco_BiomassaKg": '',
    "Eco_KarbonKgC": '',
    "Koordinat_Asli": originalCoordText,
    "Koordinat_Revisi": revisedCoordText,
    "AI_Kesehatan": entry.aiKesehatan || '',
    "AI_Confidence": Number.isFinite(entry.aiConfidence as number) ? Number(entry.aiConfidence).toFixed(2) : '',
    "AI_Deskripsi": entry.aiDeskripsi || '',
    "HCV_Input": Number.isFinite(entry.hcvInput as number) ? Number(entry.hcvInput).toFixed(2) : '',
    "Eco_UpdatedAt": '',
    "Path": pathName,
    "Gambar": pathName,
    "Tim": entry.tim || '',
    "Gambar_Nama_File": fileName,
    "FileID": fileId,
    "HCV_Deskripsi": entry.hcvDescription || '',
    "Description": entry.description || "",
    "GPS_Quality": entry.gpsQualityAtCapture || 'Tidak Tersedia',
    "GPS_Accuracy_M": Number.isFinite(entry.gpsAccuracyAtCapture) ? Number(entry.gpsAccuracyAtCapture).toFixed(1) : '',
    "Status_Verifikasi": entry.statusVerifikasi || "",
    "Eco_JarakTerdekatM": '',
    "Eco_KepadatanHa": '',
    "Eco_CCI": '',
    "Eco_JarakRata2M": '',
    "Eco_AreaHa": '',
    "Eco_SesuaiJarak": '',
    "Eco_CCI_Grade": '',
    "Eco_JarakStdM": '',
    "Eco_KesesuaianJarakPct": '',
    "Eco_GpsMedianM": '',
    "Snapped_To_Grid": entry.snappedToGrid ? '1' : '0',
    // Hindari mengirim Base64 dua kali karena membuat request membengkak.
    "Base64": '',
    "RawBase64": rawBase64
  };

  const requestBody = JSON.stringify(payload);
  const requestBodyBytes = getUtf8ByteLength(requestBody);
  if (requestBodyBytes > MAX_APPS_SCRIPT_BODY_BYTES) {
    const sizeMb = (requestBodyBytes / (1024 * 1024)).toFixed(2);
    return {
      ok: false,
      confirmed: false,
      message: `Ukuran payload ${sizeMb} MB terlalu besar untuk Apps Script. Foto perlu diperkecil sebelum dikirim ke Drive.`,
    };
  }

  // 1) Coba kirim dengan CORS agar status sukses/error bisa diverifikasi dari JSON Apps Script.
  try {
    const corsResponse = await fetch(cleanUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: requestBody,
    });

    if (!corsResponse.ok) {
      const responsePreview = await corsResponse.text().catch(() => '');
      const compactPreview = responsePreview.replace(/\s+/g, ' ').trim().slice(0, 180);
      return {
        ok: false,
        confirmed: true,
        message: compactPreview
          ? `HTTP ${corsResponse.status} saat sinkronisasi. Respons: ${compactPreview}`
          : `HTTP ${corsResponse.status} saat sinkronisasi.`,
      };
    }

    let result: any = null;
    try {
      result = await corsResponse.json();
    } catch {
      return verifyPersistedAfterCorsResponse(cleanUrl, entry.id);
    }

    if (result && result.status === 'error') {
      return {
        ok: false,
        confirmed: true,
        message: result.message || 'Apps Script mengembalikan status error.',
      };
    }

    if (!result || (result.status && result.status !== 'success')) {
      return verifyPersistedAfterCorsResponse(cleanUrl, entry.id);
    }

    const driveWarningMessage = String(result?.driveMessage || '').trim();
    const driveWarning = rawBase64 && String(result?.url || '').trim() === ''
      ? (driveWarningMessage || 'Data cloud tersimpan, tetapi foto belum berhasil dibuat di Google Drive.')
      : undefined;

    return {
      ok: true,
      confirmed: true,
      message: result?.message || 'Upload berhasil.',
      warning: driveWarning,
    };
  } catch {
    // 2) Fallback no-cors untuk deployment Apps Script yang tidak membuka CORS.
    // Setelah kirim no-cors, coba verifikasi via endpoint list terbaru.
    try {
      await fetch(cleanUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: requestBody,
      });

      const verified = await isEntryPersistedInCloud(cleanUrl, entry.id);
      if (verified) {
        return {
          ok: true,
          confirmed: true,
          message: 'Data tersimpan dan terverifikasi lewat pengecekan list terbaru.',
        };
      }

      return {
        ok: true,
        confirmed: false,
        message: 'Permintaan no-cors terkirim, namun verifikasi ID belum ditemukan.',
      };
    } catch (error) {
      return {
        ok: false,
        confirmed: false,
        message:
          error instanceof Error ? error.message : 'Gagal mengirim data ke Apps Script.',
      };
    }
  }
};
