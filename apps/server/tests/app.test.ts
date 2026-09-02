import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { while (apps.length) await apps.pop()?.close(); });

async function makeApp() {
  const app = await buildApp({ databasePath: ':memory:', dataDir: '/tmp/xiaodan-workbench-tests', basePath: '/xiaodan', logger: false });
  apps.push(app); return app;
}

const headers = { 'content-type': 'application/json', 'idempotency-key': 'create-project-1', origin: 'http://localhost' };
const series = {
  name: '小单日谈', type: 'content_series', description: '长期口播系列', targetDate: null,
  contentProfile: {
    audience: 'AI 初学者', topicScope: 'AI 科普', toneGuidelines: '通俗、直接',
    structureTemplate: '问题—比喻—结论', forbiddenPhrases: ['赋能'],
    targetDurationSeconds: 180, cadenceWeekdays: [1, 2, 3, 4, 5]
  }
};

describe('Fastify API', () => {
  it('serves the production web app from the root base path', async () => {
    const staticRoot = await mkdtemp(join(tmpdir(), 'xiaodan-static-'));
    try {
      await writeFile(join(staticRoot, 'index.html'), '<!doctype html><title>root-workbench</title>');
      const app = await buildApp({ databasePath: ':memory:', dataDir: '/tmp/xiaodan-workbench-root-tests', basePath: '/', logger: false, serveStatic: true, staticRoot } as Parameters<typeof buildApp>[0]);
      apps.push(app);
      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('root-workbench');
    } finally {
      await rm(staticRoot, { recursive: true, force: true });
    }
  });

  it('reports liveness and database-backed readiness', async () => {
    const app = await makeApp();
    expect((await app.inject({ method: 'GET', url: '/xiaodan/health/live' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/xiaodan/health/ready' })).json()).toEqual({ data: { ready: true } });
  });

  it('creates a series idempotently and returns an ETag', async () => {
    const app = await makeApp();
    const first = await app.inject({ method: 'POST', url: '/xiaodan/api/v1/projects', headers, payload: series });
    const replay = await app.inject({ method: 'POST', url: '/xiaodan/api/v1/projects', headers, payload: series });
    expect(first.statusCode).toBe(201);
    expect(first.headers.etag).toBe('"1"');
    expect(replay.json().data.id).toBe(first.json().data.id);
    expect((await app.inject({ method: 'GET', url: '/xiaodan/api/v1/projects' })).json().data).toHaveLength(1);
  });

  it('rejects unknown fields and missing write headers', async () => {
    const app = await makeApp();
    const unknown = await app.inject({ method: 'POST', url: '/xiaodan/api/v1/projects', headers,
      payload: { ...series, surprise: true } });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe('VALIDATION_ERROR');
    const missing = await app.inject({ method: 'POST', url: '/xiaodan/api/v1/projects', payload: series });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('enforces If-Match and version conflicts', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/xiaodan/api/v1/projects', headers, payload: series });
    const id = created.json().data.id;
    const updated = await app.inject({ method: 'PATCH', url: `/xiaodan/api/v1/projects/${id}`,
      headers: { ...headers, 'idempotency-key': 'update-1', 'if-match': '"1"' }, payload: { name: '新名字' } });
    expect(updated.statusCode).toBe(200);
    expect(updated.headers.etag).toBe('"2"');
    const stale = await app.inject({ method: 'PATCH', url: `/xiaodan/api/v1/projects/${id}`,
      headers: { ...headers, 'idempotency-key': 'update-2', 'if-match': '"1"' }, payload: { name: '覆盖' } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('RESOURCE_VERSION_CONFLICT');
  });

  it('previews and transactionally creates weekday scripts without replay duplicates', async () => {
    const app = await makeApp();
    const project = (await app.inject({ method: 'POST', url: '/xiaodan/api/v1/projects', headers, payload: series })).json().data;
    const body = { from: '2026-09-07', to: '2026-09-13', weekdays: [1, 3, 5], titleTemplate: '第 {episode} 期', startEpisodeNo: 1, previewOnly: true };
    const preview = await app.inject({ method: 'POST', url: `/xiaodan/api/v1/projects/${project.id}/scripts/batch`,
      headers: { ...headers, 'idempotency-key': 'preview' }, payload: body });
    expect(preview.json().data.preview).toHaveLength(3);
    const createPayload = { ...body, previewOnly: false };
    const created = await app.inject({ method: 'POST', url: `/xiaodan/api/v1/projects/${project.id}/scripts/batch`,
      headers: { ...headers, 'idempotency-key': 'batch-1' }, payload: createPayload });
    const replay = await app.inject({ method: 'POST', url: `/xiaodan/api/v1/projects/${project.id}/scripts/batch`,
      headers: { ...headers, 'idempotency-key': 'batch-1' }, payload: createPayload });
    expect(created.json().data.scripts).toHaveLength(3);
    expect(replay.json().data.scripts.map((s: { id: string }) => s.id)).toEqual(created.json().data.scripts.map((s: { id: string }) => s.id));
  });
});
