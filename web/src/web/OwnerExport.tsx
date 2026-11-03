import {useEffect,useRef,useState} from 'react';
import {beginOwnerExport,OwnerExportError,type OwnerExportOperation} from '@eiyu/shared';
import {saveOwnerExport} from '../lib/save-owner-export';
import MailboxVerification from './MailboxVerification';

export default function OwnerExport({userId}:{userId:string}){
 const [phase,setPhase]=useState<'idle'|'preparing'|'ready'|'saving'>('idle');
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[verification,setVerification]=useState(false);
 const work=useRef<{epoch:number;busy:boolean;controller?:AbortController;operation?:OwnerExportOperation}>({epoch:0,busy:false});
 const discard=()=>{const w=work.current;w.epoch++;w.controller?.abort();w.operation?.dispose();w.controller=undefined;w.operation=undefined;w.busy=false;};
 useEffect(()=>{setPhase('idle');setError('');setMessage('');setVerification(false);return discard;},[userId]);
 const fail=(value:unknown)=>{const known=value instanceof OwnerExportError?value:new OwnerExportError('unavailable');setError(known.message);setVerification(known.code==='verification');};
 const prepare=async()=>{
  if(work.current.busy)return;discard();const w=work.current,current=w.epoch;w.busy=true;w.controller=new AbortController();
  setPhase('preparing');setError('');setMessage('');setVerification(false);
  try{const operation=await beginOwnerExport(userId,{signal:w.controller.signal});
   if(w.epoch!==current){operation.dispose();return;}w.operation=operation;setPhase('ready');
  }catch(value){if(w.epoch===current){fail(value);setPhase('idle');}}
  finally{if(w.epoch===current)w.busy=false;}
 };
 const save=async()=>{
  const w=work.current,operation=w.operation;if(w.busy||!operation)return;const current=w.epoch;w.busy=true;setPhase('saving');setError('');
  try{await saveOwnerExport(operation);if(w.epoch===current)setMessage('Download started. Check your browser downloads.');}
  catch(value){if(w.epoch===current)fail(value);}
  finally{if(w.epoch===current){discard();setPhase('idle');}}
 };
 return <section aria-label="Download your data" style={{display:'grid',gap:10}}>
  <strong>Download your data</strong>
  <p style={{margin:0}}>Download a snapshot of your saved account data. Pending offline actions and unsaved edits stay on this device. Keep the downloaded copy private; you control copies after saving.</p>
  <p style={{margin:0}}>For help with export or deletion, contact <a href="mailto:privacy@eiyusystem.app">privacy@eiyusystem.app</a>. Deletion requests are reviewed manually.</p>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {verification&&<MailboxVerification userId={userId} purpose="account-export" onVerified={()=>{setVerification(false);setError('');setMessage('Email checked. Prepare a new download when ready.');}}/>}
  <button type="button" className="btn-secondary" disabled={phase!=='idle'} onClick={()=>void prepare()}>{phase==='preparing'?'Preparing…':'Prepare data download'}</button>
  {(phase==='ready'||phase==='saving')&&<button type="button" className="btn-primary" disabled={phase==='saving'} onClick={()=>void save()}>{phase==='saving'?'Starting download…':'Download JSON'}</button>}
  {phase!=='idle'&&<button type="button" className="btn-secondary" onClick={()=>{discard();setPhase('idle');setMessage('Data download canceled.');}}>Cancel data download</button>}
 </section>;
}
