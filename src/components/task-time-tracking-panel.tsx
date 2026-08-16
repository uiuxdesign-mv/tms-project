'use client';

import { useState } from 'react';
import { formatDuration } from '@/components/time-tracking-controls';
import { useLanguage } from '@/components/language-provider';

/**
 * Time Tracking — Redesign Modal Task Detail Round 10 lanjutan ("Opsi 7" dari
 * redesign-modal-round4-timetracking.md, dengan penyesuaian permintaan user: bar ringkas ini
 * dipindah ke ATAS Judul/Deskripsi, bukan di footer seperti mockup awal).
 *
 * PENTING (permintaan user eksplisit, 2x diulang: "jangan menghilangkan fitur", "jangan
 * ceroboh"): komponen ini adalah ekstraksi 1:1 dari blok Time Tracking yang sebelumnya menyatu di
 * task-detail-modal.tsx — SELURUH logic (state machine tombol Mulai/Jeda/Lanjut/Stop/Kembali/
 * Selesai, tombol Stop yang tetap tampil-tapi-disabled saat idle, gating canOperateTT/
 * canManageInfo, tombol Batalkan Task, tab Sesi Kerja/Sesi Review + tabel riwayat lengkap dengan
 * nama pelaku) dipindahkan APA ADANYA, cuma disusun ulang jadi 2 lapis:
 *  - Bar ringkas (SELALU terlihat): label, badge status, timer sesi berjalan, SEMUA tombol aksi
 *    (Mulai/Jeda/Lanjut/Stop/Kembali/Selesai/Batalkan Task) — sama sekali tidak disembunyikan,
 *    sesuai permintaan user supaya action Mulai/Stop/Batalkan tetap langsung terlihat.
 *  - Drawer detail (collapse, default tertutup, dibuka lewat tautan "Detail Waktu"): 3 statistik
 *    (Sesi Saat Ini/Waktu Kerja/Waktu Review) + tab Sesi Kerja/Sesi Review + tabel riwayat.
 */

export type SessionInterval = {
  startAt: string;
  endAt: string | null;
  seconds: number;
  openedBy: 'start' | 'resume';
  closedBy: 'pause' | 'stop' | null;
  startedByUserId?: string;
  endedByUserId?: string;
};

export type TimeTrackingState = {
  state: 'idle' | 'running' | 'paused';
  currentSessionIsReview: boolean;
  closedWorkSeconds: number;
  closedReviewSeconds: number;
  liveSince: string | null;
};

function formatLogTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TaskTimeTrackingPanel({
  timeUnavailable,
  isFinalStatus,
  isReviewStatus,
  timeState,
  canOperateTT,
  canManageInfo,
  busy,
  currentSessionSeconds,
  workTimeSeconds,
  reviewTimeSeconds,
  activeTab,
  onTabChange,
  workIntervals,
  reviewIntervals,
  resolveActorName,
  onAction,
  onCancelTask,
}: {
  timeUnavailable: boolean;
  isFinalStatus: boolean;
  isReviewStatus: boolean;
  timeState: TimeTrackingState | null;
  canOperateTT: boolean;
  canManageInfo: boolean;
  busy: boolean;
  currentSessionSeconds: number;
  workTimeSeconds: number;
  reviewTimeSeconds: number;
  activeTab: 'work' | 'review';
  onTabChange: (tab: 'work' | 'review') => void;
  workIntervals: SessionInterval[];
  reviewIntervals: SessionInterval[];
  resolveActorName: (userId: string | undefined) => string;
  onAction: (action: 'start' | 'pause' | 'resume' | 'stop' | 'back' | 'done') => void;
  onCancelTask: () => void;
}) {
  const { t } = useLanguage();
  const [detailOpen, setDetailOpen] = useState(false);

  const btnBase =
    'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  const startBtn = `${btnBase} bg-indigo-600 text-white hover:bg-indigo-700`;
  const pauseBtn = `${btnBase} border border-amber-400 text-amber-600 hover:bg-amber-50`;
  const stopBtn = `${btnBase} border border-red-300 text-red-600 hover:bg-red-50`;
  const backBtn = `${btnBase} border border-gray-300 text-gray-900 hover:bg-gray-100`;
  const doneBtn = `${btnBase} bg-emerald-600 text-white hover:bg-emerald-700`;

  if (timeUnavailable) {
    return (
      <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-500">{t('td_tt_not_configured')}</p>
      </div>
    );
  }

  const intervals = activeTab === 'work' ? workIntervals : reviewIntervals;

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Time Tracking</h3>
        {!isFinalStatus && timeState && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              timeState.state === 'running'
                ? 'bg-emerald-50 text-emerald-700'
                : timeState.state === 'paused'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            {timeState.state === 'running'
              ? t('td_tt_state_running')
              : timeState.state === 'paused'
              ? t('td_tt_state_paused')
              : t('td_tt_state_not_started')}
          </span>
        )}
        {/* Perbaikan (permintaan user): angka headline di sebelah status TIDAK lagi selalu
            "Sesi Saat Ini" (waktu sesi yang sedang berjalan, reset tiap kali mulai/lanjut lagi) —
            sekarang tergantung fase task, dan "keterkaitan"-nya konsisten di 3 fase:
            - Status akhir (Done dkk.): "Sesi Saat Ini" TIDAK relevan lagi (tidak ada sesi
              berjalan) — diganti tampilan Waktu Kerja + Waktu Review sekaligus (total akumulasi).
            - Status Review: diganti Waktu Review (akumulasi, TETAP ikut live-tick selama sesi
              review berjalan — lihat workTimeSeconds/reviewTimeSeconds di task-detail-modal.tsx,
              keduanya sudah include waktu sesi berjalan, bukan cuma yang sudah closed).
            - Selain itu (mis. In Progress): diganti Waktu Kerja (akumulasi, sama alasannya) —
              permintaan user eksplisit utk kasus ini, diperluas ke Review demi konsistensi (bukan
              cuma "In Progress" doang yang benar, "Review" dibiarkan sesi-saat-ini akan terlihat
              janggal/tidak konsisten). "Sesi Saat Ini" murni masih ada di drawer Detail Waktu.

            Perbaikan lanjutan (permintaan user): preview waktu ini (blok di atas) sekarang
            disembunyikan SELAMA drawer "Detail Waktu" terbuka (detailOpen), lalu muncul lagi
            begitu drawer ditutup — berlaku utk SEMUA status/fase (final, review, maupun biasa),
            bukan cuma salah satu, karena angka ini toh sudah terlihat lebih detail lengkap di
            drawer-nya sendiri saat expand, jadi menampilkan keduanya sekaligus cuma duplikat.
            State badge (Berjalan/Dijeda/Belum Dimulai) di atas TIDAK ikut disembunyikan — user
            spesifik cuma minta "waktu"-nya (bagian ini) yang hilang, bukan seluruh baris. */}
        {!detailOpen &&
          (isFinalStatus ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
              <span className="flex items-baseline gap-1">
                <span className="text-gray-400">{t('tt_work_time')}:</span>
                <span className="tabular-nums font-semibold text-gray-900">{formatDuration(workTimeSeconds)}</span>
              </span>
              <span className="flex items-baseline gap-1">
                <span className="text-gray-400">{t('tt_review_time')}:</span>
                <span className="tabular-nums font-semibold text-amber-600">{formatDuration(reviewTimeSeconds)}</span>
              </span>
            </span>
          ) : (
            <span className="flex items-baseline gap-1">
              <span className="text-[0.625rem] uppercase tracking-wide text-gray-400">
                {isReviewStatus ? t('tt_review_time') : t('tt_work_time')}
              </span>
              <span className="tabular-nums text-sm font-semibold text-gray-900">
                {formatDuration(isReviewStatus ? reviewTimeSeconds : workTimeSeconds)}
              </span>
            </span>
          ))}

        <button
          type="button"
          onClick={() => setDetailOpen((v) => !v)}
          className="ml-auto flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          {detailOpen ? t('tt_hide_detail') : t('tt_show_detail')}
          <svg
            className={`h-3 w-3 transition-transform ${detailOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {canOperateTT && timeState && !isFinalStatus && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {isReviewStatus ? (
            <>
              <button disabled={busy} onClick={() => onAction('back')} className={backBtn}>
                {t('tt_btn_back')}
              </button>
              <button disabled={busy} onClick={() => onAction('done')} className={doneBtn}>
                {t('tt_btn_done')}
              </button>
            </>
          ) : (
            <>
              {timeState.state === 'idle' && (
                <>
                  <button disabled={busy} onClick={() => onAction('start')} className={startBtn}>
                    ▶ {t('tt_btn_start')}
                  </button>
                  {/* Bugfix (Fase 19, spec §2 "Kondisi Awal"): tombol Stop tetap DITAMPILKAN (dalam
                      kondisi disabled) saat status To Do — sebelumnya disembunyikan total. Pause
                      memang sengaja tidak ditampilkan sama sekali di kondisi ini, sesuai spesifikasi. */}
                  <button disabled className={stopBtn}>
                    {t('tt_btn_stop')}
                  </button>
                </>
              )}
              {timeState.state === 'running' && (
                <>
                  <button disabled={busy} onClick={() => onAction('pause')} className={pauseBtn}>
                    {t('tt_btn_pause')}
                  </button>
                  <button disabled={busy} onClick={() => onAction('stop')} className={stopBtn}>
                    {t('tt_btn_stop')}
                  </button>
                </>
              )}
              {timeState.state === 'paused' && (
                <>
                  <button disabled={busy} onClick={() => onAction('resume')} className={startBtn}>
                    ▶ {t('tt_btn_start')}
                  </button>
                  <button disabled={busy} onClick={() => onAction('stop')} className={stopBtn}>
                    {t('tt_btn_stop')}
                  </button>
                </>
              )}
            </>
          )}
          {/* Perbaikan (permintaan user poin 3): Cancel Task TIDAK termasuk "boleh mengoperasikan
              status/Time Tracking" — penerima delegasi cuma boleh mengerjakan
              (Start/Pause/Resume/Stop/Back/Done), tidak boleh membatalkan sepihak task yang
              ditugaskan orang lain ke dia. Tetap digerbangi canManageInfo, sama seperti field lain. */}
          {canManageInfo && (
            <button disabled={busy} onClick={onCancelTask} className={`${btnBase} ml-auto bg-red-600 text-white hover:bg-red-700`}>
              ✕ {t('td_cancel_task_btn')}
            </button>
          )}
        </div>
      )}

      {detailOpen && (
        <div className="mt-3.5 border-t border-gray-200 pt-3">
          {/* Perbaikan (permintaan user): "Sesi Saat Ini" dihilangkan juga di sini utk status
              akhir (bukan cuma di angka headline) — di status akhir tidak ada sesi yang sedang
              berjalan sama sekali, jadi stat ini akan selalu 0 & membingungkan kalau dibiarkan.
              Grid ikut menyesuaikan jadi 2 kolom (bukan 3) supaya Waktu Kerja/Waktu Review tetap
              proporsional, bukan menyisakan slot kosong. */}
          <div className={`grid gap-2 text-center ${isFinalStatus ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {!isFinalStatus && (
              <div>
                <p className="text-[0.625rem] uppercase tracking-wide text-gray-400">{t('td_current_session')}</p>
                <p className="tabular-nums text-base font-semibold text-gray-900">{formatDuration(currentSessionSeconds)}</p>
              </div>
            )}
            <div>
              <p className="text-[0.625rem] uppercase tracking-wide text-gray-400">{t('tt_work_time')}</p>
              <p className="tabular-nums text-base font-semibold text-gray-900">{formatDuration(workTimeSeconds)}</p>
            </div>
            <div>
              <p className="text-[0.625rem] uppercase tracking-wide text-gray-400">{t('tt_review_time')}</p>
              <p className="tabular-nums text-base font-semibold text-amber-600">{formatDuration(reviewTimeSeconds)}</p>
            </div>
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3">
            <div className="flex gap-4 border-b border-gray-200 text-sm">
              <button
                onClick={() => onTabChange('work')}
                className={`-mb-px border-b-2 pb-2 font-medium ${
                  activeTab === 'work' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'
                }`}
              >
                {t('td_work_session_label')} ({workIntervals.length})
              </button>
              <button
                onClick={() => onTabChange('review')}
                className={`-mb-px border-b-2 pb-2 font-medium ${
                  activeTab === 'review' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'
                }`}
              >
                {t('td_review_session_label')} ({reviewIntervals.length})
              </button>
            </div>
            <div className="mt-2 max-h-48 overflow-y-auto">
              {intervals.length === 0 && <p className="py-3 text-center text-xs text-gray-400">{t('td_no_time_recorded')}</p>}
              {intervals.length > 0 && (
                <table className="w-full text-left text-xs">
                  <thead className="text-[0.625rem] uppercase text-gray-400">
                    <tr>
                      <th className="pb-1 pr-2 font-medium">{t('td_col_start_resume')}</th>
                      <th className="pb-1 pr-2 font-medium">{activeTab === 'review' ? t('td_col_back_done') : t('td_col_pause_stop')}</th>
                      <th className="pb-1 font-medium">{t('td_col_duration')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intervals.map((iv, i) => {
                      // Bugfix (Fase 19, spec §6): label + warna Action/Activity meniru tabel warna
                      // aplikasi lama — Start=Blue, Resume=Green, Pause=Orange, Stop=Red. Sesi
                      // review cuma bisa ditutup lewat tombol Back atau Done (tidak ada Pause/Stop
                      // di tahap review), jadi penutupan sesi review dilabeli "Done" + hijau, bukan
                      // "Stop" + merah, konsisten dengan warna "Review Done = Green" di spec (event
                      // mentahnya tetap sama-sama `stop`, yang membedakan cuma konteks tab-nya).
                      const openLabel = iv.openedBy === 'start' ? t('tt_btn_start') : t('tt_btn_resume');
                      const openColor = iv.openedBy === 'start' ? 'text-blue-600' : 'text-emerald-600';
                      const closeLabel =
                        iv.closedBy === null
                          ? t('td_tt_state_running')
                          : activeTab === 'review'
                          ? t('tt_btn_done')
                          : iv.closedBy === 'pause'
                          ? t('tt_btn_pause')
                          : t('tt_btn_stop');
                      const closeColor =
                        iv.closedBy === null
                          ? 'text-gray-400'
                          : activeTab === 'review'
                            ? 'text-emerald-600'
                            : iv.closedBy === 'pause'
                              ? 'text-amber-600'
                              : 'text-red-600';
                      return (
                        <tr key={i} className="align-top">
                          <td className="py-1 pr-2">
                            <div className={`font-medium ${openColor}`}>{openLabel}</div>
                            <div className="text-gray-500">{formatLogTimestamp(iv.startAt)}</div>
                            <div className="text-[0.625rem] text-gray-400">{resolveActorName(iv.startedByUserId)}</div>
                          </td>
                          <td className="py-1 pr-2">
                            <div className={`font-medium ${closeColor}`}>{closeLabel}</div>
                            <div className="text-gray-500">{iv.endAt ? formatLogTimestamp(iv.endAt) : '-'}</div>
                            {iv.endAt && <div className="text-[0.625rem] text-gray-400">{resolveActorName(iv.endedByUserId)}</div>}
                          </td>
                          <td className="py-1 tabular-nums text-gray-700">
                            {iv.endAt ? formatDuration(iv.seconds) : formatDuration(currentSessionSeconds)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
