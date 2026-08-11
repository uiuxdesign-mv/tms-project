'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'tms-theme';

type ThemeApi = { theme: Theme; toggleTheme: () => void };

const ThemeContext = createContext<ThemeApi | null>(null);

/**
 * Inline script (Fase 10) yang dirender di <head>, dieksekusi SEBELUM React hydrate — mencegah
 * "flash of wrong theme" (sekilas tampil terang lalu berkedip ke gelap) dengan langsung
 * menambahkan class `dark` ke <html> berdasarkan preferensi tersimpan di localStorage, sebelum
 * body sempat ter-render sama sekali.
 */
export function ThemeInitScript() {
  const code = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  // Sinkronkan state React dengan class yang sudah di-set oleh ThemeInitScript (dieksekusi lebih
  // dulu), supaya tombol toggle langsung menampilkan status yang benar tanpa perlu klik dulu.
  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // localStorage bisa gagal (mis. mode privat browser) — tema tetap berfungsi untuk sesi ini,
        // cuma tidak tersimpan untuk kunjungan berikutnya.
      }
      return next;
    });
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() harus dipakai di dalam <ThemeProvider>.');
  return ctx;
}
