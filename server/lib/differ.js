function diffMetadata(source, target) {
  const scripts = [];

  // 1. Diff Tables
  for (const [key, sourceTable] of Object.entries(source.tables)) {
    const targetTable = target.tables[key];
    if (!targetTable) {
      // CREATE TABLE
      let sql = `CREATE TABLE ${sourceTable.schema}.${sourceTable.name} (\n`;
      sql += sourceTable.columns.map(c => {
        let col = `  ${c.name} ${c.type}`;
        if (!c.nullable) col += ' NOT NULL';
        if (c.default) col += ` DEFAULT ${c.default}`;
        return col;
      }).join(',\n');
      sql += '\n);';
      scripts.push({ type: 'create_table', name: key, sql });
    } else {
      // Compare columns
      sourceTable.columns.forEach(sourceCol => {
        const targetCol = targetTable.columns.find(c => c.name === sourceCol.name);
        if (!targetCol) {
          // ADD COLUMN
          let sql = `ALTER TABLE ${sourceTable.schema}.${sourceTable.name} ADD COLUMN ${sourceCol.name} ${sourceCol.type}`;
          if (!sourceCol.nullable) sql += ' NOT NULL';
          if (sourceCol.default) sql += ` DEFAULT ${sourceCol.default}`;
          sql += ';';
          scripts.push({ type: 'add_column', name: `${key}.${sourceCol.name}`, sql });
        } else {
          // Check for differences (type, nullable, default)
          if (sourceCol.type !== targetCol.type) {
             scripts.push({ 
               type: 'alter_column_type', 
               name: `${key}.${sourceCol.name}`, 
               sql: `ALTER TABLE ${sourceTable.schema}.${sourceTable.name} ALTER COLUMN ${sourceCol.name} TYPE ${sourceCol.type};` 
             });
          }
          // ... more column checks ...
        }
      });
    }
  }

  // 2. Diff Functions
  for (const [key, sourceFunc] of Object.entries(source.functions)) {
    const targetFunc = target.functions[key];
    if (!targetFunc || targetFunc.definition !== sourceFunc.definition) {
      scripts.push({
        type: 'upsert_function',
        name: key,
        sql: sourceFunc.definition + ';'
      });
    }
  }

  // 3. Diff Triggers
  for (const [key, sourceTrigger] of Object.entries(source.triggers)) {
    const targetTrigger = target.triggers[key];
    if (!targetTrigger || targetTrigger.definition !== sourceTrigger.definition) {
      if (targetTrigger) {
        scripts.push({
          type: 'drop_trigger',
          name: key,
          sql: `DROP TRIGGER IF EXISTS ${sourceTrigger.name} ON ${sourceTrigger.schema}.${sourceTrigger.table};`
        });
      }
      scripts.push({
        type: 'create_trigger',
        name: key,
        sql: sourceTrigger.definition + ';'
      });
    }
  }

  return scripts;
}

module.exports = { diffMetadata };
