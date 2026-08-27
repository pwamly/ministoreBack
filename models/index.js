"use strict";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import process from "process";
import Sequelize from "sequelize";

const { DataTypes } = Sequelize;

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const basename =
    path.basename(__filename);

const env =
    process.env.NODE_ENV || "development";

const config =
    (
        await import("../config/config.json", {
            with: {
                type: "json",
            },
        })
    ).default[env];

const db = {};

let sequelize;

// =====================================================
// DATABASE
// =====================================================

if (config.use_env_variable) {

    sequelize =
        new Sequelize.Sequelize(
            process.env[
                config.use_env_variable
            ],
            config
        );

} else {

    sequelize =
        new Sequelize.Sequelize(
            config.database,
            config.username,
            config.password,
            config
        );
}

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

        console.log(
            `Loading model: ${file}`
        );

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

        console.log(
            `Model loaded: ${model.name}`
        );

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

console.log(
    "\nLoaded models:"
);

console.log(
    Object.keys(db)
);

// =====================================================
// ASSOCIATIONS
// =====================================================

console.log(
    "\nSetting up associations..."
);

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

            console.log(
                `Associating: ${modelName}`
            );

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
// DEBUG ASSOCIATIONS
// =====================================================

console.log(
    "\nProduct associations:"
);

if (db.product) {

    console.log(
        Object.keys(
            db.product.associations
        )
    );
}

// =====================================================
// EXPORT
// =====================================================

export {
    db
};

export default db;
