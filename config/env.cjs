"use strict";

// =====================================================
// ENVIRONMENT LOADER
// =====================================================
//
// All configuration comes from the single `.env` file.
//
// APP_ENV selects the active environment:
//   development | preprod | production
//   (short forms dev | prep | prod are accepted)
//
// Every setting is looked up with the environment prefix
// first and falls back to the un-prefixed name, so values
// shared by all environments only need to be written once:
//
//   PROD_DB_HOST=db.internal   <- used when APP_ENV=production
//   DB_HOST=localhost          <- used by any env without its own
//
// CommonJS so sequelize-cli (.sequelizerc) can require it too.

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const ENVIRONMENTS = {
    development: "DEV",
    preprod: "PREP",
    production: "PROD",
};

const ALIASES = {
    dev: "development",
    develop: "development",
    development: "development",
    prep: "preprod",
    preprod: "preprod",
    preproduction: "preprod",
    staging: "preprod",
    prod: "production",
    production: "production",
};

const rawEnv = String(
    process.env.APP_ENV || process.env.NODE_ENV || "development"
)
    .trim()
    .toLowerCase();

const APP_ENV = ALIASES[rawEnv];

if (!APP_ENV) {
    throw new Error(
        `Unknown APP_ENV "${rawEnv}". Use one of: development, preprod, production`
    );
}

const PREFIX = ENVIRONMENTS[APP_ENV];

const isSet = (value) => value !== undefined && value !== "";

/** Raw lookup for a specific environment prefix. */
const lookup = (prefix, key) => {
    const prefixed = process.env[`${prefix}_${key}`];

    if (isSet(prefixed)) {
        return prefixed;
    }

    const plain = process.env[key];

    return isSet(plain) ? plain : undefined;
};

const str = (key, defaultValue = undefined, prefix = PREFIX) => {
    const value = lookup(prefix, key);

    return value === undefined ? defaultValue : value;
};

const int = (key, defaultValue = undefined, prefix = PREFIX) => {
    const value = lookup(prefix, key);

    if (value === undefined) {
        return defaultValue;
    }

    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed)) {
        throw new Error(`${key} must be an integer, got "${value}"`);
    }

    return parsed;
};

const bool = (key, defaultValue = false, prefix = PREFIX) => {
    const value = lookup(prefix, key);

    if (value === undefined) {
        return defaultValue;
    }

    return /^(1|true|yes|on)$/i.test(String(value).trim());
};

const list = (key, defaultValue = [], prefix = PREFIX) => {
    const value = lookup(prefix, key);

    if (value === undefined) {
        return defaultValue;
    }

    return String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
};

const required = (key, prefix = PREFIX) => {
    const value = lookup(prefix, key);

    if (value === undefined) {
        throw new Error(
            `Missing required setting ${prefix}_${key} (or ${key}) in .env for APP_ENV=${APP_ENV}`
        );
    }

    return value;
};

module.exports = {
    APP_ENV,
    PREFIX,
    ENVIRONMENTS,
    isDev: APP_ENV === "development",
    isPreprod: APP_ENV === "preprod",
    isProd: APP_ENV === "production",
    str,
    int,
    bool,
    list,
    required,
};
