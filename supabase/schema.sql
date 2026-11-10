-- Reference for the deployed create_private_job_tracker migration.
-- Apply only to a NEW project after inspecting its schema, not as a reset script.
create table public.tracked_jobs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_url text not null check (length(job_url) <= 2048 and job_url ~ '^https://'),
  title text not null check (length(title) between 1 and 250),
  company text not null check (length(company) between 1 and 200),
  location text not null default '' check (length(location) <= 300),
  source text not null default '' check (length(source) <= 80),
  status text not null default 'Saved' check (status in ('Saved', 'Applied', 'Interview', 'Offer', 'Closed')),
  notes text not null default '' check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_url)
);
alter table public.tracked_jobs enable row level security;
revoke all on public.tracked_jobs from anon;
grant select, insert, update, delete on public.tracked_jobs to authenticated;
create policy "Read own jobs" on public.tracked_jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy "Save own jobs" on public.tracked_jobs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own jobs" on public.tracked_jobs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Remove own jobs" on public.tracked_jobs for delete to authenticated using ((select auth.uid()) = user_id);
create index tracked_jobs_updated on public.tracked_jobs (user_id, updated_at desc);
