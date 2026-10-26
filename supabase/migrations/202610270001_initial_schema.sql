create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  role text not null default 'student' check (role in ('coach', 'student')),
  created_at timestamptz not null default now()
);

create table public.coach_students (
  coach_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, student_id),
  unique (student_id),
  constraint coach_students_not_self check (coach_id <> student_id)
);

create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  details text not null default '' check (char_length(details) <= 5000),
  starts_on date,
  created_at timestamptz not null default now(),
  constraint training_plans_coach_student_fk
    foreign key (coach_id, student_id)
    references public.coach_students (coach_id, student_id)
    on delete cascade
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 240),
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'cancelled')),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  constraint appointments_coach_student_fk
    foreign key (coach_id, student_id)
    references public.coach_students (coach_id, student_id)
    on delete cascade
);

create index training_plans_student_created_idx
  on public.training_plans (student_id, created_at desc);
create index appointments_coach_start_idx
  on public.appointments (coach_id, starts_at);
create index appointments_student_start_idx
  on public.appointments (student_id, starts_at);

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 100)
  );
  return new;
end;
$$;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

create function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles as p
  where p.id = (select auth.uid())
$$;

revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

create function public.request_coach_link(p_coach_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or coalesce(public.current_user_role(), '') <> 'student'
     or not exists (
       select 1
       from public.profiles as p
       where p.id = p_coach_id and p.role = 'coach'
     ) then
    raise exception '无法关联该教练账号';
  end if;

  insert into public.coach_students (coach_id, student_id)
  values (p_coach_id, (select auth.uid()));
end;
$$;

revoke all on function public.request_coach_link(uuid) from public, anon;
grant execute on function public.request_coach_link(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.coach_students enable row level security;
alter table public.training_plans enable row level security;
alter table public.appointments enable row level security;

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy "Users can read their own profile and linked accounts"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.coach_students as cs
      where (cs.coach_id = (select auth.uid()) and cs.student_id = id)
         or (cs.student_id = (select auth.uid()) and cs.coach_id = id)
    )
  );
create policy "Users can update their own display name"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on public.coach_students from public, anon, authenticated;
grant select on public.coach_students to authenticated;
create policy "Users can read their own coach-student links"
  on public.coach_students for select to authenticated
  using (coach_id = (select auth.uid()) or student_id = (select auth.uid()));

revoke all on public.training_plans from public, anon, authenticated;
grant select, insert, update, delete on public.training_plans to authenticated;
create policy "Linked users can read training plans"
  on public.training_plans for select to authenticated
  using (
    student_id = (select auth.uid())
    or exists (
      select 1 from public.coach_students as cs
      where cs.coach_id = (select auth.uid())
        and cs.student_id = training_plans.student_id
    )
  );
create policy "Coaches can create plans for linked students"
  on public.training_plans for insert to authenticated
  with check (
    coach_id = (select auth.uid())
    and created_at is not null
    and public.current_user_role() = 'coach'
    and exists (
      select 1 from public.coach_students as cs
      where cs.coach_id = (select auth.uid())
        and cs.student_id = training_plans.student_id
    )
  );
create policy "Coaches can update plans for linked students"
  on public.training_plans for update to authenticated
  using (
    coach_id = (select auth.uid())
    and public.current_user_role() = 'coach'
    and exists (
      select 1 from public.coach_students as cs
      where cs.coach_id = (select auth.uid())
        and cs.student_id = training_plans.student_id
    )
  )
  with check (
    coach_id = (select auth.uid())
    and public.current_user_role() = 'coach'
    and exists (
      select 1 from public.coach_students as cs
      where cs.coach_id = (select auth.uid())
        and cs.student_id = training_plans.student_id
    )
  );
create policy "Coaches can delete plans for linked students"
  on public.training_plans for delete to authenticated
  using (
    coach_id = (select auth.uid())
    and public.current_user_role() = 'coach'
    and exists (
      select 1 from public.coach_students as cs
      where cs.coach_id = (select auth.uid())
        and cs.student_id = training_plans.student_id
    )
  );

revoke all on public.appointments from public, anon, authenticated;
grant select, insert on public.appointments to authenticated;
grant update (status) on public.appointments to authenticated;
create policy "Linked users can read appointments"
  on public.appointments for select to authenticated
  using (
    student_id = (select auth.uid())
    or (
      coach_id = (select auth.uid())
      and exists (
        select 1 from public.coach_students as cs
        where cs.coach_id = (select auth.uid())
          and cs.student_id = appointments.student_id
      )
    )
  );
create policy "Students can request appointments with their coach"
  on public.appointments for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and status = 'requested'
    and public.current_user_role() = 'student'
    and exists (
      select 1 from public.coach_students as cs
      where cs.coach_id = appointments.coach_id
        and cs.student_id = (select auth.uid())
    )
  );
create policy "Coaches can manage appointments with linked students"
  on public.appointments for update to authenticated
  using (
    coach_id = (select auth.uid())
    and public.current_user_role() = 'coach'
    and exists (
      select 1 from public.coach_students as cs
      where cs.coach_id = (select auth.uid())
        and cs.student_id = appointments.student_id
    )
  )
  with check (
    coach_id = (select auth.uid())
    and public.current_user_role() = 'coach'
    and exists (
      select 1 from public.coach_students as cs
      where cs.coach_id = (select auth.uid())
        and cs.student_id = appointments.student_id
    )
  );
create policy "Students can cancel their own appointments"
  on public.appointments for update to authenticated
  using (
    student_id = (select auth.uid())
    and status <> 'cancelled'
    and public.current_user_role() = 'student'
  )
  with check (
    student_id = (select auth.uid())
    and status = 'cancelled'
    and public.current_user_role() = 'student'
  );
