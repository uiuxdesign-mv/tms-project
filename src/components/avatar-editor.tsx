'use client';

import { useCallback, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';

const OUTPUT_SIZE = 320; // ukuran output foto profil persegi, cukup tajam untuk avatar 40-80px.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar.'));
    img.src = src;
  });
}

async function cropImageToBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak didukung browser ini.');
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gagal memproses gambar.'))), 'image/jpeg', 0.92);
  });
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif';

export type AvatarEditorProps = {
  /** Label di atas field. Kosongkan untuk menyembunyikan label (dipakai saat sudah ada judul section sendiri). */
  label?: string | null;
  /** URL foto yang sedang aktif (foto lama dari server, ATAU blob URL hasil crop baru). */
  previewUrl: string | null;
  /** Huruf awal nama, ditampilkan sebagai fallback kalau belum ada foto sama sekali. */
  fallbackInitial?: string;
  /** Dipanggil setelah user selesai crop & klik "Terapkan" — file siap diupload + url utk preview lokal. */
  onFileReady: (file: File, previewUrl: string) => void;
  /** Dipanggil saat user klik "Hapus Foto". */
  onRemove: () => void;
  /** Tampilkan tombol "Hapus Foto" (biasanya: ada foto aktif, baik lama maupun baru dipilih). */
  canRemove: boolean;
  error?: string;
  disabled?: boolean;
};

/**
 * Fase 17 (permintaan user): widget upload foto profil dengan penyesuaian posisi & crop, dipakai
 * bersama oleh Master User (Add/Edit User) dan self-service Profile Saya — sebelumnya Add/Edit
 * User cuma punya file input polos tanpa crop, dan Profile Saya sama sekali tidak punya upload
 * foto. Crop dilakukan di client (canvas), hasilnya file JPEG persegi baru yang dikirim ke server
 * menggantikan file asli — server tetap validasi ulang ukuran/jenis file seperti biasa.
 */
export default function AvatarEditor({
  label = 'Foto Profil',
  previewUrl,
  fallbackInitial,
  onFileReady,
  onRemove,
  canRemove,
  error,
  disabled,
}: AvatarEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  function handlePickFile(file: File | null) {
    if (!file) return;
    setCropError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    };
    reader.onerror = () => setCropError('Gagal membaca file gambar.');
    reader.readAsDataURL(file);
  }

  const handleCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  function closeCropModal() {
    setRawImageSrc(null);
    setCropError(null);
  }

  async function handleConfirmCrop() {
    if (!rawImageSrc || !croppedAreaPixels) return;
    setProcessing(true);
    setCropError(null);
    try {
      const blob = await cropImageToBlob(rawImageSrc, croppedAreaPixels);
      const file = new File([blob], 'foto-profil.jpg', { type: 'image/jpeg' });
      onFileReady(file, URL.createObjectURL(blob));
      closeCropModal();
    } catch (e) {
      setCropError(e instanceof Error ? e.message : 'Gagal memproses gambar.');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div>
      {label && <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>}
      <div className="flex items-center gap-3">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Preview foto profil" className="h-14 w-14 shrink-0 rounded-full object-cover" />
        ) : fallbackInitial ? (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-lg font-medium text-indigo-700">
            {fallbackInitial}
          </span>
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </span>
        )}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              {previewUrl ? 'Ganti Foto' : 'Pilih Foto'}
            </button>
            {canRemove && (
              <button
                type="button"
                disabled={disabled}
                onClick={onRemove}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Hapus Foto
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              e.target.value = '';
              handlePickFile(file);
            }}
          />
          <p className="mt-1 text-xs text-gray-400">JPG, PNG, GIF, atau WEBP. Maks 2MB.</p>
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {rawImageSrc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
            <div className="shrink-0 border-b border-gray-200 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">Atur Posisi &amp; Crop Foto</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Geser foto untuk mengatur posisi, gunakan slider untuk memperbesar/memperkecil.
              </p>
            </div>
            <div className="relative h-72 w-full shrink-0 bg-gray-900">
              <Cropper
                image={rawImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            </div>
            <div className="shrink-0 space-y-3 border-t border-gray-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-indigo-600"
                />
              </div>
              {cropError && <p className="text-xs text-red-600">{cropError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCropModal}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={processing || !croppedAreaPixels}
                  onClick={handleConfirmCrop}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {processing ? 'Memproses...' : 'Terapkan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
