-- Phase 27 — Barista (staff) → branch assignment.
-- Run AFTER phase26_feedback_tags.sql.
--
-- No such relationship existed (only orders.branch_id). Adds an optional branch
-- on the user/profile + an admin-only RPC to set it. RLS unchanged (users is
-- already own-row-select + is_admin()); writes go through the SECURITY DEFINER
-- RPC like the other user mutations.

alter table public.users
  add column if not exists branch_id uuid references public.branches(id) on delete set null;

create index if not exists idx_users_branch on public.users(branch_id);

create or replace function public.set_staff_branch(p_user_id uuid, p_branch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  update public.users
    set branch_id = p_branch_id, updated_at = now()
    where id = p_user_id;
end;
$$;

grant execute on function public.set_staff_branch(uuid, uuid) to authenticated;
