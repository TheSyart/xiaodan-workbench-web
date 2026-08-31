import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir=await mkdtemp(join(tmpdir(),'xiaodan-smoke-'));const port=33210;
const child=spawn(process.execPath,['apps/server/dist/index.js'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),XIAODAN_BASE_PATH:'/xiaodan',XIAODAN_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',(chunk)=>output+=chunk);child.stderr.on('data',(chunk)=>output+=chunk);
try{
  let ready=false;for(let i=0;i<50;i++){try{const response=await fetch(`http://127.0.0.1:${port}/xiaodan/health/ready`);if(response.ok){ready=true;break;}}catch{}await new Promise((resolve)=>setTimeout(resolve,100));}
  if(!ready)throw new Error(`ready 未在 5 秒内通过\n${output}`);
  const page=await fetch(`http://127.0.0.1:${port}/xiaodan/scripts`);const html=await page.text();if(!page.ok||!html.includes('<title>小单工作台</title>'))throw new Error('SPA 子路径刷新失败');
  const health=await (await fetch(`http://127.0.0.1:${port}/xiaodan/health/live`)).json();if(!health.data?.live)throw new Error('live 健康检查失败');
  console.log('production smoke: ready、SPA 子路径、live 均通过');
}finally{child.kill('SIGTERM');await new Promise((resolve)=>child.once('exit',resolve));await rm(dataDir,{recursive:true,force:true});}

