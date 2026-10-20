"use strict";

// Migration helpers.
//
// MySQL only accepts a foreign key when both columns have exactly
// the same type, character set and collation. Older tables may use
// a different charset/collation than tables created today (e.g.
// MariaDB dump on MySQL 8, or a server with another default), so
// foreign keys to existing tables are added by copying the
// referenced column's definition first.

/** "CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin" for table.column. */
export const columnSpec = async (queryInterface, table, column) => {
    const [[row]] = await queryInterface.sequelize.query(
        `SELECT COLUMN_TYPE AS type, CHARACTER_SET_NAME AS charset, COLLATION_NAME AS collation
           FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name = :table AND column_name = :column`,
        { replacements: { table, column } }
    );

    if (!row) {
        throw new Error(`Column ${table}.${column} not found`);
    }

    return row.charset ? `${row.type} CHARACTER SET ${row.charset} COLLATE ${row.collation}` : row.type;
};

/**
 * Make table.column match refTable.refColumn exactly, then add the
 * foreign key. The column must already exist (any type).
 */
export const addForeignKey = async (
    queryInterface,
    { table, column, refTable, refColumn = "id", allowNull = true, onDelete = "RESTRICT", onUpdate = "CASCADE", name }
) => {
    const spec = await columnSpec(queryInterface, refTable, refColumn);

    await queryInterface.sequelize.query(
        `ALTER TABLE \`${table}\` MODIFY \`${column}\` ${spec} ${allowNull ? "NULL" : "NOT NULL"}`
    );

    await queryInterface.addConstraint(table, {
        fields: [column],
        type: "foreign key",
        name: name || `${table}_${column}_fk`,
        references: { table: refTable, field: refColumn },
        onDelete,
        onUpdate,
    });
};

/** Drop every foreign key on table.column, whatever its name. */
export const dropForeignKeysOn = async (queryInterface, table, column) => {
    const [rows] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME AS name
           FROM information_schema.KEY_COLUMN_USAGE
          WHERE table_schema = DATABASE() AND table_name = :table AND column_name = :column
            AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { replacements: { table, column } }
    );

    for (const { name } of rows) {
        await queryInterface.removeConstraint(table, name);
    }
};
