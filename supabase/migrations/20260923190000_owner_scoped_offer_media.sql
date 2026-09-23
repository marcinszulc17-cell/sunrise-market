-- New browser uploads are scoped to the authenticated user's folder.
-- Existing public media remain readable; service_role maintenance jobs bypass RLS.

drop policy if exists product_images_auth_upload on storage.objects;

create policy product_images_auth_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
