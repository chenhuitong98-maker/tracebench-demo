import {encode,decode,writeSave} from './hi3d-save-core.mjs';
import {requirements} from './hi3d-domain.mjs';
const KEY='tracebench.concept.v1',BACKUP=KEY+'.previous';
const options={game:'tracebench-concept',version:1,maxBytes:4500000,validate};
const str=(x,max=10000)=>typeof x==='string'&&x.length<=max;
const validCase=c=>c&&str(c.id,80)&&str(c.title,200)&&str(c.requirement,80)&&str(c.recipe,80)&&str(c.module,100)&&str(c.type,50)&&str(c.precondition)&&str(c.steps)&&str(c.data)&&str(c.expected)&&str(c.sourceText)&&typeof c.automatic==='boolean'&&typeof c.reviewed==='boolean'&&Number.isInteger(c.revision)&&['P0','P1','P2'].includes(c.priority)&&(c.expectedStatus===null||Number.isInteger(c.expectedStatus));
function validate(d){
 if(!d||!Array.isArray(d.requirements)||!Array.isArray(d.cases)||!Array.isArray(d.runs)||!Array.isArray(d.audit)||!['baseline','patched'].includes(d.version))return false;
 if(d.requirements.length>500||d.cases.length>2000||d.runs.length>100)return false;
 for(const arr of [d.requirements,d.cases,d.runs])if(new Set(arr.map(x=>x.id)).size!==arr.length)return false;
 if(!d.requirements.every(r=>r&&str(r.id,80)&&str(r.title,200)&&r.title.trim()&&str(r.text)&&r.text.trim()&&str(r.module,100)&&str(r.type,50)&&['P0','P1','P2'].includes(r.priority)))return false;
 if(!d.cases.every(c=>validCase(c)&&d.requirements.some(r=>r.id===c.requirement)))return false;
 if(!d.runs.every(r=>r&&str(r.id,80)&&str(r.createdAt,80)&&Number.isFinite(Date.parse(r.createdAt))&&['baseline','patched'].includes(r.version)&&str(r.transport,100)&&Array.isArray(r.cases)&&r.cases.every(validCase)&&typeof r.finished==='boolean'&&Array.isArray(r.results)&&r.results.every(x=>x&&str(x.id,80)&&r.cases.some(c=>c.id===x.id)&&['PASSED','FAILED','ERROR','BLOCKED','CANCELLED'].includes(x.status)&&Number.isFinite(x.duration)&&Array.isArray(x.checks)&&Array.isArray(x.traces)&&x.checks.every(c=>c&&str(c.label,500)&&typeof c.passed==='boolean')&&x.traces.every(t=>t&&str(t.method,20)&&str(t.path,1000)&&str(t.actor,100)&&str(t.transport,100)&&t.response&&Number.isInteger(t.response.status)))&&str(r.source,500000)&&str(r.hash,100)&&/^[a-f0-9]{64}$/.test(r.hash)))return false;
 return d.audit.every(a=>a&&str(a.at,80)&&str(a.message,2000));
}
export function initial(){return {requirements:structuredClone(requirements),cases:[],runs:[],audit:[],version:'baseline'};}
export function load(){const raw=localStorage.getItem(KEY);return raw?decode(raw,options):initial();}
export function serialize(data){if(!validate(data))throw new Error('数据结构不完整，无法保存');return encode(options.game,1,data);}
export function save(data){
 const next=serialize(data);decode(next,options);const previous=localStorage.getItem(KEY);
 if(previous){decode(previous,options);writeSave(localStorage,BACKUP,previous);}
 try{writeSave(localStorage,KEY,next);}catch(e){if(previous)localStorage.setItem(KEY,previous);throw e;}
}
export function importState(raw){const data=decode(raw,options);for(const run of data.runs)run.imported=true;save(data);return data;}
export function backup(){return localStorage.getItem(BACKUP);}
