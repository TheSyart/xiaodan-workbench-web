import Database from 'better-sqlite3';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const dataDir=resolve(process.env.XIAODAN_DATA_DIR??'.data');const backupDir=resolve(process.env.XIAODAN_BACKUP_DIR??join(dataDir,'backups'));await mkdir(backupDir,{recursive:true});
const source=join(dataDir,'xiaodan.db');const target=join(backupDir,`xiaodan-${new Date().toISOString().replaceAll(':','-')}.db`);const db=new Database(source,{readonly:true});
try{await db.backup(target);console.log(target);}finally{db.close();}

