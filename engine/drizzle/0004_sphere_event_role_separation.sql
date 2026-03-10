-- Migration: 0004_sphere_event_role_separation
-- Hardens Sphere event write boundaries with role-separation grant helper.

REVOKE ALL ON TABLE "sphere_events" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "sphere_event_write_tokens" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION metacanon_append_sphere_event(
  UUID,
  BIGINT,
  UUID,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  JSONB,
  JSONB,
  JSONB,
  TEXT
) FROM PUBLIC;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION metacanon_apply_sphere_app_role_grants(
  p_role_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_role TEXT := btrim(COALESCE(p_role_name, ''));
BEGIN
  IF target_role = '' THEN
    RAISE EXCEPTION 'App role must be non-empty.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = target_role
  ) THEN
    RAISE EXCEPTION 'App role "%" does not exist.', target_role
      USING ERRCODE = '42704';
  END IF;

  EXECUTE format('REVOKE ALL ON TABLE sphere_events FROM %I', target_role);
  EXECUTE format('GRANT SELECT ON TABLE sphere_events TO %I', target_role);

  EXECUTE format(
    'REVOKE ALL ON FUNCTION metacanon_append_sphere_event(UUID, BIGINT, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB, JSONB, JSONB, TEXT) FROM %I',
    target_role
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION metacanon_append_sphere_event(UUID, BIGINT, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB, JSONB, JSONB, TEXT) TO %I',
    target_role
  );

  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE sphere_threads TO %I', target_role);
  EXECUTE format('GRANT SELECT ON TABLE counselors TO %I', target_role);
  EXECUTE format('GRANT SELECT, INSERT ON TABLE sphere_acks TO %I', target_role);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE sphere_acks_ack_id_seq TO %I', target_role);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION metacanon_apply_sphere_app_role_grants(TEXT) FROM PUBLIC;
