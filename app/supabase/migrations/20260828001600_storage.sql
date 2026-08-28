-- ============================================================
-- The file store.
--
-- One private bucket. Nothing in it is publicly readable, and there is
-- no route by which it could become so: the app asks for a signed link
-- each time a file is opened, and that link expires. A public bucket
-- would mean a photograph of the inside of somebody's bedroom, or a
-- passport scan, sitting on a guessable URL forever.
--
-- Paths are prefixed by what the file belongs to:
--
--   issues/<issue-id>/<file>        photographs of a fault
--   incidents/<incident-id>/<file>  photographs of an incident
--   sheets/<date>/<file>            the set-up and clear-up photographs
--   assets/<asset-id>/<file>        the thing itself, and its manual
--   documents/<document-id>/<file>  warranties, contracts, visas
--   receipts/<profile-id>/<file>    petty cash receipts
--
-- The prefix is what the policies read. It is not decoration: a policy
-- cannot look inside a photograph to decide who may see it, so the
-- folder has to carry the answer.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'house-files',
  'house-files',
  false,
  -- 20MB. Photographs are shrunk on the device before upload — a camera
  -- snap becomes roughly 150KB — so this ceiling is really for PDFs:
  -- a scanned warranty booklet or a tenancy contract.
  20971520,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- house-files is private. Every read is a short-lived signed link, and
-- there is no public path to any object in it.
--
-- That is a plain comment and not COMMENT ON TABLE: storage.buckets
-- belongs to supabase_storage_admin, so commenting on it fails with
-- "42501: must be owner of table buckets" and takes the whole
-- transaction down with it.


-- ---------- the policies ----------

-- Two things are going on in this block, and both are about the fact
-- that storage.objects is not an ordinary table in this database.
--
-- DROP before CREATE, because Postgres has no CREATE POLICY IF NOT
-- EXISTS, and this file is the one most likely to be run a second time
-- after something else in the deployment failed.
--
-- And the whole thing is wrapped, because on some Supabase projects the
-- role running this cannot create policies on storage.objects at all.
-- If that happens the failure is safe in the direction that matters:
-- Supabase enables RLS on storage.objects by default, so a bucket with
-- no policies refuses every read rather than allowing them. Files
-- become inaccessible, which is visible and fixable, rather than
-- public, which is neither. The notice below says exactly what to do.
do $$
begin
  drop policy if exists "house files are read by capability" on storage.objects;
  drop policy if exists "house files are written by capability" on storage.objects;
  drop policy if exists "house files are replaced by capability" on storage.objects;
  drop policy if exists "house files are deleted by the few" on storage.objects;

  -- Which prefix a person may read is the same question as which table
  -- they may read, so the policy asks the same function the table
  -- policies do. A role that cannot see documents cannot fetch the PDF
  -- either — the hole a hand-written bucket policy usually leaves open.
  execute $p$
    create policy "house files are read by capability"
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'house-files'
      and case (storage.foldername(name))[1]
            when 'issues' then has_capability('issue.viewAll') or has_capability('issue.raise')
            when 'incidents' then has_capability('issue.viewAll')
            when 'sheets' then has_capability('sheet.view')
            when 'assets' then has_capability('property.view')
            when 'documents' then has_capability('documents.view')
            when 'receipts' then has_capability('money.view')
                                or (storage.foldername(name))[2] = my_profile_id()
            else false
          end
    )
  $p$;

  execute $p$
    create policy "house files are written by capability"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'house-files'
      and case (storage.foldername(name))[1]
            when 'issues' then has_capability('issue.raise')
            when 'incidents' then has_capability('issue.raise')
            when 'sheets' then has_capability('sheet.edit')
            when 'assets' then has_capability('property.edit')
            when 'documents' then has_capability('documents.view')
            -- Anybody may photograph their own receipt. R19: cash spent
            -- is logged with receipts, and making that need a capability
            -- is how it stops happening.
            when 'receipts' then (storage.foldername(name))[2] = my_profile_id()
                                or has_capability('money.view')
            else false
          end
    )
  $p$;

  execute $p$
    create policy "house files are replaced by capability"
    on storage.objects for update
    to authenticated
    using (
      bucket_id = 'house-files'
      and case (storage.foldername(name))[1]
            when 'assets' then has_capability('property.edit')
            when 'documents' then has_capability('documents.view')
            else false
          end
    )
  $p$;

  -- Narrow on purpose. A photograph of a fault is evidence and the
  -- person who took it may have left; letting anyone with issue.raise
  -- delete one would make the record worth less than the photograph.
  execute $p$
    create policy "house files are deleted by the few"
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'house-files'
      and case (storage.foldername(name))[1]
            when 'assets' then has_capability('property.edit')
            when 'documents' then has_capability('documents.viewOwner')
            when 'receipts' then has_capability('money.viewOwner')
            else has_capability('settings.edit')
          end
    )
  $p$;

exception when insufficient_privilege then
  raise notice '%',
    'STORAGE POLICIES NOT CREATED — this role cannot alter storage.objects. '
    'Everything else in this deployment succeeded. The bucket is private and '
    'currently refuses every read, so nothing is exposed. Create the four '
    'policies from Dashboard -> Storage -> Policies, copying the USING and '
    'WITH CHECK expressions out of this file.';
end
$$;
