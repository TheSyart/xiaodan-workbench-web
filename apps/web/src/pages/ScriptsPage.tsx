import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Project, Script, ScriptAiRun } from '@xiaodan/contracts';
import { api, apiRoot, post, put } from '../api.js';
import { ScriptEditor, type SaveState } from '../components/ScriptEditor.js';
import { Empty } from '../components/common/PageHeader.js';
import { PlusIcon } from '../components/common/Icons.js';

export function ScriptsPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [selection, setSelection] = useState({ from: 0, to: 0 });
  const [activeRun, setActiveRun] = useState<ScriptAiRun | null>(null);

  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') });
  const scriptsQuery = useQuery({ queryKey: ['scripts'], queryFn: () => api<Script[]>('/scripts') });

  const selected = scriptsQuery.data?.find((item) => item.id === selectedId) ?? scriptsQuery.data?.[0] ?? null;
  const history = useQuery({
    queryKey: ['ai-history', selected?.id],
    queryFn: () => api<ScriptAiRun[]>(`/scripts/${selected!.id}/ai-history`),
    enabled: Boolean(selected)
  });

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  useEffect(() => {
    if (selected) setContent(selected.contentMarkdown);
  }, [selected?.id]);

  const create = useMutation({
    mutationFn: () =>
      post<Script>('/scripts', {
        title: `未命名稿件 ${new Date().toLocaleDateString('zh-CN')}`,
        projectId: projects.data?.[0]?.id ?? null,
        plannedDate: new Date().toISOString().slice(0, 10),
        episodeNo: null
      }),
    onSuccess: (script) => {
      void client.invalidateQueries({ queryKey: ['scripts'] });
      setSelectedId(script.id);
    }
  });

  const save = async (value: string) => {
    if (!selected) return;
    setSaveState('saving');
    try {
      const result = await put<Script>(
        `/scripts/${selected.id}/content`,
        { contentMarkdown: value },
        selected.version
      );
      client.setQueryData<Script[]>(['scripts'], (old) =>
        old?.map((item) => (item.id === result.id ? result : item))
      );
      setSaveState('saved');
    } catch {
      setSaveState('error');
      throw new Error('save failed');
    }
  };

  const runAi = async (operation: string, instruction: string | null = null) => {
    if (!selected) return;
    const scope = selection.to > selection.from ? 'selection' : 'current_beat';
    const run = await post<ScriptAiRun>(`/scripts/${selected.id}/ai-runs`, {
      operation,
      scope,
      selectionFrom: selection.from,
      selectionTo: scope === 'selection' ? selection.to : null,
      instruction,
      referencedScriptIds: []
    });
    setActiveRun(run);

    const source = new EventSource(`${apiRoot}/script-ai-runs/${run.id}/events`);
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { type: string };
      if (payload.type === 'done' || payload.type === 'error') {
        source.close();
        void api<ScriptAiRun>(`/script-ai-runs/${run.id}`).then((done) => {
          setActiveRun(done);
          void client.invalidateQueries({ queryKey: ['ai-history', selected.id] });
        });
      }
    };
  };

  const accept = async (ids: string[]) => {
    if (!activeRun) return;
    const result = await post<{ run: ScriptAiRun; script: Script }>(
      `/script-ai-runs/${activeRun.id}/accept`,
      { hunkIds: ids }
    );
    setActiveRun(result.run);
    setContent(result.script.contentMarkdown);
    client.setQueryData<Script[]>(['scripts'], (old) =>
      old?.map((item) => (item.id === result.script.id ? result.script : item))
    );
  };

  const beats = content.split(/\r?\n/).filter((line) => line.trim()).length;
  const estimate = Math.max(1, Math.round(content.replace(/\s/g, '').length / 240));

  return (
    <div className="scripts-workspace">
      <aside className="script-rail">
        <div className="rail-header">
          <div>
            <small>稿件工作台</small>
            <strong>每日稿件</strong>
          </div>
          <button onClick={() => create.mutate()} title="新建稿件">
            <PlusIcon size={16} />
          </button>
        </div>

        <select aria-label="筛选项目">
          <option>全部项目</option>
          {projects.data?.map((project) => (
            <option key={project.id}>{project.name}</option>
          ))}
        </select>

        <div className="script-list">
          {scriptsQuery.data?.map((script) => (
            <button
              key={script.id}
              className={selected?.id === script.id ? 'active' : ''}
              onClick={() => setSelectedId(script.id)}
            >
              <small>
                {script.plannedDate ?? '未排期'}{' '}
                {script.episodeNo ? `· 第 ${script.episodeNo} 期` : ''}
              </small>
              <strong>{script.title}</strong>
              <span>{script.status === 'draft' ? '草稿' : script.status}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="writing-stage">
        {selected ? (
          <>
            <header className="writing-toolbar">
              <div>
                <input aria-label="稿件标题" value={selected.title} readOnly />
                <small>
                  {saveState === 'saving'
                    ? '保存中…'
                    : saveState === 'error'
                    ? '保存失败，正文仍在本页'
                    : saveState === 'saved'
                    ? '已保存'
                    : '等待输入'}{' '}
                  · {beats} 个节拍 · 预计 {estimate} 分钟
                </small>
              </div>
              <button onClick={() => navigate('/calendar')}>排期</button>
            </header>

            <div className="paper-editor">
              <ScriptEditor
                value={content}
                onChange={setContent}
                onSave={save}
                onSelectionChange={(from, to) => setSelection({ from, to })}
                saveState={saveState}
              />
            </div>

            <div className="selection-tools">
              <span>{selection.to > selection.from ? '已选择文本' : '当前节拍'}</span>
              {(
                [
                  ['polish', '润色'],
                  ['condense', '精简'],
                  ['expand', '扩写'],
                  ['rhythm', '节拍优化']
                ] as const
              ).map(([key, label]) => (
                <button key={key} onClick={() => void runAi(key)}>
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <Empty title="还没有稿件" text="点击左上角加号新建第一篇。" />
        )}
      </section>

      <aside className="ai-panel">
        <div className="ai-heading">
          <div>
            <span className="brand-mark small">单</span>
            <div>
              <strong>AI 写作助手</strong>
              <small>只给候选，不会直接改正文</small>
            </div>
          </div>
          <button onClick={() => selected && void runAi('ideate')}>拓展思路</button>
        </div>

        {activeRun ? (
          <AiCandidate
            run={activeRun}
            onAccept={accept}
            onIdea={(idea) => void runAi('expand', `在当前节拍后插入并展开这个想法：${idea}`)}
          />
        ) : (
          <div className="ai-empty">
            <strong>从一个明确动作开始</strong>
            <p>选择一段文字进行润色、精简、扩写或节拍优化。全文处理需要你显式选择。</p>
            <div className="rule-note">
              系列画像与当前稿件会作为默认上下文；历史稿件需主动选择。
            </div>
          </div>
        )}

        <details className="ai-history">
          <summary>历史候选（{history.data?.length ?? 0}）</summary>
          {history.data?.map((run) => (
            <button key={run.id} onClick={() => setActiveRun(run)}>
              <span>{run.operation}</span>
              <small>
                {run.status} · {new Date(run.createdAt).toLocaleString('zh-CN')}
              </small>
            </button>
          ))}
        </details>
      </aside>
    </div>
  );
}

function AiCandidate({
  run,
  onAccept,
  onIdea
}: {
  run: ScriptAiRun;
  onAccept: (ids: string[]) => void;
  onIdea: (idea: string) => void;
}) {
  const [accepted, setAccepted] = useState<string[]>(() =>
    run.diffHunks.filter((h) => h.kind === 'change').map((h) => h.id)
  );
  const stale = run.status === 'stale';

  if (['queued', 'streaming'].includes(run.status)) {
    return (
      <div className="ai-running">
        <i />
        <strong>小单正在整理候选</strong>
        <p>你可以继续编辑。正文一旦变化，这份候选会自动过期。</p>
      </div>
    );
  }

  if (run.operation === 'ideate') {
    return (
      <div className="candidate">
        <h3>思路卡</h3>
        {run.candidateText
          .split('\n')
          .filter(Boolean)
          .map((idea, index) => (
            <button className="idea-card" key={index} onClick={() => onIdea(idea)}>
              {idea}
              <small>选择并生成插入候选 →</small>
            </button>
          ))}
        <small>选择想法后再生成插入候选，不会直接写入正文。</small>
      </div>
    );
  }

  return (
    <div className="candidate">
      <div className="candidate-status">
        <span>{stale ? '候选已过期' : '候选差异'}</span>
        <small>{run.model}</small>
      </div>
      {stale && <div className="stale-note">正文已经变化。你仍可查看和复制，但不能采纳。</div>}
      <div className="diff-list">
        {run.diffHunks
          .filter((h) => h.kind === 'change')
          .map((h) => (
            <article key={h.id} className={accepted.includes(h.id) ? 'accepted' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={accepted.includes(h.id)}
                  disabled={stale}
                  onChange={(event) =>
                    setAccepted(
                      event.target.checked
                        ? [...accepted, h.id]
                        : accepted.filter((id) => id !== h.id)
                    )
                  }
                />
                采纳此段
              </label>
              <div className="diff-old">{h.originalText || '（空）'}</div>
              <div className="diff-new">{h.candidateText || '（删除）'}</div>
            </article>
          ))}
      </div>
      <button
        className="primary full"
        disabled={stale || run.status !== 'completed'}
        onClick={() => onAccept(accepted)}
      >
        采纳所选修改
      </button>
    </div>
  );
}
