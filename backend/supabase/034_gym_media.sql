begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gym-exercise-media','gym-exercise-media',false,20971520,array['image/gif','video/mp4'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy gym_media_read on storage.objects for select to authenticated
using(bucket_id='gym-exercise-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy gym_media_upload on storage.objects for insert to authenticated
with check(bucket_id='gym-exercise-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy gym_media_delete on storage.objects for delete to authenticated
using(bucket_id='gym-exercise-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Unique object paths replace media without allowing in-place overwrites.
commit;
