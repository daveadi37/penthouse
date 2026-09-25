-- What the seed actually put in, read as the owner of the tables with
-- RLS out of the way. A zero in the capability grid means "refused"
-- only if the number here is not also zero.
select 'transactions'   as tbl, count(*) from transactions
union all select 'staff_details',  count(*) from staff_details
union all select 'documents',      count(*) from documents
union all select 'chat_messages',  count(*) from chat_messages
union all select 'inventory_items', count(*) from inventory_items
union all select 'profiles',       count(*) from profiles
union all select 'shopping_items', count(*) from shopping_items
union all select 'issues',         count(*) from issues
union all select 'task_instances', count(*) from task_instances
union all select 'budgets',        count(*) from budgets
order by 1;
