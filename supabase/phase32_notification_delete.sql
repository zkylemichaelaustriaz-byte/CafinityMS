-- phase32_notification_delete.sql
-- Let a customer remove their OWN notifications from their history. Notifications
-- are convenience records (the order is the source of truth), so a hard delete is
-- appropriate — it must never touch another user's rows, the orders, or any audit
-- history. Enforced by an owner-scoped RLS DELETE policy.
--
-- Idempotent. Does NOT edit phase11 or any other applied migration.

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete using (auth.uid() = user_id);
