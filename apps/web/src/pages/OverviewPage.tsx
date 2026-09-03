import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import type { TodayOverview } from '@xiaodan/contracts';
import { api } from '../api.js';
import { PageHeader, Empty, PanelState } from '../components/common/PageHeader.js';

function money(value: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value / 100);
}

export function OverviewPage() {
  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: () =>
      api<TodayOverview>(
        `/overview/today?now=${encodeURIComponent(new Date().toISOString())}&timezone=${encodeURIComponent(
          Intl.DateTimeFormat().resolvedOptions().timeZone
        )}`
      )
  });

  const date = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(new Date());

  return (
    <div className="page overview-page">
      <PageHeader
        eyebrow={date}
        title="把今天过清楚"
        description="写作、项目和日常事务，在同一张桌面上继续。"
      />

      <PanelState loading={overview.isLoading} error={overview.error}>
        <div className="overview-grid">
          <section className="paper-panel focus-panel">
            <div className="section-heading">
              <span>今日安排</span>
              <small>{overview.data?.todayItems.length ?? 0} 项</small>
            </div>
            {(overview.data?.todayItems.length ?? 0) > 0 ? (
              overview.data!.todayItems.map((item) => (
                <div className="timeline-row" key={item.id}>
                  <time>
                    {new Date(item.startsAt).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </time>
                  <i />
                  <strong>{item.title}</strong>
                </div>
              ))
            ) : (
              <Empty title="今天没有被塞满" text="留白也是一种安排。去日历里添加事项。" />
            )}
          </section>

          <section className="paper-panel">
            <div className="section-heading">
              <span>本月记账</span>
              <small>人民币</small>
            </div>
            <div className="money-pair">
              <div>
                <small>收入</small>
                <strong>{money(overview.data?.financeMonth.incomeMinor ?? 0)}</strong>
              </div>
              <div>
                <small>支出</small>
                <strong>{money(overview.data?.financeMonth.expenseMinor ?? 0)}</strong>
              </div>
            </div>
          </section>

          <section className="paper-panel">
            <div className="section-heading">
              <span>待推进</span>
              <small>{overview.data?.pendingTasks.length ?? 0} 项</small>
            </div>
            {overview.data?.pendingTasks.slice(0, 5).map((task) => (
              <div className="plain-row" key={task.id}>
                <span className={`status-dot ${task.status}`} />
                <span>{task.title}</span>
              </div>
            ))}
            {!overview.data?.pendingTasks.length && (
              <Empty title="手头很干净" text="没有待推进任务。" />
            )}
          </section>

          <section className="paper-panel wide">
            <div className="section-heading">
              <span>最近稿件</span>
              <NavLink to="/scripts">打开写作台 →</NavLink>
            </div>
            <div className="script-strip">
              {overview.data?.recentScripts.map((script) => (
                <div className="mini-script" key={script.id}>
                  <small>{script.plannedDate ?? '未排期'}</small>
                  <strong>{script.title}</strong>
                  <span>{script.contentMarkdown.length} 字</span>
                </div>
              ))}
              {!overview.data?.recentScripts.length && (
                <Empty title="从第一篇开始" text="新建一篇稿件，写下第一行。" />
              )}
            </div>
          </section>
        </div>
      </PanelState>
    </div>
  );
}
