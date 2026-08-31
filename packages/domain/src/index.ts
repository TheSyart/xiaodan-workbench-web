import BetterSqlite3, { type Database as SqliteDatabase } from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { diffLines, diffWordsWithSpace } from 'diff';
import type {
  CreateProjectInput,
  CreateScriptInput,
  Project,
  ProjectContentProfile,
  Task,
  FinanceTransaction,
  CalendarItem,
  Script,
  ScriptAiOperation,
  ScriptAiRun,
  ScriptAiScope,
  ScriptDiffHunk
} from '@xiaodan/contracts';

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export type WorkbenchDatabase = SqliteDatabase & { migrate(): void };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mutation_receipts (
  mutation_id TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('general','content_series')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','archived')),
  target_date TEXT,
  progress_mode TEXT NOT NULL DEFAULT 'auto' CHECK(progress_mode IN ('auto','manual')),
  manual_progress INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE TABLE IF NOT EXISTS project_content_profiles (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  audience TEXT NOT NULL,
  topic_scope TEXT NOT NULL,
  tone_guidelines TEXT NOT NULL,
  structure_template TEXT NOT NULL,
  forbidden_phrases_json TEXT NOT NULL,
  target_duration_seconds INTEGER NOT NULL,
  cadence_weekdays_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done')),
  due_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  title TEXT NOT NULL,
  content_markdown TEXT NOT NULL DEFAULT '',
  planned_date TEXT,
  episode_no INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','recorded','published','archived')),
  published_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scripts_project_episode
  ON scripts(project_id, episode_no) WHERE project_id IS NOT NULL AND episode_no IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scripts_project_date ON scripts(project_id, planned_date);
CREATE TABLE IF NOT EXISTS finance_categories (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
  name TEXT NOT NULL,
  archived_at TEXT
);
CREATE TABLE IF NOT EXISTS finance_transactions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'CNY' CHECK(currency = 'CNY'),
  category_id TEXT NOT NULL REFERENCES finance_categories(id),
  occurred_at TEXT NOT NULL,
  counterparty TEXT,
  note TEXT,
  project_id TEXT REFERENCES projects(id),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS finance_transaction_documents (
  transaction_id TEXT NOT NULL REFERENCES finance_transactions(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  PRIMARY KEY(transaction_id, document_id)
);
CREATE TABLE IF NOT EXISTS calendar_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('event','task_block','script_block','reminder')),
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  project_id TEXT REFERENCES projects(id),
  task_id TEXT REFERENCES tasks(id),
  script_id TEXT REFERENCES scripts(id),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS calendar_alerts (
  id TEXT PRIMARY KEY,
  calendar_item_id TEXT NOT NULL REFERENCES calendar_items(id),
  alert_at TEXT NOT NULL,
  delivered_at TEXT,
  UNIQUE(calendar_item_id, alert_at)
);
CREATE TABLE IF NOT EXISTS script_ai_runs (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL REFERENCES scripts(id),
  operation TEXT NOT NULL,
  scope TEXT NOT NULL,
  selection_from INTEGER,
  selection_to INTEGER,
  instruction TEXT,
  base_version INTEGER NOT NULL,
  base_content_hash TEXT NOT NULL,
  referenced_script_ids_json TEXT NOT NULL,
  model TEXT NOT NULL,
  original_text TEXT NOT NULL,
  candidate_text TEXT NOT NULL DEFAULT '',
  diff_hunks_json TEXT NOT NULL DEFAULT '[]',
  accepted_hunk_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  usage_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS script_ai_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES script_ai_runs(id),
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL,
  response_text TEXT NOT NULL DEFAULT '',
  confirmation_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
`;

const now = () => new Date().toISOString();

export function createDatabase(path: string): WorkbenchDatabase {
  const db = new BetterSqlite3(path);
  db.pragma('foreign_keys = ON');
  if (path !== ':memory:') db.pragma('journal_mode = WAL');
  const migrate = () => {
    db.transaction(() => {
      db.exec(SCHEMA);
      db.prepare('INSERT OR IGNORE INTO migrations(version, applied_at) VALUES(1, ?)').run(now());
      db.pragma('user_version = 1');
      seedCategories(db);
    })();
  };
  Object.defineProperty(db, 'migrate', { value: migrate, enumerable: false });
  migrate();
  return db as WorkbenchDatabase;
}

function seedCategories(db: SqliteDatabase) {
  const insert = db.prepare('INSERT OR IGNORE INTO finance_categories(id, kind, name) VALUES(?,?,?)');
  const expense = ['餐饮', '交通', '居住', '购物', '学习', '医疗', '娱乐', '其他'];
  const income = ['工资', '项目收入', '兼职', '退款', '其他收入'];
  expense.forEach((name, index) => insert.run(`expense-${index + 1}`, 'expense', name));
  income.forEach((name, index) => insert.run(`income-${index + 1}`, 'income', name));
}

function readReceipt<T>(db: SqliteDatabase, mutationId: string): T | null {
  const row = db.prepare('SELECT response_json FROM mutation_receipts WHERE mutation_id = ?').get(mutationId) as { response_json: string } | undefined;
  return row ? JSON.parse(row.response_json) as T : null;
}

function writeReceipt(db: SqliteDatabase, mutationId: string, operation: string, result: unknown) {
  db.prepare('INSERT INTO mutation_receipts(mutation_id, operation, response_json, created_at) VALUES(?,?,?,?)')
    .run(mutationId, operation, JSON.stringify(result), now());
}

function projectFromRow(row: Record<string, unknown>): Project {
  return {
    id: String(row.id), name: String(row.name), description: row.description as string | null,
    type: row.type as Project['type'], status: row.status as Project['status'], targetDate: row.target_date as string | null,
    progressMode: row.progress_mode as Project['progressMode'], manualProgress: row.manual_progress as number | null,
    version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    archivedAt: row.archived_at as string | null
  };
}

function scriptFromRow(row: Record<string, unknown>): Script {
  return {
    id: String(row.id), projectId: row.project_id as string | null, title: String(row.title),
    contentMarkdown: String(row.content_markdown), plannedDate: row.planned_date as string | null,
    episodeNo: row.episode_no as number | null, status: row.status as Script['status'],
    publishedAt: row.published_at as string | null, version: Number(row.version),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), archivedAt: row.archived_at as string | null
  };
}

function mapSqliteError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('idx_scripts_project_episode') || message.includes('scripts.project_id, scripts.episode_no')) {
    throw new DomainError('SCRIPT_EPISODE_CONFLICT', '同一项目的期数不能重复', 409);
  }
  if (message.includes('FOREIGN KEY')) throw new DomainError('RESOURCE_NOT_FOUND', '关联资源不存在', 404);
  throw error;
}

export function createProjectRepository(db: WorkbenchDatabase) {
  return {
    list(includeArchived = false): Project[] {
      return (db.prepare(`SELECT * FROM projects ${includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY updated_at DESC`).all() as Record<string, unknown>[]).map(projectFromRow);
    },
    get(id: string): Project | null {
      const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      return row ? projectFromRow(row) : null;
    },
    create(input: CreateProjectInput, mutationId: string): Project {
      const previous = readReceipt<Project>(db, mutationId);
      if (previous) return previous;
      return db.transaction(() => {
        const timestamp = now();
        const project: Project = {
          id: nanoid(), name: input.name, description: input.description, type: input.type,
          status: 'active', targetDate: input.targetDate, progressMode: 'auto', manualProgress: null,
          version: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null
        };
        db.prepare(`INSERT INTO projects(id,name,description,type,status,target_date,progress_mode,manual_progress,version,created_at,updated_at,archived_at)
          VALUES(@id,@name,@description,@type,@status,@targetDate,@progressMode,@manualProgress,@version,@createdAt,@updatedAt,@archivedAt)`).run(project);
        if (input.type === 'content_series') {
          const profile = input.contentProfile;
          db.prepare(`INSERT INTO project_content_profiles(project_id,audience,topic_scope,tone_guidelines,structure_template,forbidden_phrases_json,target_duration_seconds,cadence_weekdays_json,version)
            VALUES(?,?,?,?,?,?,?,?,1)`).run(project.id, profile.audience, profile.topicScope, profile.toneGuidelines,
              profile.structureTemplate, JSON.stringify(profile.forbiddenPhrases), profile.targetDurationSeconds, JSON.stringify(profile.cadenceWeekdays));
        }
        writeReceipt(db, mutationId, 'projects.create', project);
        return project;
      })();
    },
    update(id: string, patch: Partial<Project>, expectedVersion: number, mutationId: string): Project {
      const previous = readReceipt<Project>(db, mutationId); if (previous) return previous;
      return db.transaction(() => {
        const current = this.get(id);
        if (!current) throw new DomainError('RESOURCE_NOT_FOUND', '项目不存在', 404);
        if (current.version !== expectedVersion) throw new DomainError('RESOURCE_VERSION_CONFLICT', '项目已被其他操作修改', 409, { currentVersion: current.version });
        const next = { ...current, ...patch, id, version: current.version + 1, updatedAt: now() };
        db.prepare(`UPDATE projects SET name=?,description=?,status=?,target_date=?,progress_mode=?,manual_progress=?,version=?,updated_at=?,archived_at=? WHERE id=?`)
          .run(next.name, next.description, next.status, next.targetDate, next.progressMode, next.manualProgress, next.version, next.updatedAt, next.archivedAt, id);
        writeReceipt(db, mutationId, 'projects.update', next); return next;
      })();
    },
    getContentProfile(projectId: string): ProjectContentProfile | null {
      const row = db.prepare('SELECT * FROM project_content_profiles WHERE project_id = ?').get(projectId) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        projectId, audience: String(row.audience), topicScope: String(row.topic_scope),
        toneGuidelines: String(row.tone_guidelines), structureTemplate: String(row.structure_template),
        forbiddenPhrases: JSON.parse(String(row.forbidden_phrases_json)) as string[],
        targetDurationSeconds: Number(row.target_duration_seconds),
        cadenceWeekdays: JSON.parse(String(row.cadence_weekdays_json)) as number[], version: Number(row.version)
      };
    },
    saveContentProfile(projectId: string, profile: Omit<ProjectContentProfile, 'projectId' | 'version'>, expectedVersion: number | null, mutationId: string): ProjectContentProfile {
      const previous = readReceipt<ProjectContentProfile>(db, mutationId); if (previous) return previous;
      return db.transaction(() => {
        const current = this.getContentProfile(projectId);
        if (current && expectedVersion !== current.version) throw new DomainError('RESOURCE_VERSION_CONFLICT', '系列画像已更新', 409);
        const version = current ? current.version + 1 : 1;
        db.prepare(`INSERT INTO project_content_profiles(project_id,audience,topic_scope,tone_guidelines,structure_template,forbidden_phrases_json,target_duration_seconds,cadence_weekdays_json,version)
          VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET audience=excluded.audience,topic_scope=excluded.topic_scope,tone_guidelines=excluded.tone_guidelines,structure_template=excluded.structure_template,forbidden_phrases_json=excluded.forbidden_phrases_json,target_duration_seconds=excluded.target_duration_seconds,cadence_weekdays_json=excluded.cadence_weekdays_json,version=excluded.version`)
          .run(projectId, profile.audience, profile.topicScope, profile.toneGuidelines, profile.structureTemplate,
            JSON.stringify(profile.forbiddenPhrases), profile.targetDurationSeconds, JSON.stringify(profile.cadenceWeekdays), version);
        const result = { projectId, ...profile, version }; writeReceipt(db, mutationId, 'profiles.save', result); return result;
      })();
    }
  };
}

export interface ScriptListFilter { projectId: string | null; plannedFrom: string | null; plannedTo: string | null; includeArchived: boolean }

export function createScriptRepository(db: WorkbenchDatabase) {
  return {
    list(filter: ScriptListFilter): Script[] {
      const clauses: string[] = []; const values: unknown[] = [];
      if (filter.projectId) { clauses.push('project_id = ?'); values.push(filter.projectId); }
      if (filter.plannedFrom) { clauses.push('planned_date >= ?'); values.push(filter.plannedFrom); }
      if (filter.plannedTo) { clauses.push('planned_date <= ?'); values.push(filter.plannedTo); }
      if (!filter.includeArchived) clauses.push('archived_at IS NULL');
      const rows = db.prepare(`SELECT * FROM scripts ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY COALESCE(planned_date,'9999-12-31'), episode_no, updated_at DESC`).all(...values) as Record<string, unknown>[];
      return rows.map(scriptFromRow);
    },
    get(id: string): Script | null {
      const row = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      return row ? scriptFromRow(row) : null;
    },
    create(input: CreateScriptInput, mutationId: string): Script {
      const previous = readReceipt<Script>(db, mutationId); if (previous) return previous;
      try {
        return db.transaction(() => {
          const timestamp = now();
          const script: Script = { id: nanoid(), projectId: input.projectId, title: input.title, contentMarkdown: '',
            plannedDate: input.plannedDate, episodeNo: input.episodeNo, status: 'draft', publishedAt: null,
            version: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null };
          db.prepare(`INSERT INTO scripts(id,project_id,title,content_markdown,planned_date,episode_no,status,published_at,version,created_at,updated_at,archived_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(script.id, script.projectId, script.title, script.contentMarkdown, script.plannedDate,
              script.episodeNo, script.status, script.publishedAt, script.version, script.createdAt, script.updatedAt, script.archivedAt);
          writeReceipt(db, mutationId, 'scripts.create', script); return script;
        })();
      } catch (error) { return mapSqliteError(error); }
    },
    saveContent(id: string, contentMarkdown: string, expectedVersion: number, mutationId: string): Script {
      const previous = readReceipt<Script>(db, mutationId); if (previous) return previous;
      if (Buffer.byteLength(contentMarkdown, 'utf8') > 2 * 1024 * 1024) throw new DomainError('SCRIPT_CONTENT_TOO_LARGE', '正文超过 2 MiB', 413);
      return db.transaction(() => {
        const current = this.get(id);
        if (!current) throw new DomainError('RESOURCE_NOT_FOUND', '稿件不存在', 404);
        if (current.version !== expectedVersion) throw new DomainError('RESOURCE_VERSION_CONFLICT', '稿件已被修改，未覆盖当前正文', 409, { currentVersion: current.version });
        const updatedAt = now(); const version = current.version + 1;
        db.prepare('UPDATE scripts SET content_markdown=?, version=?, updated_at=? WHERE id=?').run(contentMarkdown, version, updatedAt, id);
        const result = { ...current, contentMarkdown, version, updatedAt };
        db.prepare(`UPDATE script_ai_runs SET status='stale' WHERE script_id=? AND status IN ('queued','streaming','completed') AND base_version < ?`).run(id, version);
        writeReceipt(db, mutationId, 'scripts.saveContent', result); return result;
      })();
    },
    updateMetadata(id: string, patch: Partial<Pick<Script, 'projectId'|'title'|'plannedDate'|'episodeNo'|'status'|'publishedAt'|'archivedAt'>>, expectedVersion: number, mutationId: string): Script {
      const previous = readReceipt<Script>(db, mutationId); if (previous) return previous;
      try {
        return db.transaction(() => {
          const current = this.get(id); if (!current) throw new DomainError('RESOURCE_NOT_FOUND', '稿件不存在', 404);
          if (current.version !== expectedVersion) throw new DomainError('RESOURCE_VERSION_CONFLICT', '稿件已被修改', 409);
          const next = { ...current, ...patch, version: current.version + 1, updatedAt: now() };
          db.prepare(`UPDATE scripts SET project_id=?,title=?,planned_date=?,episode_no=?,status=?,published_at=?,version=?,updated_at=?,archived_at=? WHERE id=?`)
            .run(next.projectId, next.title, next.plannedDate, next.episodeNo, next.status, next.publishedAt, next.version, next.updatedAt, next.archivedAt, id);
          writeReceipt(db, mutationId, 'scripts.updateMetadata', next); return next;
        })();
      } catch (error) { return mapSqliteError(error); }
    },
    batchCreate(projectId: string, entries: Array<{ title: string; plannedDate: string; episodeNo: number | null }>, mutationId: string): Script[] {
      const previous = readReceipt<Script[]>(db, mutationId); if (previous) return previous;
      try {
        return db.transaction(() => {
          const results = entries.map((entry, index) => this.create({ projectId, ...entry }, `${mutationId}:item:${index}`));
          writeReceipt(db, mutationId, 'scripts.batchCreate', results); return results;
        })();
      } catch (error) { return mapSqliteError(error); }
    }
  };
}

function makeDiffHunks(originalText: string, candidateText: string): ScriptDiffHunk[] {
  const lineParts = diffLines(originalText, candidateText);
  const hunks: ScriptDiffHunk[] = [];
  for (let index = 0; index < lineParts.length; index++) {
    const part = lineParts[index]!;
    if (!part.added && !part.removed) {
      hunks.push({ id: `h${hunks.length + 1}`, kind: 'equal', originalText: part.value, candidateText: part.value,
        tokens: [{ type: 'equal', text: part.value }] });
      continue;
    }
    let original = ''; let candidate = '';
    if (part.removed) original = part.value; else if (part.added) candidate = part.value;
    const next = lineParts[index + 1];
    if (part.removed && next?.added) { candidate = next.value; index++; }
    const tokens = diffWordsWithSpace(original, candidate).map((token) => ({
      type: token.added ? 'insert' as const : token.removed ? 'delete' as const : 'equal' as const,
      text: token.value
    }));
    hunks.push({ id: `h${hunks.length + 1}`, kind: 'change', originalText: original, candidateText: candidate, tokens });
  }
  return hunks;
}

function aiRunFromRow(row: Record<string, unknown>): ScriptAiRun {
  return {
    id: String(row.id), scriptId: String(row.script_id), operation: row.operation as ScriptAiOperation,
    scope: row.scope as ScriptAiScope, selectionFrom: row.selection_from as number | null, selectionTo: row.selection_to as number | null,
    instruction: row.instruction as string | null, baseVersion: Number(row.base_version), baseContentHash: String(row.base_content_hash),
    referencedScriptIds: JSON.parse(String(row.referenced_script_ids_json)) as string[], model: String(row.model),
    originalText: String(row.original_text), candidateText: String(row.candidate_text),
    diffHunks: JSON.parse(String(row.diff_hunks_json)) as ScriptDiffHunk[],
    acceptedHunkIds: JSON.parse(String(row.accepted_hunk_ids_json)) as string[], status: row.status as ScriptAiRun['status'],
    usage: row.usage_json ? JSON.parse(String(row.usage_json)) as ScriptAiRun['usage'] : null,
    errorMessage: row.error_message as string | null, createdAt: String(row.created_at), completedAt: row.completed_at as string | null
  };
}

type CompletedRunInput = Pick<ScriptAiRun, 'scriptId'|'operation'|'scope'|'selectionFrom'|'selectionTo'|'instruction'|'baseVersion'|'baseContentHash'|'referencedScriptIds'|'model'|'originalText'|'candidateText'|'usage'> & { id?: string };
type PendingRunInput = Omit<CompletedRunInput, 'candidateText' | 'usage'>;

export function contentHash(content: string) { return createHash('sha256').update(content).digest('hex'); }

export function createScriptAiRepository(db: WorkbenchDatabase) {
  const scripts = createScriptRepository(db);
  return {
    get(id: string): ScriptAiRun | null {
      const row = db.prepare('SELECT * FROM script_ai_runs WHERE id=?').get(id) as Record<string, unknown> | undefined;
      return row ? aiRunFromRow(row) : null;
    },
    listForScript(scriptId: string): ScriptAiRun[] {
      return (db.prepare('SELECT * FROM script_ai_runs WHERE script_id=? ORDER BY created_at DESC').all(scriptId) as Record<string, unknown>[]).map(aiRunFromRow);
    },
    createPendingRun(input: PendingRunInput): ScriptAiRun {
      const timestamp = now(); const id = input.id ?? nanoid();
      db.prepare(`INSERT INTO script_ai_runs(id,script_id,operation,scope,selection_from,selection_to,instruction,base_version,base_content_hash,referenced_script_ids_json,model,original_text,candidate_text,diff_hunks_json,accepted_hunk_ids_json,status,usage_json,error_message,created_at,completed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, input.scriptId, input.operation, input.scope, input.selectionFrom, input.selectionTo,
          input.instruction, input.baseVersion, input.baseContentHash, JSON.stringify(input.referencedScriptIds), input.model, input.originalText,
          '', '[]', '[]', 'queued', null, null, timestamp, null);
      this.addEvent(id, { type: 'status', status: 'queued' });
      return this.get(id)!;
    },
    addEvent(runId: string, event: unknown): number {
      const result = db.prepare('INSERT INTO script_ai_events(run_id,event_json,created_at) VALUES(?,?,?)').run(runId, JSON.stringify(event), now());
      return Number(result.lastInsertRowid);
    },
    listEvents(runId: string, afterId = 0): Array<{ id: number; event: unknown }> {
      return (db.prepare('SELECT id,event_json FROM script_ai_events WHERE run_id=? AND id>? ORDER BY id').all(runId, afterId) as Array<{id:number;event_json:string}>)
        .map((row) => ({ id: row.id, event: JSON.parse(row.event_json) as unknown }));
    },
    setStreaming(runId: string): ScriptAiRun {
      db.prepare("UPDATE script_ai_runs SET status='streaming' WHERE id=? AND status='queued'").run(runId);
      this.addEvent(runId, { type: 'status', status: 'streaming' }); return this.get(runId)!;
    },
    complete(runId: string, candidateText: string, usage: ScriptAiRun['usage']): ScriptAiRun {
      const run = this.get(runId); if (!run) throw new DomainError('RESOURCE_NOT_FOUND', 'AI 候选不存在', 404);
      const script = scripts.get(run.scriptId); const stale = !script || script.version !== run.baseVersion || contentHash(script.contentMarkdown) !== run.baseContentHash;
      const status = stale ? 'stale' : 'completed'; const completedAt = now(); const hunks = makeDiffHunks(run.originalText, candidateText);
      db.prepare('UPDATE script_ai_runs SET candidate_text=?,diff_hunks_json=?,usage_json=?,status=?,completed_at=? WHERE id=?')
        .run(candidateText, JSON.stringify(hunks), usage ? JSON.stringify(usage) : null, status, completedAt, runId);
      if (usage) this.addEvent(runId, { type: 'usage', inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
      this.addEvent(runId, { type: 'status', status }); this.addEvent(runId, { type: 'done', runId }); return this.get(runId)!;
    },
    fail(runId: string, message: string): ScriptAiRun {
      db.prepare("UPDATE script_ai_runs SET status='failed',error_message=?,completed_at=? WHERE id=?").run(message,now(),runId);
      this.addEvent(runId,{type:'error',code:'AI_GENERATION_FAILED',message});return this.get(runId)!;
    },
    cancel(runId: string): ScriptAiRun {
      db.prepare("UPDATE script_ai_runs SET status='cancelled',completed_at=? WHERE id=? AND status IN ('queued','streaming')").run(now(),runId);
      this.addEvent(runId,{type:'status',status:'cancelled'});return this.get(runId)!;
    },
    createCompletedRun(input: CompletedRunInput): ScriptAiRun {
      const timestamp = now(); const id = input.id ?? nanoid(); const diffHunks = makeDiffHunks(input.originalText, input.candidateText);
      db.prepare(`INSERT INTO script_ai_runs(id,script_id,operation,scope,selection_from,selection_to,instruction,base_version,base_content_hash,referenced_script_ids_json,model,original_text,candidate_text,diff_hunks_json,accepted_hunk_ids_json,status,usage_json,error_message,created_at,completed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, input.scriptId, input.operation, input.scope, input.selectionFrom, input.selectionTo,
          input.instruction, input.baseVersion, input.baseContentHash, JSON.stringify(input.referencedScriptIds), input.model, input.originalText,
          input.candidateText, JSON.stringify(diffHunks), '[]', 'completed', input.usage ? JSON.stringify(input.usage) : null, null, timestamp, timestamp);
      return this.get(id)!;
    },
    accept(runId: string, hunkIds: string[], mutationId: string): { run: ScriptAiRun; script: Script } {
      const previous = readReceipt<{ run: ScriptAiRun; script: Script }>(db, mutationId); if (previous) return previous;
      const run = this.get(runId); if (!run) throw new DomainError('RESOURCE_NOT_FOUND', 'AI 候选不存在', 404);
      const script = scripts.get(run.scriptId); if (!script) throw new DomainError('RESOURCE_NOT_FOUND', '稿件不存在', 404);
      if (script.version !== run.baseVersion || contentHash(script.contentMarkdown) !== run.baseContentHash) {
        db.prepare("UPDATE script_ai_runs SET status='stale' WHERE id=?").run(runId);
        throw new DomainError('AI_RUN_STALE', '正文已变化，候选只能查看，不能采纳', 409);
      }
      if (run.status === 'stale') throw new DomainError('AI_RUN_STALE', '候选已过期', 409);
      return db.transaction(() => {
        const accepted = new Set(hunkIds);
        const finalContent = run.diffHunks.map((hunk) => hunk.kind === 'equal' || !accepted.has(hunk.id) ? hunk.originalText : hunk.candidateText).join('');
        const timestamp = now(); const version = script.version + 1;
        db.prepare('UPDATE scripts SET content_markdown=?,version=?,updated_at=? WHERE id=?').run(finalContent, version, timestamp, script.id);
        db.prepare("UPDATE script_ai_runs SET accepted_hunk_ids_json=?,status='accepted' WHERE id=?").run(JSON.stringify([...accepted]), runId);
        db.prepare(`UPDATE script_ai_runs SET status='stale' WHERE script_id=? AND id<>? AND status IN ('queued','streaming','completed')`).run(script.id, runId);
        const result = { run: this.get(runId)!, script: { ...script, contentMarkdown: finalContent, version, updatedAt: timestamp } };
        writeReceipt(db, mutationId, 'ai.accept', result); return result;
      })();
    },
    reject(runId: string, mutationId: string): ScriptAiRun {
      const previous = readReceipt<ScriptAiRun>(db, mutationId); if (previous) return previous;
      return db.transaction(() => {
        const run = this.get(runId); if (!run) throw new DomainError('RESOURCE_NOT_FOUND', 'AI 候选不存在', 404);
        db.prepare("UPDATE script_ai_runs SET status='rejected' WHERE id=?").run(runId);
        const result = this.get(runId)!; writeReceipt(db, mutationId, 'ai.reject', result); return result;
      })();
    }
  };
}

type FinanceInput = Omit<FinanceTransaction, 'id' | 'currency' | 'version' | 'deletedAt'> & { documentIds: string[] };
type TaskInput = Pick<Task, 'projectId' | 'title' | 'notes' | 'dueAt'>;
type CalendarInput = Omit<CalendarItem, 'id' | 'version' | 'deletedAt'>;

function taskFromRow(row: Record<string, unknown>): Task {
  return { id: String(row.id), projectId: String(row.project_id), title: String(row.title), notes: row.notes as string | null,
    status: row.status as Task['status'], dueAt: row.due_at as string | null, sortOrder: Number(row.sort_order),
    completedAt: row.completed_at as string | null, version: Number(row.version), deletedAt: row.deleted_at as string | null };
}

function transactionFromRow(row: Record<string, unknown>): FinanceTransaction {
  return { id: String(row.id), kind: row.kind as FinanceTransaction['kind'], amountMinor: Number(row.amount_minor), currency: 'CNY',
    categoryId: String(row.category_id), occurredAt: String(row.occurred_at), counterparty: row.counterparty as string | null,
    note: row.note as string | null, projectId: row.project_id as string | null, version: Number(row.version), deletedAt: row.deleted_at as string | null };
}

function calendarFromRow(row: Record<string, unknown>): CalendarItem {
  return { id: String(row.id), kind: row.kind as CalendarItem['kind'], title: String(row.title), startsAt: String(row.starts_at),
    endsAt: String(row.ends_at), allDay: Boolean(row.all_day), projectId: row.project_id as string | null,
    taskId: row.task_id as string | null, scriptId: row.script_id as string | null, version: Number(row.version), deletedAt: row.deleted_at as string | null };
}

export function createWorkspaceRepository(db: WorkbenchDatabase) {
  return {
    listCategories() {
      return db.prepare('SELECT id,kind,name,archived_at AS archivedAt FROM finance_categories ORDER BY kind,name').all();
    },
    listTransactions(month?: string): FinanceTransaction[] {
      const where = month ? "WHERE occurred_at >= ? AND occurred_at < ?" : '';
      const params: string[] = [];
      if (month) {
        const start = `${month}-01T00:00:00.000Z`; const date = new Date(start); date.setUTCMonth(date.getUTCMonth() + 1);
        params.push(start, date.toISOString());
      }
      return (db.prepare(`SELECT * FROM finance_transactions ${where} ORDER BY occurred_at DESC`).all(...params) as Record<string, unknown>[]).map(transactionFromRow);
    },
    createTransaction(input: FinanceInput, mutationId: string): FinanceTransaction {
      const previous = readReceipt<FinanceTransaction>(db, mutationId); if (previous) return previous;
      if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new DomainError('INVALID_AMOUNT', '金额必须是正整数分', 400);
      return db.transaction(() => {
        const value: FinanceTransaction = { id: nanoid(), kind: input.kind, amountMinor: input.amountMinor, currency: 'CNY',
          categoryId: input.categoryId, occurredAt: input.occurredAt, counterparty: input.counterparty, note: input.note,
          projectId: input.projectId, version: 1, deletedAt: null };
        db.prepare(`INSERT INTO finance_transactions(id,kind,amount_minor,currency,category_id,occurred_at,counterparty,note,project_id,version,deleted_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(value.id,value.kind,value.amountMinor,value.currency,value.categoryId,value.occurredAt,value.counterparty,value.note,value.projectId,1,null);
        const link = db.prepare('INSERT INTO finance_transaction_documents(transaction_id,document_id) VALUES(?,?)');
        input.documentIds.forEach((documentId) => link.run(value.id, documentId));
        writeReceipt(db, mutationId, 'finance.create', value); return value;
      })();
    },
    deleteTransaction(id: string, expectedVersion: number, mutationId: string): FinanceTransaction {
      const previous = readReceipt<FinanceTransaction>(db, mutationId); if (previous) return previous;
      return db.transaction(() => {
        const row = db.prepare('SELECT * FROM finance_transactions WHERE id=?').get(id) as Record<string, unknown> | undefined;
        if (!row) throw new DomainError('RESOURCE_NOT_FOUND', '流水不存在', 404);
        const current = transactionFromRow(row); if (current.version !== expectedVersion) throw new DomainError('RESOURCE_VERSION_CONFLICT', '流水已更新', 409);
        const result = { ...current, version: current.version + 1, deletedAt: now() };
        db.prepare('UPDATE finance_transactions SET version=?,deleted_at=? WHERE id=?').run(result.version,result.deletedAt,id);
        writeReceipt(db,mutationId,'finance.delete',result); return result;
      })();
    },
    monthSummary(month: string) {
      const start = `${month}-01T00:00:00.000Z`; const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
      const rows = db.prepare(`SELECT kind,COALESCE(SUM(amount_minor),0) total FROM finance_transactions
        WHERE deleted_at IS NULL AND occurred_at>=? AND occurred_at<? GROUP BY kind`).all(start,end.toISOString()) as Array<{kind:string;total:number}>;
      return { incomeMinor: rows.find((r) => r.kind === 'income')?.total ?? 0, expenseMinor: rows.find((r) => r.kind === 'expense')?.total ?? 0 };
    },
    listTasks(projectId?: string): Task[] {
      const rows = projectId ? db.prepare('SELECT * FROM tasks WHERE project_id=? AND deleted_at IS NULL ORDER BY sort_order,id').all(projectId)
        : db.prepare('SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY due_at,sort_order,id').all();
      return (rows as Record<string, unknown>[]).map(taskFromRow);
    },
    createTask(input: TaskInput, mutationId: string): Task {
      const previous = readReceipt<Task>(db, mutationId); if (previous) return previous;
      return db.transaction(() => {
        const max = db.prepare('SELECT COALESCE(MAX(sort_order),-1) value FROM tasks WHERE project_id=? AND deleted_at IS NULL').get(input.projectId) as {value:number};
        const value: Task = { id:nanoid(),projectId:input.projectId,title:input.title,notes:input.notes,status:'todo',dueAt:input.dueAt,
          sortOrder:max.value+1,completedAt:null,version:1,deletedAt:null };
        db.prepare(`INSERT INTO tasks(id,project_id,title,notes,status,due_at,sort_order,completed_at,version,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
          .run(value.id,value.projectId,value.title,value.notes,value.status,value.dueAt,value.sortOrder,null,1,null);
        writeReceipt(db,mutationId,'tasks.create',value); return value;
      })();
    },
    updateTask(id: string, patch: Partial<Pick<Task,'title'|'notes'|'status'|'dueAt'|'sortOrder'>>, expectedVersion: number, mutationId: string): Task {
      const previous = readReceipt<Task>(db, mutationId); if (previous) return previous;
      return db.transaction(() => {
        const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id) as Record<string, unknown> | undefined;
        if (!row) throw new DomainError('RESOURCE_NOT_FOUND','任务不存在',404); const current=taskFromRow(row);
        if(current.version!==expectedVersion) throw new DomainError('RESOURCE_VERSION_CONFLICT','任务已更新',409);
        const status=patch.status??current.status; const result={...current,...patch,status,completedAt:status==='done'?(current.completedAt??now()):null,version:current.version+1};
        db.prepare('UPDATE tasks SET title=?,notes=?,status=?,due_at=?,sort_order=?,completed_at=?,version=? WHERE id=?')
          .run(result.title,result.notes,result.status,result.dueAt,result.sortOrder,result.completedAt,result.version,id);
        writeReceipt(db,mutationId,'tasks.update',result); return result;
      })();
    },
    projectProgress(projectId: string): number {
      const project = db.prepare('SELECT progress_mode,manual_progress FROM projects WHERE id=?').get(projectId) as {progress_mode:string;manual_progress:number|null}|undefined;
      if (!project) throw new DomainError('RESOURCE_NOT_FOUND','项目不存在',404);
      if(project.progress_mode==='manual') return project.manual_progress??0;
      const row=db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) done FROM tasks WHERE project_id=? AND deleted_at IS NULL").get(projectId) as {total:number;done:number|null};
      return row.total===0?0:Math.round(((row.done??0)/row.total)*100);
    },
    listCalendar(from: string, to: string): CalendarItem[] {
      return (db.prepare('SELECT * FROM calendar_items WHERE deleted_at IS NULL AND starts_at < ? AND ends_at > ? ORDER BY starts_at').all(to,from) as Record<string,unknown>[]).map(calendarFromRow);
    },
    createCalendarItem(input: CalendarInput, mutationId: string): CalendarItem {
      const previous=readReceipt<CalendarItem>(db,mutationId);if(previous)return previous;
      if(input.startsAt>=input.endsAt) throw new DomainError('INVALID_TIME_RANGE','结束时间必须晚于开始时间',400);
      return db.transaction(()=>{const value:CalendarItem={id:nanoid(),...input,version:1,deletedAt:null};
        db.prepare(`INSERT INTO calendar_items(id,kind,title,starts_at,ends_at,all_day,project_id,task_id,script_id,version,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
          .run(value.id,value.kind,value.title,value.startsAt,value.endsAt,value.allDay?1:0,value.projectId,value.taskId,value.scriptId,1,null);
        writeReceipt(db,mutationId,'calendar.create',value);return value;})();
    },
    updateCalendarItem(id:string,patch:Partial<Omit<CalendarItem,'id'|'version'|'deletedAt'>>,expectedVersion:number,mutationId:string):CalendarItem{
      const previous=readReceipt<CalendarItem>(db,mutationId);if(previous)return previous;
      return db.transaction(()=>{const row=db.prepare('SELECT * FROM calendar_items WHERE id=?').get(id) as Record<string,unknown>|undefined;
        if(!row)throw new DomainError('RESOURCE_NOT_FOUND','日历事项不存在',404);const current=calendarFromRow(row);
        if(current.version!==expectedVersion)throw new DomainError('RESOURCE_VERSION_CONFLICT','日历事项已更新',409);
        const result={...current,...patch,version:current.version+1};if(result.startsAt>=result.endsAt)throw new DomainError('INVALID_TIME_RANGE','结束时间必须晚于开始时间',400);
        db.prepare('UPDATE calendar_items SET kind=?,title=?,starts_at=?,ends_at=?,all_day=?,project_id=?,task_id=?,script_id=?,version=? WHERE id=?')
          .run(result.kind,result.title,result.startsAt,result.endsAt,result.allDay?1:0,result.projectId,result.taskId,result.scriptId,result.version,id);
        writeReceipt(db,mutationId,'calendar.update',result);return result;})();
    }
  };
}
