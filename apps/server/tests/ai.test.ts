import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AiProvider } from '../src/app.js';

const fakeProvider: AiProvider = {
  async *generate() {
    yield { type: 'delta', text: '更自然的第一行\n' };
    yield { type: 'usage', inputTokens: 10, outputTokens: 6 };
  }
};

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async()=>{while(apps.length)await apps.pop()?.close();});
const writeHeaders=(id:string,version?:number)=>({origin:'http://localhost','content-type':'application/json','idempotency-key':id,...(version?{'if-match':`"${version}"`}:{})});

async function setup() {
  const app=await buildApp({databasePath:':memory:',dataDir:'/tmp/xiaodan-ai-tests',basePath:'/xiaodan',logger:false,aiProvider:fakeProvider});apps.push(app);
  const created=(await app.inject({method:'POST',url:'/xiaodan/api/v1/scripts',headers:writeHeaders('script'),payload:{title:'测试稿'}})).json().data;
  const saved=(await app.inject({method:'PUT',url:`/xiaodan/api/v1/scripts/${created.id}/content`,headers:writeHeaders('save',created.version),payload:{contentMarkdown:'原来的第一行\n第二行\n'}})).json().data;
  return {app,script:saved};
}

describe('AI candidate API',()=>{
  it('streams into a persisted candidate and accepts server-side hunks',async()=>{
    const {app,script}=await setup();
    const response=await app.inject({method:'POST',url:`/xiaodan/api/v1/scripts/${script.id}/ai-runs`,headers:writeHeaders('ai'),payload:{operation:'polish',scope:'current_beat',selectionFrom:0,selectionTo:null,instruction:null,referencedScriptIds:[]}});
    expect(response.statusCode).toBe(202);const id=response.json().data.id;
    await new Promise((resolve)=>setTimeout(resolve,20));
    const run=(await app.inject({method:'GET',url:`/xiaodan/api/v1/script-ai-runs/${id}`})).json().data;
    expect(run.status).toBe('completed');expect(run.candidateText).toContain('更自然的第一行');
    const ids=run.diffHunks.filter((h:{kind:string})=>h.kind==='change').map((h:{id:string})=>h.id);
    const accepted=await app.inject({method:'POST',url:`/xiaodan/api/v1/script-ai-runs/${id}/accept`,headers:writeHeaders('accept'),payload:{hunkIds:ids}});
    expect(accepted.statusCode).toBe(200);expect(accepted.json().data.script.contentMarkdown).toContain('更自然的第一行');
  });

  it('makes a candidate stale when the user keeps editing',async()=>{
    const {app,script}=await setup();
    const response=await app.inject({method:'POST',url:`/xiaodan/api/v1/scripts/${script.id}/ai-runs`,headers:writeHeaders('ai-stale'),payload:{operation:'polish',scope:'document',selectionFrom:null,selectionTo:null,instruction:null,referencedScriptIds:[]}});
    const id=response.json().data.id;
    await app.inject({method:'PUT',url:`/xiaodan/api/v1/scripts/${script.id}/content`,headers:writeHeaders('edit',script.version),payload:{contentMarkdown:`${script.contentMarkdown}继续写`}});
    await new Promise((resolve)=>setTimeout(resolve,20));
    expect((await app.inject({method:'GET',url:`/xiaodan/api/v1/script-ai-runs/${id}`})).json().data.status).toBe('stale');
    const accept=await app.inject({method:'POST',url:`/xiaodan/api/v1/script-ai-runs/${id}/accept`,headers:writeHeaders('accept-stale'),payload:{hunkIds:[]}});
    expect(accept.statusCode).toBe(409);expect(accept.json().error.code).toBe('AI_RUN_STALE');
  });

  it('rejects a forged global assistant body-writing tool',async()=>{
    const {app}=await setup();
    const response=await app.inject({method:'POST',url:'/xiaodan/api/v1/assistant/execute',headers:writeHeaders('forged'),payload:{tool:'scripts.writeContent',arguments:{contentMarkdown:'覆盖'}}});
    expect(response.statusCode).toBe(403);expect(response.json().error.code).toBe('AGENT_TOOL_NOT_ALLOWED');
  });
});

