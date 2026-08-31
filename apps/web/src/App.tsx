import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, MemoryRouter, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { CalendarItem, FinanceCategory, FinanceTransaction, Project, Script, ScriptAiRun, Task, TodayOverview } from '@xiaodan/contracts';
import { api, apiRoot, basePath, mutationHeaders, patch, post, put } from './api.js';
import { ScriptEditor, type SaveState } from './components/ScriptEditor.js';

const queryClient=new QueryClient({defaultOptions:{queries:{staleTime:15_000,retry:1,refetchOnWindowFocus:false}}});
const nav=[['/','今','今日'],['/finance','账','记账'],['/scripts','稿','稿件'],['/calendar','历','日历'],['/projects','项','项目']] as const;

function money(value:number){return new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(value/100);}
function PanelState({loading,error,empty,children}:{loading:boolean;error:unknown;empty?:boolean;children:React.ReactNode}){
  if(loading)return <div className="state-box">正在整理数据…</div>;
  if(error)return <div className="state-box state-error">读取失败，请稍后重试。</div>;
  if(empty)return <div className="state-box">这里还没有内容。</div>;
  return <>{children}</>;
}

function Shell(){
  const[assistantOpen,setAssistantOpen]=useState(false);const[dark,setDark]=useState(()=>localStorage.getItem('xiaodan-theme')==='dark');const[reminder,setReminder]=useState<string|null>(null);
  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem('xiaodan-theme',dark?'dark':'light');},[dark]);
  useEffect(()=>{if(!('EventSource'in window))return;const source=new EventSource(`${apiRoot}/reminders/events`);source.onmessage=(event)=>{const data=JSON.parse(event.data) as {title:string};if('Notification'in window&&Notification.permission==='granted')new Notification(data.title);else setReminder(data.title);};return()=>source.close();},[]);
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">单</span><div><strong>小单工作台</strong><small>个人创作与事务</small></div></div>
      <nav aria-label="全局导航">{nav.map(([to,icon,label])=><NavLink key={to} to={to} end={to==='/'} className={({isActive})=>isActive?'nav-item active':'nav-item'}><span>{icon}</span>{label}</NavLink>)}</nav>
      <div className="sidebar-bottom">
        <button className={`nav-item assistant-trigger ${assistantOpen?'active':''}`} onClick={()=>setAssistantOpen(true)}><span>小</span>小单</button>
        <NavLink to="/settings" className={({isActive})=>isActive?'nav-item active':'nav-item'}><span>设</span>设置</NavLink>
        <button className="theme-toggle" onClick={()=>setDark(!dark)}>{dark?'切换浅色':'切换深色'}</button>
      </div>
    </aside>
    <main className="main-stage"><Routes>
      <Route path="/" element={<OverviewPage/>}/><Route path="/finance" element={<FinancePage/>}/>
      <Route path="/scripts" element={<ScriptsPage/>}/><Route path="/calendar" element={<CalendarPage/>}/>
      <Route path="/projects" element={<ProjectsPage/>}/><Route path="/settings" element={<SettingsPage/>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes></main>
    <AssistantDrawer open={assistantOpen} onClose={()=>setAssistantOpen(false)}/>
    {reminder&&<button className="reminder-toast" onClick={()=>setReminder(null)}><strong>时间到了</strong><span>{reminder}</span></button>}
  </div>;
}

export function App({initialEntries}:{initialEntries?:string[]}={}){
  const content=<QueryClientProvider client={queryClient}><Shell/></QueryClientProvider>;
  return initialEntries?<MemoryRouter initialEntries={initialEntries}>{content}</MemoryRouter>:<BrowserRouter basename={basePath}>{content}</BrowserRouter>;
}

function PageHeader({eyebrow,title,description,actions}:{eyebrow:string;title:string;description:string;actions?:React.ReactNode}){
  return <header className="page-header"><div><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div>{actions&&<div className="header-actions">{actions}</div>}</header>;
}

function OverviewPage(){
  const overview=useQuery({queryKey:['overview'],queryFn:()=>api<TodayOverview>(`/overview/today?now=${encodeURIComponent(new Date().toISOString())}&timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`)});
  const date=new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());
  return <div className="page overview-page"><PageHeader eyebrow={date} title="把今天过清楚" description="写作、项目和日常事务，在同一张桌面上继续。"/>
    <PanelState loading={overview.isLoading} error={overview.error}><div className="overview-grid">
      <section className="paper-panel focus-panel"><div className="section-heading"><span>今日安排</span><small>{overview.data?.todayItems.length??0} 项</small></div>
        {(overview.data?.todayItems.length??0)>0?overview.data!.todayItems.map((item)=><div className="timeline-row" key={item.id}><time>{new Date(item.startsAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</time><i/><strong>{item.title}</strong></div>):<Empty title="今天没有被塞满" text="留白也是一种安排。去日历里添加事项。"/>}
      </section>
      <section className="paper-panel"><div className="section-heading"><span>本月记账</span><small>人民币</small></div><div className="money-pair"><div><small>收入</small><strong>{money(overview.data?.financeMonth.incomeMinor??0)}</strong></div><div><small>支出</small><strong>{money(overview.data?.financeMonth.expenseMinor??0)}</strong></div></div></section>
      <section className="paper-panel"><div className="section-heading"><span>待推进</span><small>{overview.data?.pendingTasks.length??0} 项</small></div>{overview.data?.pendingTasks.slice(0,5).map((task)=><div className="plain-row" key={task.id}><span className={`status-dot ${task.status}`}/><span>{task.title}</span></div>)}{!overview.data?.pendingTasks.length&&<Empty title="手头很干净" text="没有待推进任务。"/>}</section>
      <section className="paper-panel wide"><div className="section-heading"><span>最近稿件</span><NavLink to="/scripts">打开写作台</NavLink></div><div className="script-strip">{overview.data?.recentScripts.map((script)=><div className="mini-script" key={script.id}><small>{script.plannedDate??'未排期'}</small><strong>{script.title}</strong><span>{script.contentMarkdown.length} 字</span></div>)}{!overview.data?.recentScripts.length&&<Empty title="从第一篇开始" text="新建一篇稿件，写下第一行。"/>}</div></section>
    </div></PanelState>
  </div>;
}

function Empty({title,text}:{title:string;text:string}){return <div className="empty"><strong>{title}</strong><span>{text}</span></div>;}

function FinancePage(){
  const client=useQueryClient();const month=new Date().toISOString().slice(0,7);const[showForm,setShowForm]=useState(false);const[tab,setTab]=useState<'transactions'|'documents'>('transactions');
  const tx=useQuery({queryKey:['finance',month],queryFn:()=>api<FinanceTransaction[]>(`/finance/transactions?month=${month}`)});
  const categories=useQuery({queryKey:['categories'],queryFn:()=>api<FinanceCategory[]>('/finance/categories')});
  const summary=useQuery({queryKey:['finance-summary',month],queryFn:()=>api<{incomeMinor:number;expenseMinor:number}>(`/finance/summary?month=${month}`)});
  const create=useMutation({mutationFn:(body:unknown)=>post('/finance/transactions',body),onSuccess:()=>{void client.invalidateQueries({queryKey:['finance']});void client.invalidateQueries({queryKey:['finance-summary']});setShowForm(false);}});
  return <div className="page"><PageHeader eyebrow="FINANCE" title="每一笔，都有来处" description="只记录真实流水。凭证可以关联，但不会自动变成账目。" actions={tab==='transactions'?<button className="primary" onClick={()=>setShowForm(true)}>新建流水</button>:undefined}/>
    <div className="project-tabs"><button className={tab==='transactions'?'active':''} onClick={()=>setTab('transactions')}>流水</button><button className={tab==='documents'?'active':''} onClick={()=>setTab('documents')}>凭证</button></div>
    {tab==='documents'?<DocumentsPanel/>:<>
    <div className="summary-line"><div><small>本月收入</small><strong>{money(summary.data?.incomeMinor??0)}</strong></div><div><small>本月支出</small><strong>{money(summary.data?.expenseMinor??0)}</strong></div><div><small>结余</small><strong>{money((summary.data?.incomeMinor??0)-(summary.data?.expenseMinor??0))}</strong></div></div>
    <section className="paper-panel table-panel"><div className="section-heading"><span>流水</span><small>{month}</small></div><PanelState loading={tx.isLoading} error={tx.error} empty={!tx.data?.length}><table><thead><tr><th>日期</th><th>类型</th><th>对方 / 备注</th><th>金额</th></tr></thead><tbody>{tx.data?.filter((row)=>!row.deletedAt).map((row)=><tr key={row.id}><td>{row.occurredAt.slice(0,10)}</td><td>{row.kind==='income'?'收入':'支出'}</td><td>{row.counterparty||row.note||'—'}</td><td className={row.kind}>{row.kind==='income'?'+':'−'}{money(row.amountMinor)}</td></tr>)}</tbody></table></PanelState></section>
    {showForm&&<Modal title="新建流水" onClose={()=>setShowForm(false)}><FinanceForm categories={categories.data??[]} pending={create.isPending} onSubmit={(body)=>create.mutate(body)}/></Modal>}</>}
  </div>;
}

function DocumentsPanel(){
  type Doc={id:string;originalName:string;mimeType:string;size:number;createdAt:string};const client=useQueryClient();const docs=useQuery({queryKey:['documents'],queryFn:()=>api<Doc[]>('/documents')});
  const upload=useMutation({mutationFn:async(file:File)=>{const data=new FormData();data.set('file',file);return api<Doc>('/documents',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:data});},onSuccess:()=>void client.invalidateQueries({queryKey:['documents']})});
  return <section className="paper-panel documents-panel"><div className="section-heading"><span>票据与原件</span><label className="upload-button">{upload.isPending?'上传中…':'上传凭证'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain" onChange={(event)=>{const file=event.target.files?.[0];if(file)upload.mutate(file);}}/></label></div><p className="boundary-copy">上传只保存原件。识读结果不会自动生成账目，必须由你确认后另建真实流水。</p><div className="document-grid">{docs.data?.map((doc)=><a key={doc.id} href={`${apiRoot}/documents/${doc.id}/file`} target="_blank" rel="noreferrer"><strong>{doc.originalName}</strong><span>{doc.mimeType} · {(doc.size/1024).toFixed(1)} KB</span></a>)}{!docs.data?.length&&<Empty title="还没有凭证" text="支持图片、PDF 和文本原件。"/>}</div></section>;
}

function FinanceForm({categories,pending,onSubmit}:{categories:FinanceCategory[];pending:boolean;onSubmit:(body:unknown)=>void}){
  const[kind,setKind]=useState<'income'|'expense'>('expense');
  return <form className="form-stack" onSubmit={(event)=>{event.preventDefault();const data=new FormData(event.currentTarget);onSubmit({kind,amountMinor:Math.round(Number(data.get('amount'))*100),categoryId:String(data.get('categoryId')),occurredAt:new Date(String(data.get('date'))+'T12:00:00').toISOString(),counterparty:String(data.get('counterparty')||'')||null,note:String(data.get('note')||'')||null,projectId:null,documentIds:[]});}}>
    <div className="segmented"><button type="button" className={kind==='expense'?'active':''} onClick={()=>setKind('expense')}>支出</button><button type="button" className={kind==='income'?'active':''} onClick={()=>setKind('income')}>收入</button></div>
    <label>金额（元）<input name="amount" type="number" min="0.01" step="0.01" required autoFocus/></label><label>分类<select name="categoryId" required>{categories.filter((item)=>item.kind===kind&&!item.archivedAt).map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>日期<input name="date" type="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label><label>对方<input name="counterparty" maxLength={300}/></label><label>备注<textarea name="note" rows={3}/></label><button className="primary" disabled={pending}>{pending?'正在保存…':'保存流水'}</button>
  </form>;
}

function ProjectsPage(){
  const client=useQueryClient();const[showCreate,setShowCreate]=useState(false);const[selected,setSelected]=useState<Project|null>(null);const[projectTab,setProjectTab]=useState<'tasks'|'content'>('tasks');
  const projects=useQuery({queryKey:['projects'],queryFn:()=>api<Project[]>('/projects')});
  const tasks=useQuery({queryKey:['tasks',selected?.id],queryFn:()=>api<Task[]>(`/tasks?projectId=${selected!.id}`),enabled:Boolean(selected)});
  const create=useMutation({mutationFn:(body:unknown)=>post<Project>('/projects',body),onSuccess:(project)=>{void client.invalidateQueries({queryKey:['projects']});setShowCreate(false);setSelected(project);}});
  const createTask=useMutation({mutationFn:(title:string)=>post('/tasks',{projectId:selected!.id,title,notes:null,dueAt:null}),onSuccess:()=>void client.invalidateQueries({queryKey:['tasks',selected?.id]})});
  const moveTask=useMutation({mutationFn:({task,status}:{task:Task;status:Task['status']})=>patch(`/tasks/${task.id}`,{status},task.version),onSuccess:()=>void client.invalidateQueries({queryKey:['tasks',selected?.id]})});
  if(selected)return <div className="page"><button className="back" onClick={()=>setSelected(null)}>← 返回项目</button><PageHeader eyebrow={selected.type==='content_series'?'CONTENT SERIES':'PROJECT'} title={selected.name} description={selected.description||'把下一步拆小，然后推进。'} actions={<NavLink className="button-link" to="/scripts">进入写作台</NavLink>}/>
    {selected.type==='content_series'&&<div className="project-tabs"><button className={projectTab==='tasks'?'active':''} onClick={()=>setProjectTab('tasks')}>任务</button><button className={projectTab==='content'?'active':''} onClick={()=>setProjectTab('content')}>内容日历</button></div>}
    {projectTab==='content'&&selected.type==='content_series'?<ProjectContentCalendar project={selected}/>:<div className="kanban">{(['todo','doing','done'] as const).map((status)=><section key={status}><div className="section-heading"><span>{{todo:'待办',doing:'进行中',done:'已完成'}[status]}</span><small>{tasks.data?.filter((t)=>t.status===status).length??0}</small></div>{status==='todo'&&<form className="quick-add" onSubmit={(event)=>{event.preventDefault();const input=event.currentTarget.elements.namedItem('title') as HTMLInputElement;if(input.value.trim()){createTask.mutate(input.value.trim());input.value='';}}}><input name="title" placeholder="添加一个任务"/><button>添加</button></form>}{tasks.data?.filter((task)=>task.status===status).map((task)=><article className="task-card" key={task.id}><strong>{task.title}</strong><div>{status!=='todo'&&<button onClick={()=>moveTask.mutate({task,status:status==='done'?'doing':'todo'})}>←</button>}{status!=='done'&&<button onClick={()=>moveTask.mutate({task,status:status==='todo'?'doing':'done'})}>→</button>}</div></article>)}</section>)}</div>}</div>;
  return <div className="page"><PageHeader eyebrow="PROJECTS" title="让长期事情看得见" description="普通项目管任务，内容系列还可以管画像、期数和每日稿件。" actions={<button className="primary" onClick={()=>setShowCreate(true)}>新建项目</button>}/>
    <PanelState loading={projects.isLoading} error={projects.error} empty={!projects.data?.length}><div className="project-grid">{projects.data?.map((project)=><button className="project-card" key={project.id} onClick={()=>setSelected(project)}><small>{project.type==='content_series'?'内容系列':'普通项目'}</small><h2>{project.name}</h2><p>{project.description||'还没有项目说明'}</p><div><span>{project.status==='active'?'进行中':project.status}</span><b>打开 →</b></div></button>)}</div></PanelState>
    {showCreate&&<Modal title="新建项目" onClose={()=>setShowCreate(false)}><ProjectForm pending={create.isPending} onSubmit={(body)=>create.mutate(body)}/></Modal>}
  </div>;
}

function ProjectContentCalendar({project}:{project:Project}){
  const client=useQueryClient();const[showBatch,setShowBatch]=useState(false);const[preview,setPreview]=useState<Array<{title:string;plannedDate:string;episodeNo:number|null}>>([]);
  const start=new Date();start.setDate(1);const from=start.toISOString().slice(0,10);const end=new Date(start.getFullYear(),start.getMonth()+2,0).toISOString().slice(0,10);
  const scripts=useQuery({queryKey:['content-calendar',project.id,from,end],queryFn:()=>api<Script[]>(`/projects/${project.id}/content-calendar?from=${from}&to=${end}`)});
  const batch=useMutation({mutationFn:(body:{from:string;to:string;weekdays:number[];titleTemplate:string;startEpisodeNo:number|null;previewOnly:boolean})=>post<{preview:Array<{title:string;plannedDate:string;episodeNo:number|null}>;scripts?:Script[]}>(`/projects/${project.id}/scripts/batch`,body),onSuccess:(result,variables)=>{setPreview(result.preview);if(!variables.previewOnly){void client.invalidateQueries({queryKey:['content-calendar',project.id]});void client.invalidateQueries({queryKey:['scripts']});setShowBatch(false);setPreview([]);}}});
  const byDate=new Map<string,Script[]>();scripts.data?.forEach((script)=>{if(!script.plannedDate)return;byDate.set(script.plannedDate,[...(byDate.get(script.plannedDate)??[]),script]);});
  return <section className="content-calendar"><div className="content-toolbar"><div><strong>稿件排期</strong><small>{from} 至 {end}</small></div><button className="primary" onClick={()=>setShowBatch(true)}>批量创建空稿</button></div>
    <div className="content-list">{scripts.data?.map((script)=><article key={script.id}><time>{script.plannedDate??'未排期'}</time><span>{script.episodeNo?`第 ${script.episodeNo} 期`:'单篇'}</span><strong>{script.title}</strong><b>{script.status}</b></article>)}{!scripts.data?.length&&<Empty title="这个月还没有稿件" text="可以手动新建，也可以按星期批量生成空稿。"/>}</div>
    {showBatch&&<Modal title="批量创建空稿" onClose={()=>{setShowBatch(false);setPreview([]);}}><BatchScriptForm pending={batch.isPending} preview={preview} onSubmit={(body)=>batch.mutate(body)}/></Modal>}
  </section>;
}

function BatchScriptForm({pending,preview,onSubmit}:{pending:boolean;preview:Array<{title:string;plannedDate:string;episodeNo:number|null}>;onSubmit:(body:{from:string;to:string;weekdays:number[];titleTemplate:string;startEpisodeNo:number|null;previewOnly:boolean})=>void}){
  const[values,setValues]=useState({from:new Date().toISOString().slice(0,10),to:new Date(Date.now()+6*86400000).toISOString().slice(0,10),titleTemplate:'第 {episode} 期',startEpisodeNo:'1'});const[weekdays,setWeekdays]=useState([1,2,3,4,5]);
  const body=(previewOnly:boolean)=>({from:values.from,to:values.to,weekdays,titleTemplate:values.titleTemplate,startEpisodeNo:values.startEpisodeNo?Number(values.startEpisodeNo):null,previewOnly});
  return <div className="form-stack"><div className="date-pair"><label>开始日期<input type="date" value={values.from} onChange={(event)=>setValues({...values,from:event.target.value})}/></label><label>结束日期<input type="date" value={values.to} onChange={(event)=>setValues({...values,to:event.target.value})}/></label></div><label>标题模板<input value={values.titleTemplate} onChange={(event)=>setValues({...values,titleTemplate:event.target.value})}/><small>可用 {'{episode}'} 和 {'{date}'}</small></label><label>起始期数<input type="number" min="1" value={values.startEpisodeNo} onChange={(event)=>setValues({...values,startEpisodeNo:event.target.value})}/></label><fieldset><legend>创建星期</legend><div className="weekday-row">{['一','二','三','四','五','六','日'].map((label,index)=><label key={label}><input type="checkbox" checked={weekdays.includes(index+1)} onChange={(event)=>setWeekdays(event.target.checked?[...weekdays,index+1]:weekdays.filter((day)=>day!==index+1))}/>{label}</label>)}</div></fieldset>
    {preview.length>0&&<div className="batch-preview"><strong>将创建 {preview.length} 篇</strong>{preview.map((item)=><div key={`${item.plannedDate}-${item.episodeNo}`}><time>{item.plannedDate}</time><span>{item.title}</span></div>)}</div>}
    {preview.length===0?<button className="primary" disabled={pending||weekdays.length===0} onClick={()=>onSubmit(body(true))}>{pending?'正在计算…':'预览日期与标题'}</button>:<div className="form-actions"><button className="primary" disabled={pending} onClick={()=>onSubmit(body(false))}>{pending?'正在创建…':'确认并一次创建'}</button></div>}
  </div>;
}

function ProjectForm({pending,onSubmit}:{pending:boolean;onSubmit:(body:unknown)=>void}){
  const[type,setType]=useState<'general'|'content_series'>('content_series');
  return <form className="form-stack" onSubmit={(event)=>{event.preventDefault();const d=new FormData(event.currentTarget);const base={name:String(d.get('name')),description:String(d.get('description')||'')||null,targetDate:null,type};onSubmit(type==='general'?base:{...base,contentProfile:{audience:String(d.get('audience')),topicScope:String(d.get('topicScope')),toneGuidelines:String(d.get('toneGuidelines')),structureTemplate:String(d.get('structureTemplate')),forbiddenPhrases:String(d.get('forbiddenPhrases')||'').split('、').filter(Boolean),targetDurationSeconds:Number(d.get('targetDurationSeconds')),cadenceWeekdays:d.getAll('weekday').map(Number)}});}}>
    <div className="segmented"><button type="button" className={type==='content_series'?'active':''} onClick={()=>setType('content_series')}>内容系列</button><button type="button" className={type==='general'?'active':''} onClick={()=>setType('general')}>普通项目</button></div>
    <label>项目名称<input name="name" required autoFocus placeholder="例如：小单日谈"/></label><label>项目说明<textarea name="description" rows={2}/></label>
    {type==='content_series'&&<><label>目标观众<input name="audience" required placeholder="谁会看这个系列"/></label><label>选题范围<textarea name="topicScope" required rows={2}/></label><label>语气规范<textarea name="toneGuidelines" required rows={2}/></label><label>结构模板<textarea name="structureTemplate" required rows={2}/></label><label>禁用词（用顿号分隔）<input name="forbiddenPhrases"/></label><label>目标时长（秒）<input name="targetDurationSeconds" type="number" min="10" defaultValue="180" required/></label><fieldset><legend>更新星期</legend><div className="weekday-row">{['一','二','三','四','五','六','日'].map((label,index)=><label key={label}><input type="checkbox" name="weekday" value={index+1} defaultChecked={index<5}/>{label}</label>)}</div></fieldset></>}
    <button className="primary" disabled={pending}>{pending?'正在创建…':'创建项目'}</button>
  </form>;
}

function ScriptsPage(){
  const client=useQueryClient();const navigate=useNavigate();const[selectedId,setSelectedId]=useState<string|null>(null);const[content,setContent]=useState('');const[saveState,setSaveState]=useState<SaveState>('idle');const[selection,setSelection]=useState({from:0,to:0});const[activeRun,setActiveRun]=useState<ScriptAiRun|null>(null);
  const projects=useQuery({queryKey:['projects'],queryFn:()=>api<Project[]>('/projects')});const scriptsQuery=useQuery({queryKey:['scripts'],queryFn:()=>api<Script[]>('/scripts')});
  const selected=scriptsQuery.data?.find((item)=>item.id===selectedId)??scriptsQuery.data?.[0]??null;
  const history=useQuery({queryKey:['ai-history',selected?.id],queryFn:()=>api<ScriptAiRun[]>(`/scripts/${selected!.id}/ai-history`),enabled:Boolean(selected)});
  useEffect(()=>{if(selected&&!selectedId)setSelectedId(selected.id);},[selected,selectedId]);useEffect(()=>{if(selected)setContent(selected.contentMarkdown);},[selected?.id]);
  const create=useMutation({mutationFn:()=>post<Script>('/scripts',{title:`未命名稿件 ${new Date().toLocaleDateString('zh-CN')}`,projectId:projects.data?.[0]?.id??null,plannedDate:new Date().toISOString().slice(0,10),episodeNo:null}),onSuccess:(script)=>{void client.invalidateQueries({queryKey:['scripts']});setSelectedId(script.id);}});
  const save=async(value:string)=>{if(!selected)return;setSaveState('saving');try{const result=await put<Script>(`/scripts/${selected.id}/content`,{contentMarkdown:value},selected.version);client.setQueryData<Script[]>(['scripts'],(old)=>old?.map((item)=>item.id===result.id?result:item));setSaveState('saved');}catch{setSaveState('error');throw new Error('save failed');}};
  const runAi=async(operation:string,instruction:string|null=null)=>{if(!selected)return;const scope=selection.to>selection.from?'selection':'current_beat';const run=await post<ScriptAiRun>(`/scripts/${selected.id}/ai-runs`,{operation,scope,selectionFrom:selection.from,selectionTo:scope==='selection'?selection.to:null,instruction,referencedScriptIds:[]});setActiveRun(run);const source=new EventSource(`${apiRoot}/script-ai-runs/${run.id}/events`);source.onmessage=(event)=>{const payload=JSON.parse(event.data) as {type:string};if(payload.type==='done'||payload.type==='error'){source.close();void api<ScriptAiRun>(`/script-ai-runs/${run.id}`).then((done)=>{setActiveRun(done);void client.invalidateQueries({queryKey:['ai-history',selected.id]});});}};};
  const accept=async(ids:string[])=>{if(!activeRun)return;const result=await post<{run:ScriptAiRun;script:Script}>(`/script-ai-runs/${activeRun.id}/accept`,{hunkIds:ids});setActiveRun(result.run);setContent(result.script.contentMarkdown);client.setQueryData<Script[]>(['scripts'],(old)=>old?.map((item)=>item.id===result.script.id?result.script:item));};
  const beats=content.split(/\r?\n/).filter((line)=>line.trim()).length;const estimate=Math.max(1,Math.round(content.replace(/\s/g,'').length/240));
  return <div className="scripts-workspace">
    <aside className="script-rail"><div className="rail-header"><div><small>稿件工作台</small><strong>每日稿件</strong></div><button onClick={()=>create.mutate()}>＋</button></div><select aria-label="筛选项目"><option>全部项目</option>{projects.data?.map((project)=><option key={project.id}>{project.name}</option>)}</select><div className="script-list">{scriptsQuery.data?.map((script)=><button key={script.id} className={selected?.id===script.id?'active':''} onClick={()=>setSelectedId(script.id)}><small>{script.plannedDate??'未排期'} {script.episodeNo?`· 第 ${script.episodeNo} 期`:''}</small><strong>{script.title}</strong><span>{script.status==='draft'?'草稿':script.status}</span></button>)}</div></aside>
    <section className="writing-stage">{selected?<><header className="writing-toolbar"><div><input aria-label="稿件标题" value={selected.title} readOnly/><small>{saveState==='saving'?'保存中…':saveState==='error'?'保存失败，正文仍在本页':saveState==='saved'?'已保存':'等待输入'} · {beats} 个节拍 · 预计 {estimate} 分钟</small></div><button onClick={()=>navigate('/calendar')}>排期</button></header><div className="paper-editor"><ScriptEditor value={content} onChange={setContent} onSave={save} onSelectionChange={(from,to)=>setSelection({from,to})} saveState={saveState}/></div><div className="selection-tools"><span>{selection.to>selection.from?'已选择文本':'当前节拍'}</span>{([['polish','润色'],['condense','精简'],['expand','扩写'],['rhythm','节拍优化']] as const).map(([key,label])=><button key={key} onClick={()=>void runAi(key)}>{label}</button>)}</div></>:<Empty title="还没有稿件" text="点击左上角加号新建第一篇。"/>}</section>
    <aside className="ai-panel"><div className="ai-heading"><div><span className="brand-mark small">小</span><div><strong>AI 写作助手</strong><small>只给候选，不会直接改正文</small></div></div><button onClick={()=>selected&&void runAi('ideate')}>拓展思路</button></div>{activeRun?<AiCandidate run={activeRun} onAccept={accept} onIdea={(idea)=>void runAi('expand',`在当前节拍后插入并展开这个想法：${idea}`)}/>:<div className="ai-empty"><strong>从一个明确动作开始</strong><p>选择一段文字进行润色、精简、扩写或节拍优化。全文处理需要你显式选择。</p><div className="rule-note">系列画像与当前稿件会作为默认上下文；历史稿件需主动选择。</div></div>}<details className="ai-history"><summary>历史候选（{history.data?.length??0}）</summary>{history.data?.map((run)=><button key={run.id} onClick={()=>setActiveRun(run)}><span>{run.operation}</span><small>{run.status} · {new Date(run.createdAt).toLocaleString('zh-CN')}</small></button>)}</details></aside>
  </div>;
}

function AiCandidate({run,onAccept,onIdea}:{run:ScriptAiRun;onAccept:(ids:string[])=>void;onIdea:(idea:string)=>void}){
  const[accepted,setAccepted]=useState<string[]>(()=>run.diffHunks.filter((h)=>h.kind==='change').map((h)=>h.id));const stale=run.status==='stale';
  if(['queued','streaming'].includes(run.status))return <div className="ai-running"><i/><strong>小单正在整理候选</strong><p>你可以继续编辑。正文一旦变化，这份候选会自动过期。</p></div>;
  if(run.operation==='ideate')return <div className="candidate"><h3>思路卡</h3>{run.candidateText.split('\n').filter(Boolean).map((idea,index)=><button className="idea-card" key={index} onClick={()=>onIdea(idea)}>{idea}<small>选择并生成插入候选 →</small></button>)}<small>选择想法后再生成插入候选，不会直接写入正文。</small></div>;
  return <div className="candidate"><div className="candidate-status"><span>{stale?'候选已过期':'候选差异'}</span><small>{run.model}</small></div>{stale&&<div className="stale-note">正文已经变化。你仍可查看和复制，但不能采纳。</div>}<div className="diff-list">{run.diffHunks.filter((h)=>h.kind==='change').map((h)=><article key={h.id} className={accepted.includes(h.id)?'accepted':''}><label><input type="checkbox" checked={accepted.includes(h.id)} disabled={stale} onChange={(event)=>setAccepted(event.target.checked?[...accepted,h.id]:accepted.filter((id)=>id!==h.id))}/>采纳此段</label><div className="diff-old">{h.originalText||'（空）'}</div><div className="diff-new">{h.candidateText||'（删除）'}</div></article>)}</div><button className="primary full" disabled={stale||run.status!=='completed'} onClick={()=>onAccept(accepted)}>采纳所选修改</button></div>;
}

function CalendarPage(){
  const client=useQueryClient();const range=useMemo(()=>{const date=new Date();const from=new Date(date.getFullYear(),date.getMonth()-1,1).toISOString();const to=new Date(date.getFullYear(),date.getMonth()+2,1).toISOString();return{from,to};},[]);
  const items=useQuery({queryKey:['calendar',range],queryFn:()=>api<CalendarItem[]>(`/calendar/items?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)});
  const create=useMutation({mutationFn:(body:unknown)=>post('/calendar/items',body),onSuccess:()=>void client.invalidateQueries({queryKey:['calendar']})});
  const update=useMutation({mutationFn:({item,startsAt,endsAt}:{item:CalendarItem;startsAt:string;endsAt:string})=>patch(`/calendar/items/${item.id}`,{startsAt,endsAt},item.version),onSuccess:()=>void client.invalidateQueries({queryKey:['calendar']}),onError:()=>void client.invalidateQueries({queryKey:['calendar']})});
  return <div className="page calendar-page"><PageHeader eyebrow="CALENDAR" title="让时间有形状" description="拖动调整开始时间，拉伸改变长度；每次移动都受版本保护。"/>
    <section className="calendar-paper"><FullCalendar plugins={[dayGridPlugin,timeGridPlugin,interactionPlugin]} initialView="timeGridWeek" locale="zh-cn" firstDay={1} slotMinTime="07:00:00" slotMaxTime="23:00:00" slotDuration="00:15:00" snapDuration="00:15:00" editable selectable height="auto" headerToolbar={{left:'prev,next today',center:'title',right:'dayGridMonth,timeGridWeek'}} events={(items.data??[]).map((item)=>({id:item.id,title:item.title,start:item.startsAt,end:item.endsAt,allDay:item.allDay,extendedProps:{item}}))} select={(selection)=>create.mutate({kind:'event',title:'新事项',startsAt:selection.start.toISOString(),endsAt:selection.end.toISOString(),allDay:selection.allDay,projectId:null,taskId:null,scriptId:null})} eventDrop={(info)=>{const item=info.event.extendedProps.item as CalendarItem;update.mutate({item,startsAt:info.event.start!.toISOString(),endsAt:(info.event.end??new Date(info.event.start!.getTime()+3600000)).toISOString()},{onError:()=>info.revert()});}} eventResize={(info)=>{const item=info.event.extendedProps.item as CalendarItem;update.mutate({item,startsAt:info.event.start!.toISOString(),endsAt:info.event.end!.toISOString()},{onError:()=>info.revert()});}}/></section>
  </div>;
}

function SettingsPage(){const status=useQuery({queryKey:['ai-capabilities'],queryFn:()=>api<{tools:string[];forbidden:string[]}>('/assistant/capabilities')});return <div className="page narrow"><PageHeader eyebrow="SETTINGS" title="设置" description="服务器掌管数据与密钥，浏览器只获取必要结果。"/><section className="paper-panel settings-list"><div><strong>数据存储</strong><p>SQLite 与附件保存在服务器本地数据目录。</p><span className="badge">服务器管理</span></div><div><strong>AI 连接</strong><p>模型密钥不会出现在 HTML、API、日志或导出中。</p><span className="badge">{status.isSuccess?'服务可用':'等待检测'}</span></div><div><strong>通知</strong><p>页面打开时通过 SSE 接收；关闭页面后不做 Web Push。</p><span className="badge">应用内提醒</span></div></section></div>;}

function AssistantDrawer({open,onClose}:{open:boolean;onClose:()=>void}){
  type Message={role:'user'|'assistant';text:string;confirmationId?:string};const[text,setText]=useState('');const[messages,setMessages]=useState<Message[]>([{role:'assistant',text:'我是小单。可以帮你查询项目、任务、账目、日历和稿件元数据。稿件正文只在编辑器里由你采纳。'}]);
  const send=async()=>{const prompt=text.trim();if(!prompt)return;setText('');setMessages((old)=>[...old,{role:'user',text:prompt}]);let tool='projects.list';let args:Record<string,unknown>={query:prompt};if(prompt.includes('任务'))tool='tasks.list';else if(prompt.includes('账'))tool='finance.list';else if(prompt.includes('稿'))tool='scripts.search';
    const createMatch=/新建(?:一个)?项目[：:]?\s*(.+)/.exec(prompt);if(createMatch?.[1]){tool='projects.create';args={name:createMatch[1].trim(),type:'general',description:null,targetDate:null};}
    try{const data=await post<{requiresConfirmation?:boolean;confirmationId?:string;result?:unknown}>('/assistant/execute',{tool,arguments:args});if(data.requiresConfirmation&&data.confirmationId){const confirmationId=data.confirmationId;setMessages((old)=>[...old,{role:'assistant',text:`准备执行 ${tool}。请核对后确认；确认会在 24 小时后失效。`,confirmationId}]);}else setMessages((old)=>[...old,{role:'assistant',text:`已查询：${JSON.stringify(data,null,2).slice(0,1200)}`}]);}catch(error){setMessages((old)=>[...old,{role:'assistant',text:error instanceof Error?error.message:'执行失败'}]);}};
  const confirm=async(id:string)=>{try{const data=await post<{result:unknown}>(`/assistant/confirm/${id}`,{});setMessages((old)=>[...old,{role:'assistant',text:`已执行：${JSON.stringify(data.result,null,2).slice(0,1200)}`}]);}catch(error){setMessages((old)=>[...old,{role:'assistant',text:error instanceof Error?error.message:'确认失败'}]);}};
  return <div className={`assistant-sheet ${open?'open':''}`} aria-hidden={!open}><header><div><span className="brand-mark small">小</span><div><strong>小单</strong><small>全局工作助理</small></div></div><button onClick={onClose}>关闭</button></header><div className="chat-feed">{messages.map((message,index)=><div key={index} className={`chat-message ${message.role}`}>{message.text}{message.confirmationId&&<button className="confirm-action" onClick={()=>void confirm(message.confirmationId!)}>确认执行</button>}</div>)}</div><form onSubmit={(event)=>{event.preventDefault();void send();}}><textarea value={text} onChange={(event)=>setText(event.target.value)} placeholder="例如：新建项目：九月口播计划"/><button className="primary">发送</button></form></div>;
}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div className="modal-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button onClick={onClose}>关闭</button></header>{children}</section></div>;}
