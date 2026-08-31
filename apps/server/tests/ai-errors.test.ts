import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AiProvider } from '../src/app.js';
const apps:Awaited<ReturnType<typeof buildApp>>[]=[];afterEach(async()=>{while(apps.length)await apps.pop()?.close();});
const headers=(id:string,version?:number)=>({'content-type':'application/json','idempotency-key':id,...(version?{'if-match':`"${version}"`}:{})});
async function script(app:Awaited<ReturnType<typeof buildApp>>){const s=(await app.inject({method:'POST',url:'/xiaodan/api/v1/scripts',headers:headers('s'),payload:{title:'稿'}})).json().data;return (await app.inject({method:'PUT',url:`/xiaodan/api/v1/scripts/${s.id}/content`,headers:headers('b',1),payload:{contentMarkdown:'正文\n'}})).json().data;}
describe('AI failure boundaries',()=>{
  it('persists provider failures and supports reject/history',async()=>{const provider:AiProvider={async *generate(){throw new Error('模型离线');}};const app=await buildApp({databasePath:':memory:',dataDir:'/tmp/ai-errors',basePath:'/xiaodan',logger:false,aiProvider:provider});apps.push(app);const s=await script(app);
    const id=(await app.inject({method:'POST',url:`/xiaodan/api/v1/scripts/${s.id}/ai-runs`,headers:headers('ai'),payload:{operation:'polish',scope:'document',selectionFrom:null,selectionTo:null,instruction:null,referencedScriptIds:[]}})).json().data.id;await new Promise((r)=>setTimeout(r,10));
    expect((await app.inject({method:'GET',url:`/xiaodan/api/v1/script-ai-runs/${id}`})).json().data.status).toBe('failed');expect((await app.inject({method:'GET',url:`/xiaodan/api/v1/scripts/${s.id}/ai-history`})).json().data).toHaveLength(1);
    expect((await app.inject({method:'POST',url:`/xiaodan/api/v1/script-ai-runs/${id}/reject`,headers:headers('reject'),payload:{}})).json().data.status).toBe('rejected');
  });
  it('requires idea selection instead of directly accepting ideation text',async()=>{const provider:AiProvider={async *generate(){yield{type:'delta',text:'想法一'};}};const app=await buildApp({databasePath:':memory:',dataDir:'/tmp/ai-ideas',basePath:'/xiaodan',logger:false,aiProvider:provider});apps.push(app);const s=await script(app);
    const id=(await app.inject({method:'POST',url:`/xiaodan/api/v1/scripts/${s.id}/ai-runs`,headers:headers('idea'),payload:{operation:'ideate',scope:'current_beat',selectionFrom:0,selectionTo:null,instruction:null,referencedScriptIds:[]}})).json().data.id;await new Promise((r)=>setTimeout(r,10));
    const response=await app.inject({method:'POST',url:`/xiaodan/api/v1/script-ai-runs/${id}/accept`,headers:headers('idea-accept'),payload:{hunkIds:[]}});expect(response.statusCode).toBe(409);expect(response.json().error.code).toBe('IDEA_SELECTION_REQUIRED');
  });
});

