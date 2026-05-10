const { Client } = require('pg');

async function getMetadata(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const tables = await getTables(client);
    const functions = await getFunctions(client);
    const triggers = await getTriggers(client);
    return { tables, functions, triggers };
  } finally {
    await client.end();
  }
}

async function getTables(client) {
  const res = await client.query(`
    SELECT 
      table_schema, 
      table_name, 
      column_name, 
      data_type, 
      is_nullable, 
      column_default
    FROM information_schema.columns
    WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'extensions')
    ORDER BY table_schema, table_name, ordinal_position;
  `);
  
  // Group by table
  const tables = {};
  res.rows.forEach(row => {
    const key = `${row.table_schema}.${row.table_name}`;
    if (!tables[key]) tables[key] = { schema: row.table_schema, name: row.table_name, columns: [] };
    tables[key].columns.push({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      default: row.column_default
    });
  });
  return tables;
}

async function getFunctions(client) {
  const res = await client.query(`
    SELECT 
      n.nspname as schema,
      p.proname as name,
      pg_get_functiondef(p.oid) as definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'extensions')
    AND p.prokind = 'f';
  `);
  
  const functions = {};
  res.rows.forEach(row => {
    const key = `${row.schema}.${row.name}`;
    functions[key] = {
      schema: row.schema,
      name: row.name,
      definition: row.definition
    };
  });
  return functions;
}

async function getTriggers(client) {
  const res = await client.query(`
    SELECT 
      n.nspname as schema,
      t.relname as table,
      tr.tgname as name,
      pg_get_triggerdef(tr.oid) as definition
    FROM pg_trigger tr
    JOIN pg_class t ON tr.tgrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'extensions')
    AND tr.tgisinternal = false;
  `);
  
  const triggers = {};
  res.rows.forEach(row => {
    const key = `${row.schema}.${row.table}.${row.name}`;
    triggers[key] = {
      schema: row.schema,
      table: row.table,
      name: row.name,
      definition: row.definition
    };
  });
  return triggers;
}

module.exports = { getMetadata };
