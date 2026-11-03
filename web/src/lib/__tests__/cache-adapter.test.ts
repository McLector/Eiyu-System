// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest';
const root='eiyu:ai-suggestions';
const scoped=`${root}:abcdefab-1234-4123-8123-abcdefabcdef:1`;
const ordinary=['sb-synthetic-auth-token','REACT_QUERY_OFFLINE_CACHE','eiyu.widget.v1','eiyu.writeQueue.v1.synthetic',`${scoped}:extra`];
beforeEach(()=>{vi.restoreAllMocks();vi.resetModules();localStorage.clear();for(const key of [root,scoped,...ordinary])localStorage.setItem(key,'synthetic-sentinel');});
it('actual browser adapter retires known keys without values or ordinary storage loss',async()=>{
 const read=vi.spyOn(Storage.prototype,'getItem');
 await import('../cache-adapter');const shared=await import('@eiyu/shared');
 expect(await shared.retrySuggestionCacheRetirement()).toBe('complete');
 // Importing the SDK may read its own nonsecret debug preference; retirement never reads AI values.
 expect(read.mock.calls.filter(([key])=>key.startsWith(root))).toEqual([]);
 expect(Object.keys(localStorage)).toEqual(ordinary);for(const key of ordinary)expect(localStorage.getItem(key)).toBe('synthetic-sentinel');
});
it('blocked key enumeration is contained and explicit retry can recover',async()=>{
 const key=vi.spyOn(Storage.prototype,'key').mockImplementationOnce(()=>{throw Error('synthetic storage failure');});
 await import('../cache-adapter');const shared=await import('@eiyu/shared');
 expect(shared.getSuggestionCacheRetirementStatus()).toBe('failed');expect(localStorage.getItem(ordinary[0])).toBe('synthetic-sentinel');
 key.mockRestore();expect(await shared.retrySuggestionCacheRetirement()).toBe('complete');
});
