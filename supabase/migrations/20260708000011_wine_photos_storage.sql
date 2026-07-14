-- Phase 5: photo upload. A public bucket so photos render via public URL, with
-- upload/delete restricted to the owner's own folder (path prefixed with their
-- uid). wine_logs.photo_url already exists to hold the resulting public URL.
insert into storage.buckets (id, name, public)
values ('wine-photos', 'wine-photos', true)
on conflict (id) do nothing;

-- Anyone can read (public bucket / public URLs).
create policy "wine_photos_read_all"
  on storage.objects for select
  using (bucket_id = 'wine-photos');

-- Authenticated users can upload only under their own uid folder,
-- e.g. "<uid>/<uuid>.jpg".
create policy "wine_photos_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wine-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owners can delete their own uploads.
create policy "wine_photos_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'wine-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
