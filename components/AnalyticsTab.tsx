
import React, { useState, useEffect, useMemo } from 'react';
import { PlantEntry } from '../types';
import { AnalyticsPanel } from './AnalyticsPanel';
import { fetchCloudDataSmart } from '../services/fetchService';

interface AnalyticsTabProps {
  entries: PlantEntry[];
  appsScriptUrl: string;
  isOnline: boolean;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ entries, appsScriptUrl, isOnline }) => {
  const [cloudData, setCloudData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cloudSource, setCloudSource] = useState<'network' | 'cache'>('network');
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const loadCloudData = async () => {
    if (!appsScriptUrl || appsScriptUrl.includes('/s/.../exec')) return;

    setLoading(true);
    try {
      const result = await fetchCloudDataSmart(appsScriptUrl);
      setCloudData(Array.isArray(result.data) ? result.data : []);
      setCloudSource(result.source);
      setCachedAt(result.cachedAt || null);
    } catch (err) {
      console.error("Gagal sinkronisasi analitik cloud:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCloudData();
  }, [appsScriptUrl, isOnline]);

  // Gabungkan data lokal dan cloud, hindari duplikat berdasarkan ID
  const mergedData = useMemo(() => {
    const map = new Map();
    
    // Masukkan data cloud dulu
    cloudData.forEach(item => {
      if (!item || !item.ID) return;

      // Parsing Koordinat dengan aman (menangani jika data sudah berupa number dari Apps Script)
      let lat = 0;
      let lon = 0;
      let hasGps = false;

      if (item.X !== undefined && item.X !== null && item.Y !== undefined && item.Y !== null) {
        const xStr = String(item.X).replace(',', '.');
        const yStr = String(item.Y).replace(',', '.');
        lat = parseFloat(xStr);
        lon = parseFloat(yStr);
        if (!isNaN(lat) && !isNaN(lon)) {
          hasGps = true;
        }
      }

      const entry: Partial<PlantEntry> = {
        id: String(item.ID),
        noPohon: parseInt(item["No Pohon"]) || 0,
        tanaman: item.Tanaman || 'Unknown',
        tinggi: parseFloat(String(item.Tinggi).replace(',', '.')) || 0,
        kesehatan: (item.Kesehatan || 'Sehat') as any,
        pengawas: item.Pengawas || 'N/A',
        tanggal: item.Tanggal || '-',
        foto: item["Link Drive"] || '', // Gunakan link drive untuk cloud
        gps: hasGps ? { lat, lon, accuracy: 0 } : undefined
      };
      map.set(String(item.ID), entry);
    });

    // Masukkan/Timpa dengan data lokal (lebih fresh)
    entries.forEach(entry => {
      map.set(String(entry.id), entry);
    });

    return Array.from(map.values()) as PlantEntry[];
  }, [cloudData, entries]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-2">
          {loading && <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            {loading ? 'Menyinkronkan Cloud...' : `Total Terdeteksi: ${mergedData.length} Titik`}
          </span>
          {!loading && cloudSource === 'cache' && (
            <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-1 rounded-full">
              CACHE OFFLINE
            </span>
          )}
        </div>
        <button 
          onClick={loadCloudData}
          className="text-[9px] font-black text-blue-600 uppercase tracking-tighter bg-blue-50 px-3 py-1 rounded-full active:scale-95 transition-all"
        >
          Refresh Data
        </button>
      </div>

      {!loading && cloudSource === 'cache' && cachedAt && (
        <div className="px-1">
          <p className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Menampilkan cache cloud terakhir ({new Date(cachedAt).toLocaleString('id-ID')}).
          </p>
        </div>
      )}
      
      <AnalyticsPanel entries={mergedData} />
    </div>
  );
};
