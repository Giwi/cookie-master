-- Prefered UI theme, persisted per user. Applied on login (AuthContext.fetchProfile)
-- and written back from the profile page. RLS: profiles_self_manage already covers it.

alter table public.profiles
  add column if not exists theme text not null default 'choco';