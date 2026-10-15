// PostgREST advertises functions executable by the schema key's role. Reviewed
// migration contracts supplement functions omitted by that role's metadata and
// nullable arguments omitted even when the function itself is advertised.
const AUTHENTICATED_ONLY_FUNCTIONS = {
  // Prepared from 0121; retain the typed contract while adoption is pending.
  search_admin_trips: {
    properties: {
      p_from_date: { type: 'string', format: 'date', description: 'nullable', default: null },
      p_to_date: { type: 'string', format: 'date', description: 'nullable', default: null },
      p_status: { type: 'string', format: 'text', description: 'nullable', default: null },
      p_page: { type: 'integer', default: 1 },
      p_page_size: { type: 'integer', default: 25 },
    },
    required: new Set(),
  },
  get_guardian_delivery_preferences_v3: { properties: {}, required: new Set() },
  set_guardian_delivery_preferences_v3: {
    properties: { p_preferences: { type: 'object' } },
    required: new Set(['p_preferences']),
  },
  get_user_notification_detail: {
    properties: { p_id: { type: 'string', format: 'uuid' } },
    required: new Set(['p_id']),
  },
  get_support_directory: { properties: {}, required: new Set() },
  update_platform_support_contact: {
    properties: {
      p_display_name: { type: 'string', format: 'text' },
      p_email: { type: 'string', format: 'text' },
      p_phone: { type: 'string', format: 'text', description: 'nullable' },
      p_website_url: { type: 'string', format: 'text', description: 'nullable' },
      p_support_hours: { type: 'string', format: 'text', description: 'nullable' },
      p_instructions: { type: 'string', format: 'text', description: 'nullable' },
    },
    required: new Set([
      'p_display_name',
      'p_email',
      'p_phone',
      'p_website_url',
      'p_support_hours',
      'p_instructions',
    ]),
  },
  update_tenant_support_contact: {
    properties: {
      p_display_name: { type: 'string', format: 'text' },
      p_email: { type: 'string', format: 'text' },
      p_phone: { type: 'string', format: 'text', description: 'nullable' },
      p_website_url: { type: 'string', format: 'text', description: 'nullable' },
      p_support_hours: { type: 'string', format: 'text', description: 'nullable' },
      p_instructions: { type: 'string', format: 'text', description: 'nullable' },
    },
    required: new Set([
      'p_display_name',
      'p_email',
      'p_phone',
      'p_website_url',
      'p_support_hours',
      'p_instructions',
    ]),
  },
  admin_create_bus: {
    properties: {
      p_school_id: { type: 'string', format: 'uuid', description: 'nullable' },
      p_bus_number: { type: 'string', format: 'text' },
      p_fleet_number: { type: 'string', format: 'text' },
      p_license_plate: { type: 'string', format: 'text', description: 'nullable' },
      p_capacity: { type: 'integer', description: 'nullable' },
      p_status: { type: 'string', format: 'text', default: 'active' },
    },
    required: new Set([
      'p_school_id',
      'p_bus_number',
      'p_fleet_number',
      'p_license_plate',
      'p_capacity',
    ]),
  },
  admin_update_bus: {
    properties: {
      p_bus_id: { type: 'string', format: 'uuid' },
      p_school_id: { type: 'string', format: 'uuid', description: 'nullable' },
      p_fleet_number: { type: 'string', format: 'text' },
      p_license_plate: { type: 'string', format: 'text', description: 'nullable' },
      p_capacity: { type: 'integer', description: 'nullable' },
      p_status: { type: 'string', format: 'text' },
    },
    required: new Set([
      'p_bus_id',
      'p_school_id',
      'p_fleet_number',
      'p_license_plate',
      'p_capacity',
      'p_status',
    ]),
  },
  admin_update_bus_with_fleet_number: {
    properties: {
      p_bus_id: { type: 'string', format: 'uuid' },
      p_school_id: { type: 'string', format: 'uuid', description: 'nullable' },
      p_fleet_number: { type: 'string', format: 'text' },
      p_license_plate: { type: 'string', format: 'text', description: 'nullable' },
      p_capacity: { type: 'integer', description: 'nullable' },
      p_status: { type: 'string', format: 'text' },
    },
    required: new Set([
      'p_bus_id',
      'p_school_id',
      'p_fleet_number',
      'p_license_plate',
      'p_capacity',
      'p_status',
    ]),
  },
  enforce_new_password_policy: {
    properties: { p_password: { type: 'string', format: 'text' } },
    required: new Set(['p_password']),
  },
  is_current_user_session_active: { properties: {}, required: new Set() },
  get_guardian_student_stops: { properties: {}, required: new Set() },
  get_platform_tenant_billing_detail: {
    properties: { p_tenant_id: { type: 'string', format: 'uuid' } },
    required: new Set(['p_tenant_id']),
  },
  get_platform_tenant_billing_summaries: { properties: {}, required: new Set() },
  get_admin_buses_page: {
    properties: {
      p_page: { type: 'integer', default: 1 },
      p_page_size: { type: 'integer', default: 50 },
      p_search: { type: 'string', format: 'text', default: '' },
      p_status: { type: 'string', format: 'text', description: 'nullable', default: null },
      p_school_id: { type: 'string', format: 'uuid', description: 'nullable', default: null },
    },
    required: new Set(),
  },
  get_tenant_subscription: { properties: {}, required: new Set() },
  get_tenant_notification_settings: { properties: {}, required: new Set() },
  set_tenant_notification_delivery_enabled: {
    properties: { p_enabled: { type: 'boolean' } },
    required: new Set(['p_enabled']),
  },
  set_tenant_push_notifications_enabled: {
    properties: { p_enabled: { type: 'boolean' } },
    required: new Set(['p_enabled']),
  },
  record_student_record_access: {
    properties: { p_student_id: { type: 'string', format: 'uuid' } },
    required: new Set(['p_student_id']),
  },
  register_current_user_session: {
    properties: {
      p_device_label: { type: 'string', format: 'text' },
      p_user_agent: { type: 'string', format: 'text' },
    },
    required: new Set(),
  },
};

// PostgreSQL allows NULL for these parameters even though PostgREST's OpenAPI
// metadata describes only their scalar format.
const NULLABLE_FUNCTION_ARGUMENTS = new Set([
  'admin_renew_bus_route_assignment.p_effective_to',
  'admin_set_guardian_access_expiry.p_access_expires_at',
  'admin_update_bus_route_assignment.p_effective_to',
]);

function quoteProperty(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function indent(lines, spaces) {
  const prefix = ' '.repeat(spaces);
  return lines.map((line) => (line ? `${prefix}${line}` : line));
}

function jsonType(property, enums) {
  if (Array.isArray(property.enum) && property.enum.length > 0) {
    const enumName = property.format?.startsWith('public.')
      ? property.format.slice('public.'.length)
      : undefined;
    if (enumName) {
      enums.set(enumName, property.enum);
      return `Database["public"]["Enums"][${JSON.stringify(enumName)}]`;
    }
    return property.enum.map(JSON.stringify).join(' | ');
  }

  if (property.type === 'array') {
    return `Array<${jsonType(property.items ?? {}, enums)}>`;
  }
  if (property.type === 'boolean') return 'boolean';
  if (property.type === 'integer' || property.type === 'number') return 'number';
  if (property.type === 'string') return 'string';
  return 'Json';
}

function isNullableProperty(property, required, name) {
  if (!required.has(name)) return true;
  // PostgREST marks nullable columns as not required, but function arguments
  // may be required by PostgreSQL while still accepting SQL NULL.
  return property.description?.includes('nullable') ?? false;
}

function foreignKey(property) {
  const match = property.description?.match(
    /Foreign Key to `([^`.]+)\.([^`]+)`\.<fk table='([^']+)' column='([^']+)'\/>/,
  );
  if (!match) return undefined;
  return { referencedRelation: match[3], referencedColumn: match[4] };
}

function objectType(properties, required, enums, mode, nullableNames = new Set()) {
  const lines = ['{'];
  for (const [name, property] of Object.entries(properties)) {
    const isNullable = nullableNames.has(name) || isNullableProperty(property, required, name);
    const isOptional =
      mode === 'args'
        ? !required.has(name) || 'default' in property
        : mode !== 'row' && (mode === 'update' || isNullable || 'default' in property);
    const type = `${jsonType(property, enums)}${isNullable ? ' | null' : ''}`;
    lines.push(`  ${quoteProperty(name)}${isOptional ? '?' : ''}: ${type}`);
  }
  lines.push('}');
  return lines;
}

export function generateFromOpenApi(schema) {
  if (!schema || typeof schema !== 'object' || !schema.definitions || !schema.paths) {
    throw new Error('The Supabase schema endpoint returned invalid OpenAPI metadata.');
  }

  const enums = new Map();
  const tableBlocks = [];
  for (const tableName of Object.keys(schema.definitions).sort()) {
    const definition = schema.definitions[tableName];
    const properties = definition.properties ?? {};
    const required = new Set(definition.required ?? []);
    const relationships = [];
    for (const [column, property] of Object.entries(properties)) {
      const target = foreignKey(property);
      if (!target) continue;
      relationships.push({ column, ...target });
    }

    const block = [`${quoteProperty(tableName)}: {`];
    block.push('  Row: ' + objectType(properties, required, enums, 'row')[0]);
    block.push(...indent(objectType(properties, required, enums, 'row').slice(1), 2));
    block.push('  Insert: ' + objectType(properties, required, enums, 'insert')[0]);
    block.push(...indent(objectType(properties, required, enums, 'insert').slice(1), 2));
    block.push('  Update: ' + objectType(properties, required, enums, 'update')[0]);
    block.push(...indent(objectType(properties, required, enums, 'update').slice(1), 2));
    if (relationships.length === 0) {
      block.push('  Relationships: []');
    } else {
      block.push('  Relationships: [');
      for (const relationship of relationships) {
        block.push('    {');
        block.push(
          `      foreignKeyName: ${JSON.stringify(`${tableName}_${relationship.column}_fkey`)}`,
        );
        block.push(`      columns: [${JSON.stringify(relationship.column)}]`);
        block.push('      isOneToOne: false');
        block.push(`      referencedRelation: ${JSON.stringify(relationship.referencedRelation)}`);
        block.push(`      referencedColumns: [${JSON.stringify(relationship.referencedColumn)}]`);
        block.push('    },');
      }
      block.push('  ]');
    }
    block.push('}');
    tableBlocks.push(block);
  }

  const functions = new Map();
  for (const rpcPath of Object.keys(schema.paths).filter((entry) => entry.startsWith('/rpc/'))) {
    const operation = schema.paths[rpcPath].post ?? schema.paths[rpcPath].get ?? {};
    const body = operation.parameters?.find((parameter) => parameter.in === 'body')?.schema ?? {};
    functions.set(rpcPath.slice('/rpc/'.length), {
      properties: body.properties ?? {},
      required: new Set(body.required ?? []),
    });
  }
  for (const [functionName, definition] of Object.entries(AUTHENTICATED_ONLY_FUNCTIONS)) {
    if (!functions.has(functionName)) {
      functions.set(functionName, definition);
    }
  }

  const functionBlocks = [];
  for (const [functionName, definition] of [...functions].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const nullableArguments = new Set(
      [
        ...NULLABLE_FUNCTION_ARGUMENTS,
        ...Object.entries(AUTHENTICATED_ONLY_FUNCTIONS[functionName]?.properties ?? {})
          .filter(([, property]) => property.description?.includes('nullable'))
          .map(([name]) => `${functionName}.${name}`),
      ]
        .filter((entry) => entry.startsWith(`${functionName}.`))
        .map((entry) => entry.slice(functionName.length + 1)),
    );
    const block = [`${quoteProperty(functionName)}: {`];
    block.push(
      '  Args: ' +
        objectType(definition.properties, definition.required, enums, 'args', nullableArguments)[0],
    );
    block.push(
      ...indent(
        objectType(
          definition.properties,
          definition.required,
          enums,
          'args',
          nullableArguments,
        ).slice(1),
        2,
      ),
    );
    // OpenAPI does not include PostgreSQL function return schemas. Unknown
    // forces callers to validate or explicitly narrow each application RPC.
    block.push('  Returns: unknown');
    block.push('}');
    functionBlocks.push(block);
  }

  const enumBlocks = [...enums.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, values]) => `${quoteProperty(name)}: ${values.map(JSON.stringify).join(' | ')}`);

  const lines = [
    '// This file is generated. Do not edit it by hand.',
    '// Run `pnpm types:generate` against the authoritative hosted Supabase schema.',
    '',
    'export type Json =',
    '  | string',
    '  | number',
    '  | boolean',
    '  | null',
    '  | { [key: string]: Json | undefined }',
    '  | Json[]',
    '',
    'export interface Database {',
    '  public: {',
    '    Tables: {',
    ...tableBlocks.flatMap((block) => indent(block, 6)),
    '    }',
    '    Views: {',
    '      [_ in never]: never',
    '    }',
    '    Functions: {',
    ...functionBlocks.flatMap((block) => indent(block, 6)),
    '    }',
    '    Enums: {',
    ...indent(enumBlocks, 6),
    '    }',
    '    CompositeTypes: {',
    '      [_ in never]: never',
    '    }',
    '  }',
    '}',
    '',
  ];
  return lines.join('\n');
}
