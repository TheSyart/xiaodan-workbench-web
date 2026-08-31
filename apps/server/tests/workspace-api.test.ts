import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AiProvider } from '../src/app.js';

const apps: Awaited<ReturnType<typeof buildApp>>[]=[];
afterEach(async()=>{while(apps.length)await apps.pop()?.close();});
const headers=(id:string,version?:number)=>({origin:'http://localhost','content-type':'application/json','idempotency-key':id,...(version===undefined?{}:{'if-match':`"${version}"`})});
async function make(provider?:AiProvider){const app=await buildApp({databasePath:':memory:',dataDir:'/tmp/xiaodan-workspace-api',basePath:'/xiaodan',logger:false,...(provider?{aiProvider:provider}:{})});apps.push(app);return app;}
async function project(app:Awaited<ReturnType<typeof buildApp>>,id='p'){return (await app.inject({method:'POST',url:'/xiaodan/api/v1/projects',headers:headers(id),payload:{name:'测试项目',type:'general',description:null,targetDate:null}})).json().data;}

describe('workspace REST modules',()=>{
  it('covers project detail, profile replacement and script metadata',async()=>{
    const app=await make();const p=(await app.inject({method:'POST',url:'/xiaodan/api/v1/projects',headers:headers('series'),payload:{name:'系列',type:'content_series',description:null,targetDate:null,contentProfile:{audience:'读者',topicScope:'AI',toneGuidelines:'直接',structureTemplate:'三段',forbiddenPhrases:[],targetDurationSeconds:60,cadenceWeekdays:[1]}}})).json().data;
    expect((await app.inject({method:'GET',url:`/xiaodan/api/v1/projects/${p.id}`})).headers.etag).toBe('"1"');
    const profile=await app.inject({method:'GET',url:`/xiaodan/api/v1/projects/${p.id}/content-profile`});expect(profile.statusCode).toBe(200);
    const updated=await app.inject({method:'PUT',url:`/xiaodan/api/v1/projects/${p.id}/content-profile`,headers:headers('profile',1),payload:{audience:'新读者',topicScope:'AI',toneGuidelines:'直接',structureTemplate:'三段',forbiddenPhrases:['空话'],targetDurationSeconds:90,cadenceWeekdays:[1,3]}});expect(updated.json().data.version).toBe(2);
    const script=(await app.inject({method:'POST',url:'/xiaodan/api/v1/scripts',headers:headers('s'),payload:{title:'初稿',projectId:p.id,plannedDate:'2026-08-31',episodeNo:1}})).json().data;
    expect((await app.inject({method:'GET',url:`/xiaodan/api/v1/scripts/${script.id}`})).statusCode).toBe(200);
    const meta=await app.inject({method:'PATCH',url:`/xiaodan/api/v1/scripts/${script.id}`,headers:headers('meta',1),payload:{title:'定稿',status:'ready'}});expect(meta.json().data.title).toBe('定稿');
    expect((await app.inject({method:'GET',url:`/xiaodan/api/v1/projects/${p.id}/content-calendar?from=2026-08-01&to=2026-09-30`})).json().data).toHaveLength(1);
    expect((await app.inject({method:'GET',url:'/xiaodan/api/v1/projects/missing'})).statusCode).toBe(404);
  });

  it('creates, moves and lists tasks',async()=>{const app=await make();const p=await project(app);
    const task=(await app.inject({method:'POST',url:'/xiaodan/api/v1/tasks',headers:headers('t'),payload:{projectId:p.id,title:'写稿',notes:null,dueAt:null}})).json().data;
    expect((await app.inject({method:'GET',url:`/xiaodan/api/v1/tasks?projectId=${p.id}`})).json().data).toHaveLength(1);
    const moved=await app.inject({method:'PATCH',url:`/xiaodan/api/v1/tasks/${task.id}`,headers:headers('tm',task.version),payload:{status:'doing',sortOrder:2}});expect(moved.json().data.status).toBe('doing');
    expect((await app.inject({method:'PATCH',url:`/xiaodan/api/v1/tasks/${task.id}`,headers:headers('bad',2),payload:{unknown:true}})).statusCode).toBe(400);
  });

  it('handles finance creation, summary and soft deletion',async()=>{const app=await make();
    const categories=(await app.inject({method:'GET',url:'/xiaodan/api/v1/finance/categories'})).json().data;expect(categories.length).toBeGreaterThan(10);
    const tx=(await app.inject({method:'POST',url:'/xiaodan/api/v1/finance/transactions',headers:headers('f'),payload:{kind:'expense',amountMinor:1234,categoryId:'expense-1',occurredAt:'2026-08-20T00:00:00.000Z',counterparty:'店铺',note:null,projectId:null,documentIds:[]}})).json().data;
    expect((await app.inject({method:'GET',url:'/xiaodan/api/v1/finance/transactions?month=2026-08'})).json().data).toHaveLength(1);
    expect((await app.inject({method:'GET',url:'/xiaodan/api/v1/finance/summary?month=2026-08'})).json().data.expenseMinor).toBe(1234);
    expect((await app.inject({method:'DELETE',url:`/xiaodan/api/v1/finance/transactions/${tx.id}`,headers:{origin:'http://localhost','idempotency-key':'fd','if-match':`"${tx.version}"`}})).json().data.deletedAt).toBeTruthy();
  });

  it('creates and version-updates calendar items including reminders',async()=>{const app=await make();
    const item=(await app.inject({method:'POST',url:'/xiaodan/api/v1/calendar/items',headers:headers('c'),payload:{kind:'reminder',title:'交稿',startsAt:'2026-08-31T01:00:00.000Z',endsAt:'2026-08-31T02:00:00.000Z',allDay:false,projectId:null,taskId:null,scriptId:null}})).json().data;
    expect((await app.inject({method:'GET',url:'/xiaodan/api/v1/calendar/items?from=2026-08-31T00%3A00%3A00.000Z&to=2026-09-01T00%3A00%3A00.000Z'})).json().data).toHaveLength(1);
    const moved=await app.inject({method:'PATCH',url:`/xiaodan/api/v1/calendar/items/${item.id}`,headers:headers('cm',1),payload:{title:'交稿提醒'}});expect(moved.json().data.version).toBe(2);
    expect((await app.inject({method:'GET',url:'/xiaodan/api/v1/calendar/items'})).statusCode).toBe(400);
  });

  it('uploads a controlled attachment and serves the original bytes',async()=>{const app=await make();const boundary='----xiaodan-test';
    const payload=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="note.txt"\r\nContent-Type: text/plain\r\n\r\n原件内容\r\n--${boundary}--\r\n`);
    const uploaded=await app.inject({method:'POST',url:'/xiaodan/api/v1/documents',headers:{origin:'http://localhost','idempotency-key':'doc','content-type':`multipart/form-data; boundary=${boundary}`},payload});expect(uploaded.statusCode).toBe(201);const doc=uploaded.json().data;
    expect((await app.inject({method:'GET',url:'/xiaodan/api/v1/documents'})).json().data).toHaveLength(1);
    const file=await app.inject({method:'GET',url:`/xiaodan/api/v1/documents/${doc.id}/file`});expect(file.body).toContain('原件内容');expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect((await app.inject({method:'GET',url:'/xiaodan/api/v1/documents/missing/file'})).statusCode).toBe(404);
  });

  it('serves overview and assistant query capabilities',async()=>{const app=await make();await project(app);
    expect((await app.inject({method:'GET',url:'/xiaodan/api/v1/overview/today?now=2026-08-31T08%3A00%3A00.000Z&timezone=Asia%2FShanghai'})).json().data.activeProjects).toHaveLength(1);
    expect((await app.inject({method:'GET',url:'/xiaodan/api/v1/assistant/capabilities'})).json().data.forbidden).toContain('scripts.writeContent');
    expect((await app.inject({method:'POST',url:'/xiaodan/api/v1/assistant/execute',headers:headers('a'),payload:{tool:'projects.list',arguments:{}}})).statusCode).toBe(200);
    const pending=await app.inject({method:'POST',url:'/xiaodan/api/v1/assistant/execute',headers:headers('aw'),payload:{tool:'projects.create',arguments:{name:'新项目',type:'general',description:null,targetDate:null}}});expect(pending.statusCode).toBe(202);expect(pending.json().data.requiresConfirmation).toBe(true);
    const confirmationId=pending.json().data.confirmationId;const confirmed=await app.inject({method:'POST',url:`/xiaodan/api/v1/assistant/confirm/${confirmationId}`,headers:headers('confirm'),payload:{}});expect(confirmed.statusCode).toBe(200);expect(confirmed.json().data.result.name).toBe('新项目');
    const replay=await app.inject({method:'POST',url:`/xiaodan/api/v1/assistant/confirm/${confirmationId}`,headers:headers('confirm'),payload:{}});expect(replay.json().data.result.id).toBe(confirmed.json().data.result.id);
  });
});
