-- Forward search correction. Retain the original authority source and names.
-- Alias provenance: config/authority-directory-search-aliases.json.
-- Prepared for protected review/rehearsal/release; never apply directly.
alter table safebus_private.authority_reference_directory
  add column search_aliases text[] not null default '{}'::text[]
  check (cardinality(search_aliases) <= 20);

do $$
begin
  if (select count(*) from safebus_private.authority_reference_directory d
    join (values
      ('0110','The Edmonton Catholic Separate School Division'),
      ('1190','The Rocky View School Division'),
      ('3020','The Edmonton School Division'),
      ('3030','The Calgary School Division')
    ) expected(code,name) on d.authority_code=expected.code and d.official_name=expected.name) <> 4 then
    raise exception 'Reviewed authority identities changed. Reconcile aliases before release.';
  end if;
end;
$$;

update safebus_private.authority_reference_directory d set search_aliases=verified.aliases
from (values
  ('0110',array['Edmonton Catholic Schools']::text[]),
  ('1190',array['Rocky View Schools','RVS']::text[]),
  ('3020',array['Edmonton Public Schools']::text[]),
  ('3030',array['Calgary Board of Education','CBE']::text[])
) verified(code,aliases) where d.authority_code=verified.code;

create or replace function public.search_authority_reference_directory(p_query text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_query text; v_tokens text[];
begin
  if (select auth.uid()) is null or safebus_private.is_platform_super_admin() is distinct from true
    or public.is_current_user_session_active() is distinct from true then
    raise exception 'Only an active platform administrator can search authorities.' using errcode = '42501';
  end if;
  perform safebus_private.enforce_mfa_if_required();
  if p_query is null or length(btrim(p_query)) < 2 then return '[]'::jsonb; end if;
  if length(p_query) > 100 then raise exception 'Search is too long.' using errcode = '22023'; end if;
  v_query := btrim(regexp_replace(lower(p_query),'[^[:alnum:]]+',' ','g'));
  if length(v_query) < 2 then return '[]'::jsonb; end if;
  v_tokens := regexp_split_to_array(v_query,'[[:space:]]+');

  return coalesce((
    with normalized as (
      select d.*,
        btrim(regexp_replace(lower(d.official_name),'[^[:alnum:]]+',' ','g')) as name_text,
        btrim(regexp_replace(lower(coalesce(d.city,'')),'[^[:alnum:]]+',' ','g')) as city_text,
        coalesce((select array_agg(btrim(regexp_replace(lower(alias),'[^[:alnum:]]+',' ','g')))
          from unnest(d.search_aliases) alias),'{}'::text[]) as alias_texts
      from safebus_private.authority_reference_directory d where d.available
    ), matched as (
      select n.*,regexp_replace(n.name_text,'^the ','') as sort_name,
        case
          when n.authority_code=v_query then 0
          when n.name_text=v_query or v_query=any(n.alias_texts) then 1
          when position(v_query in n.name_text)=1
            or position(v_query in regexp_replace(n.name_text,'^the ',''))=1
            or position(v_query in n.authority_code)=1
            or exists(select 1 from unnest(n.alias_texts) a where position(v_query in a)=1) then 2
          when not exists(select 1 from unnest(v_tokens) token
            where position(token in n.name_text||' '||array_to_string(n.alias_texts,' '))=0) then 3
          else 4
        end as match_rank
      from normalized n
      where not exists(select 1 from unnest(v_tokens) token
        where position(token in n.authority_code||' '||n.name_text||' '||array_to_string(n.alias_texts,' ')||' '||n.city_text)=0)
    ), page as (
      select * from matched order by match_rank,sort_name,authority_code limit 20
    )
    select jsonb_agg(jsonb_build_object(
      'authorityCode',p.authority_code,'officialName',p.official_name,
      'aliases',p.search_aliases,
      'authorityCategory',p.authority_category,'address',p.address,'city',p.city,
      'province',p.province,'postalCode',p.postal_code,'email',p.email,'phone',p.phone,
      'websiteUrl',p.website_url,'sourceExtractDate',p.source_extract_date,
      'importedAt',p.imported_at,'sourceUrl',p.source_url,
      'alreadyLinked',exists(select 1 from public.tenants t where t.authority_code=p.authority_code)
    ) order by p.match_rank,p.sort_name,p.authority_code) from page p
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.search_authority_reference_directory(text)
  from public,anon,authenticated,service_role;
grant execute on function public.search_authority_reference_directory(text) to authenticated;
