-- The owner's bookmark grants access to the existing tracker and portal feed.
-- Provision its SHA-256 digest separately. The worker keeps its own credential.
begin;

create table application_worker.personal_access (
  singleton boolean primary key default true check (singleton),
  key_hash bytea not null check (octet_length(key_hash) = 32)
);
revoke all on application_worker.personal_access from public, anon, authenticated;

create function application_worker.personal_tracker(p_action text, p_job jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  access_key text := current_setting('request.headers', true)::jsonb ->> 'x-next-chapter-access';
  tracker_owner uuid;
  result jsonb;
  changed public.tracked_jobs;
begin
  if access_key is null or access_key !~ '^[0-9a-f]{64}$' then
    raise insufficient_privilege using message = 'Invalid personal tracker link';
  end if;
  select credential.owner_id into tracker_owner
  from application_worker.credential as credential
  join application_worker.personal_access as personal on personal.singleton = credential.singleton
  where credential.singleton and personal.key_hash = sha256(convert_to(access_key, 'UTF8'));
  if tracker_owner is null then
    raise insufficient_privilege using message = 'Invalid personal tracker link';
  end if;

  if p_action = 'list' then
    select jsonb_build_object(
      'jobs', coalesce(jsonb_agg(to_jsonb(job) - 'user_id' order by job.updated_at desc), '[]'::jsonb),
      'today_applied', count(*) filter (where job.notes like 'Application confirmed by the job agent on '
        || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD') || ' %')
    ) into result
    from public.tracked_jobs as job where job.user_id = tracker_owner;
    return result;
  end if;

  if p_action = 'portal' then
    select jsonb_build_object('jobs', snapshot.jobs, 'checked_at', snapshot.checked_at) into result
    from public.portal_job_snapshots as snapshot
    where snapshot.user_id = tracker_owner order by snapshot.id desc limit 1;
    return result;
  end if;

  if p_action = 'save' then
    insert into public.tracked_jobs (user_id, job_url, title, company, location, source)
    values (tracker_owner, p_job ->> 'job_url', p_job ->> 'title', p_job ->> 'company',
      coalesce(p_job ->> 'location', ''), coalesce(p_job ->> 'source', 'Added by you'))
    on conflict (user_id, job_url) do nothing
    returning * into changed;
    if not found then
      select * into changed from public.tracked_jobs
      where user_id = tracker_owner and job_url = (p_job ->> 'job_url');
    end if;
  elsif p_action = 'status' then
    update public.tracked_jobs set status = p_job ->> 'status', updated_at = now()
    where user_id = tracker_owner and job_url = (p_job ->> 'job_url')
    returning * into changed;
    if not found then
      raise no_data_found using message = 'Tracked job not found';
    end if;
  else
    raise invalid_parameter_value using message = 'Unsupported tracker action';
  end if;
  return to_jsonb(changed) - 'user_id';
end;
$$;
revoke all on function application_worker.personal_tracker(text, jsonb) from public, anon, authenticated;
grant usage on schema application_worker to anon;
grant execute on function application_worker.personal_tracker(text, jsonb) to anon;

create function public.personal_tracker(p_action text, p_job jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select application_worker.personal_tracker(p_action, p_job) $$;
revoke all on function public.personal_tracker(text, jsonb) from public, anon, authenticated;
grant execute on function public.personal_tracker(text, jsonb) to anon;

commit;
