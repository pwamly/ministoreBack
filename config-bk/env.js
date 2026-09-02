import dotenv from "dotenv";

dotenv.config();

export const getString = (
    attr,
    defaultValue = null
) => {
    return process.env[attr] || defaultValue;
};
