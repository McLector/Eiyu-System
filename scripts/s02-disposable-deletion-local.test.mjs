// Explicit standalone acceptance entry; importing adapters does not mutate anything.
import {parseMode,runRehearsal} from './lib/s02-disposable-deletion-local.mjs';
import {reportResult} from './lib/s02-disposable-deletion.mjs';
let result;
try{result=await runRehearsal(parseMode(process.argv.slice(2)));}catch{result=reportResult({stage:'needs-review'});}
console.log(JSON.stringify(result));
process.exitCode=result.stage==='needs-review'?1:0;
