'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/language-provider';
import { BarList } from '@/components/charts/bar-list';
import { WeeklyTrendChart } from '@/components/charts/weekly-trend-chart';
import type { TaskSummary, EnrichedTask } from '@/lib/reports/types';
import type { AuditLogEntry } from '@/lib/models/audit-log';
import type { CommentRow } from '@/lib/models/comments';

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: 'red' | 'amber' | 'green' }) {
  const toneClass = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : tone === 'green' ? 'text-green-600' : 'text-gray-900';
  return (
    <div className="rounded-md border border-gray-200 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

function FeedCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

const ACTION_LABEL: Record<AuditLogEntry['action'], string> = { create: 'Tambah', update: 'Ubah', delete: 'Hapus' };
const ACTION_COLOR: Record<AuditLogEntry['action'], string> = {
  create: 'text-green-600',
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

export type DashboardViewProps = {
  session: { name: string; email: string; roleName: string; roleKey: string; canAssignOthers: boolean } | null;
  isAdmin: boolean;
  canViewTasking: boolean;
  canViewReport: boolean;
  summary: TaskSummary | null;
  upcomingDue: EnrichedTask[];
  recentTasks: EnrichedTask[];
  recentComments: CommentRow[];
  commentUserNames: Record<string, string>;
  taskTitleById: Record<string, string>;
  recentActivity: AuditLogEntry[];
};

export default function DashboardView({
  session,
  isAdmin,
  canViewTasking,
  canViewReport,
  summary,
  upcomingDue,
  recentTasks,
  recentComments,
  commentUserNames,
  taskTitleById,
  recentActivity,
}: DashboardViewProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">{t('dashboard_title')}</h1>
        <p className="text-sm text-gray-600">
          {t('dashboard_login_as')} <span className="font-medium">{session?.name}</span> ({session?.email})
        </p>
        <dl className="mt-3 space-y-1 text-sm text-gray-600">
          <div>
            <dt className="inline font-medium text-gray-700">{t('dashboard_role')}: </dt>
            <dd className="inline">{session?.roleName} ({session?.roleKey})</dd>
          </div>
          <div>
            <dt className="inline font-medium text-gray-700">{t('dashboard_can_assign')}: </dt>
            <dd className="inline">{session?.canAssignOthers ? t('dashboard_yes') : t('dashboard_no')}</dd>
          </div>
        </dl>
      </div>

      {summary && (
        <>
          {/* Ringkasan angka */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label={t('dashboard_total_tasks')} value={summary.total} />
            <SummaryCard label={t('dashboard_overdue')} value={summary.overdue} tone="red" />
            <SummaryCard label={t('dashboard_due_soon')} value={summary.dueSoon} tone="amber" />
            <SummaryCard label={t('dashboard_completed')} value={summary.completed} tone="green" />
          </div>
          {canViewReport && (
            <Link href="/reports" className="-mt-3 inline-block text-xs text-gray-500 hover:text-gray-700">
              {t('dashboard_view_full_report')}
            </Link>
          )}

          {/* 6 chart ringkasan */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard title={t('dashboard_by_status')}>
              <BarList
                items={summary.byStatus.map((s) => ({
                  key: s.statusId,
                  label: s.statusName,
                  count: s.count,
                  colorClassName: s.isFinal ? 'bg-green-500' : 'bg-gray-900',
                }))}
              />
            </ChartCard>

            <ChartCard title={t('dashboard_by_priority')}>
              <BarList
                items={summary.byPriority.map((p) => ({ key: p.priorityId, label: p.priorityName, count: p.count, colorClassName: 'bg-blue-500' }))}
              />
            </ChartCard>

            <ChartCard title={t('dashboard_by_task_type')}>
              <BarList
                items={summary.byTaskType.map((tt) => ({ key: tt.taskTypeId, label: tt.taskTypeName, count: tt.count, colorClassName: 'bg-purple-500' }))}
              />
            </ChartCard>

            <ChartCard title={t('dashboard_top_assignee')}>
              <BarList
                items={summary.byAssignee.map((a) => ({ key: a.userId, label: a.userName, count: a.count, colorClassName: 'bg-indigo-500' }))}
                maxItems={6}
              />
            </ChartCard>

            <ChartCard title={t('dashboard_completion_status')}>
              <div className="space-y-3">
                <div className="flex h-3 w-full overflow-hidden rounded bg-gray-100">
                  {summary.total > 0 && (
                    <>
                      <div className="h-3 bg-green-500" style={{ width: `${(summary.completed / summary.total) * 100}%` }} title={t('dashboard_completed')} />
                      <div className="h-3 bg-red-500" style={{ width: `${(summary.overdue / summary.total) * 100}%` }} title={t('dashboard_overdue')} />
                      <div
                        className="h-3 bg-gray-900"
                        style={{
                          width: `${Math.max(0, ((summary.total - summary.completed - summary.overdue) / summary.total) * 100)}%`,
                        }}
                        title={t('dashboard_active')}
                      />
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                  <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500" />{t('dashboard_completed')} ({summary.completed})</span>
                  <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />{t('dashboard_overdue')} ({summary.overdue})</span>
                  <span>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full bg-gray-900" />
                    {t('dashboard_active')} ({Math.max(0, summary.total - summary.completed - summary.overdue)})
                  </span>
                </div>
              </div>
            </ChartCard>

            <ChartCard title={t('dashboard_weekly_trend')}>
              <WeeklyTrendChart buckets={summary.dueDateTrend} />
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
              <p className="text-sm text-gray-400">Belum ada aktivitas tercatat.</p>
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
          <FeedCard title={t('dashboard_recent_comments')}>
            {recentComments.length === 0 ? (
              <p className="text-sm text-gray-400">Belum ada komentar.</p>
            ) : (
              <div className="space-y-2">
                {recentComments.map((c) => (
                  <div key={c.id} className="rounded-md border border-gray-100 bg-gray-50 p-2.5 text-sm">
                    <div className="mb-0.5 flex items-center justify-between text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{commentUserNames[c.user_id] || 'User'}</span>
                      <span>{taskTitleById[c.task_id] || 'Task'}</span>
                    </div>
                    <p className="truncate text-gray-600">
                      {c.comment || (c.attachment_original_name ? `📎 ${c.attachment_original_name}` : '')}
                    </p>
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
              <p className="text-sm text-gray-400">Tidak ada tugas jatuh tempo dalam 14 hari ke depan.</p>
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
          <FeedCard title={t('dashboard_recent_tasks')}>
            {recentTasks.length === 0 ? (
              <p className="text-sm text-gray-400">Belum ada tugas.</p>
            ) : (
              <div className="space-y-2">
                {recentTasks.map((tk) => (
                  <div key={tk.id} className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2 text-gray-700">{tk.title}</span>
                    <span className="shrink-0 text-xs text-gray-400">{tk.status_name || '-'}</span>
                  </div>
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
