-- 在 Supabase 的 SQL Editor 中一次性运行此文件。
-- 首次建立时使用需求示例中的 12,847 作为初始计数；重复运行不会覆盖现有数字。

create table if not exists public.boom_counter (
  id integer primary key check (id = 1),
  total_count bigint not null check (total_count >= 0),
  updated_at timestamptz not null default now()
);

insert into public.boom_counter (id, total_count)
values (1, 12847)
on conflict (id) do nothing;

alter table public.boom_counter enable row level security;
alter table public.boom_counter replica identity full;

drop policy if exists "任何人可读取共享计数" on public.boom_counter;
create policy "任何人可读取共享计数"
  on public.boom_counter
  for select
  to anon
  using (true);

revoke all on table public.boom_counter from public, anon, authenticated;
grant select on table public.boom_counter to anon;

create or replace function public.increment_boom()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_count bigint;
begin
  update public.boom_counter
  set total_count = total_count + 1,
      updated_at = pg_catalog.now()
  where id = 1
  returning total_count into next_count;
  if next_count is null then
    raise exception 'boom_counter 的初始记录不存在';
  end if;
  return next_count;
end;
$$;

revoke all on function public.increment_boom() from public, authenticated;
grant execute on function public.increment_boom() to anon;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'boom_counter'
  ) then
    execute 'alter publication supabase_realtime add table public.boom_counter';
  end if;
end;
$$;
