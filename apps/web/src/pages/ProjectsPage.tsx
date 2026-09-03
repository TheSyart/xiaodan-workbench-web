import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import type { Project, Script, Task } from '@xiaodan/contracts';
import { api, patch, post } from '../api.js';
import { PageHeader, Empty, PanelState } from '../components/common/PageHeader.js';
import { Modal } from '../components/common/Modal.js';
import { PlusIcon } from '../components/common/Icons.js';

export function ProjectsPage() {
  const client = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Project | null>(null);
  const [projectTab, setProjectTab] = useState<'tasks' | 'content'>('tasks');

  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') });
  const tasks = useQuery({
    queryKey: ['tasks', selected?.id],
    queryFn: () => api<Task[]>(`/tasks?projectId=${selected!.id}`),
    enabled: Boolean(selected)
  });

  const create = useMutation({
    mutationFn: (body: unknown) => post<Project>('/projects', body),
    onSuccess: (project) => {
      void client.invalidateQueries({ queryKey: ['projects'] });
      setShowCreate(false);
      setSelected(project);
    }
  });

  const createTask = useMutation({
    mutationFn: (title: string) =>
      post('/tasks', { projectId: selected!.id, title, notes: null, dueAt: null }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['tasks', selected?.id] })
  });

  const moveTask = useMutation({
    mutationFn: ({ task, status }: { task: Task; status: Task['status'] }) =>
      patch(`/tasks/${task.id}`, { status }, task.version),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['tasks', selected?.id] })
  });

  if (selected) {
    return (
      <div className="page">
        <button className="back" onClick={() => setSelected(null)}>
          ← 返回项目
        </button>
        <PageHeader
          eyebrow={selected.type === 'content_series' ? 'CONTENT SERIES' : 'PROJECT'}
          title={selected.name}
          description={selected.description || '把下一步拆小，然后推进。'}
          actions={
            <NavLink className="button-link" to="/scripts">
              进入写作台 →
            </NavLink>
          }
        />

        {selected.type === 'content_series' && (
          <div className="project-tabs">
            <button
              className={projectTab === 'tasks' ? 'active' : ''}
              onClick={() => setProjectTab('tasks')}
            >
              任务
            </button>
            <button
              className={projectTab === 'content' ? 'active' : ''}
              onClick={() => setProjectTab('content')}
            >
              内容日历
            </button>
          </div>
        )}

        {projectTab === 'content' && selected.type === 'content_series' ? (
          <ProjectContentCalendar project={selected} />
        ) : (
          <div className="kanban">
            {(['todo', 'doing', 'done'] as const).map((status) => (
              <section key={status}>
                <div className="section-heading">
                  <span>{{ todo: '待办', doing: '进行中', done: '已完成' }[status]}</span>
                  <small>{tasks.data?.filter((t) => t.status === status).length ?? 0}</small>
                </div>
                {status === 'todo' && (
                  <form
                    className="quick-add"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const input = event.currentTarget.elements.namedItem('title') as HTMLInputElement;
                      if (input.value.trim()) {
                        createTask.mutate(input.value.trim());
                        input.value = '';
                      }
                    }}
                  >
                    <input name="title" placeholder="添加一个任务" />
                    <button>添加</button>
                  </form>
                )}
                {tasks.data
                  ?.filter((task) => task.status === status)
                  .map((task) => (
                    <article className="task-card" key={task.id}>
                      <strong>{task.title}</strong>
                      <div>
                        {status !== 'todo' && (
                          <button
                            onClick={() =>
                              moveTask.mutate({
                                task,
                                status: status === 'done' ? 'doing' : 'todo'
                              })
                            }
                            title="后退状态"
                          >
                            ←
                          </button>
                        )}
                        {status !== 'done' && (
                          <button
                            onClick={() =>
                              moveTask.mutate({
                                task,
                                status: status === 'todo' ? 'doing' : 'done'
                              })
                            }
                            title="推进状态"
                          >
                            →
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="PROJECTS"
        title="让长期事情看得见"
        description="普通项目管任务，内容系列还可以管画像、期数和每日稿件。"
        actions={
          <button className="primary" onClick={() => setShowCreate(true)}>
            <PlusIcon size={16} />
            新建项目
          </button>
        }
      />

      <PanelState loading={projects.isLoading} error={projects.error} empty={!projects.data?.length}>
        <div className="project-grid">
          {projects.data?.map((project) => (
            <button className="project-card" key={project.id} onClick={() => setSelected(project)}>
              <small>{project.type === 'content_series' ? '内容系列' : '普通项目'}</small>
              <h2>{project.name}</h2>
              <p>{project.description || '还没有项目说明'}</p>
              <div>
                <span>{project.status === 'active' ? '进行中' : project.status}</span>
                <b>打开 →</b>
              </div>
            </button>
          ))}
        </div>
      </PanelState>

      {showCreate && (
        <Modal title="新建项目" onClose={() => setShowCreate(false)}>
          <ProjectForm pending={create.isPending} onSubmit={(body) => create.mutate(body)} />
        </Modal>
      )}
    </div>
  );
}

function ProjectContentCalendar({ project }: { project: Project }) {
  const client = useQueryClient();
  const [showBatch, setShowBatch] = useState(false);
  const [preview, setPreview] = useState<Array<{ title: string; plannedDate: string; episodeNo: number | null }>>([]);
  const start = new Date();
  start.setDate(1);
  const from = start.toISOString().slice(0, 10);
  const end = new Date(start.getFullYear(), start.getMonth() + 2, 0).toISOString().slice(0, 10);

  const scripts = useQuery({
    queryKey: ['content-calendar', project.id, from, end],
    queryFn: () => api<Script[]>(`/projects/${project.id}/content-calendar?from=${from}&to=${end}`)
  });

  const batch = useMutation({
    mutationFn: (body: {
      from: string;
      to: string;
      weekdays: number[];
      titleTemplate: string;
      startEpisodeNo: number | null;
      previewOnly: boolean;
    }) =>
      post<{
        preview: Array<{ title: string; plannedDate: string; episodeNo: number | null }>;
        scripts?: Script[];
      }>(`/projects/${project.id}/scripts/batch`, body),
    onSuccess: (result, variables) => {
      setPreview(result.preview);
      if (!variables.previewOnly) {
        void client.invalidateQueries({ queryKey: ['content-calendar', project.id] });
        void client.invalidateQueries({ queryKey: ['scripts'] });
        setShowBatch(false);
        setPreview([]);
      }
    }
  });

  return (
    <section className="paper-panel content-calendar" style={{ padding: 0 }}>
      <div className="section-heading" style={{ padding: '20px 24px', margin: 0 }}>
        <div>
          <span>稿件排期</span>
          <small style={{ display: 'block', marginTop: '4px' }}>
            {from} 至 {end}
          </small>
        </div>
        <button className="primary" onClick={() => setShowBatch(true)}>
          批量创建空稿
        </button>
      </div>

      <div style={{ padding: '16px 24px' }}>
        {scripts.data?.map((script) => (
          <article
            key={script.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '110px 90px 1fr 90px',
              gap: '12px',
              alignItems: 'center',
              padding: '14px 16px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)'
            }}
          >
            <time style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {script.plannedDate ?? '未排期'}
            </time>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {script.episodeNo ? `第 ${script.episodeNo} 期` : '单篇'}
            </span>
            <strong style={{ fontFamily: 'var(--font-writing)', fontSize: '14px' }}>
              {script.title}
            </strong>
            <b style={{ textAlign: 'right', fontSize: '11px', color: 'var(--brand-primary)' }}>
              {script.status}
            </b>
          </article>
        ))}
        {!scripts.data?.length && (
          <Empty title="这个月还没有稿件" text="可以手动新建，也可以按星期批量生成空稿。" />
        )}
      </div>

      {showBatch && (
        <Modal
          title="批量创建空稿"
          onClose={() => {
            setShowBatch(false);
            setPreview([]);
          }}
        >
          <BatchScriptForm
            pending={batch.isPending}
            preview={preview}
            onSubmit={(body) => batch.mutate(body)}
          />
        </Modal>
      )}
    </section>
  );
}

function BatchScriptForm({
  pending,
  preview,
  onSubmit
}: {
  pending: boolean;
  preview: Array<{ title: string; plannedDate: string; episodeNo: number | null }>;
  onSubmit: (body: {
    from: string;
    to: string;
    weekdays: number[];
    titleTemplate: string;
    startEpisodeNo: number | null;
    previewOnly: boolean;
  }) => void;
}) {
  const [values, setValues] = useState({
    from: new Date().toISOString().slice(0, 10),
    to: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10),
    titleTemplate: '第 {episode} 期',
    startEpisodeNo: '1'
  });
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);

  const body = (previewOnly: boolean) => ({
    from: values.from,
    to: values.to,
    weekdays,
    titleTemplate: values.titleTemplate,
    startEpisodeNo: values.startEpisodeNo ? Number(values.startEpisodeNo) : null,
    previewOnly
  });

  return (
    <div className="form-stack">
      <div className="date-pair">
        <label>
          开始日期
          <input
            type="date"
            value={values.from}
            onChange={(event) => setValues({ ...values, from: event.target.value })}
          />
        </label>
        <label>
          结束日期
          <input
            type="date"
            value={values.to}
            onChange={(event) => setValues({ ...values, to: event.target.value })}
          />
        </label>
      </div>
      <label>
        标题模板
        <input
          value={values.titleTemplate}
          onChange={(event) => setValues({ ...values, titleTemplate: event.target.value })}
        />
        <small style={{ color: 'var(--text-muted)' }}>可用 {'{episode}'} 和 {'{date}'}</small>
      </label>
      <label>
        起始期数
        <input
          type="number"
          min="1"
          value={values.startEpisodeNo}
          onChange={(event) => setValues({ ...values, startEpisodeNo: event.target.value })}
        />
      </label>
      <fieldset>
        <legend>创建星期</legend>
        <div className="weekday-row">
          {['一', '二', '三', '四', '五', '六', '日'].map((label, index) => (
            <label key={label}>
              <input
                type="checkbox"
                checked={weekdays.includes(index + 1)}
                onChange={(event) =>
                  setWeekdays(
                    event.target.checked
                      ? [...weekdays, index + 1]
                      : weekdays.filter((day) => day !== index + 1)
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {preview.length > 0 && (
        <div className="batch-preview">
          <strong>将创建 {preview.length} 篇</strong>
          {preview.map((item) => (
            <div key={`${item.plannedDate}-${item.episodeNo}`}>
              <time>{item.plannedDate}</time>
              <span>{item.title}</span>
            </div>
          ))}
        </div>
      )}

      {preview.length === 0 ? (
        <button
          className="primary"
          disabled={pending || weekdays.length === 0}
          onClick={() => onSubmit(body(true))}
        >
          {pending ? '正在计算…' : '预览日期与标题'}
        </button>
      ) : (
        <div className="form-actions">
          <button className="primary" disabled={pending} onClick={() => onSubmit(body(false))}>
            {pending ? '正在创建…' : '确认并一次创建'}
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectForm({
  pending,
  onSubmit
}: {
  pending: boolean;
  onSubmit: (body: unknown) => void;
}) {
  const [type, setType] = useState<'general' | 'content_series'>('content_series');

  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        const d = new FormData(event.currentTarget);
        const base = {
          name: String(d.get('name')),
          description: String(d.get('description') || '') || null,
          targetDate: null,
          type
        };
        onSubmit(
          type === 'general'
            ? base
            : {
                ...base,
                contentProfile: {
                  audience: String(d.get('audience')),
                  topicScope: String(d.get('topicScope')),
                  toneGuidelines: String(d.get('toneGuidelines')),
                  structureTemplate: String(d.get('structureTemplate')),
                  forbiddenPhrases: String(d.get('forbiddenPhrases') || '')
                    .split('、')
                    .filter(Boolean),
                  targetDurationSeconds: Number(d.get('targetDurationSeconds')),
                  cadenceWeekdays: d.getAll('weekday').map(Number)
                }
              }
        );
      }}
    >
      <div className="segmented">
        <button
          type="button"
          className={type === 'content_series' ? 'active' : ''}
          onClick={() => setType('content_series')}
        >
          内容系列
        </button>
        <button
          type="button"
          className={type === 'general' ? 'active' : ''}
          onClick={() => setType('general')}
        >
          普通项目
        </button>
      </div>

      <label>
        项目名称
        <input name="name" required autoFocus placeholder="例如：小单日谈" />
      </label>
      <label>
        项目说明
        <textarea name="description" rows={2} placeholder="概括项目主旨…" />
      </label>

      {type === 'content_series' && (
        <>
          <label>
            目标观众
            <input name="audience" required placeholder="谁会看这个系列" />
          </label>
          <label>
            选题范围
            <textarea name="topicScope" required rows={2} placeholder="覆盖的话题与边界…" />
          </label>
          <label>
            语气规范
            <textarea name="toneGuidelines" required rows={2} placeholder="直爽、通俗、幽默…" />
          </label>
          <label>
            结构模板
            <textarea name="structureTemplate" required rows={2} placeholder="起承转合结构…" />
          </label>
          <label>
            禁用词（用顿号分隔）
            <input name="forbiddenPhrases" placeholder="例如：其实、基本上、顾名思义" />
          </label>
          <label>
            目标时长（秒）
            <input name="targetDurationSeconds" type="number" min="10" defaultValue="180" required />
          </label>
          <fieldset>
            <legend>更新星期</legend>
            <div className="weekday-row">
              {['一', '二', '三', '四', '五', '六', '日'].map((label, index) => (
                <label key={label}>
                  <input type="checkbox" name="weekday" value={index + 1} defaultChecked={index < 5} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <button className="primary" disabled={pending}>
        {pending ? '正在创建…' : '创建项目'}
      </button>
    </form>
  );
}
