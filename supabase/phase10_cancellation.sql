-- ============================================================================
-- Phase 10 (Batch 4) — Cancellation extension: refunds, fee/tip reversal,
-- reasons, and an audit trail. Run AFTER phase9_tip_eta.sql. Idempotent.
--
-- Refund states are modelled as a SEPARATE refund_status column (not by
-- extending the payment_status enum) to avoid unsafe in-transaction enum use.
--   refund_status: none | refund_pending | refunded | partially_refunded
--
-- Rules:
--   GCash paid      -> simulated FULL refund (refunded, amount = total_amount)
--   Cash paid       -> refund_pending (staff returns the cash at the counter)
--   Never paid      -> none (nothing to refund)
-- The refunded amount includes tip + service fee (i.e. the whole final total).
-- ============================================================================

-- 1. Audit + refund columns --------------------------------------------------
alter table public.orders
  add column if not exists cancelled_by        uuid references public.users(id),
  add column if not exists cancelled_at        timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists refund_status       text not null default 'none',
  add column if not exists refunded_amount     numeric(10,2) not null default 0,
  add column if not exists refunded_at         timestamptz;

do $$ begin
  alter table public.orders add constraint orders_refund_status_chk
    check (refund_status in ('none','refund_pending','refunded','partially_refunded'));
exception when duplicate_object then null; end $$;

-- 2. Cancellation policy configuration ---------------------------------------
alter table public.app_settings
  add column if not exists cancellation_policy          text not null default 'until_preparing',
  add column if not exists cancellation_window_minutes  int  not null default 0,
  add column if not exists cancellation_reason_required boolean not null default false;

do $$ begin
  alter table public.app_settings add constraint app_settings_cancel_policy_chk
    check (cancellation_policy in ('until_preparing','within_n_minutes','disabled'));
exception when duplicate_object then null; end $$;

-- 3. Shared cancellation core (refund-aware) ---------------------------------
create or replace function public._revert_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order   public.orders%rowtype;
  v_it      record;
  v_promo   public.promotions%rowtype;
  v_refund  text := 'none';
  v_amount  numeric(10,2) := 0;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  -- Restore inventory.
  for v_it in select product_variant_id, quantity from public.order_items where order_id = p_order_id
  loop
    update public.branch_inventory
      set stock_quantity = stock_quantity + v_it.quantity,
          is_available = true, updated_at = now()
      where branch_id = v_order.branch_id and product_variant_id = v_it.product_variant_id;
  end loop;

  -- Reverse points only if already credited (earned). Pending = never credited.
  if v_order.points_state = 'earned' and v_order.points_earned > 0 then
    update public.users
      set loyalty_points = greatest(0, loyalty_points - v_order.points_earned)
      where id = v_order.user_id;
    insert into public.loyalty_transactions (user_id, order_id, points, type, description)
    values (v_order.user_id, p_order_id, -v_order.points_earned, 'adjust',
            'Reversal: order ' || coalesce(v_order.order_number, '') || ' cancelled');
  end if;

  -- Restore promotion usage, or return a reward voucher.
  if v_order.promo_code is not null then
    select * into v_promo from public.promotions where upper(code) = upper(v_order.promo_code);
    if found then
      update public.promotions set usage_count = greatest(0, usage_count - 1) where id = v_promo.id;
    else
      update public.reward_redemptions
        set is_used = false, used_at = null, used_order_id = null
        where upper(code) = upper(v_order.promo_code) and user_id = v_order.user_id;
    end if;
  end if;

  -- Refund handling (tip + service fee are part of total_amount).
  if v_order.payment_status = 'paid' then
    v_amount := v_order.total_amount;
    if v_order.payment_method = 'GCash' then
      v_refund := 'refunded';            -- simulated successful refund
    else
      v_refund := 'refund_pending';      -- cash to be returned at the counter
    end if;
  end if;

  update public.orders
    set status = 'cancelled',
        points_state = 'reversed',
        cancelled_by = auth.uid(),
        cancelled_at = now(),
        cancellation_reason = nullif(trim(coalesce(p_reason, '')), ''),
        refund_status = v_refund,
        refunded_amount = v_amount,
        refunded_at = case when v_refund = 'refunded' then now() else null end
    where id = p_order_id;
end; $$;

-- 4. Staff cancellation (reason optional/required by config) ------------------
create or replace function public.cancel_order(p_order_id uuid, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype; v_req boolean;
begin
  if not public.is_staff_or_admin() then raise exception 'Not authorized'; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'Order can no longer be cancelled';
  end if;
  select cancellation_reason_required into v_req from public.app_settings where id;
  if coalesce(v_req, false) and coalesce(trim(p_reason), '') = '' then
    raise exception 'A cancellation reason is required';
  end if;
  perform public._revert_order(p_order_id, p_reason);
  return jsonb_build_object('status', 'cancelled');
end; $$;

-- 5. Customer self-cancellation (policy-gated) -------------------------------
create or replace function public.cancel_my_order(p_order_id uuid, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order  public.orders%rowtype;
  v_policy text;
  v_window int;
  v_req    boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.user_id <> auth.uid() then raise exception 'Order not found'; end if;

  select cancellation_policy, cancellation_window_minutes, cancellation_reason_required
    into v_policy, v_window, v_req from public.app_settings where id;
  v_policy := coalesce(v_policy, 'until_preparing');

  if v_policy = 'disabled' then
    raise exception 'Self-cancellation is currently unavailable. Please ask staff for help.';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'This order can no longer be cancelled. Please ask staff for help.';
  end if;
  if v_policy = 'within_n_minutes' and coalesce(v_window, 0) > 0
     and v_order.created_at < now() - (v_window || ' minutes')::interval then
    raise exception 'The cancellation window has passed. Please ask staff for help.';
  end if;
  if coalesce(v_req, false) and coalesce(trim(p_reason), '') = '' then
    raise exception 'A cancellation reason is required';
  end if;

  perform public._revert_order(p_order_id, p_reason);
  return jsonb_build_object('status', 'cancelled');
end; $$;

-- =============================================================================
-- DONE.
-- =============================================================================
