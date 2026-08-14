'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/language-provider';
import { DonutChart } from '@/components/charts/donut-chart';
import { VerticalBarChart } from '@/components/charts/vertical-bar-chart';
import { LineChart } from '@/components/charts/line-chart';
import { summarizeTasks } from '@/lib/reports/summarize';
import { filterByCreatedAt, type QuickRange } from '@/lib/reports/date-range';
import { computeProductivityTrend } from '@/lib/reports/productivity-trend';
import { formatDurationShort } from '@/lib/reports/time-intervals';
import type { TaskSummary, EnrichedTask, ClosedTimeInterval } from '@/lib/reports/types';
import type { TranslationKey } from '@/lib/i18n/translations';
import type { AuditLogEntry } from '@/lib/models/audit-log';
import type { CommentRow } from '@/lib/models/comments';

type CardTone = 'brand' | 'neutral' | 'amber' | 'red' | 'emerald' | 'info';

// Tone chip warna kartu ringkasan — 'info' (biru) ditambahkan Fase 11 untuk 2 kartu baru (In
// Review, Weekly Productivity) mengikuti penamaan tone Badge (@/components/badge) supaya
// konsisten dgn sistem warna yang sudah ada di aplikasi (bukan bikin skema warna baru).
const TONE_CHIP: Record<CardTone, string> = {
  brand: 'bg-indigo-50 text-indigo-600',
  neutral: 'bg-gray-100 text-gray-500',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  info: 'bg-blue-50 text-blue-600',
};

type IconName = 'document' | 'clock' | 'spinner' | 'eye' | 'check' | 'warning' | 'trending';

// Ikon ringkas (heroicons-outline) dipakai sebagai "chip" di kiri tiap kartu ringkasan, meniru
// dashboard_stat_card() aplikasi lama. Dipisah dari tone (Fase 11) supaya ikon & warna bisa
// dikombinasikan bebas per kartu (8 kartu ringkasan sekarang, sebelumnya 4).
const ICON_PATHS: Record<IconName, string> = {
  document:
    'M9 12h6m-6 4h6M4.5 6.75A2.25 2.25 0 016.75 4.5h10.5A2.25 2.25 0 0119.5 6.75v10.5A2.25 2.25 0 0117.25 19.5H6.75A2.25 2.25 0 014.5 17.25V6.75z',
  clock: 'M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z',
  spinner:
    'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99',
  eye: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  check: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  warning:
    'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  trending: 'M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
};

function SummaryIcon({ icon }: { icon: IconName }) {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[icon]} />
    </svg>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: React.ReactNode;
  tone?: CardTone;
  icon: IconName;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE_CHIP[tone]}`}>
        <SummaryIcon icon={icon} />
      </span>
      <div>
        <p className="text-2xl font-semibold leading-tight text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  // Bugfix (permintaan user Round 8): `min-w-0` ditambahkan supaya kartu ini (grid item di kolom
  // ke-3 grid "grid-cols-1 lg:grid-cols-3" di bawah) bisa MENYUSUT mengikuti lebar kolom grid yang
  // sebenarnya. Tanpa ini, grid item secara default punya ukuran minimum otomatis = lebar konten
  // MIN-CONTENT anak-anaknya (di sini: bar chart dengan label yang panjang, lihat catatan lengkap
  // di charts/vertical-bar-chart.tsx) — kalau konten itu lebih lebar dari kolom grid, kartu ini
  // ikut melebar melampaui kolomnya, sampai terpotong tepi layar (bukan cuma tulisan di dalamnya
  // yang keluar kotak, tapi SELURUH kartu).
  return (
    <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

function FeedCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

const ACTION_LABEL: Record<AuditLogEntry['action'], string> = { create: 'Tambah', update: 'Ubah', delete: 'Hapus' };
const ACTION_COLOR: Record<AuditLogEntry['action'], string> = {
  create: 'text-emerald-600',
  update: 'text-amber-600',
  delete: 'text-red-600',
};

function formatDateShort(iso: string): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

const QUICK_RANGES: QuickRange[] = ['today', 'week', 'month', 'year'];
const QUICK_RANGE_LABEL_KEY: Record<QuickRange, TranslationKey> = {
  today: 'dashboard_quick_filter_today',
  week: 'dashboard_quick_filter_week',
  month: 'dashboard_quick_filter_month',
  year: 'dashboard_quick_filter_year',
};

export type DashboardViewProps = {
  session: { name: string; email: string; roleName: string; roleKey: string; canAssignOthers: boolean } | null;
  isAdmin: boolean;
  canViewTasking: boolean;
  canViewReport: boolean;
  /** Total saat ini (TIDAK terpengaruh Quick Filter) — dipakai 8 kartu ringkasan, meniru
   * caption aplikasi lama: "Only filters the charts - summary cards always show current totals." */
  summary: TaskSummary | null;
  /** Semua task yang visible ke session ini (belum difilter) — dipakai untuk menghitung ulang ke-6
   * chart tiap tab Quick Filter (Today/This Week/This Month/This Year) berganti, di client. */
  tasks: EnrichedTask[];
  /** Semua interval kerja (Time Tracking) yang closed, lintas task visible — dipakai chart
   * Productivity Trend (disaring ulang mengikuti Quick Filter yang sama seperti chart lain). */
  timeIntervals: ClosedTimeInterval[];
  hoursWorkedTodayHours: number;
  weeklyProductivityPct: number;
  upcomingDue: EnrichedTask[];
  recentComments: CommentRow[];
  commentUserNames: Record<string, string>;
  taskTitleById: Record<string, string>;
  recentActivity: AuditLogEntry[];
  recentTimeTracking: ClosedTimeInterval[];
};

export default function DashboardView({
  session,
  isAdmin,
  canViewTasking,
  canViewReport,
  summary,
  tasks,
  timeIntervals,
  hoursWorkedTodayHours,
  weeklyProductivityPct,
  upcomingDue,
  recentComments,
  commentUserNames,
  taskTitleById,
  recentActivity,
  recentTimeTracking,
}: DashboardViewProps) {
  const { t, lang } = useLanguage();
  const [range, setRange] = useState<QuickRange>('today');

  const filteredTasks = useMemo(() => filterByCreatedAt(tasks, range), [tasks, range]);
  const filteredSummary = useMemo(() => summarizeTasks(filteredTasks), [filteredTasks]);
  const filteredIntervals = useMemo(() => {
    const ids = new Set(filteredTasks.map((tk) => tk.id));
    return timeIntervals.filter((iv) => ids.has(iv.taskId));
  }, [filteredTasks, timeIntervals]);
  const trendPoints = useMemo(
    () => computeProductivityTrend(filteredIntervals, range, lang).map((p) => ({ key: p.key, label: p.label, value: p.hours })),
    [filteredIntervals, range, lang]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {t('dashboard_welcome_back')}, <span>{session?.name}</span> <span aria-hidden>👋</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t('dashboard_welcome_subtitle')}</p>
        </div>

        {summary && (
          <div className="flex flex-col items-start gap-1.5 lg:items-end">
            <div className="inline-flex rounded-xl bg-gray-100 p-1">
              {QUICK_RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    range === r ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t(QUICK_RANGE_LABEL_KEY[r])}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">{t('dashboard_quick_filter_note')}</p>
          </div>
        )}
      </div>

      {summary && (
        <>
          {/* 8 kartu ringkasan — selalu total saat ini, TIDAK ikut Quick Filter. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label={t('dashboard_total_tasks')} value={summary.total} tone="brand" icon="document" />
            <SummaryCard label={t('dashboard_todo')} value={summary.todo} tone="neutral" icon="clock" />
            <SummaryCard label={t('dashboard_in_progress')} value={summary.inProgress} tone="amber" icon="spinner" />
            <SummaryCard label={t('dashboard_in_review')} value={summary.inReview} tone="info" icon="eye" />
            <SummaryCard label={t('dashboard_completed')} value={summary.completed} tone="emerald" icon="check" />
            <SummaryCard label={t('dashboard_overdue')} value={summary.overdue} tone="red" icon="warning" />
            <SummaryCard
              label={t('dashboard_hours_worked_today')}
              value={`${hoursWorkedTodayHours.toFixed(1)}h`}
              tone="neutral"
              icon="clock"
            />
            <SummaryCard
              label={t('dashboard_weekly_productivity')}
              value={`${weeklyProductivityPct}%`}
              tone="info"
              icon="trending"
            />
          </div>
          {canViewReport && (
            <Link href="/reports" className="-mt-3 inline-block text-xs text-gray-500 hover:text-gray-700">
              {t('dashboard_view_full_report')}
            </Link>
          )}

          {/* 6 chart — ikut Quick Filter (disaring dari `created_at` task). */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard title={t('dashboard_task_status')}>
              <DonutChart
                items={filteredSummary.byStatus.map((s) => ({ key: s.statusId, label: s.statusName, count: s.count }))}
                emptyLabel={t('dashboard_no_data_yet')}
              />
            </ChartCard>

            <ChartCard title={t('dashboard_tasks_per_project')}>
              <VerticalBarChart
                items={filteredSummary.byProject.map((p) => ({ key: p.projectId, label: p.projectName, count: p.count }))}
                emptyLabel={t('dashboard_no_data_yet')}
                barClassName="bg-sky-600"
                maxItems={8}
              />
            </ChartCard>

            <ChartCard title={t('dashboard_tasks_per_client')}>
              <VerticalBarChart
                items={filteredSummary.byClient.map((c) => ({ key: c.clientId, label: c.clientName, count: c.count }))}
                emptyLabel={t('dashboard_no_data_yet')}
                barClassName="bg-sky-600"
                maxItems={8}
              />
            </ChartCard>

            <ChartCard title={t('dashboard_productivity_trend')}>
              <LineChart
                points={trendPoints}
                emptyTitle={t('dashboard_no_data_yet')}
                emptyCaption={t('dashboard_no_data_yet_caption')}
              />
            </ChartCard>

            <ChartCard title={t('dashboard_priority_distribution')}>
              <DonutChart
                items={filteredSummary.byPriority.map((p) => ({ key: p.priorityId, label: p.priorityName, count: p.count }))}
                emptyLabel={t('dashboard_no_data_yet')}
              />
            </ChartCard>

            <ChartCard title={t('dashboard_assignee_workload')}>
              <VerticalBarChart
                items={filteredSummary.byAssignee.map((a) => ({ key: a.userId, label: a.userName, count: a.count }))}
                emptyLabel={t('dashboard_no_data_yet')}
                barClassName="bg-indigo-500"
                maxItems={8}
              />
            </ChartCard>
          </div>
        </>
      )}

      {/* 4 feed card */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {isAdmin && (
          <FeedCard
            title={t('dashboard_recent_activity')}
            action={<Link href="/audit-log" className="text-xs text-gray-500 hover:text-gray-700">{t('dashboard_view_all')}</Link>}
          >
            {recentActivity.length === 0 ? (
              <p className="text-sm text-gray-400">{t('dashboard_no_activity')}</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((a) => (
                  <div key={a.id} className="text-sm">
                    <span className="font-medium text-gray-800">{a.actor_name}</span>{' '}
                    <span className={ACTION_COLOR[a.action]}>{ACTION_LABEL[a.action]}</span>{' '}
                    <span className="text-gray-600">{a.entity_label}</span>
                    <div className="text-[11px] text-gray-400">{formatDateShort(a.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </FeedCard>
        )}

        {canViewTasking && (
          <FeedCard
            title={t('dashboard_upcoming_due')}
            action={<Link href="/tasks" className="text-xs text-gray-500 hover:text-gray-700">{t('dashboard_view_all')}</Link>}
          >
            {upcomingDue.length === 0 ? (
              <p className="text-sm text-gray-400">{t('dashboard_no_upcoming_due')}</p>
            ) : (
              <div className="space-y-2">
                {upcomingDue.map((tk) => (
                  <div key={tk.id} className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2 text-gray-700">{tk.title}</span>
                    <span className="shrink-0 text-xs text-amber-600">{tk.due_date}</span>
                  </div>
                ))}
              </div>
            )}
          </FeedCard>
        )}

        {canViewTasking && (
          <FeedCard title={t('dashboard_recent_comments')}>
            {recentComments.length === 0 ? (
              <p className="text-sm text-gray-400">{t('dashboard_no_comments')}</p>
            ) : (
              <div className="space-y-2">
                {recentComments.map((c) => (
                  <p key={c.id} className="truncate text-sm text-gray-600">
                    <span className="font-medium text-gray-800">{commentUserNames[c.user_id] || 'User'}</span>{' '}
                    {t('dashboard_on_task')} &quot;<span className="text-gray-700">{taskTitleById[c.task_id] || 'Task'}</span>&quot;:{' '}
                    {c.comment || (c.attachment_original_name ? `📎 ${c.attachment_original_name}` : '')}
                  </p>
                ))}
              </div>
            )}
          </FeedCard>
        )}

        {canViewTasking && (
          <FeedCard title={t('dashboard_recent_time_tracking')}>
            {recentTimeTracking.length === 0 ? (
              <p className="text-sm text-gray-400">{t('dashboard_no_time_tracking')}</p>
            ) : (
              <div className="space-y-2">
                {recentTimeTracking.map((iv, idx) => (
                  <p key={`${iv.taskId}-${iv.startedAt}-${idx}`} className="truncate text-sm text-gray-600">
                    <span className="font-medium text-gray-800">{iv.userName}</span> {t('dashboard_spent')}{' '}
                    <span className="font-medium text-gray-700">{formatDurationShort(iv.seconds)}</span> {t('dashboard_on_task')} &quot;
                    <span className="text-gray-700">{iv.taskTitle}</span>&quot;
                  </p>
                ))}
              </div>
            )}
          </FeedCard>
        )}
      </div>

      <p className="text-xs text-gray-400">{t('dashboard_footer_note')}</p>
    </div>
  );
}
