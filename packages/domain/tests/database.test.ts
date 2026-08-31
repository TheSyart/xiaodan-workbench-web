import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  DomainError,
  createDatabase,
  createProjectRepository,
  createScriptRepository,
  createScriptAiRepository
} from '../src/index.js';

const databases: ReturnType<typeof createDatabase>[] = [];

afterEach(() => {
  while (databases.length) databases.pop()?.close();
});

describe('SQLite domain', () => {
  it('creates and replays all migrations safely', () => {
    const first = createDatabase(':memory:');
    databases.push(first);
    expect(first.prepare("select name from sqlite_master where type='table' and name='scripts'").get()).toBeTruthy();
    first.migrate();
    expect(first.pragma('user_version', { simple: true })).toBeGreaterThan(0);
  });

  it('creates a complete content-series project transactionally', () => {
    const db = createDatabase(':memory:'); databases.push(db);
    const projects = createProjectRepository(db);
    const project = projects.create({
      name: '小单日谈', type: 'content_series', description: null, targetDate: null,
      contentProfile: {
        audience: 'AI 初学者', topicScope: 'AI 科普', toneGuidelines: '自然',
        structureTemplate: '开头、解释、结论', forbiddenPhrases: [],
        targetDurationSeconds: 180, cadenceWeekdays: [1, 2, 3, 4, 5]
      }
    }, 'project-create-1');
    expect(project.type).toBe('content_series');
    expect(projects.getContentProfile(project.id)?.cadenceWeekdays).toEqual([1, 2, 3, 4, 5]);
    expect(projects.create({
      name: 'ignored', type: 'general', description: null, targetDate: null
    }, 'project-create-1').id).toBe(project.id);
  });

  it('preserves markdown bytes and rejects stale writes', () => {
    const db = createDatabase(':memory:'); databases.push(db);
    const scripts = createScriptRepository(db);
    const script = scripts.create({ title: '原样稿', projectId: null, plannedDate: null, episodeNo: null }, 'script-1');
    const content = '第一行\r\n\r\n  缩进\n尾行\n';
    const saved = scripts.saveContent(script.id, content, script.version, 'save-1');
    expect(saved.contentMarkdown).toBe(content);
    expect(() => scripts.saveContent(script.id, '覆盖', script.version, 'save-2')).toThrowError(DomainError);
    expect(scripts.saveContent(script.id, content, script.version, 'save-1').version).toBe(saved.version);
  });

  it('enforces unique episode numbers but allows multiple scripts per day', () => {
    const db = createDatabase(':memory:'); databases.push(db);
    const projects = createProjectRepository(db);
    const scripts = createScriptRepository(db);
    const project = projects.create({ name: '系列', type: 'general', description: null, targetDate: null }, 'p');
    scripts.create({ title: '一', projectId: project.id, plannedDate: '2026-09-01', episodeNo: 1 }, 's1');
    scripts.create({ title: '二', projectId: project.id, plannedDate: '2026-09-01', episodeNo: 2 }, 's2');
    expect(scripts.list({ projectId: project.id, plannedFrom: null, plannedTo: null, includeArchived: false })).toHaveLength(2);
    expect(() => scripts.create({ title: '重复', projectId: project.id, plannedDate: '2026-09-02', episodeNo: 1 }, 's3')).toThrowError(DomainError);
  });

  it('marks AI candidates stale and applies only accepted hunks on the server', () => {
    const db = createDatabase(':memory:'); databases.push(db);
    const scripts = createScriptRepository(db);
    const ai = createScriptAiRepository(db);
    const script = scripts.create({ title: '稿件', projectId: null, plannedDate: null, episodeNo: null }, 's');
    const saved = scripts.saveContent(script.id, '第一行\n第二行\n', script.version, 'body');
    const run = ai.createCompletedRun({
      scriptId: script.id,
      operation: 'polish',
      scope: 'document',
      selectionFrom: null,
      selectionTo: null,
      instruction: null,
      baseVersion: saved.version,
      baseContentHash: createHash('sha256').update(saved.contentMarkdown).digest('hex'),
      referencedScriptIds: [],
      model: 'test-model',
      originalText: saved.contentMarkdown,
      candidateText: '第一句\n第二句\n',
      usage: { inputTokens: 3, outputTokens: 4 }
    });
    const changeIds = run.diffHunks.filter((h) => h.kind === 'change').map((h) => h.id);
    const accepted = ai.accept(run.id, changeIds.slice(0, 1), 'accept-1');
    expect(accepted.script.version).toBe(saved.version + 1);
    expect(accepted.script.contentMarkdown).not.toBe(saved.contentMarkdown);

    const nextRun = ai.createCompletedRun({ ...run, id: undefined, baseVersion: accepted.script.version,
      baseContentHash: createHash('sha256').update(accepted.script.contentMarkdown).digest('hex'),
      originalText: accepted.script.contentMarkdown, candidateText: '全新内容\n' });
    scripts.saveContent(script.id, `${accepted.script.contentMarkdown}临时编辑`, accepted.script.version, 'edit-after-ai');
    expect(() => ai.accept(nextRun.id, nextRun.diffHunks.map((h) => h.id), 'accept-stale')).toThrowError(DomainError);
    expect(ai.get(nextRun.id)?.status).toBe('stale');
  });
});

