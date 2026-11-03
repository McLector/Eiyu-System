import {Platform} from 'react-native';
import type {File} from 'expo-file-system';
import {OwnerExportError,type OwnerExportOperation} from '@eiyu/shared';
type SaveCode='exists'|'unavailable'|'partial';
const copy:Record<SaveCode,string>={
 exists:'An export with this name already exists. Choose another folder.',
 unavailable:'This folder could not safely save your export. Choose another location or contact support.',
 partial:'Saving failed and a partial export may remain in the folder you chose. Check that folder.',
};
export class OwnerExportSaveError extends Error{constructor(readonly code:SaveCode){super(copy[code]);this.name='OwnerExportSaveError';}}
const filename='eiyu-account-export.json';
const normalized=(uri:string)=>uri.replace(/\/+$/,'');
function ensure(operation:OwnerExportOperation){if(!operation.current())throw new OwnerExportError('changed');}
export async function saveOwnerExport(operation:OwnerExportOperation):Promise<'saved'|'cancelled'>{
 let file:File|undefined;let owned=false;
 try{
  ensure(operation);
  // Other native/provider paths stay unavailable until their semantics are reviewed.
  if(Platform.OS!=='android')throw new OwnerExportSaveError('unavailable');
  const {Directory}=require('expo-file-system') as typeof import('expo-file-system');ensure(operation);
  const picked=await Directory.pickDirectoryAsync();ensure(operation);
  // SDK54's inherited picker declaration returns the native base type. Rewrap
  // its public URI so list/createFile use the public JS Directory/File wrappers.
  const directory=new Directory(picked.uri);
  const location=new URL(directory.uri);
  if(location.protocol!=='content:'||location.hostname!=='com.android.externalstorage.documents')throw new OwnerExportSaveError('unavailable');
  await operation.confirm();ensure(operation);
  const existing=directory.list();
  if(existing.some(item=>item.name.toLowerCase()===filename))throw new OwnerExportSaveError('exists');
  const previousUris=new Set(existing.map(item=>normalized(item.uri)));
  file=directory.createFile(filename,'application/json');
  const uri=normalized(file.uri),target=new URL(uri);
  if(previousUris.has(uri)||target.protocol!=='content:'||target.hostname!==location.hostname||!file.exists||file.size!==0)
   throw new OwnerExportSaveError('unavailable');
  if(!directory.list().some(item=>normalized(item.uri)===uri))throw new OwnerExportSaveError('unavailable');
  owned=true;ensure(operation);
  const encoded=JSON.stringify(operation.document);file.write(encoded);ensure(operation);
  if(file.size!==new TextEncoder().encode(encoded).length||file.textSync()!==encoded)throw new OwnerExportSaveError('unavailable');
  ensure(operation);return 'saved';
 }catch(error){
  if(owned&&file){try{file.delete();}catch{throw new OwnerExportSaveError('partial');}}
  if(error instanceof OwnerExportError||error instanceof OwnerExportSaveError)throw error;
  if(error!==null&&typeof error==='object'&&'code' in error&&error.code==='ERR_PICKER_CANCELLED')return 'cancelled';
  throw new OwnerExportSaveError('unavailable');
 }
}
