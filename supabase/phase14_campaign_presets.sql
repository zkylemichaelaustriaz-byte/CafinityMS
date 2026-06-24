-- ============================================================================
-- Phase 14 — Campaign presets
-- Run AFTER phase13_admin_settings.sql. Idempotent.
--
-- Stores the chosen visual preset key so the modal can render a bundled/accent
-- banner without requiring a hero image URL.
-- ============================================================================

alter table public.campaigns
  add column if not exists preset_key text;

-- =============================================================================
-- DONE.
-- =============================================================================
