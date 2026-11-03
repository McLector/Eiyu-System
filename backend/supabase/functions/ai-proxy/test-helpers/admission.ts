// Test-only: legacy fake generators simulate work after the first reservation.
// The real generator authorizes attempt1 itself; production never imports this.
import {createAiProxyHandler as realHandler} from '../ai-proxy-core.ts';
import type {AiProxyDependencies} from '../ai-proxy-core.ts';
export function admittedFixtureData(data: unknown,args: Record<string,unknown>): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  if ((data as Record<string,unknown>).allowed !== true) return data;
  return {contractVersion:1,epoch:1,executionId:args.p_execution_id,requestId:args.p_request_id,...data};
}
// Narrow synthetic server input: only this one RPC name is answered, so unknown
// RPCs still fail in each test's own fake client.
export const canonicalWeekFixture={habits:[],statTotals:{STR:0,INT:0,DEX:0,WIS:0,CHA:0}};
export function withCanonicalWeekInput(dependencies: AiProxyDependencies): AiProxyDependencies {
  return {...dependencies,createServiceClient:(signal)=>{
    const client=dependencies.createServiceClient(signal);
    return {...client,rpc:(name:string,args:Record<string,unknown>)=>name==='ai_tracker_week_input'
      ?Promise.resolve({data:canonicalWeekFixture,error:null}):client.rpc(name,args)} as typeof client;
  }};
}
export function createInstrumentedTestHandler(dependencies: AiProxyDependencies,options: {canonicalInput?: 'fixture'|'client'}={}) {
  const base=options.canonicalInput==='client'?dependencies:withCanonicalWeekInput(dependencies);
  return realHandler({...base,generate:async(action,payload,reserve,context)=>{
    if (!await reserve(1)) throw Error('Synthetic first authorization refused');
    return dependencies.generate(action,payload,reserve,context);
  }});
}
