// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {OwnerExportOperation} from '@eiyu/shared';
import {saveOwnerExport} from '../save-owner-export';
const create=vi.fn(),revoke=vi.fn();let click:ReturnType<typeof vi.spyOn>;
function operation(){return {document:{schemaVersion:1,accountId:'synthetic-owner',sections:{}},current:vi.fn(()=>true),confirm:vi.fn(async()=>{}),dispose:vi.fn()} as unknown as OwnerExportOperation;}
beforeEach(()=>{
 vi.useFakeTimers();create.mockReset().mockReturnValue('blob:synthetic-export-only');revoke.mockReset();
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});
 click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
});
afterEach(()=>{vi.runOnlyPendingTimers();vi.useRealTimers();vi.restoreAllMocks();});
it('revalidates then hands off a generic filename and eventually revokes its URL',async()=>{
 const op=operation();let name='';click.mockImplementation(function(this:HTMLAnchorElement){name=this.download;});
 expect(await saveOwnerExport(op)).toBe('started');expect(op.confirm).toHaveBeenCalledTimes(1);expect(create).toHaveBeenCalledTimes(1);
 expect(name).toBe('eiyu-account-export.json');expect(document.querySelector('a[download]')).toBeNull();
 expect(revoke).not.toHaveBeenCalled();vi.advanceTimersByTime(60000);expect(revoke).toHaveBeenCalledTimes(1);
});
it('creates no Blob or anchor when permission changes during confirmation',async()=>{
 const op=operation();(op.confirm as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('synthetic permission loss'));
 await expect(saveOwnerExport(op)).rejects.toThrow();expect(create).not.toHaveBeenCalled();expect(click).not.toHaveBeenCalled();
});
it('refuses a stale operation before download creation',async()=>{
 const op=operation();(op.current as ReturnType<typeof vi.fn>).mockReturnValue(false);
 await expect(saveOwnerExport(op)).rejects.toThrow();expect(create).not.toHaveBeenCalled();expect(click).not.toHaveBeenCalled();
});
it('cleans the owned URL and anchor if browser handoff throws',async()=>{
 click.mockImplementation(()=>{throw Error('synthetic browser refusal');});
 await expect(saveOwnerExport(operation())).rejects.toThrow();expect(revoke).toHaveBeenCalledTimes(1);expect(document.querySelector('a[download]')).toBeNull();
});
it('page exit releases an owned successful handoff URL only once',async()=>{
 await saveOwnerExport(operation());window.dispatchEvent(new Event('pagehide'));expect(revoke).toHaveBeenCalledTimes(1);
 vi.advanceTimersByTime(60000);expect(revoke).toHaveBeenCalledTimes(1);
});
