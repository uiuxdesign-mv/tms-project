'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

type ToastEntry = {
  id: number;
  type: ToastType;
  message: string;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'border-green-200 bg-green-50 text-green-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-gray-200 bg-white text-gray-800',
};

const TYPE_ICON: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

const AUTO_DISMISS_MS: Record<ToastType, number> = {
  success: 4000,
  error: 6000,
  info: 4500,
};

/**
 * Sistem toast global (Fase 10) — pengganti alert() browser native, yang blocking dan tidak
 * konsisten gayanya dengan UI aplikasi. Dipasang sekali di root layout, dipakai lewat useToast()
 * dari komponen manapun (client component).
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  const push = useCallback((type: ToastType, message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS[type]);
  }, []);

  const api: ToastApi = {
    success: useCallback((message: string) => push('success', message), [push]),
    error: useCallback((message: string) => push('error', message), [push]),
    info: useCallback((message: string) => push('info', message), [push]),
  };

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-2 rounded-md border px-4 py-3 text-sm shadow-md ${TYPE_STYLES[t.type]}`}
          >
            <span className="mt-0.5">{TYPE_ICON[t.type]}</span>
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-1 text-xs text-current opacity-60 hover:opacity-100"
              aria-label="Tutup notifikasi"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() harus dipakai di dalam <ToastProvider>.');
  return ctx;
}
