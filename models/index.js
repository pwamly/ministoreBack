"use strict";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Sequelize from "sequelize";

import config from "../config/index.js";

const { DataTypes } = Sequelize;

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const basename =
    path.basename(__filename);

const db = {};

let sequelize;


// =====================================================
// DATABASE
// =====================================================

sequelize =
    new Sequelize.Sequelize(
        config.db.database,
        config.db.username,
        config.db.password,
        config.db
    );

// =====================================================
// LOAD MODELS
// =====================================================

const files = fs
    .readdirSync(__dirname)
    .filter((file) => {

        return (
            file.indexOf(".") !== 0 &&
            file !== basename &&
            file.endsWith(".js") &&
            !file.endsWith(".test.js")
        );

    });

for (const file of files) {

    try {

        const module =
            await import(
                path.join(__dirname, file)
            );

        const modelFactory =
            module.default;

        if (
            typeof modelFactory !==
            "function"
        ) {
            console.log(
                `Skipping ${file}`
            );

            continue;
        }

        const model =
            modelFactory(
                sequelize,
                DataTypes
            );

        db[model.name] =
            model;

    } catch (error) {

        console.error(
            `FAILED TO LOAD ${file}`
        );

        console.error(error);

        process.exit(1);
    }
}

// =====================================================
// CHECK MODELS
// =====================================================


// =====================================================
// ASSOCIATIONS
// =====================================================

for (
    const modelName of Object.keys(db)
) {

    const model =
        db[modelName];

    if (
        typeof model.associate ===
        "function"
    ) {

        try {

            model.associate(db);

        } catch (error) {

            console.error(
                `Association failed: ${modelName}`
            );

            console.error(error);

            process.exit(1);
        }
    }
}

// =====================================================
// DATABASE
// =====================================================

db.sequelize =
    sequelize;

db.Sequelize =
    Sequelize;

// =====================================================
// EXPORT
// =====================================================

export {
    db
};

export default db;
