-- The capability grid as the SQL seed actually built it.
select r.id as role, r.rank, count(rc.capability) as caps
  from roles r
  left join role_capabilities rc on rc.role_id = r.id
 group by r.id, r.rank
 order by r.rank desc;

\echo ''
\echo '--- money and documents, per role ---'
select role_id, capability
  from role_capabilities
 where capability::text like 'money%' or capability::text like 'documents%'
 order by role_id, capability;

\echo ''
\echo '--- every capability the owner role holds ---'
select capability from role_capabilities where role_id = 'owner' order by 1;

\echo ''
\echo '--- capabilities in the enum that NO role holds ---'
select e.enumlabel as unheld
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid and t.typname = 'capability'
 where not exists (select 1 from role_capabilities rc where rc.capability::text = e.enumlabel)
 order by 1;
