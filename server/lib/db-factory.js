const { Client: PGClient } = require('pg');
const mysql = require('mysql2/promise');

class PostgresIntrospector {
  constructor(connectionString) {
    this.connectionString = connectionString;
  }

  async getMetadata() {
    const client = new PGClient({ connectionString: this.connectionString });
    await client.connect();
    try {
      const tables = await client.query(`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `);

      const functions = await client.query(`
        SELECT p.proname as function_name, pg_get_functiondef(p.oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
      `);

      const triggers = await client.query(`
        SELECT tgname as trigger_name, pg_get_triggerdef(t.oid) as definition
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public' AND tgisinternal = false
      `);

      return {
        tables: this.formatTables(tables.rows),
        functions: functions.rows,
        triggers: triggers.rows
      };
    } finally {
      await client.end();
    }
  }

  formatTables(rows) {
    const tables = {};
    rows.forEach(row => {
      if (!tables[row.table_name]) tables[row.table_name] = { columns: [] };
      tables[row.table_name].columns.push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES'
      });
    });
    return tables;
  }

  async execute(sql) {
    const client = new PGClient({ connectionString: this.connectionString });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  }
}

class MySQLIntrospector {
  constructor(config) {
    // config can be connection string or object
    this.config = config;
  }

  async getMetadata() {
    const connection = await mysql.createConnection(this.config);
    try {
      const [tables] = await connection.execute(`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        ORDER BY table_name, ordinal_position
      `);

      const [routines] = await connection.execute(`
        SELECT routine_name as name, routine_definition as definition, routine_type as type
        FROM information_schema.routines
        WHERE routine_schema = DATABASE()
      `);

      const [triggers] = await connection.execute(`
        SELECT trigger_name as name, action_statement as definition
        FROM information_schema.triggers
        WHERE trigger_schema = DATABASE()
      `);

      return {
        tables: this.formatTables(tables),
        functions: routines.filter(r => r.type === 'FUNCTION'),
        triggers: triggers
      };
    } finally {
      await connection.end();
    }
  }

  formatTables(rows) {
    const tables = {};
    rows.forEach(row => {
      if (!tables[row.table_name]) tables[row.table_name] = { columns: [] };
      tables[row.table_name].columns.push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES'
      });
    });
    return tables;
  }

  async execute(sql) {
    const connection = await mysql.createConnection(this.config);
    try {
      await connection.beginTransaction();
      // Split multi-statement SQL if needed, but for now execute as block
      await connection.query(sql);
      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.end();
    }
  }
}

function getIntrospector(type, config) {
  if (type === 'mysql') return new MySQLIntrospector(config);
  return new PostgresIntrospector(config);
}

module.exports = { getIntrospector };
