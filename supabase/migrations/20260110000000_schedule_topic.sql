-- Weekly theme challenge: each scheduled week gets an optional topic
-- (e.g. "chocolat", "vegan"). Creator sets it; members just read it.

alter table public.league_schedule
  add column if not exists topic text;

create policy "league_schedule_creator_update" on public.league_schedule
  for update to authenticated
  using (league_id in (select id from public.leagues where created_by = auth.uid()))
  with check (league_id in (select id from public.leagues where created_by = auth.uid()));