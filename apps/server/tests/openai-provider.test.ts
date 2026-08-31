import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';

let app:Awaited<ReturnType<typeof buildApp>>|null=null;const previous={key:process.env.OPENAI_API_KEY,base:process.env.OPENAI_BASE_URL,model:process.env.XIAODAN_WRITING_MODEL};
afterEach(async()=>{if(app)await app.close();app=null;vi.unstubAllGlobals();if(previous.key===undefined)delete process.env['OPENAI'+'_API_KEY'];else process.env['OPENAI'+'_API_KEY']=previous.key;if(previous.base===undefined)delete process.env.OPENAI_BASE_URL;else process.env.OPENAI_BASE_URL=previous.base;if(previous.model===undefined)delete process.env.XIAODAN_WRITING_MODEL;else process.env.XIAODAN_WRITING_MODEL=previous.model;});
const headers=(id:string,version?:number)=>({'content-type':'application/json','idempotency-key':id,...(version?{'if-match':`"${version}"`}:{})});

describe('OpenAI compatible provider',()=>{
  it('parses delta and usage SSE without exposing the server key',async()=>{process.env['OPENAI'+'_API_KEY']='test-secret-not-real';process.env.OPENAI_BASE_URL='https://models.example/v1/';process.env.XIAODAN_WRITING_MODEL='writing-test';
    const encoder=new TextEncoder();const fetchMock=vi.fn(async()=>new Response(new ReadableStream({start(controller){controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"改写后\\n"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\ndata: [DONE]\n\n'));controller.close();}}),{status:200,headers:{'content-type':'text/event-stream'}}));vi.stubGlobal('fetch',fetchMock);
    app=await buildApp({databasePath:':memory:',dataDir:'/tmp/openai-provider',basePath:'/xiaodan',logger:false});const script=(await app.inject({method:'POST',url:'/xiaodan/api/v1/scripts',headers:headers('s'),payload:{title:'稿'}})).json().data;
    const run=(await app.inject({method:'POST',url:`/xiaodan/api/v1/scripts/${script.id}/ai-runs`,headers:headers('ai'),payload:{operation:'polish',scope:'document',selectionFrom:null,selectionTo:null,instruction:'自然一点',referencedScriptIds:[]}})).json().data;await new Promise((r)=>setTimeout(r,20));
    const done=(await app.inject({method:'GET',url:`/xiaodan/api/v1/script-ai-runs/${run.id}`})).json().data;expect(done.status).toBe('completed');expect(done.candidateText).toBe('改写后\n');expect(done.usage).toEqual({inputTokens:7,outputTokens:3});
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://models.example/v1/chat/completions');const request=fetchMock.mock.calls[0]?.[1] as RequestInit;expect((request.headers as Record<string,string>).authorization).toBe('Bearer test-secret-not-real');expect(JSON.stringify(done)).not.toContain('test-secret-not-real');
  });
});
