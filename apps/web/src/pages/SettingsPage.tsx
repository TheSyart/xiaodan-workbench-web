import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { PageHeader } from '../components/common/PageHeader.js';

export function SettingsPage() {
  const status = useQuery({
    queryKey: ['ai-capabilities'],
    queryFn: () => api<{ tools: string[]; forbidden: string[] }>('/assistant/capabilities')
  });

  return (
    <div className="page narrow">
      <PageHeader
        eyebrow="SETTINGS"
        title="设置"
        description="服务器掌管数据与密钥，浏览器只获取必要结果。"
      />

      <section className="paper-panel settings-list" style={{ padding: 0 }}>
        <div
          style={{
            padding: '20px 24px',
            display: 'grid',
            gridTemplateColumns: '160px 1fr auto',
            alignItems: 'center',
            gap: '16px',
            borderBottom: '1px solid var(--border-subtle)'
          }}
        >
          <strong>数据存储</strong>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
            SQLite 与附件保存在服务器本地数据目录。
          </p>
          <span className="badge">服务器管理</span>
        </div>

        <div
          style={{
            padding: '20px 24px',
            display: 'grid',
            gridTemplateColumns: '160px 1fr auto',
            alignItems: 'center',
            gap: '16px',
            borderBottom: '1px solid var(--border-subtle)'
          }}
        >
          <strong>AI 连接</strong>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
            模型密钥不会出现在 HTML、API、日志或导出中。
          </p>
          <span className="badge">{status.isSuccess ? '服务可用' : '等待检测'}</span>
        </div>

        <div
          style={{
            padding: '20px 24px',
            display: 'grid',
            gridTemplateColumns: '160px 1fr auto',
            alignItems: 'center',
            gap: '16px'
          }}
        >
          <strong>通知</strong>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
            页面打开时通过 SSE 接收；关闭页面后不做 Web Push。
          </p>
          <span className="badge">应用内提醒</span>
        </div>
      </section>
    </div>
  );
}
