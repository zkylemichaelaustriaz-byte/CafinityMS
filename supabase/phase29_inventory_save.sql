-- phase29_inventory_save.sql
-- Atomic, admin-only batch save for branch inventory with optimistic-concurrency
-- detection. Replaces the previous per-field auto-save with an explicit "Save
-- changes" flow: the whole modified set is applied in one transaction (all or
-- nothing), each row's expected updated_at is checked so a stale edit can't
-- silently overwrite a newer value, and stock is validated server-side.
--
-- Idempotent: safe to re-run. Does NOT touch existing migrations or data.

create or replace function public.save_branch_inventory(p_items jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item     jsonb;
  v_id       uuid;
  v_stock    integer;
  v_avail    boolean;
  v_expected timestamptz;
  v_actual   timestamptz;
  v_now      timestamptz := now();
begin
  -- Only administrators may change inventory.
  if not public.is_admin() then
    raise exception 'Only admins can update inventory' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_id       := (v_item->>'id')::uuid;
    v_stock    := (v_item->>'stock_quantity')::integer;
    v_avail    := coalesce((v_item->>'is_available')::boolean, true);
    v_expected := nullif(v_item->>'updated_at', '')::timestamptz;

    if v_stock is null or v_stock < 0 then
      raise exception 'Invalid stock quantity for inventory %', v_id;
    end if;

    -- Lock the row and read its current version.
    select updated_at into v_actual
      from public.branch_inventory
      where id = v_id
      for update;

    if v_actual is null then
      raise exception 'Inventory row % not found', v_id;
    end if;

    -- Optimistic concurrency: if the caller's expected version is provided and
    -- no longer matches, someone else changed it first — abort the whole batch.
    if v_expected is not null and v_actual is distinct from v_expected then
      raise exception 'CONFLICT' using errcode = '40001';
    end if;

    update public.branch_inventory
      set stock_quantity = v_stock,
          is_available   = v_avail,
          updated_at     = v_now
      where id = v_id;
  end loop;

  return v_now;
end;
$$;

revoke all on function public.save_branch_inventory(jsonb) from public;
grant execute on function public.save_branch_inventory(jsonb) to authenticated;
