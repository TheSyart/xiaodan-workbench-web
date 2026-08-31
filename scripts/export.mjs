import Database from 'better-sqlite3';
import { mkdir, writeFile, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const dataDir=resolve(process.env.XIAODAN_DATA_DIR??'.data');const target=resolve(process.argv[2]??join(dataDir,`export-${new Date().toISOString().replaceAll(':','-')}`));await mkdir(target,{recursive:true});
const db=new Database(join(dataDir,'xiaodan.db'),{readonly:true});
try{for(const table of ['projects','project_content_profiles','tasks','scripts','finance_categories','finance_transactions','documents','finance_transaction_documents','calendar_items','calendar_alerts','script_ai_runs','agent_runs']){
  const rows=db.prepare(`SELECT * FROM ${table}`).all();await writeFile(join(target,`${table}.json`),JSON.stringify(rows,null,2));
}}finally{db.close();}
await cp(join(dataDir,'attachments'),join(target,'attachments'),{recursive:true,force:true}).catch(()=>undefined);console.log(target);

