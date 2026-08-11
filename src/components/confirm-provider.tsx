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
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            {pending.title && <h2 className="mb-2 text-base font-semibold text-gray-900">{pending.title}</h2>}
            <p className="text-sm text-gray-700">{pending.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => respond(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                {pending.cancelLabel || 'Batal'}
              </button>
              <button
                onClick={() => respond(true)}
                className={`rounded-md px-3 py-1.5 text-sm text-white ${
                  pending.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-800'
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
