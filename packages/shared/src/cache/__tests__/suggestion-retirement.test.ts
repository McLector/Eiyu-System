import {initCacheAdapter, getCacheAdapter, getSuggestionCacheRetirementStatus, retrySuggestionCacheRetirement, type CacheAdapter} from '../adapter';
import {isRetiredSuggestionKey} from '../suggestion-retirement';

const root='eiyu:ai-suggestions';
const owner='abcdefab-1111-4111-8111-abcdefabcdef';
const scoped=`${root}:${owner}:1`;
const keep=['sb-synthetic-auth-token','REACT_QUERY_OFFLINE_CACHE','eiyu.widget.v1',`eiyu.writeQueue.v1.${owner}`,`${root}-other`,`${scoped}:extra`,`${root}:invalid:1`,`${root}:${owner}:01`,`${root}:${owner}:-1`,`${root}:${owner}:9007199254740992`];
function fixture(){
 const store=new Map([root,scoped,...keep].map(key=>[key,'synthetic-sentinel']));
 const adapter:CacheAdapter={getAllKeys:jest.fn(async()=>[...store.keys()]),getItem:jest.fn(async key=>store.get(key)??null),setItem:jest.fn(async(key,value)=>{store.set(key,value);}),removeItem:jest.fn(async key=>{store.delete(key);})};
 return {store,adapter};
}
test('matches only known legacy and canonical scoped keys',()=>{
 for(const key of [root,scoped,`${root}:${owner.toUpperCase()}:0`,`${root}:${owner}:9007199254740991`])expect(isRetiredSuggestionKey(key)).toBe(true);
 for(const key of [...keep,scoped.replace(root,root.toUpperCase()),`${scoped}\n`,`${root}:${owner}:1.0`,`${root}:${owner}:1e3`])expect(isRetiredSuggestionKey(key)).toBe(false);
});
test('removes known keys without reading/writing values or disturbing ordinary storage',async()=>{
 const {adapter,store}=fixture();initCacheAdapter(adapter);
 expect(await retrySuggestionCacheRetirement()).toBe('complete');
 expect([...store.keys()]).toEqual(keep);for(const key of keep)expect(store.get(key)).toBe('synthetic-sentinel');
 expect(adapter.getItem).not.toHaveBeenCalled();expect(adapter.setItem).not.toHaveBeenCalled();expect(getCacheAdapter()).toBe(adapter);
 expect(getSuggestionCacheRetirementStatus()).toBe('complete');
});
test('unavailable enumeration fails without deleting or globally disabling storage',async()=>{
 const {adapter}=fixture();delete adapter.getAllKeys;initCacheAdapter(adapter);
 expect(await retrySuggestionCacheRetirement()).toBe('failed');expect(adapter.removeItem).not.toHaveBeenCalled();
 expect(await getCacheAdapter().getItem(keep[0])).toBe('synthetic-sentinel');
});
test('enumeration rejection is a failed result, not an unhandled rejection',async()=>{
 const {adapter}=fixture();adapter.getAllKeys=jest.fn().mockRejectedValue(new Error('synthetic storage failure'));initCacheAdapter(adapter);
 expect(await retrySuggestionCacheRetirement()).toBe('failed');expect(getSuggestionCacheRetirementStatus()).toBe('failed');expect(adapter.removeItem).not.toHaveBeenCalled();
});
test('validates complete enumeration before any deletion',async()=>{
 const {adapter}=fixture();adapter.getAllKeys=jest.fn().mockResolvedValue([root,null]);initCacheAdapter(adapter);
 expect(await retrySuggestionCacheRetirement()).toBe('failed');expect(adapter.removeItem).not.toHaveBeenCalled();
});
test('sparse malformed enumeration fails before deleting earlier known keys',async()=>{
 const {adapter}=fixture();const keys=[root];keys.length=2;adapter.getAllKeys=jest.fn(async()=>keys);initCacheAdapter(adapter);
 expect(await retrySuggestionCacheRetirement()).toBe('failed');expect(adapter.removeItem).not.toHaveBeenCalled();
});
test('deduplicates keys and does not repeat successful cleanup in the same startup',async()=>{
 const {adapter}=fixture();adapter.getAllKeys=jest.fn(async()=>[root,root]);initCacheAdapter(adapter);
 expect(await retrySuggestionCacheRetirement()).toBe('complete');expect(await retrySuggestionCacheRetirement()).toBe('complete');
 expect(adapter.removeItem).toHaveBeenCalledTimes(1);expect(adapter.getAllKeys).toHaveBeenCalledTimes(1);
});
test('partial failure stays failed until explicit retry and preserves unrelated sentinels',async()=>{
 const {adapter,store}=fixture();let failing=true;
 adapter.removeItem=jest.fn(async key=>{if(key===scoped&&failing)throw Error('synthetic failure');store.delete(key);});initCacheAdapter(adapter);
 expect(await retrySuggestionCacheRetirement()).toBe('failed');expect(store.has(root)).toBe(false);expect(store.has(scoped)).toBe(true);
 for(const key of keep)expect(store.get(key)).toBe('synthetic-sentinel');
 failing=false;expect(getSuggestionCacheRetirementStatus()).toBe('failed');expect(await retrySuggestionCacheRetirement()).toBe('complete');expect([...store.keys()]).toEqual(keep);
});
test('restart after partial failure re-enumerates remaining keys idempotently',async()=>{
 const {adapter,store}=fixture();const remove=adapter.removeItem;
 adapter.removeItem=jest.fn(async key=>{if(key===scoped)throw Error();await remove(key);});initCacheAdapter(adapter);expect(await retrySuggestionCacheRetirement()).toBe('failed');
 initCacheAdapter({...adapter,removeItem:remove});expect(await retrySuggestionCacheRetirement()).toBe('complete');expect([...store.keys()]).toEqual(keep);
});
test('concurrent callers share the actual in-flight startup operation',async()=>{
 const {adapter}=fixture();let finish!:(value:readonly string[])=>void;
 adapter.getAllKeys=jest.fn(()=>new Promise(resolve=>{finish=resolve;}));initCacheAdapter(adapter);
 const first=retrySuggestionCacheRetirement(),second=retrySuggestionCacheRetirement();expect(first).toBe(second);expect(getSuggestionCacheRetirementStatus()).toBe('running');finish([root]);
 expect(await first).toBe('complete');expect(adapter.getAllKeys).toHaveBeenCalledTimes(1);
});
test('old adapter completion cannot overwrite replacement adapter status',async()=>{
 const {adapter}=fixture();let finish!:(value:readonly string[])=>void;adapter.getAllKeys=jest.fn(()=>new Promise(resolve=>{finish=resolve;}));initCacheAdapter(adapter);const previous=retrySuggestionCacheRetirement();
 const replacement=fixture().adapter;delete replacement.getAllKeys;initCacheAdapter(replacement);expect(await retrySuggestionCacheRetirement()).toBe('failed');finish([root]);expect(await previous).toBe('complete');expect(getSuggestionCacheRetirementStatus()).toBe('failed');expect(replacement.removeItem).not.toHaveBeenCalled();
});
test('empty storage completes without removal',async()=>{
 const {adapter}=fixture();adapter.getAllKeys=jest.fn(async()=>[]);initCacheAdapter(adapter);expect(await retrySuggestionCacheRetirement()).toBe('complete');expect(adapter.removeItem).not.toHaveBeenCalled();
});
