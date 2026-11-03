import {OwnerExportError,type OwnerExportOperation} from '@eiyu/shared';
export async function saveOwnerExport(operation:OwnerExportOperation):Promise<'started'>{
 if(!operation.current())throw new OwnerExportError('changed');
 await operation.confirm();if(!operation.current())throw new OwnerExportError('changed');
 let url:string|undefined;let anchor:HTMLAnchorElement|undefined;let handedOff=false;
 try{
  const blob=new Blob([JSON.stringify(operation.document)],{type:'application/json'});
  if(!operation.current())throw new OwnerExportError('changed');
  url=URL.createObjectURL(blob);anchor=document.createElement('a');anchor.href=url;anchor.download='eiyu-account-export.json';
  anchor.hidden=true;document.body.append(anchor);
  if(!operation.current())throw new OwnerExportError('changed');
  anchor.click();handedOff=true;
  const owned=url;let disposed=false;
  const release=()=>{if(disposed)return;disposed=true;URL.revokeObjectURL(owned);window.clearTimeout(timer);window.removeEventListener('pagehide',release);};
  // Retain the in-memory Blob briefly for browser handoff, never persistent storage.
  const timer=window.setTimeout(release,60000);window.addEventListener('pagehide',release,{once:true});
  return 'started';
 }catch(error){throw error instanceof OwnerExportError?error:new OwnerExportError('unavailable');}
 finally{anchor?.remove();if(url&&!handedOff)URL.revokeObjectURL(url);}
}
