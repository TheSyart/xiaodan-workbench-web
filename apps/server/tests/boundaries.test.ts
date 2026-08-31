import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AiProvider } from '../src/app.js';
const apps:Awaited<ReturnType<typeof buildApp>>[]=[];afterEach(async()=>{while(apps.length)await apps.pop()?.close();});
const json={'content-type':'application/json','idempotency-key':'x',origin:'http://localhost'};
async function make(provider?:AiProvider){const app=await buildApp({databasePath:':memory:',dataDir:'/tmp/xiaodan-boundaries',basePath:'/xiaodan',logger:false,...(provider?{aiProvider:provider}:{})});apps.push(app);return app;}

describe('HTTP boundaries',()=>{
  it('rejects cross-origin, malformed origin, invalid versions and missing resources',async()=>{const app=await make();const payload={name:'项目',type:'general'};
    expect((await app.inject({method:'POST',url:'/xiaodan/api/v1/projects',headers:{...json,origin:'https://evil.example'},payload})).json().error.code).toBe('ORIGIN_REJECTED');
    expect((await app.inject({method:'POST',url:'/xiaodan/api/v1/projects',headers:{...json,origin:'not a url'},payload})).statusCode).toBe(403);
    const p=(await app.inject({method:'POST',url:'/xiaodan/api/v1/projects',headers:json,payload})).json().data;
    expect((await app.inject({method:'PATCH',url:`/xiaodan/api/v1/projects/${p.id}`,headers:{...json,'idempotency-key':'m'},payload:{name:'无版本'}})).statusCode).toBe(428);
    expect((await app.inject({method:'PATCH',url:`/xiaodan/api/v1/projects/${p.id}`,headers:{...json,'idempotency-key':'bad','if-match':'1'},payload:{name:'格式错'}})).json().error.code).toBe('INVALID_IF_MATCH');
    expect((await app.inject({method:'GET',url:`/xiaodan/api/v1/projects/${p.id}/content-profile`})).statusCode).toBe(404);
    expect((await app.inject({method:'GET',url:'/xiaodan/api/v1/scripts/missing'})).statusCode).toBe(404);
    expect((await app.inject({method:'PUT',url:`/xiaodan/api/v1/projects/${p.id}/content-profile`,headers:{...json,'idempotency-key':'profile'},payload:{audience:'a',topicScope:'b',toneGuidelines:'c',structureTemplate:'d',forbiddenPhrases:[],targetDurationSeconds:60,cadenceWeekdays:[2]}})).statusCode).toBe(201);
  });

  it('maps bad calendar, upload, overview and assistant requests',async()=>{const app=await make();
    expect((await app.inject({method:'PATCH',url:'/xiaodan/api/v1/calendar/items/missing',headers:{...json,'if-match':'"1"'},payload:{surprise:true}})).statusCode).toBe(400);
    expect((await app.inject({method:'GET',url:'/xiaodan/api/v1/overview/today?now=nope'})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:'/xiaodan/api/v1/documents',headers:{'idempotency-key':'none'}})).json().error.code).toBe('FILE_REQUIRED');
    for(const tool of ['tasks.list','finance.list','calendar.list','scripts.search']){expect((await app.inject({method:'POST',url:'/xiaodan/api/v1/assistant/execute',headers:{...json,'idempotency-key':tool},payload:{tool,arguments:{}}})).statusCode).toBe(200);}
  });

  it('cancels an active AI generation and replays its stored SSE events',async()=>{const provider:AiProvider={async *generate({signal}){yield{type:'delta',text:'开始'};while(!signal.aborted)await new Promise((r)=>setTimeout(r,5));}};const app=await make(provider);
    const script=(await app.inject({method:'POST',url:'/xiaodan/api/v1/scripts',headers:json,payload:{title:'稿'}})).json().data;
    const run=(await app.inject({method:'POST',url:`/xiaodan/api/v1/scripts/${script.id}/ai-runs`,headers:{...json,'idempotency-key':'ai'},payload:{operation:'polish',scope:'document',selectionFrom:null,selectionTo:null,instruction:null,referencedScriptIds:[]}})).json().data;
    await new Promise((r)=>setTimeout(r,15));expect((await app.inject({method:'POST',url:`/xiaodan/api/v1/script-ai-runs/${run.id}/cancel`,headers:{...json,'idempotency-key':'cancel'},payload:{}})).json().data.status).toBe('cancelled');
    const events=await app.inject({method:'GET',url:`/xiaodan/api/v1/script-ai-runs/${run.id}/events`});expect(events.statusCode).toBe(200);expect(events.body).toContain('cancelled');
  });
});

