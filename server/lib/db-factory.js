const { Client: PGClient } = require('pg');
const mysql = require('mysql2/promise');
const mssql = require('mssql');

class PostgresIntrospector {
  constructor(config) {
    this.config = config;
  }

  async getMetadata() {
    const client = new PGClient(this.config);
    await client.connect();
    try {
      const tables = await client.query(`
        SELECT table_schema, table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY table_name, ordinal_position
      `);

      const functions = await client.query(`
        SELECT p.proname as function_name, pg_get_functiondef(p.oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname NOT IN ('information_schema', 'pg_catalog')
      `);

      return {
        tables: this.formatTables(tables.rows),
        functions: functions.rows,
        triggers: []
      };
    } finally {
      await client.end();
    }
  }

  formatTables(rows) {
    const tables = {};
    rows.forEach(row => {
      const key = `${row.table_schema}.${row.table_name}`;
      if (!tables[key]) tables[key] = { columns: [] };
      tables[key].columns.push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES'
      });
    });
    return tables;
  }

  async execute(sql) {
    const client = new PGClient(this.config);
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

      return {
        tables: this.formatTables(tables),
        functions: [],
        triggers: []
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

class MSSQLIntrospector {
  constructor(config) {
    this.config = config;
  }

  async getMetadata() {
    const pool = await mssql.connect(this.config);
    try {
      const result = await pool.request().query(`
        SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA NOT IN ('information_schema', 'sys')
      `);

      return {
        tables: this.formatTables(result.recordset),
        functions: [],
        triggers: []
      };
    } finally {
      await pool.close();
    }
  }

  formatTables(rows) {
    const tables = {};
    rows.forEach(row => {
      const key = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`;
      if (!tables[key]) tables[key] = { columns: [] };
      tables[key].columns.push({
        name: row.COLUMN_NAME,
        type: row.DATA_TYPE,
        nullable: row.IS_NULLABLE === 'YES'
      });
    });
    return tables;
  }

  async execute(sql) {
    const pool = await mssql.connect(this.config);
    try {
      const transaction = new mssql.Transaction(pool);
      await transaction.begin();
      await transaction.request().query(sql);
      await transaction.commit();
      return { success: true };
    } catch (error) {
      throw error;
    } finally {
      await pool.close();
    }
  }
}

function getIntrospector(type, config) {
  if (type === 'mysql') return new MySQLIntrospector(config);
  if (type === 'mssql') return new MSSQLIntrospector(config);
  return new PostgresIntrospector(config);
}

module.exports = { getIntrospector };
