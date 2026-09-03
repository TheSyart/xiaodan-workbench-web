import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FinanceCategory, FinanceTransaction } from '@xiaodan/contracts';
import { api, apiRoot, post } from '../api.js';
import { PageHeader, Empty, PanelState } from '../components/common/PageHeader.js';
import { Modal } from '../components/common/Modal.js';
import { UploadIcon } from '../components/common/Icons.js';

function money(value: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value / 100);
}

export function FinancePage() {
  const client = useQueryClient();
  const month = new Date().toISOString().slice(0, 7);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<'transactions' | 'documents'>('transactions');

  const tx = useQuery({
    queryKey: ['finance', month],
    queryFn: () => api<FinanceTransaction[]>(`/finance/transactions?month=${month}`)
  });

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<FinanceCategory[]>('/finance/categories')
  });

  const summary = useQuery({
    queryKey: ['finance-summary', month],
    queryFn: () => api<{ incomeMinor: number; expenseMinor: number }>(`/finance/summary?month=${month}`)
  });

  const create = useMutation({
    mutationFn: (body: unknown) => post('/finance/transactions', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['finance'] });
      void client.invalidateQueries({ queryKey: ['finance-summary'] });
      setShowForm(false);
    }
  });

  return (
    <div className="page">
      <PageHeader
        eyebrow="FINANCE"
        title="每一笔，都有来处"
        description="只记录真实流水。凭证可以关联，但不会自动变成账目。"
        actions={
          tab === 'transactions' ? (
            <button className="primary" onClick={() => setShowForm(true)}>
              新建流水
            </button>
          ) : undefined
        }
      />

      <div className="project-tabs">
        <button
          className={tab === 'transactions' ? 'active' : ''}
          onClick={() => setTab('transactions')}
        >
          流水
        </button>
        <button
          className={tab === 'documents' ? 'active' : ''}
          onClick={() => setTab('documents')}
        >
          凭证
        </button>
      </div>

      {tab === 'documents' ? (
        <DocumentsPanel />
      ) : (
        <>
          <div className="summary-line">
            <div>
              <small>本月收入</small>
              <strong>{money(summary.data?.incomeMinor ?? 0)}</strong>
            </div>
            <div>
              <small>本月支出</small>
              <strong>{money(summary.data?.expenseMinor ?? 0)}</strong>
            </div>
            <div>
              <small>结余</small>
              <strong>
                {money((summary.data?.incomeMinor ?? 0) - (summary.data?.expenseMinor ?? 0))}
              </strong>
            </div>
          </div>

          <section className="paper-panel table-panel">
            <div className="section-heading">
              <span>流水</span>
              <small>{month}</small>
            </div>
            <PanelState loading={tx.isLoading} error={tx.error} empty={!tx.data?.length}>
              <table>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>类型</th>
                    <th>对方 / 备注</th>
                    <th>金额</th>
                  </tr>
                </thead>
                <tbody>
                  {tx.data
                    ?.filter((row) => !row.deletedAt)
                    .map((row) => (
                      <tr key={row.id}>
                        <td>{row.occurredAt.slice(0, 10)}</td>
                        <td>{row.kind === 'income' ? '收入' : '支出'}</td>
                        <td>{row.counterparty || row.note || '—'}</td>
                        <td className={row.kind}>
                          {row.kind === 'income' ? '+' : '−'}
                          {money(row.amountMinor)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </PanelState>
          </section>

          {showForm && (
            <Modal title="新建流水" onClose={() => setShowForm(false)}>
              <FinanceForm
                categories={categories.data ?? []}
                pending={create.isPending}
                onSubmit={(body) => create.mutate(body)}
              />
            </Modal>
          )}
        </>
      )}
    </div>
  );
}

function DocumentsPanel() {
  type Doc = { id: string; originalName: string; mimeType: string; size: number; createdAt: string };
  const client = useQueryClient();
  const docs = useQuery({ queryKey: ['documents'], queryFn: () => api<Doc[]>('/documents') });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const data = new FormData();
      data.set('file', file);
      return api<Doc>('/documents', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: data
      });
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ['documents'] })
  });

  return (
    <section className="paper-panel documents-panel">
      <div className="section-heading">
        <span>票据与原件</span>
        <label className="upload-button">
          <UploadIcon size={14} />
          {upload.isPending ? '上传中…' : '上传凭证'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
            }}
          />
        </label>
      </div>
      <p className="boundary-copy">
        上传只保存原件。识读结果不会自动生成账目，必须由你确认后另建真实流水。
      </p>
      <div className="document-grid">
        {docs.data?.map((doc) => (
          <a key={doc.id} href={`${apiRoot}/documents/${doc.id}/file`} target="_blank" rel="noreferrer">
            <strong>{doc.originalName}</strong>
            <span>
              {doc.mimeType} · {(doc.size / 1024).toFixed(1)} KB
            </span>
          </a>
        ))}
        {!docs.data?.length && <Empty title="还没有凭证" text="支持图片、PDF 和文本原件。" />}
      </div>
    </section>
  );
}

function FinanceForm({
  categories,
  pending,
  onSubmit
}: {
  categories: FinanceCategory[];
  pending: boolean;
  onSubmit: (body: unknown) => void;
}) {
  const [kind, setKind] = useState<'income' | 'expense'>('expense');

  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          kind,
          amountMinor: Math.round(Number(data.get('amount')) * 100),
          categoryId: String(data.get('categoryId')),
          occurredAt: new Date(String(data.get('date')) + 'T12:00:00').toISOString(),
          counterparty: String(data.get('counterparty') || '') || null,
          note: String(data.get('note') || '') || null,
          projectId: null,
          documentIds: []
        });
      }}
    >
      <div className="segmented">
        <button
          type="button"
          className={kind === 'expense' ? 'active' : ''}
          onClick={() => setKind('expense')}
        >
          支出
        </button>
        <button
          type="button"
          className={kind === 'income' ? 'active' : ''}
          onClick={() => setKind('income')}
        >
          收入
        </button>
      </div>
      <label>
        金额（元）
        <input name="amount" type="number" min="0.01" step="0.01" required autoFocus />
      </label>
      <label>
        分类
        <select name="categoryId" required>
          {categories
            .filter((item) => item.kind === kind && !item.archivedAt)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        日期
        <input
          name="date"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          required
        />
      </label>
      <label>
        对方
        <input name="counterparty" maxLength={300} placeholder="对方名称或商家" />
      </label>
      <label>
        备注
        <textarea name="note" rows={3} placeholder="添加备注信息…" />
      </label>
      <button className="primary" disabled={pending}>
        {pending ? '正在保存…' : '保存流水'}
      </button>
    </form>
  );
}
