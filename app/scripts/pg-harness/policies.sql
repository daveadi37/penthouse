-- What grant_table() actually produced, against what the checker predicts.
\echo '--- policies by schema ---'
select schemaname, count(*) from pg_policies group by 1 order by 1;

\echo ''
\echo '--- public tables NOT on 4 policies ---'
select tablename, count(*) as policies
  from pg_policies
 where schemaname = 'public'
 group by 1
having count(*) <> 4
 order by 2 desc, 1;

\echo ''
\echo '--- policy commands across public ---'
select cmd, count(*) from pg_policies where schemaname = 'public' group by 1 order by 2 desc;
