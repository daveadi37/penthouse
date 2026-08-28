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

comment on table storage.buckets is 'house-files is private. Every read is a short-lived signed link; there is no public path to any object in it.';


-- ---------- reading ----------

-- Which prefix a person may read is the same question as which table
-- they may read, so the policy asks the same function the table
-- policies do. A role that cannot see documents cannot fetch the PDF
-- either, which is the hole that a bucket policy written by hand
-- usually leaves open.
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
);


-- ---------- writing ----------

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
        -- Anybody may photograph their own receipt. R19: cash spent is
        -- logged with receipts, and making that need a capability is
        -- how it stops happening.
        when 'receipts' then (storage.foldername(name))[2] = my_profile_id()
                            or has_capability('money.view')
        else false
      end
);


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
);


-- ---------- deleting ----------

-- Narrow on purpose. A photograph of a fault is evidence and the person
-- who took it may have left; letting anyone with issue.raise delete one
-- would make the record worth less than the photograph.
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
);
