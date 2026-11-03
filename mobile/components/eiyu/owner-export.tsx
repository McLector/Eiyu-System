import {useEffect,useRef,useState} from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import {beginOwnerExport,OwnerExportError,type OwnerExportOperation} from '@eiyu/shared';
import {saveOwnerExport,OwnerExportSaveError} from '@/lib/save-owner-export';
import {MailboxVerification} from '@/components/status/mailbox-verification';
import {Button} from '@/components/ui/button';
import {fonts} from '@/constants/eiyu-theme';
import {useTokens} from '@/contexts/theme-store';

export function OwnerExport({userId}:{userId:string}){
 const t=useTokens();
 const [phase,setPhase]=useState<'idle'|'preparing'|'ready'|'saving'>('idle');
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[verification,setVerification]=useState(false);
 const work=useRef<{epoch:number;busy:boolean;controller?:AbortController;operation?:OwnerExportOperation}>({epoch:0,busy:false});
 const discard=()=>{const w=work.current;w.epoch++;w.controller?.abort();w.operation?.dispose();w.controller=undefined;w.operation=undefined;w.busy=false;};
 useEffect(()=>{setPhase('idle');setError('');setMessage('');setVerification(false);return discard;},[userId]);
 const fail=(value:unknown)=>{const known=value instanceof OwnerExportError||value instanceof OwnerExportSaveError?value:new OwnerExportError('unavailable');setError(known.message);setVerification(known instanceof OwnerExportError&&known.code==='verification');};
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
  try{const result=await saveOwnerExport(operation);if(w.epoch===current)setMessage(result==='saved'?'Export saved.':'Save canceled.');}
  catch(value){if(w.epoch===current)fail(value);}
  finally{if(w.epoch===current){discard();setPhase('idle');}}
 };
 const body={fontFamily:fonts.body,color:t['muted-flat']};
 return <View style={{gap:10}}>
  <AppText style={{fontFamily:fonts.body,color:t.text}}>Download your data</AppText>
  <AppText style={body}>Download a snapshot of your saved account data. Pending offline actions and unsaved edits stay on this device. Keep the saved copy private; you control copies after saving.</AppText>
  <AppText style={body}>On Android, choose a dedicated folder. Android may retain this app’s read and write access to that folder and its contents after saving. Automatic saving is currently available only for supported Android device folders.</AppText>
  <AppText selectable style={body}>For help with export or deletion, contact privacy@eiyusystem.app. Deletion requests are reviewed manually.</AppText>
  {error&&<AppText accessibilityRole="alert" style={{...body,color:t.danger}}>{error}</AppText>}{message&&<AppText accessibilityLiveRegion="polite" style={body}>{message}</AppText>}
  {verification&&<MailboxVerification userId={userId} purpose="account-export" onVerified={()=>{setVerification(false);setError('');setMessage('Email checked. Prepare a new download when ready.');}}/>}
  <Button variant="secondary" disabled={phase!=='idle'} label={phase==='preparing'?'Preparing…':'Prepare data download'} onPress={()=>void prepare()}/>
  {(phase==='ready'||phase==='saving')&&<Button variant="primary" disabled={phase==='saving'} label={phase==='saving'?'Saving…':'Choose folder and save'} onPress={()=>void save()}/>}
  {phase!=='idle'&&<Button variant="quiet" label="Cancel data download" onPress={()=>{discard();setPhase('idle');setMessage('Data download canceled.');}}/>}
 </View>;
}
