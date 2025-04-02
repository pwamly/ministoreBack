import dotenv from "dotenv";
dotenv.config();

const env = process.env;

module.exports.get = (attr, defaultValue = null) => env[attr] || defaultValue;