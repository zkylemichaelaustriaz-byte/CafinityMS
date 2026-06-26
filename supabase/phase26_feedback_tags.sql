-- Phase 26 — Feedback tags.
-- Run AFTER phase25_loyalty_challenges.sql.
--
-- Adds optional quick-feedback tags to the existing per-order feedback. No new
-- table, no RLS change (feedback_select_own already grants own-row + is_admin()).
-- Per-product feedback is intentionally NOT added — feedback is unique per
-- (order_id, user_id) and item-level review would need a separate table.

alter table public.feedback add column if not exists tags text[] not null default '{}';

-- Replace submit_feedback with a tags-aware version (old 3-arg form dropped so
-- there's no ambiguous overload).
drop function if exists public.submit_feedback(uuid, int, text);

create or replace function public.submit_feedback(
  p_order_id uuid,
  p_rating int,
  p_comment text,
  p_tags text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating must be between 1 and 5'; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.user_id <> auth.uid() then raise exception 'Order not found'; end if;
  if v_order.status <> 'completed' then
    raise exception 'You can only review completed orders';
  end if;

  insert into public.feedback (order_id, user_id, rating, comment, tags)
  values (
    p_order_id,
    auth.uid(),
    p_rating,
    left(coalesce(p_comment, ''), 500),
    (coalesce(p_tags, '{}'))[1:8]
  )
  on conflict (order_id, user_id) do update
    set rating = excluded.rating, comment = excluded.comment, tags = excluded.tags;
end;
$$;

grant execute on function public.submit_feedback(uuid, int, text, text[]) to authenticated;
