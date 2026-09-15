-- Voting runs server-side (SECURITY DEFINER, same pattern as join_league):
-- the RLS insert policy on ratings tripped on edge cases, and the raw upsert
-- conflated user_id (baker) with voter_id (voter). This RPC resolves the baker
-- from the schedule, keeps the (voter, league, week) uniqueness, and lets the
-- client stay on one row per vote.

create or replace function public.submit_rating(
  p_league_id uuid,
  p_week_number int,
  p_taste int,
  p_texture int,
  p_appearance int,
  p_baking int,
  p_indulgence int,
  p_score numeric,
  p_comment text default null
)
returns public.ratings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_baker public.league_schedule%rowtype;
  v_row public.ratings;
begin
  if p_league_id is null or p_week_number is null then
    raise exception 'Ligue et semaine requises pour voter.';
  end if;

  -- Le votant doit être membre.
  if not exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = auth.uid()
  ) then
    raise exception 'Tu ne participes pas à cette ligue.';
  end if;

  -- La semaine doit avoir un boulanger assigné, différent du votant.
  select * into v_baker
    from public.league_schedule
    where league_id = p_league_id
      and week_number = p_week_number
      and assigned_user_id is not null
    limit 1;

  if not found then
    raise exception 'Aucun boulanger assigné pour cette semaine.';
  end if;

  if v_baker.assigned_user_id = auth.uid() then
    raise exception 'Auto-jugement interdit.';
  end if;

  -- Notes bornées 0..5, score = moyenne (0 si incomplet, le client envoie le vrai).
  if p_taste < 0 or p_taste > 5 or p_texture < 0 or p_texture > 5
     or p_appearance < 0 or p_appearance > 5 or p_baking < 0 or p_baking > 5
     or p_indulgence < 0 or p_indulgence > 5 then
    raise exception 'Les notes doivent être comprises entre 0 et 5.';
  end if;

  insert into public.ratings (
    league_id, user_id, voter_id, week_number,
    taste, texture, appearance, baking, indulgence, score, comment
  ) values (
    p_league_id, v_baker.assigned_user_id, auth.uid(), p_week_number,
    p_taste, p_texture, p_appearance, p_baking, p_indulgence,
    least(greatest(p_score, 0), 5), nullif(trim(coalesce(p_comment, '')), '')
  )
  on conflict (voter_id, league_id, week_number)
  do update set
    user_id = excluded.user_id,
    taste = excluded.taste,
    texture = excluded.texture,
    appearance = excluded.appearance,
    baking = excluded.baking,
    indulgence = excluded.indulgence,
    score = excluded.score,
    comment = excluded.comment
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.submit_rating(uuid, int, int, int, int, int, int, numeric, text) from public;
grant execute on function public.submit_rating(uuid, int, int, int, int, int, int, numeric, text) to authenticated;