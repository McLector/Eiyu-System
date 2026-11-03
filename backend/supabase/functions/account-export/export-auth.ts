export async function authenticateExportBearer(
 authorization:string,verify:(token:string,signal:AbortSignal)=>Promise<{id:string}|null>,signal:AbortSignal,
):Promise<{userId:string;sessionId:string}|null>{
 try{
  if(signal.aborted||authorization.length>16384||!/^Bearer [^\s]+$/.test(authorization))return null;
  const token=authorization.slice(7),parts=token.split('.');if(parts.length!==3||parts.some(p=>!p))return null;
  const user=await verify(token,signal);if(!user||signal.aborted)return null;
  // Only the exact token already verified by Auth may supply its session claim.
  const encoded=parts[1].replaceAll('-','+').replaceAll('_','/');
  const payload:unknown=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')),c=>c.charCodeAt(0))));
  if(payload===null||typeof payload!=='object'||Array.isArray(payload))return null;
  const claims=payload as Record<string,unknown>;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!uuid.test(user.id)||claims.sub!==user.id||typeof claims.session_id!=='string'||!uuid.test(claims.session_id))return null;
  return {userId:user.id,sessionId:claims.session_id};
 }catch{return null;}
}
