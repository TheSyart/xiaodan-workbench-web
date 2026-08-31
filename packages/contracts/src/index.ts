import { z } from 'zod';

export type ApiResult<T> = { data: T } | { error: ApiError };
export interface ApiError { code: string; message: string; details?: unknown }

export const PROJECT_STATUSES = ['active', 'paused', 'completed', 'archived'] as const;
export const PROJECT_TYPES = ['general', 'content_series'] as const;
export const SCRIPT_STATUSES = ['draft', 'ready', 'recorded', 'published', 'archived'] as const;
export const AI_OPERATIONS = ['polish', 'ideate', 'rhythm', 'condense', 'expand', 'custom'] as const;
export const AI_STATUSES = ['queued', 'streaming', 'completed', 'stale', 'accepted', 'rejected', 'cancelled', 'failed'] as const;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}, '日期无效');

const nullableTrimmed = z.string().trim().max(10_000).nullable().optional().default(null);

export const contentProfileInputSchema = z.object({
  audience: z.string().trim().min(1).max(2_000),
  topicScope: z.string().trim().min(1).max(5_000),
  toneGuidelines: z.string().trim().min(1).max(5_000),
  structureTemplate: z.string().trim().min(1).max(10_000),
  forbiddenPhrases: z.array(z.string().trim().min(1).max(200)).max(100),
  targetDurationSeconds: z.number().int().min(10).max(86_400),
  cadenceWeekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7)
    .refine((days) => new Set(days).size === days.length, '星期不可重复')
}).strict();

export type ProjectType = typeof PROJECT_TYPES[number];
export type ProjectStatus = typeof PROJECT_STATUSES[number];
export type ProjectContentProfileInput = z.infer<typeof contentProfileInputSchema>;

export interface ProjectContentProfile extends ProjectContentProfileInput {
  projectId: string;
  version: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  type: ProjectType;
  status: ProjectStatus;
  targetDate: string | null;
  progressMode: 'auto' | 'manual';
  manualProgress: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

const projectBase = z.object({
  name: z.string().trim().min(1).max(200),
  description: nullableTrimmed,
  targetDate: isoDateSchema.nullable().optional().default(null)
}).strict();

export const createProjectSchema = z.discriminatedUnion('type', [
  projectBase.extend({ type: z.literal('general'), contentProfile: z.never().optional() }).strict(),
  projectBase.extend({ type: z.literal('content_series'), contentProfile: contentProfileInputSchema }).strict()
]);

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  targetDate: isoDateSchema.nullable().optional(),
  progressMode: z.enum(['auto', 'manual']).optional(),
  manualProgress: z.number().int().min(0).max(100).nullable().optional()
}).strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export type ScriptStatus = typeof SCRIPT_STATUSES[number];
export interface Script {
  id: string;
  projectId: string | null;
  title: string;
  contentMarkdown: string;
  plannedDate: string | null;
  episodeNo: number | null;
  status: ScriptStatus;
  publishedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export const createScriptSchema = z.object({
  projectId: z.string().min(1).nullable().optional().default(null),
  title: z.string().trim().min(1).max(300),
  plannedDate: isoDateSchema.nullable().optional().default(null),
  episodeNo: z.number().int().positive().nullable().optional().default(null)
}).strict();

export const updateScriptMetadataSchema = z.object({
  projectId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  plannedDate: isoDateSchema.nullable().optional(),
  episodeNo: z.number().int().positive().nullable().optional(),
  status: z.enum(SCRIPT_STATUSES).optional(),
  publishedAt: z.string().datetime().nullable().optional()
}).strict();

export const saveScriptContentSchema = z.object({
  contentMarkdown: z.string().refine((value) => Buffer.byteLength(value, 'utf8') <= 2 * 1024 * 1024, '正文超过 2 MiB')
}).strict();

export const batchCreateScriptsSchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  titleTemplate: z.string().trim().min(1).max(200).default('第 {episode} 期'),
  startEpisodeNo: z.number().int().positive().nullable().default(null),
  previewOnly: z.boolean().default(true)
}).strict().refine((value) => value.from <= value.to, { message: '结束日期不能早于开始日期' });

export type CreateScriptInput = z.infer<typeof createScriptSchema>;
export type UpdateScriptMetadataInput = z.infer<typeof updateScriptMetadataSchema>;
export type BatchCreateScriptsInput = z.infer<typeof batchCreateScriptsSchema>;

export interface Task {
  id: string; projectId: string; title: string; notes: string | null;
  status: 'todo' | 'doing' | 'done'; dueAt: string | null; sortOrder: number;
  completedAt: string | null; version: number; deletedAt: string | null;
}

export const createTaskSchema = z.object({
  projectId: z.string().min(1), title: z.string().trim().min(1).max(300),
  notes: z.string().max(10_000).nullable().optional().default(null),
  dueAt: z.string().datetime().nullable().optional().default(null)
}).strict();

export interface FinanceCategory { id: string; kind: 'income' | 'expense'; name: string; archivedAt: string | null }
export interface FinanceTransaction {
  id: string; kind: 'income' | 'expense'; amountMinor: number; currency: 'CNY';
  categoryId: string; occurredAt: string; counterparty: string | null; note: string | null;
  projectId: string | null; version: number; deletedAt: string | null;
}

export const financeTransactionInputSchema = z.object({
  kind: z.enum(['income', 'expense']), amountMinor: z.number().int().positive(),
  categoryId: z.string().min(1), occurredAt: z.string().datetime(),
  counterparty: z.string().trim().max(300).nullable().optional().default(null),
  note: z.string().max(10_000).nullable().optional().default(null),
  projectId: z.string().min(1).nullable().optional().default(null),
  documentIds: z.array(z.string().min(1)).max(50).optional().default([])
}).strict();

export interface DocumentRecord {
  id: string; originalName: string; mimeType: string; size: number; relativePath: string;
  sha256: string; createdAt: string; deletedAt: string | null;
}

export interface CalendarItem {
  id: string; kind: 'event' | 'task_block' | 'script_block' | 'reminder'; title: string;
  startsAt: string; endsAt: string; allDay: boolean; projectId: string | null;
  taskId: string | null; scriptId: string | null; version: number; deletedAt: string | null;
}

export const calendarItemInputSchema = z.object({
  kind: z.enum(['event', 'task_block', 'script_block', 'reminder']),
  title: z.string().trim().min(1).max(300), startsAt: z.string().datetime(), endsAt: z.string().datetime(),
  allDay: z.boolean().default(false), projectId: z.string().nullable().default(null),
  taskId: z.string().nullable().default(null), scriptId: z.string().nullable().default(null)
}).strict().refine((value) => value.startsAt < value.endsAt, '结束时间必须晚于开始时间');

export type ScriptAiOperation = typeof AI_OPERATIONS[number];
export type ScriptAiStatus = typeof AI_STATUSES[number];
export type ScriptAiScope = 'current_beat' | 'selection' | 'document';
export interface ScriptDiffToken { type: 'equal' | 'insert' | 'delete'; text: string }
export interface ScriptDiffHunk {
  id: string; kind: 'equal' | 'change'; originalText: string; candidateText: string;
  tokens: ScriptDiffToken[];
}
export interface ScriptAiRun {
  id: string; scriptId: string; operation: ScriptAiOperation; scope: ScriptAiScope;
  selectionFrom: number | null; selectionTo: number | null; instruction: string | null;
  baseVersion: number; baseContentHash: string; referencedScriptIds: string[]; model: string;
  originalText: string; candidateText: string; diffHunks: ScriptDiffHunk[]; acceptedHunkIds: string[];
  status: ScriptAiStatus; usage: { inputTokens: number; outputTokens: number } | null;
  errorMessage: string | null; createdAt: string; completedAt: string | null;
}

export const createAiRunSchema = z.object({
  operation: z.enum(AI_OPERATIONS), scope: z.enum(['current_beat', 'selection', 'document']),
  selectionFrom: z.number().int().nonnegative().nullable().default(null),
  selectionTo: z.number().int().nonnegative().nullable().default(null),
  instruction: z.string().max(4_000).nullable().default(null),
  referencedScriptIds: z.array(z.string().min(1)).max(5).default([])
}).strict().refine((v) => v.scope !== 'selection' || (v.selectionFrom !== null && v.selectionTo !== null && v.selectionTo > v.selectionFrom), '选区无效');

export const acceptAiRunSchema = z.object({ hunkIds: z.array(z.string().min(1)).max(10_000) }).strict();

export type AiStreamEvent =
  | { type: 'status'; status: ScriptAiStatus }
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'done'; runId: string }
  | { type: 'error'; code: string; message: string };

export interface TodayOverview {
  todayItems: CalendarItem[]; pendingTasks: Task[]; activeProjects: Array<Project & { progress: number }>;
  recentScripts: Script[]; financeMonth: { incomeMinor: number; expenseMinor: number };
}

