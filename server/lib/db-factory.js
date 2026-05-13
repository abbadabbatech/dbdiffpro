const { Client: PGClient } = require('pg');
const mysql = require('mysql2/promise');
const mssql = require('mssql');

function splitTableName(tableName) {
  if (tableName.includes('.')) {
    const parts = tableName.split('.');
    return { schema: parts[0], table: parts[1] };
  }
  return { schema: 'public', table: tableName };
}

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

  async getRowCount(tableName) {
    const { schema, table } = splitTableName(tableName);
    const client = new PGClient(this.config);
    await client.connect();
    try {
      const res = await client.query(`SELECT count(*) FROM "${schema}"."${table}"`);
      return parseInt(res.rows[0].count, 10);
    } finally {
      await client.end();
    }
  }

  async fetchDataBatch(tableName, limit, offset) {
    const { schema, table } = splitTableName(tableName);
    const client = new PGClient(this.config);
    await client.connect();
    try {
      const res = await client.query(`SELECT * FROM "${schema}"."${table}" LIMIT $1 OFFSET $2`, [limit, offset]);
      return res.rows;
    } finally {
      await client.end();
    }
  }

  async truncateTable(tableName) {
    const { schema, table } = splitTableName(tableName);
    const client = new PGClient(this.config);
    await client.connect();
    try {
      await client.query(`TRUNCATE TABLE "${schema}"."${table}" CASCADE`);
    } finally {
      await client.end();
    }
  }

  async insertDataBatch(tableName, rows, strategy) {
    if (!rows || rows.length === 0) return;
    const { schema, table } = splitTableName(tableName);
    const client = new PGClient(this.config);
    await client.connect();
    
    try {
      const columns = Object.keys(rows[0]);
      const colString = columns.map(c => `"${c}"`).join(', ');
      
      let valuesString = '';
      let values = [];
      let paramIndex = 1;
      
      rows.forEach((row, rowIndex) => {
        const rowParams = [];
        columns.forEach(col => {
          rowParams.push(`$${paramIndex++}`);
          values.push(row[col]);
        });
        valuesString += `(${rowParams.join(', ')})${rowIndex < rows.length - 1 ? ', ' : ''}`;
      });

      let query = `INSERT INTO "${schema}"."${table}" (${colString}) VALUES ${valuesString}`;
      
      if (strategy === 'ignore') {
        query += ' ON CONFLICT DO NOTHING';
      }

      await client.query('BEGIN');
      await client.query(query, values);
      await client.query('COMMIT');
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

  async getRowCount(tableName) {
    const connection = await mysql.createConnection(this.config);
    try {
      const [rows] = await connection.query(`SELECT count(*) as count FROM \`${tableName}\``);
      return rows[0].count;
    } finally {
      await connection.end();
    }
  }

  async fetchDataBatch(tableName, limit, offset) {
    const connection = await mysql.createConnection(this.config);
    try {
      const [rows] = await connection.query(`SELECT * FROM \`${tableName}\` LIMIT ? OFFSET ?`, [limit, offset]);
      return rows;
    } finally {
      await connection.end();
    }
  }

  async truncateTable(tableName) {
    const connection = await mysql.createConnection(this.config);
    try {
      await connection.query(`TRUNCATE TABLE \`${tableName}\``);
    } finally {
      await connection.end();
    }
  }

  async insertDataBatch(tableName, rows, strategy) {
    if (!rows || rows.length === 0) return;
    const connection = await mysql.createConnection(this.config);
    
    try {
      const columns = Object.keys(rows[0]);
      const colString = columns.map(c => `\`${c}\``).join(', ');
      
      let valuesString = '';
      let values = [];
      
      rows.forEach((row, rowIndex) => {
        const rowParams = new Array(columns.length).fill('?');
        columns.forEach(col => values.push(row[col]));
        valuesString += `(${rowParams.join(', ')})${rowIndex < rows.length - 1 ? ', ' : ''}`;
      });

      let query = `${strategy === 'ignore' ? 'INSERT IGNORE' : 'INSERT'} INTO \`${tableName}\` (${colString}) VALUES ${valuesString}`;

      await connection.beginTransaction();
      await connection.query(query, values);
      await connection.commit();
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

  async getRowCount(tableName) {
    const { schema, table } = splitTableName(tableName);
    const pool = await mssql.connect(this.config);
    try {
      const result = await pool.request().query(`SELECT count(*) as count FROM [${schema}].[${table}]`);
      return result.recordset[0].count;
    } finally {
      await pool.close();
    }
  }

  async fetchDataBatch(tableName, limit, offset) {
    const { schema, table } = splitTableName(tableName);
    const pool = await mssql.connect(this.config);
    try {
      // MSSQL Requires ORDER BY to use OFFSET. Using (SELECT NULL) if no natural order.
      const result = await pool.request()
        .input('limit', mssql.Int, limit)
        .input('offset', mssql.Int, offset)
        .query(`SELECT * FROM [${schema}].[${table}] ORDER BY (SELECT NULL) OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
      return result.recordset;
    } finally {
      await pool.close();
    }
  }

  async truncateTable(tableName) {
    const { schema, table } = splitTableName(tableName);
    const pool = await mssql.connect(this.config);
    try {
      await pool.request().query(`TRUNCATE TABLE [${schema}].[${table}]`);
    } finally {
      await pool.close();
    }
  }

  async insertDataBatch(tableName, rows, strategy) {
    if (!rows || rows.length === 0) return;
    const { schema, table } = splitTableName(tableName);
    const pool = await mssql.connect(this.config);
    
    // For MSSQL, to avoid 2100 parameter limits, we use row-by-row in a transaction for batches of 500
    try {
      const columns = Object.keys(rows[0]);
      const colString = columns.map(c => `[${c}]`).join(', ');
      
      const transaction = new mssql.Transaction(pool);
      await transaction.begin();
      
      for (const row of rows) {
        try {
            const request = new mssql.Request(transaction);
            const paramNames = [];
            columns.forEach((col, i) => {
              const paramName = `p${i}`;
              paramNames.push(`@${paramName}`);
              request.input(paramName, row[col]);
            });
            
            const query = `INSERT INTO [${schema}].[${table}] (${colString}) VALUES (${paramNames.join(', ')})`;
            await request.query(query);
        } catch (err) {
            // Ignore PK violations if strategy is ignore
            if (strategy === 'ignore' && err.number === 2627) {
                continue; // 2627 is Violation of PRIMARY KEY constraint
            }
            throw err;
        }
      }
      
      await transaction.commit();
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
