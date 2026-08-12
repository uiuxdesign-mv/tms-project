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

const TYPE_BORDER: Record<ToastType, string> = {
  success: 'border-emerald-500/30',
  error: 'border-red-500/30',
  info: 'border-blue-500/30',
};

const TYPE_DOT: Record<ToastType, string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
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
      <div className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={`animate-toast-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-popover ${TYPE_BORDER[t.type]}`}
          >
            <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${TYPE_DOT[t.type]}`} />
            <p className="flex-1 text-sm text-gray-900">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-gray-400 hover:text-gray-500" aria-label="Tutup notifikasi">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
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
