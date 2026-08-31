import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const files=execFileSync('rg',['--files','apps','packages','scripts'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const forbidden=[/sk-[A-Za-z0-9_-]{20,}/,/OPENAI_API_KEY\s*=\s*[^\s'";]+/];
for(const file of files){if(file.includes('/dist/'))continue;const text=await readFile(file,'utf8').catch(()=>null);if(text===null)continue;for(const pattern of forbidden){if(pattern.test(text))throw new Error(`检测到疑似密钥：${file}`);}}
const server=await readFile('apps/server/src/app.ts','utf8');
for(const required of ['ORIGIN_REJECTED','X-Content-Type-Options','INVALID_PATH','AGENT_TOOL_NOT_ALLOWED'])if(!server.includes(required))throw new Error(`缺少安全边界：${required}`);
console.log('security check: 未发现硬编码 Key，来源、MIME、路径和 Agent 工具边界存在');

