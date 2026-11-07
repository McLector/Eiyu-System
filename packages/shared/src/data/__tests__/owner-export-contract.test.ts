import {isOwnerExportDocument,OWNER_EXPORT_OBJECT_COLUMNS,OWNER_EXPORT_SECTION_FIELDS,type OwnerExportDocument} from '../owner-export-contract';

// The reviewed manifest is generated from private.owner_export_manifest() (scripts/owner-export-contract.mjs).
// These tests build documents from it, so a contract that falls behind the database fails here.
const manifest=require('../../../../../scripts/fixtures/owner-export-manifest.json') as {tables:Array<{scope:string;table:string;export:string[]}>};
const owned=manifest.tables.filter(t=>t.scope!=='global');
const owner='e5200000-0000-4000-8000-000000000002';

function document(overrides:Record<string,Record<string,unknown>[]>={}):OwnerExportDocument{
 const sections:OwnerExportDocument['sections']={};for(const spec of owned)sections[spec.table]=[];
 return {schemaVersion:1,generatedAt:'2026-11-07T12:00:00.000Z',accountId:owner,mailboxVersion:1,
  account:{email:'synthetic@example.invalid',createdAt:'2026-11-07T12:00:00.000Z',signup:{displayName:null,timeZone:null,birthDate:null,ageScreening:{granted:null,noticeVersion:null}}},
  sections:{...sections,...overrides},omissions:[]};
}
function row(columns:string[]){return Object.fromEntries(columns.map(c=>[c,c==='user_id'?owner:c==='id'?'1':null]));}

describe('owner export contract against the database manifest',()=>{
 it('accepts a document with exactly the manifest sections',()=>{
  expect(isOwnerExportDocument(document(),owner)).toBe(true);
 });
 it('lists every owner-scoped manifest table, including the tracker tables added after the first release',()=>{
  expect(Object.keys(OWNER_EXPORT_SECTION_FIELDS).sort()).toEqual(owned.map(t=>t.table).sort());
  for(const table of ['private.tracker_retention_state','private.tracker_purpose_authority','private.tracker_input_provenance','private.authority_review_requests'])
   expect(OWNER_EXPORT_SECTION_FIELDS).toHaveProperty([table]);
 });
 it('accepts one row with exactly the manifest columns in every section that has a user_id',()=>{
  for(const spec of owned.filter(t=>t.export.includes('user_id'))){
   expect(isOwnerExportDocument(document({[spec.table]:[row(spec.export)]}),owner)).toBe(true);
  }
 });
 it.each(owned.filter(t=>t.export.includes('user_id')).map(t=>[t.table,t.export] as const))('rejects %s when a column is missing',(table,columns)=>{
  const short=columns.filter(c=>c!==columns[columns.length-1]);
  expect(isOwnerExportDocument(document({[table]:[row(short)]}),owner)).toBe(false);
 });
 it('rejects a document that is missing any one manifest section',()=>{
  for(const spec of owned){
   const doc=document();delete (doc.sections as Record<string,unknown>)[spec.table];
   expect(isOwnerExportDocument(doc,owner)).toBe(false);
  }
 });
 it('rejects a document with a section the manifest does not list',()=>{
  expect(isOwnerExportDocument(document({'private.not_in_manifest':[]}),owner)).toBe(false);
 });
 it('rejects a row that belongs to another account',()=>{
  const spec=owned.find(t=>t.table==='private.tracker_retention_state')!;
  expect(isOwnerExportDocument(document({[spec.table]:[{...row(spec.export),user_id:'e5200000-0000-4000-8000-0000000000ff'}]}),owner)).toBe(false);
 });
 it('rejects a document for a different owner',()=>{
  expect(isOwnerExportDocument(document(),'e5200000-0000-4000-8000-0000000000ff')).toBe(false);
 });

 describe('structured columns (Gym prescription is a flat JSON object)',()=>{
  const gym=owned.find(t=>t.table==='public.gym_entries')!;
  const entry=(prescription:unknown)=>({...row(gym.export),prescription});
  const flat={name:'Hammer Curl',sets:3,reps:'6-10',rir:1,rir_max:null,rest_seconds:60,notes:'Brachialis'};
  it('accepts a flat object of scalars in gym_entries.prescription (the second 503 on hosted)',()=>{
   expect(isOwnerExportDocument(document({'public.gym_entries':[entry(flat)]}),owner)).toBe(true);
   expect(isOwnerExportDocument(document({'public.gym_entries':[entry({})]}),owner)).toBe(true);
  });
  it('rejects a nested object or an array of objects inside the prescription',()=>{
   expect(isOwnerExportDocument(document({'public.gym_entries':[entry({...flat,extra:{deep:1}})]}),owner)).toBe(false);
   expect(isOwnerExportDocument(document({'public.gym_entries':[entry({...flat,list:[{a:1}]})]}),owner)).toBe(false);
  });
  it('rejects an absurdly wide prescription object',()=>{
   const wide=Object.fromEntries(Array.from({length:200},(_,i)=>['k'+i,i]));
   expect(isOwnerExportDocument(document({'public.gym_entries':[entry(wide)]}),owner)).toBe(false);
  });
  it('rejects an object in any other column',()=>{
   const habits=owned.find(t=>t.table==='public.habits')!;
   expect(isOwnerExportDocument(document({'public.habits':[{...row(habits.export),name:{a:1}}]}),owner)).toBe(false);
   expect(isOwnerExportDocument(document({'public.gym_entries':[{...row(gym.export),exercise_id:{a:1}}]}),owner)).toBe(false);
  });
  it('lists only exported columns, so the allowlist cannot drift from the manifest',()=>{
   for(const [table,columns] of Object.entries(OWNER_EXPORT_OBJECT_COLUMNS))
    for(const column of columns)expect(OWNER_EXPORT_SECTION_FIELDS[table]).toContain(column);
  });
 });
});
