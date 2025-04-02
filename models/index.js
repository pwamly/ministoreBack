"use strict";

import fs from "fs";  // Import 'fs' using ES module syntax
import { Sequelize } from "sequelize";  // Import Sequelize (example of named import)
import dotenv from "dotenv";  // ES Module import
import vehiclehistory from './vehiclehistory.js';
import vehiclereports from './vehiclereports.js';
import nb_user from "./nb_user.js";
import { fileURLToPath } from "url";
import path from "path";
import allDbConfig from "../config/database.js";  // Import default export
import { getString } from "../utils/env.js";  // Import named export

dotenv.config();  // Load environment variables from .env file

// Get the current module's filename (equivalent to __filename)
const __filename = fileURLToPath(import.meta.url);

// Get the base name of the current module
const basename = path.basename(__filename);

const targetEnv = getString("NODE_ENV");
const config = allDbConfig[targetEnv];
const db = {};

let sequelize;
if (config.use_env_variable) {
    sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
    sequelize = new Sequelize(
        config.database,
        config.username,
        config.password,
        config
    );
}

// Get the directory name equivalent (like __dirname)
const __dirname = path.dirname(__filename);

fs.readdirSync(__dirname)
    .filter((file) => {
        return (
            file.indexOf(".") !== 0 && file !== basename && file.slice(-3) === ".js"
        );
    })
    .forEach(async (file) => {
        // Use dynamic import for each model instead of require
        const model = (await import(path.join(__dirname, file))).default(
            sequelize,
            Sequelize.DataTypes
        );
        db[model.name] = model;
    });

Object.keys(db).forEach((modelName) => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

// CommonJS export
export { nb_user, vehiclereports, vehiclehistory, db };
