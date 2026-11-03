import type {OwnerExportOperation} from '@eiyu/shared';
import {saveOwnerExport} from '../save-owner-export';
const mockPick=jest.fn();
jest.mock('expo-file-system',()=>({Directory:class {
 constructor(uri:string){return {...mockFolder,uri};}
 static pickDirectoryAsync(...args:unknown[]){return mockPick(...args);}
}}));
jest.mock('react-native',()=>({Platform:{OS:'android'}}));
global.TextEncoder=require('node:util').TextEncoder;
it('loads the explicit picker module without other native APIs',async()=>{
 const {Directory}=require('expo-file-system') as typeof import('expo-file-system');
 expect(typeof Directory.pickDirectoryAsync).toBe('function');
 expect(require('react-native').Platform.OS).toBe('android');
});
let content:string,created:boolean;
const file={uri:'content://com.android.externalstorage.documents/document/synthetic-new',name:'eiyu-account-export.json',exists:true,
 get size(){return new TextEncoder().encode(content).length;},write:jest.fn((text:string)=>{content=text;}),textSync:jest.fn(()=>content),delete:jest.fn(()=>{content='';})};
const mockFolder={uri:'content://com.android.externalstorage.documents/tree/synthetic-mockFolder',list:jest.fn(()=>[] as Array<{name:string;uri:string}>),createFile:jest.fn(()=>file)};
function operation(){return {document:{schemaVersion:1,accountId:'synthetic-owner',sections:{},label:'界'},current:jest.fn(()=>true),confirm:jest.fn(async()=>{}),dispose:jest.fn()} as unknown as OwnerExportOperation;}
beforeEach(()=>{content='';created=false;jest.clearAllMocks();mockPick.mockResolvedValue(mockFolder);mockFolder.list.mockImplementation(()=>created?[{name:file.name,uri:file.uri}]:[]);mockFolder.createFile.mockImplementation(()=>{created=true;return file;});
 file.write.mockImplementation(text=>{content=text;});file.textSync.mockImplementation(()=>content);file.delete.mockImplementation(()=>{content='';});});
it('selects explicitly, revalidates, creates a new generic file and checks written bytes',async()=>{
 const op=operation();expect(await saveOwnerExport(op)).toBe('saved');expect(mockPick).toHaveBeenCalledTimes(1);expect(op.confirm).toHaveBeenCalledTimes(1);
 expect(mockFolder.createFile).toHaveBeenCalledWith('eiyu-account-export.json','application/json');expect(content).toBe(JSON.stringify(op.document));expect(file.textSync).toHaveBeenCalledTimes(1);expect(file.delete).not.toHaveBeenCalled();
});
it('picker cancellation creates and writes no file',async()=>{
 mockPick.mockRejectedValue({code:'ERR_PICKER_CANCELLED'});expect(await saveOwnerExport(operation())).toBe('cancelled');
 expect(mockFolder.createFile).not.toHaveBeenCalled();expect(file.write).not.toHaveBeenCalled();
});
it('owner loss while picker is open cannot create an export',async()=>{
 const op=operation();mockPick.mockImplementation(async()=>{(op.current as jest.Mock).mockReturnValue(false);return mockFolder;});
 await expect(saveOwnerExport(op)).rejects.toThrow();expect(mockFolder.createFile).not.toHaveBeenCalled();
});
it('proof failure after selection creates no file',async()=>{
 const op=operation();(op.confirm as jest.Mock).mockRejectedValue(new Error('synthetic verification loss'));
 await expect(saveOwnerExport(op)).rejects.toThrow();expect(mockFolder.createFile).not.toHaveBeenCalled();
});
it('existing filename is preserved without create, write or delete',async()=>{
 mockFolder.list.mockReturnValue([{name:'eiyu-account-export.json',uri:'content://synthetic/existing'}]);
 await expect(saveOwnerExport(operation())).rejects.toMatchObject({code:'exists'});expect(mockFolder.createFile).not.toHaveBeenCalled();expect(file.delete).not.toHaveBeenCalled();
});
it('a provider returning an existing document URI cannot overwrite it',async()=>{
 mockFolder.list.mockReturnValue([{name:'different-name.json',uri:file.uri+'/'}]);
 await expect(saveOwnerExport(operation())).rejects.toThrow();expect(file.write).not.toHaveBeenCalled();expect(file.delete).not.toHaveBeenCalled();
});
it('nonempty returned files are not written or deleted as if newly owned',async()=>{
 content='synthetic-existing-content';await expect(saveOwnerExport(operation())).rejects.toThrow();
 expect(file.write).not.toHaveBeenCalled();expect(file.delete).not.toHaveBeenCalled();expect(content).toBe('synthetic-existing-content');
});
it('write failure removes only the new owned file',async()=>{
 file.write.mockImplementation(()=>{content='partial';throw Error('synthetic failure');});
 await expect(saveOwnerExport(operation())).rejects.toThrow();expect(file.delete).toHaveBeenCalledTimes(1);expect(content).toBe('');
});
it('failed owned-file cleanup reports possible residue',async()=>{
 file.write.mockImplementation(()=>{content='partial';throw Error('synthetic failure');});file.delete.mockImplementation(()=>{throw Error('synthetic removal failure');});
 await expect(saveOwnerExport(operation())).rejects.toMatchObject({code:'partial'});
});
it('readback mismatch cannot be reported saved',async()=>{
 file.textSync.mockReturnValue('synthetic-incomplete-copy');await expect(saveOwnerExport(operation())).rejects.toThrow();expect(file.delete).toHaveBeenCalledTimes(1);
});
it('unsupported providers are unavailable before file creation',async()=>{
 mockPick.mockResolvedValue({...mockFolder,uri:'content://unreviewed.example/tree/synthetic'});
 await expect(saveOwnerExport(operation())).rejects.toMatchObject({code:'unavailable'});expect(mockFolder.createFile).not.toHaveBeenCalled();
});
it('owner loss during write removes only the owned new copy and cannot report success',async()=>{
 const op=operation();file.write.mockImplementation(text=>{content=text;(op.current as jest.Mock).mockReturnValue(false);});
 await expect(saveOwnerExport(op)).rejects.toMatchObject({code:'changed'});expect(file.delete).toHaveBeenCalledTimes(1);expect(content).toBe('');
});
