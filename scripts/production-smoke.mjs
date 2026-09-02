import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir=await mkdtemp(join(tmpdir(),'xiaodan-smoke-'));const port=33210;const basePath=process.env.XIAODAN_BASE_PATH??'/';
const baseUrl=`http://127.0.0.1:${port}${basePath==='/'?'':basePath}`;
const child=spawn(process.execPath,['apps/server/dist/index.js'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),XIAODAN_BASE_PATH:basePath,XIAODAN_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',(chunk)=>output+=chunk);child.stderr.on('data',(chunk)=>output+=chunk);
try{
  let ready=false;for(let i=0;i<50;i++){try{const response=await fetch(`${baseUrl}/health/ready`);if(response.ok){ready=true;break;}}catch{}await new Promise((resolve)=>setTimeout(resolve,100));}
  if(!ready)throw new Error(`ready 未在 5 秒内通过\n${output}`);
  const page=await fetch(`${baseUrl}/scripts`);const html=await page.text();if(!page.ok||!html.includes('<title>小单工作台</title>'))throw new Error('SPA 刷新失败');
  const assetPaths=[...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)].map((match)=>match[1]);
  if(assetPaths.length===0)throw new Error('生产 HTML 未引用任何 JS/CSS 资源');
  for(const assetPath of assetPaths){
    const asset=await fetch(new URL(assetPath,`${baseUrl}/`));const contentType=asset.headers.get('content-type')??'';
    if(!asset.ok||contentType.includes('text/html'))throw new Error(`静态资源 MIME 错误: ${assetPath} -> ${asset.status} ${contentType}`);
    if(assetPath.endsWith('.js')&&!contentType.includes('javascript'))throw new Error(`JS MIME 错误: ${assetPath} -> ${contentType}`);
    if(assetPath.endsWith('.css')&&!contentType.includes('text/css'))throw new Error(`CSS MIME 错误: ${assetPath} -> ${contentType}`);
  }
  const health=await (await fetch(`${baseUrl}/health/live`)).json();if(!health.data?.live)throw new Error('live 健康检查失败');
  console.log(`production smoke: ready、SPA 刷新、${assetPaths.length} 个静态资源 MIME、live 均通过`);
}finally{child.kill('SIGTERM');await new Promise((resolve)=>child.once('exit',resolve));await rm(dataDir,{recursive:true,force:true});}
