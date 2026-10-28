"use strict";

// =====================================================
// APPLICATION CONFIG
// =====================================================
//
// The only place the app reads process.env. Everything else
// imports from here. See .env.example for every setting.

import env from "./env.cjs";
import database from "./database.cjs";

const { APP_ENV, isDev, isProd, str, int, bool, list, required } = env;

// In preprod/prod a missing secret must stop the server,
// in development we fall back to throwaway values.
const secret = (key) =>
    isDev ? str(key, `dev-only-${key.toLowerCase()}`) : required(key);

const config = {
    appEnv: APP_ENV,
    isDev,
    isProd,

    server: {
        host: str("HOST", "0.0.0.0"),
        port: int("PORT", 5000),
        // Set when running behind nginx / a load balancer so
        // secure cookies and client IPs work.
        trustProxy: bool("TRUST_PROXY", !isDev),
        https: {
            // Defaults to on: the server has always served HTTPS itself.
            enabled: bool("HTTPS_ENABLED", true),
            keyPath: str("SSL_KEY_PATH", "cert/server.key"),
            certPath: str("SSL_CERT_PATH", "cert/server.crt"),
        },
        requestLogging: bool("REQUEST_LOGGING", isDev),
    },

    cors: {
        origins: list("CORS_ORIGINS", ["http://localhost:3000", "https://localhost:3000"]),
    },

    auth: {
        accessTokenSecret: secret("ACCESSTOKEN_SECRETE"),
        refreshTokenSecret: secret("REFRESHTOKEN_SECRETE"),
        recoverySecret: secret("RECOVERY_SECRETE"),
        // Logout/disable is enforced per request (token_version), so a
        // long access token is not a revocation risk.
        accessTokenTtl: str("ACCESS_TOKEN_TTL", "300m"),
        refreshTokenTtl: str("REFRESH_TOKEN_TTL", "7d"),
        bcryptRounds: int("BCRYPT_ROUNDS", 12),
        cookie: {
            name: "jto",
            secure: bool("COOKIE_SECURE", !isDev),
            sameSite: str("COOKIE_SAMESITE", "lax"),
            domain: str("COOKIE_DOMAIN", undefined),
            path: "/",
        },
    },

    saas: {
        // Lets anyone create a new store (tenant + owner) from /auth/register.
        allowPublicSignup: bool("ALLOW_PUBLIC_SIGNUP", false),
        defaultPlanCode: str("DEFAULT_PLAN_CODE", "starter"),
        trialDays: int("TRIAL_DAYS", 14),
        // Days a tenant keeps working after its subscription end date.
        graceDays: int("SUBSCRIPTION_GRACE_DAYS", 3),
        defaultCurrency: str("DEFAULT_CURRENCY", "TZS"),
    },

    // Subscription payments (services/payments). Billing endpoints
    // answer 503 until the provider credentials are set.
    payments: {
        clickpesa: {
            baseUrl: str("CLICKPESA_BASE_URL", "https://api.clickpesa.com/third-parties"),
            clientId: str("CLICKPESA_CLIENT_ID", undefined),
            apiKey: str("CLICKPESA_API_KEY", undefined),
            // Only needed when checksum is enabled on the ClickPesa account.
            checksumKey: str("CLICKPESA_CHECKSUM_KEY", undefined),
        },
    },

    db: database[APP_ENV],
};

if (!config.db.database || !config.db.username) {
    throw new Error(
        `Database is not configured for APP_ENV=${APP_ENV}: set ${env.PREFIX}_DB_NAME and ${env.PREFIX}_DB_USERNAME (or DB_NAME / DB_USERNAME) in .env`
    );
}

export default config;
