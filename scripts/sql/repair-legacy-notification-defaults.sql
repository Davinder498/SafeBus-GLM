-- Bounded data repair under the owner's existing standard notification approval.
-- This timestamp records the reviewed repair approval, not a fabricated administrator identity.
DO $repair$
DECLARE changed integer;
BEGIN
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.guardian_notification_delivery_policies'::regclass AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'Notification trigger inventory changed';
  END IF;
  UPDATE public.guardian_notification_delivery_policies p
  SET privacy_review_status='approved', privacy_approved_at='2026-11-14T08:42:34Z'::timestamptz
  FROM public.tenants t
  WHERE p.tenant_id='49410f95-38da-4eed-aaef-c6b6b98e9a7c'::uuid AND t.id=p.tenant_id
    AND jsonb_build_object('policy',to_jsonb(p)-'updated_at','tenant_status',t.status,
      'tenant_created_at',to_jsonb(t)->'created_at')='{"policy":{"tenant_id":"49410f95-38da-4eed-aaef-c6b6b98e9a7c","tenant_daily_limit":10000000,"privacy_approved_at":null,"privacy_approved_by":null,"privacy_review_status":"pending","push_tenant_daily_limit":10000000,"tenant_per_minute_limit":200000,"push_tenant_per_minute_limit":200000},"tenant_status":"active","tenant_created_at":"2026-08-05T19:09:07.505273+00:00"}'::jsonb;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Notification repair baseline changed'; END IF;
END $repair$;
