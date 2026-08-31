import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, createProjectRepository, createWorkspaceRepository, DomainError } from '../src/index.js';

const databases: ReturnType<typeof createDatabase>[] = [];
afterEach(() => { while (databases.length) databases.pop()?.close(); });

function setup() {
  const db = createDatabase(':memory:'); databases.push(db);
  return { db, workspace: createWorkspaceRepository(db), projects: createProjectRepository(db) };
}

describe('workspace modules', () => {
  it('keeps integer finance precision and excludes deleted rows from summary', () => {
    const { workspace } = setup();
    const a = workspace.createTransaction({ kind: 'expense', amountMinor: 101, categoryId: 'expense-1', occurredAt: '2026-08-02T00:00:00.000Z', counterparty: null, note: null, projectId: null, documentIds: [] }, 'tx-a');
    workspace.createTransaction({ kind: 'income', amountMinor: 500, categoryId: 'income-1', occurredAt: '2026-08-03T00:00:00.000Z', counterparty: null, note: null, projectId: null, documentIds: [] }, 'tx-b');
    expect(workspace.monthSummary('2026-08')).toEqual({ incomeMinor: 500, expenseMinor: 101 });
    workspace.deleteTransaction(a.id, a.version, 'delete-a');
    expect(workspace.monthSummary('2026-08')).toEqual({ incomeMinor: 500, expenseMinor: 0 });
  });

  it('computes project progress and does not auto-complete unfinished tasks', () => {
    const { workspace, projects } = setup();
    const project = projects.create({ name: '项目', type: 'general', description: null, targetDate: null }, 'p');
    const first = workspace.createTask({ projectId: project.id, title: '一', notes: null, dueAt: null }, 't1');
    workspace.createTask({ projectId: project.id, title: '二', notes: null, dueAt: null }, 't2');
    workspace.updateTask(first.id, { status: 'done' }, first.version, 'done');
    expect(workspace.projectProgress(project.id)).toBe(50);
    projects.update(project.id, { status: 'completed' }, project.version, 'complete-project');
    expect(workspace.listTasks(project.id).filter((task) => task.status === 'done')).toHaveLength(1);
  });

  it('rolls versioned calendar changes forward and rejects stale moves', () => {
    const { workspace } = setup();
    const item = workspace.createCalendarItem({ kind: 'event', title: '写稿', startsAt: '2026-08-31T01:00:00.000Z', endsAt: '2026-08-31T02:00:00.000Z', allDay: false, projectId: null, taskId: null, scriptId: null }, 'c1');
    const moved = workspace.updateCalendarItem(item.id, { startsAt: '2026-08-31T02:00:00.000Z', endsAt: '2026-08-31T03:00:00.000Z' }, item.version, 'move');
    expect(moved.version).toBe(2);
    expect(() => workspace.updateCalendarItem(item.id, { title: '覆盖' }, item.version, 'stale')).toThrowError(DomainError);
  });
});

