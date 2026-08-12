'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tombol konfirmasi dibuat merah (destructive) — dipakai untuk aksi Hapus. */
  danger?: boolean;
};

type ConfirmApi = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmApi | null>(null);

type PendingConfirm = ConfirmOptions & { resolve: (value: boolean) => void };

/**
 * Modal konfirmasi global (Fase 10) — pengganti confirm() browser native, yang blocking dan tidak
 * bisa distyle. Dipasang sekali di root layout, dipakai lewat useConfirm() — mengembalikan Promise
 * yang resolve `true`/`false` sesuai pilihan user, jadi kode pemanggil tinggal
 * `if (!(await confirmDialog('Hapus data ini?'))) return;` — pola yang sama persis dengan
 * `if (!confirm(...)) return;` sebelumnya, cuma ditambah `await`.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirmFn = useCallback<ConfirmApi>((options) => {
    const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPending({ ...opts, resolve });
    });
  }, []);

  function respond(value: boolean) {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirmFn}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => respond(false)} />
          <div className="relative flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-modal">
            <div className="shrink-0 border-b border-gray-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{pending.title || 'Konfirmasi'}</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-sm text-gray-500">{pending.message}</p>
            </div>
            <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 px-5 py-4">
              <button
                onClick={() => respond(false)}
                className="focus-ring rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200"
              >
                {pending.cancelLabel || 'Batal'}
              </button>
              <button
                onClick={() => respond(true)}
                className={`focus-ring rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  pending.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {pending.confirmLabel || 'Ya'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmApi {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm() harus dipakai di dalam <ConfirmProvider>.');
  return ctx;
}
