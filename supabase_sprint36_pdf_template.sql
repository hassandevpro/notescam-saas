-- Sprint 36 : PDF bulletin template
-- Ajoute 2 colonnes dans schools + crée le bucket bulletin-templates

alter table public.schools
  add column if not exists bulletin_template_url     text,
  add column if not exists bulletin_template_mapping jsonb default '{}';

-- Bucket pour les templates de bulletin (accepte PDF + images)
insert into storage.buckets (id, name, public, allowed_mime_types)
values (
  'bulletin-templates',
  'bulletin-templates',
  true,
  array['image/png','image/jpeg','image/webp','application/pdf']
)
on conflict (id) do update
  set public = true,
      allowed_mime_types = array['image/png','image/jpeg','image/webp','application/pdf'];

-- RLS : admin de l'école peut uploader / lire
DROP POLICY IF EXISTS "bulletin_templates_insert" ON storage;
create policy "bulletin_templates_insert" on storage.objects
  for insert with check (
    bucket_id = 'bulletin-templates'
    and auth.uid() is not null
  );

DROP POLICY IF EXISTS "bulletin_templates_select" ON storage;
create policy "bulletin_templates_select" on storage.objects
  for select using (bucket_id = 'bulletin-templates');

DROP POLICY IF EXISTS "bulletin_templates_update" ON storage;
create policy "bulletin_templates_update" on storage.objects
  for update using (
    bucket_id = 'bulletin-templates'
    and auth.uid() is not null
  );
