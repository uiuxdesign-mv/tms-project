'use client';

import { useState } from 'react';
import { TableSearchBox } from '@/components/table-controls';
import { useLanguage } from '@/components/language-provider';

type Option = { value: string; label: string };

/**
 * Search box + tombol filter (Status/Priority/Assignee) + dropdown Reset/Apply — dipakai bersama
 * oleh List, Kanban, dan Calendar (permintaan user) supaya ketiga view Task punya kemampuan filter
 * yang SAMA PERSIS, bukan cuma di List seperti sebelumnya. Sebelumnya blok ini cuma ada sebagai
 * JSX inline di `tasks-table.tsx` (List) — sekarang diekstrak jadi satu komponen supaya
 * perilakunya (termasuk state "draft" & tombol Reset/Apply) konsisten di ketiga tempat dan tidak
 * perlu dijaga triple lipat kalau nanti berubah lagi.
 *
 * Filter TIDAK langsung diterapkan tiap dropdown diganti — pilihan ditampung dulu di state
 * "draft" internal komponen ini, baru benar-benar diterapkan (lewat `onApply`) saat tombol
 * "Apply" ditekan. "Reset" mengosongkan draft SEKALIGUS filter yang sedang aktif di parent.
 *
 * Komponen ini HANYA me-render baris search+filter-nya saja (bukan card pembungkusnya) — supaya
 * List (yang butuh baris ini menyatu dengan card tabel di bawahnya, dipisah `border-b`) dan
 * Kanban/Calendar (yang butuh baris ini berdiri sendiri dalam card-nya sendiri) bisa membungkusnya
 * dengan container yang sesuai masing-masing lewat prop `className`.
 */
export default function TaskFilterBar({
  search,
  onSearchChange,
  statuses,
  priorities,
  assignees,
  filterStatus,
  filterPriority,
  filterAssignee,
  onApply,
  onReset,
  className,
  rightSlot,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  statuses: Option[];
  priorities: Option[];
  assignees: Option[];
  filterStatus: string;
  filterPriority: string;
  filterAssignee: string;
  onApply: (next: { status: string; priority: string; assignee: string }) => void;
  onReset: () => void;
  /** Class tambahan untuk baris pembungkus (mis. `border-b border-gray-200 p-4` di List, cukup
   *  `p-4` di Kanban/Calendar). */
  className?: string;
  /** Perbaikan (permintaan user Round 6, poin 2): slot untuk konten tambahan yang didorong ke
   *  paling kanan baris ini (lewat `ml-auto`) — dipakai untuk menempatkan switcher tab
   *  List/Kanban/Calendar (`TasksViewSwitcher`) sejajar dengan search & filter, bukan lagi di
   *  header terpisah di atasnya. */
  rightSlot?: React.ReactNode;
}) {
  const { t } = useLanguage();
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState('');
  const [draftPriority, setDraftPriority] = useState('');
  const [draftAssignee, setDraftAssignee] = useState('');
  const activeFilterCount = [filterStatus, filterPriority, filterAssignee].filter(Boolean).length;

  function openFilterDropdown() {
    // Sinkronkan draft dengan filter yang SEDANG aktif tiap kali dropdown dibuka — supaya kalau
    // sebelumnya ditutup tanpa menekan Apply, draft tidak menyisakan pilihan yang belum diterapkan.
    setDraftStatus(filterStatus);
    setDraftPriority(filterPriority);
    setDraftAssignee(filterAssignee);
    setFilterOpen((v) => !v);
  }

  function applyFilters() {
    onApply({ status: draftStatus, priority: draftPriority, assignee: draftAssignee });
    setFilterOpen(false);
  }

  function resetFilters() {
    setDraftStatus('');
    setDraftPriority('');
    setDraftAssignee('');
    onReset();
    setFilterOpen(false);
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className || ''}`}>
      <TableSearchBox value={search} onChange={onSearchChange} placeholder={t('filter_search_placeholder')} />
      <div className="relative">
        <button
          type="button"
          onClick={openFilterDropdown}
          className={`relative flex h-[34px] w-[38px] items-center justify-center rounded-lg border transition-colors ${
            activeFilterCount > 0 ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
          }`}
          title={t('filter_title')}
          aria-label={t('filter_title')}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6 9.75h12M10.5 15h3" />
          </svg>
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-medium text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
        {filterOpen && (
          <div className="absolute left-0 z-20 mt-2 w-64 space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-popover">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">{t('filter_label_status')}</label>
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value)}
                className="select-field-sm w-full appearance-none rounded-lg border border-gray-300 bg-white py-1.5 pl-2.5 pr-7 text-sm text-gray-900 focus-ring"
              >
                <option value="">{t('filter_option_all_status')}</option>
                {statuses.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">{t('filter_label_priority')}</label>
              <select
                value={draftPriority}
                onChange={(e) => setDraftPriority(e.target.value)}
                className="select-field-sm w-full appearance-none rounded-lg border border-gray-300 bg-white py-1.5 pl-2.5 pr-7 text-sm text-gray-900 focus-ring"
              >
                <option value="">{t('filter_option_all_priority')}</option>
                {priorities.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">{t('filter_label_assignee')}</label>
              <select
                value={draftAssignee}
                onChange={(e) => setDraftAssignee(e.target.value)}
                className="select-field-sm w-full appearance-none rounded-lg border border-gray-300 bg-white py-1.5 pl-2.5 pr-7 text-sm text-gray-900 focus-ring"
              >
                <option value="">{t('filter_option_all_assignee')}</option>
                {assignees.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('action_reset')}
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              >
                {t('action_apply')}
              </button>
            </div>
          </div>
        )}
      </div>
      {rightSlot && <div className="ml-auto shrink-0">{rightSlot}</div>}
    </div>
  );
}
