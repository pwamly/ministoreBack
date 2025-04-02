/**
 * Get string value from environment variables
 *
 * @param {string} variable - variable name
 * @param {string} [defaultValue] - default value if variable name does not exist
 * @returns {string} returns value under the variable.
 */
export const getString = (variable, defaultVal = null) =>
    process.env[variable] || defaultVal;

/**
 * Get integer value from environment variables
 *
 * @param {string} variable - name of the variable
 * @param {string} [defaultValue] - default value if variable does not exist
 * @param {number} returned value if variable is found and is integer. Otherwise
 *        the function will return `NaN`
 */
export const getInt = (variable, defaultVal = NaN) =>
    1 * process.env[variable] || defaultVal;

/**
 * Get float value from environment variables
 *
 * @param {string} variable - name of the variable
 * @param {string} [defaultValue] - default value if variable does not exist
 * @param {number} returned value if variable is found and a float. Otherwise
 *        the function will return `NaN`
 */
export const getFloat = (variable, defaultVal = NaN) =>
    parseFloat(process.env[variable]) || defaultVal;

/**
 * Returns true if we're in dev mode
 *
 * @returns {boolean}
 */
export const isDev = () => /development/i.test(getString("NODE_ENV"));

/** Returns true if we're in test mode */
export const isTest = () => /test/i.test(getString("NODE_ENV"));
