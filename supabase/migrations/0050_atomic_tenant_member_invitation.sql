-- Bound guardian/driver invitation latency by moving all SafeBus writes and
-- optional guardian-student linking into one tenant-scoped transaction.

create or replace function public.server_get_member_invitation_state(
  p_email text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text := lower(trim(p_email));
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization required.' using errcode = '42501';
  end if;

  if nullif(v_email, '') is null or length(v_email) > 320 then
    raise exception 'A valid member email is required.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'authUserId', u.id,
    'emailConfirmed', u.email_confirmed_at is not null,
    'hasPassword', nullif(u.encrypted_password, '') is not null,
    'profileId', p.id,
    'profileTenantId', p.tenant_id,
    'profileRole', p.role,
    'profileStatus', p.status
  )
  into v_result
  from auth.users u
  left join public.profiles p on p.id = u.id
  where lower(u.email) = v_email
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.server_get_member_invitation_state(text)
  from public, anon, authenticated;
grant execute on function public.server_get_member_invitation_state(text)
  to service_role;

comment on function public.server_get_member_invitation_state(text) is
  'Server-only exact-email lookup used to safely resend or recover guardian and driver invitations without exposing Auth state to browsers.';

create or replace function public.admin_finalize_member_invitation(
  p_auth_user_id uuid,
  p_role text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_driver_details jsonb default null,
  p_student_links jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_role text := lower(trim(p_role));
  v_first_name text := trim(p_first_name);
  v_last_name text := trim(p_last_name);
  v_full_name text;
  v_email text := lower(trim(p_email));
  v_phone text := trim(p_phone);
  v_existing_profile public.profiles%rowtype;
  v_auth_email text;
  v_guardian public.guardians%rowtype;
  v_driver public.drivers%rowtype;
  v_link jsonb;
  v_student_id uuid;
  v_relationship text;
  v_license_number text;
  v_license_issue_date date;
  v_license_expiry_date date;
  v_license_class text;
  v_address_line1 text;
  v_address_line2 text;
  v_city text;
  v_province text;
  v_postal_code text;
begin
  if auth.uid() is null or not public.is_tenant_admin() or v_tenant_id is null then
    raise exception 'Only an active tenant administrator can finalize member invitations.'
      using errcode = '42501';
  end if;

  if v_role not in ('driver', 'guardian') then
    raise exception 'Only driver or guardian invitations are supported.'
      using errcode = '22023';
  end if;

  if p_auth_user_id is null
    or nullif(v_first_name, '') is null
    or nullif(v_last_name, '') is null
    or nullif(v_email, '') is null
    or nullif(v_phone, '') is null
    or length(v_first_name) > 100
    or length(v_last_name) > 100
    or length(v_email) > 320
    or length(v_phone) > 40 then
    raise exception 'Enter valid guardian or driver contact details.'
      using errcode = '22023';
  end if;
  v_full_name := concat_ws(' ', v_first_name, v_last_name);

  select lower(u.email)
  into v_auth_email
  from auth.users u
  where u.id = p_auth_user_id;

  if v_auth_email is null or v_auth_email <> v_email then
    raise exception 'The invited Auth account does not match the member email.'
      using errcode = '22023';
  end if;

  select *
  into v_existing_profile
  from public.profiles p
  where p.id = p_auth_user_id
  for update;

  if found then
    if v_existing_profile.tenant_id is distinct from v_tenant_id
      or v_existing_profile.role::text is distinct from v_role then
      raise exception 'That email is already linked to a different SafeBus tenant or role.'
        using errcode = '23505';
    end if;
    if v_existing_profile.status <> 'invited' then
      raise exception 'Only a pending invitation can be finalized.'
        using errcode = '55000';
    end if;

    update public.profiles
    set first_name = v_first_name,
        last_name = v_last_name,
        full_name = v_full_name,
        email = v_email,
        school_id = null,
        status = 'invited'
    where id = p_auth_user_id;
  else
    if exists (
      select 1
      from public.profiles p
      where lower(p.email) = v_email
    ) then
      raise exception 'That email is already linked to another SafeBus profile.'
        using errcode = '23505';
    end if;

    insert into public.profiles (
      id,
      tenant_id,
      school_id,
      first_name,
      last_name,
      full_name,
      email,
      role,
      status
    )
    values (
      p_auth_user_id,
      v_tenant_id,
      null,
      v_first_name,
      v_last_name,
      v_full_name,
      v_email,
      v_role::public.user_role,
      'invited'
    );
  end if;

  if v_role = 'guardian' then
    insert into public.guardians (
      tenant_id,
      profile_id,
      first_name,
      last_name,
      full_name,
      email,
      phone,
      status
    )
    values (
      v_tenant_id,
      p_auth_user_id,
      v_first_name,
      v_last_name,
      v_full_name,
      v_email,
      v_phone,
      'active'
    )
    on conflict (profile_id, tenant_id) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name,
        full_name = excluded.full_name,
        email = excluded.email,
        phone = excluded.phone,
        status = 'active'
    returning * into v_guardian;

    if jsonb_typeof(coalesce(p_student_links, '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(p_student_links, '[]'::jsonb)) > 20 then
      raise exception 'Student links must be an array of at most 20 rows.'
        using errcode = '22023';
    end if;

    for v_link in
      select value
      from jsonb_array_elements(coalesce(p_student_links, '[]'::jsonb))
    loop
      begin
        v_student_id := nullif(trim(v_link ->> 'studentId'), '')::uuid;
      exception
        when invalid_text_representation then
          raise exception 'A selected student identifier is invalid.'
            using errcode = '22023';
      end;
      v_relationship := coalesce(
        nullif(lower(trim(v_link ->> 'relationship')), ''),
        'guardian'
      );

      if v_student_id is null
        or v_relationship not in ('mother', 'father', 'guardian', 'caregiver', 'other')
        or not exists (
          select 1
          from public.students s
          where s.id = v_student_id
            and s.tenant_id = v_tenant_id
            and s.status = 'active'
        ) then
        raise exception 'A selected student or relationship is not valid for this tenant.'
          using errcode = '22023';
      end if;

      insert into public.student_guardians (
        tenant_id,
        student_id,
        guardian_id,
        relationship,
        can_receive_notifications,
        status
      )
      values (
        v_tenant_id,
        v_student_id,
        v_guardian.id,
        v_relationship,
        true,
        'active'
      )
      on conflict (student_id, guardian_id) do update
      set relationship = excluded.relationship,
          can_receive_notifications = true,
          status = 'active';
    end loop;
  else
    if jsonb_typeof(p_driver_details) <> 'object' then
      raise exception 'Complete driver licence and address details are required.'
        using errcode = '22023';
    end if;

    v_license_number := upper(trim(p_driver_details ->> 'license_number'));
    v_license_class := trim(p_driver_details ->> 'license_class');
    v_address_line1 := trim(p_driver_details ->> 'address_line1');
    v_address_line2 := nullif(trim(p_driver_details ->> 'address_line2'), '');
    v_city := trim(p_driver_details ->> 'city');
    v_province := upper(trim(p_driver_details ->> 'province'));
    v_postal_code := upper(
      regexp_replace(trim(p_driver_details ->> 'postal_code'), '\s+', '', 'g')
    );

    begin
      v_license_issue_date := (p_driver_details ->> 'license_issue_date')::date;
      v_license_expiry_date := (p_driver_details ->> 'license_expiry_date')::date;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception 'Enter valid driver licence dates.'
          using errcode = '22023';
    end;

    if nullif(v_license_number, '') is null
      or nullif(v_license_class, '') is null
      or nullif(v_address_line1, '') is null
      or nullif(v_city, '') is null
      or nullif(v_province, '') is null
      or nullif(v_postal_code, '') is null
      or length(v_license_number) > 64
      or length(v_address_line1) > 160
      or length(coalesce(v_address_line2, '')) > 160
      or length(v_city) > 100
      or v_province !~ '^[A-Z]{2}$'
      or v_postal_code !~ '^[A-Z][0-9][A-Z][0-9][A-Z][0-9]$'
      or v_license_class not in ('1', '2', '3', '4', '5', '6', '7')
      or v_license_expiry_date < v_license_issue_date then
      raise exception 'Enter valid Alberta driver licence and address details.'
        using errcode = '22023';
    end if;

    v_postal_code := substring(v_postal_code from 1 for 3)
      || ' '
      || substring(v_postal_code from 4 for 3);

    if exists (
      select 1
      from public.drivers d
      where d.tenant_id = v_tenant_id
        and lower(d.license_number) = lower(v_license_number)
        and d.profile_id <> p_auth_user_id
    ) then
      raise exception 'That driver licence number is already assigned in your organization.'
        using errcode = '23505';
    end if;

    insert into public.drivers (
      tenant_id,
      profile_id,
      phone,
      license_number,
      license_issue_date,
      license_expiry_date,
      license_class,
      address_line1,
      address_line2,
      city,
      province,
      postal_code,
      status
    )
    values (
      v_tenant_id,
      p_auth_user_id,
      v_phone,
      v_license_number,
      v_license_issue_date,
      v_license_expiry_date,
      v_license_class,
      v_address_line1,
      v_address_line2,
      v_city,
      v_province,
      v_postal_code,
      'active'
    )
    on conflict (profile_id, tenant_id) do update
    set phone = excluded.phone,
        license_number = excluded.license_number,
        license_issue_date = excluded.license_issue_date,
        license_expiry_date = excluded.license_expiry_date,
        license_class = excluded.license_class,
        address_line1 = excluded.address_line1,
        address_line2 = excluded.address_line2,
        city = excluded.city,
        province = excluded.province,
        postal_code = excluded.postal_code,
        status = 'active'
    returning * into v_driver;
  end if;

  insert into public.tenant_onboarding_invitations (
    tenant_id,
    email,
    full_name,
    role,
    status,
    invited_profile_id,
    invited_by_profile_id,
    last_sent_at
  )
  values (
    v_tenant_id,
    v_email,
    v_full_name,
    v_role::public.user_role,
    'pending',
    p_auth_user_id,
    auth.uid(),
    now()
  );

  return jsonb_build_object(
    'status', 'pending',
    'profileId', p_auth_user_id,
    'guardianId', case when v_role = 'guardian' then v_guardian.id else null end,
    'driverId', case when v_role = 'driver' then v_driver.id else null end
  );
end;
$$;

revoke all on function public.admin_finalize_member_invitation(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) from public, anon;
grant execute on function public.admin_finalize_member_invitation(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) to authenticated;

comment on function public.admin_finalize_member_invitation(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) is
  'Atomically finalizes a guardian or driver invitation for the active tenant admin, including optional guardian-student links.';
