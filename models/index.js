"use strict";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import process from "process";
import Sequelize from "sequelize";

const { DataTypes } = Sequelize;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const basename = path.basename(__filename);
const env = process.env.NODE_ENV || "development";

const config = (
    await import("../config/config.json", {
        with: { type: "json" },
    })
).default[env];

const db = {};

let sequelize;

if (config.use_env_variable) {
    sequelize = new Sequelize.Sequelize(
        process.env[config.use_env_variable],
        config
    );
} else {
    sequelize = new Sequelize.Sequelize(
        config.database,
        config.username,
        config.password,
        config
    );
}

/*
 * Load all models
 */
const files = fs
    .readdirSync(__dirname)
    .filter((file) => {
        return (
            file.indexOf(".") !== 0 &&
            file !== basename &&
            file.slice(-3) === ".js" &&
            file.indexOf(".test.js") === -1
        );
    });

for (const file of files) {
    const filePath = path.join(__dirname, file);

    const module = await import(filePath);

    const modelFactory = module.default;

    if (typeof modelFactory === "function") {
        const model = modelFactory(sequelize, DataTypes);

        db[model.name] = model;

        console.log(
            `Model loaded: ${model.name}`,
            typeof model.validateAndGet === "function"
                ? "validateAndGet ✓"
                : ""
        );
    }
}

/*
 * Setup associations
 */
Object.keys(db).forEach((modelName) => {
    if (
        db[modelName] &&
        typeof db[modelName].associate === "function"
    ) {
        db[modelName].associate(db);
    }
});

/*
 * Sequelize references
 */
db.sequelize = sequelize;
db.Sequelize = Sequelize;

export { db };
export default db;
