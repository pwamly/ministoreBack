"use strict";

// =====================================================
// DATABASE CONFIG (shared by the app and sequelize-cli)
// =====================================================
//
// One entry per APP_ENV. Values come from .env, e.g.
// DEV_DB_HOST / PREP_DB_HOST / PROD_DB_HOST, falling back
// to DB_HOST when the prefixed name is not set.

const { ENVIRONMENTS, APP_ENV, str, int, bool } = require("./env.cjs");

const build = (prefix) => ({
    username: str("DB_USERNAME", undefined, prefix),
    password: str("DB_PASSWORD", null, prefix),
    database: str("DB_NAME", undefined, prefix),
    host: str("DB_HOST", "127.0.0.1", prefix),
    port: int("DB_PORT", 3306, prefix),
    dialect: str("DB_DIALECT", "mysql", prefix),
    // Existing rows were written in UTC; only change this on a fresh DB.
    timezone: str("DB_TIMEZONE", "+00:00", prefix),
    logging: bool("DB_LOGGING", false, prefix) ? console.log : false,
    pool: {
        max: int("DB_POOL_MAX", 10, prefix),
        min: 0,
        acquire: 30000,
        idle: 10000,
    },
    migrationStorageTableName: "SequelizeMeta",
});

const configs = {};

for (const [name, prefix] of Object.entries(ENVIRONMENTS)) {
    configs[name] = build(prefix);
}

module.exports = configs;
module.exports.current = configs[APP_ENV];
