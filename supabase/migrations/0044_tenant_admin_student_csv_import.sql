-- SafeBus Alberta - tenant admin student CSV import
--
-- Adds one tenant-admin-only RPC for previewing and atomically committing
-- student-only CSV rows. The browser parses the file, but authorization,
-- limits, field validation, school resolution, duplicate warnings, and writes
-- are all revalidated here. No uploaded file or import history is retained.

create index if not exists students_tenant_normalized_import_match_idx
  on public.students (
    tenant_id,
    (lower(btrim(first_name))),
    (lower(btrim(last_name))),
    (lower(btrim(coalesce(grade, '')))),
    school_id
  );

create or replace function public.admin_process_student_csv_import(
  p_rows jsonb,
  p_commit boolean default false,
  p_acknowledge_warnings boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_row_count integer := 0;
  v_imported_count integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  if public.current_user_role() is distinct from 'tenant_admin'
     or v_tenant_id is null then
    raise exception 'Only a tenant administrator can import students.'
      using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object(
      'rowCount', 0,
      'importedCount', 0,
      'errors', jsonb_build_array(jsonb_build_object(
        'rowNumber', 0,
        'field', 'file',
        'code', 'invalid_payload',
        'message', 'Student import rows must be provided as an array.'
      )),
      'warnings', '[]'::jsonb
    );
  end if;

  v_row_count := jsonb_array_length(p_rows);
  if v_row_count = 0 then
    return jsonb_build_object(
      'rowCount', 0,
      'importedCount', 0,
      'errors', jsonb_build_array(jsonb_build_object(
        'rowNumber', 0,
        'field', 'file',
        'code', 'no_data_rows',
        'message', 'The CSV does not contain any student rows.'
      )),
      'warnings', '[]'::jsonb
    );
  end if;
  if v_row_count > 5000 then
    return jsonb_build_object(
      'rowCount', v_row_count,
      'importedCount', 0,
      'errors', jsonb_build_array(jsonb_build_object(
        'rowNumber', 0,
        'field', 'file',
        'code', 'row_limit',
        'message', 'A CSV can contain at most 5,000 student rows.'
      )),
      'warnings', '[]'::jsonb
    );
  end if;

  with raw as (
    select
      item.ordinality::integer source_ordinal,
      item.value row_value,
      case
        when coalesce(item.value->>'rowNumber', '') ~ '^[1-9][0-9]{0,8}$'
          then (item.value->>'rowNumber')::integer
        else item.ordinality::integer + 1
      end row_number,
      btrim(coalesce(item.value->>'firstName', '')) first_name,
      btrim(coalesce(item.value->>'lastName', '')) last_name,
      nullif(btrim(coalesce(item.value->>'preferredName', '')), '') preferred_name,
      nullif(btrim(coalesce(item.value->>'grade', '')), '') grade,
      nullif(btrim(coalesce(item.value->>'schoolName', '')), '') school_name
    from jsonb_array_elements(p_rows) with ordinality item(value, ordinality)
  ),
  normalized as (
    select
      r.*,
      coalesce(sm.match_count, 0) school_match_count,
      sm.school_id
    from raw r
    left join lateral (
      select
        count(*)::integer match_count,
        (array_agg(s.id order by s.id))[1] school_id
      from public.schools s
      where r.school_name is not null
        and s.tenant_id = v_tenant_id
        and s.status = 'active'
        and lower(btrim(s.name)) = lower(r.school_name)
    ) sm on true
  ),
  duplicate_row_numbers as (
    select row_number
    from normalized
    group by row_number
    having count(*) > 1
  ),
  issues as (
    select
      n.row_number,
      'row'::text field,
      'invalid_row'::text code,
      format('Row %s must be a CSV row object.', n.row_number) message
    from normalized n
    where jsonb_typeof(n.row_value) <> 'object'

    union all

    select
      n.row_number,
      k.key field,
      'unknown_field'::text code,
      format('Row %s contains the unsupported "%s" field.', n.row_number, k.key) message
    from normalized n
    cross join lateral jsonb_object_keys(
      case when jsonb_typeof(n.row_value) = 'object' then n.row_value else '{}'::jsonb end
    ) k(key)
    where k.key <> all (
      array['rowNumber', 'firstName', 'lastName', 'preferredName', 'grade', 'schoolName']
    )

    union all

    select
      n.row_number,
      'rowNumber',
      'invalid_row_number',
      format('Import row %s has an invalid row number.', n.source_ordinal)
    from normalized n
    where jsonb_typeof(n.row_value) = 'object'
      and (
        jsonb_typeof(n.row_value->'rowNumber') <> 'number'
        or coalesce(n.row_value->>'rowNumber', '') !~ '^[1-9][0-9]{0,8}$'
      )

    union all

    select
      n.row_number,
      'rowNumber',
      'duplicate_row_number',
      format('Row number %s appears more than once.', n.row_number)
    from normalized n
    join duplicate_row_numbers d on d.row_number = n.row_number

    union all

    select
      n.row_number,
      f.field,
      'invalid_type',
      format('Row %s: %s must be text.', n.row_number, f.label)
    from normalized n
    cross join lateral (
      values
        ('firstName'::text, 'first name'::text),
        ('lastName', 'last name'),
        ('preferredName', 'preferred name'),
        ('grade', 'grade'),
        ('schoolName', 'school name')
    ) f(field, label)
    where jsonb_typeof(n.row_value) = 'object'
      and (
        not (n.row_value ? f.field)
        or jsonb_typeof(n.row_value->f.field) <> 'string'
      )

    union all

    select
      n.row_number,
      'first_name',
      'required',
      format('Row %s: first name is required.', n.row_number)
    from normalized n
    where n.first_name = ''

    union all

    select
      n.row_number,
      'last_name',
      'required',
      format('Row %s: last name is required.', n.row_number)
    from normalized n
    where n.last_name = ''

    union all

    select
      n.row_number,
      'first_name',
      'too_long',
      format('Row %s: first name is too long.', n.row_number)
    from normalized n
    where length(n.first_name) > 100

    union all

    select
      n.row_number,
      'last_name',
      'too_long',
      format('Row %s: last name is too long.', n.row_number)
    from normalized n
    where length(n.last_name) > 100

    union all

    select
      n.row_number,
      'preferred_name',
      'too_long',
      format('Row %s: preferred name is too long.', n.row_number)
    from normalized n
    where length(coalesce(n.preferred_name, '')) > 100

    union all

    select
      n.row_number,
      'grade',
      'too_long',
      format('Row %s: grade is too long.', n.row_number)
    from normalized n
    where length(coalesce(n.grade, '')) > 40

    union all

    select
      n.row_number,
      'school_name',
      'school_not_found',
      format('Row %s: school name does not match an active school.', n.row_number)
    from normalized n
    where n.school_name is not null
      and n.school_match_count = 0

    union all

    select
      n.row_number,
      'school_name',
      'ambiguous_school',
      format('Row %s: school name matches more than one active school.', n.row_number)
    from normalized n
    where n.school_name is not null
      and n.school_match_count > 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rowNumber', row_number,
        'field', field,
        'code', code,
        'message', message
      )
      order by row_number, field, code
    ),
    '[]'::jsonb
  )
  into v_errors
  from issues;

  if jsonb_array_length(v_errors) = 0 then
    with raw as (
      select
        item.ordinality::integer source_ordinal,
        (item.value->>'rowNumber')::integer row_number,
        btrim(item.value->>'firstName') first_name,
        btrim(item.value->>'lastName') last_name,
        nullif(btrim(item.value->>'preferredName'), '') preferred_name,
        nullif(btrim(item.value->>'grade'), '') grade,
        nullif(btrim(item.value->>'schoolName'), '') school_name
      from jsonb_array_elements(p_rows) with ordinality item(value, ordinality)
    ),
    normalized as (
      select
        r.*,
        sm.school_id
      from raw r
      left join lateral (
        select s.id school_id
        from public.schools s
        where r.school_name is not null
          and s.tenant_id = v_tenant_id
          and s.status = 'active'
          and lower(btrim(s.name)) = lower(r.school_name)
        order by s.id
        limit 1
      ) sm on true
    ),
    file_duplicate_rows as (
      select
        lower(first_name) first_name_key,
        lower(last_name) last_name_key,
        lower(coalesce(grade, '')) grade_key,
        school_id
      from normalized
      group by
        lower(first_name),
        lower(last_name),
        lower(coalesce(grade, '')),
        school_id
      having count(*) > 1
    ),
    warning_issues as (
      select
        n.row_number,
        'student'::text field,
        'possible_file_duplicate'::text code,
        format('Row %s may duplicate another row in this file.', n.row_number) message
      from normalized n
      join file_duplicate_rows d
        on d.first_name_key = lower(n.first_name)
       and d.last_name_key = lower(n.last_name)
       and d.grade_key = lower(coalesce(n.grade, ''))
       and d.school_id is not distinct from n.school_id

      union all

      select
        n.row_number,
        'student',
        'possible_existing_duplicate',
        format('Row %s may duplicate a student already in the roster.', n.row_number)
      from normalized n
      where exists (
        select 1
        from public.students s
        where s.tenant_id = v_tenant_id
          and lower(btrim(s.first_name)) = lower(n.first_name)
          and lower(btrim(s.last_name)) = lower(n.last_name)
          and lower(btrim(coalesce(s.grade, ''))) = lower(coalesce(n.grade, ''))
          and s.school_id is not distinct from n.school_id
      )
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rowNumber', row_number,
          'field', field,
          'code', code,
          'message', message
        )
        order by row_number, code
      ),
      '[]'::jsonb
    )
    into v_warnings
    from warning_issues;
  end if;

  if coalesce(p_commit, false)
     and jsonb_array_length(v_errors) = 0
     and jsonb_array_length(v_warnings) > 0
     and not coalesce(p_acknowledge_warnings, false) then
    v_errors := jsonb_build_array(jsonb_build_object(
      'rowNumber', 0,
      'field', 'warnings',
      'code', 'warnings_not_acknowledged',
      'message', 'Review and acknowledge possible duplicates before importing.'
    ));
  end if;

  if coalesce(p_commit, false) and jsonb_array_length(v_errors) = 0 then
    with raw as (
      select
        btrim(item.value->>'firstName') first_name,
        btrim(item.value->>'lastName') last_name,
        nullif(btrim(item.value->>'preferredName'), '') preferred_name,
        nullif(btrim(item.value->>'grade'), '') grade,
        nullif(btrim(item.value->>'schoolName'), '') school_name
      from jsonb_array_elements(p_rows) item(value)
    ),
    normalized as (
      select
        r.*,
        coalesce(sm.match_count, 0) school_match_count,
        sm.school_id
      from raw r
      left join lateral (
        select
          count(*)::integer match_count,
          (array_agg(s.id order by s.id))[1] school_id
        from public.schools s
        where r.school_name is not null
          and s.tenant_id = v_tenant_id
          and s.status = 'active'
          and lower(btrim(s.name)) = lower(r.school_name)
      ) sm on true
    )
    insert into public.students (
      tenant_id,
      school_id,
      first_name,
      last_name,
      preferred_name,
      grade,
      status
    )
    select
      v_tenant_id,
      n.school_id,
      n.first_name,
      n.last_name,
      n.preferred_name,
      n.grade,
      'active'
    from normalized n
    where n.school_name is null or n.school_match_count = 1;

    get diagnostics v_imported_count = row_count;
    if v_imported_count <> v_row_count then
      raise exception 'Student import validation changed before commit. No rows were saved.'
        using errcode = '40001';
    end if;
  end if;

  return jsonb_build_object(
    'rowCount', v_row_count,
    'importedCount', v_imported_count,
    'errors', v_errors,
    'warnings', v_warnings
  );
end;
$$;

revoke all on function public.admin_process_student_csv_import(jsonb, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_process_student_csv_import(jsonb, boolean, boolean)
  to authenticated;

comment on function public.admin_process_student_csv_import(jsonb, boolean, boolean) is
  'Tenant-admin-only student CSV preview/commit workflow. Tenant scope is '
  'derived from the active authenticated profile. Commits are atomic and '
  'create-only; no uploaded file or import history is retained.';
