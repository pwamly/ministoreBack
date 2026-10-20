"use strict";

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import config from "./config/index.js";
import db from "./models/index.js";
import controller from "./controller/index.js";
import refreshtoken from "./auth/refreshtoken.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.disable("x-powered-by");

if (config.server.trustProxy) {
    app.set("trust proxy", 1);
}

// =====================================================
// CORS (origins from CORS_ORIGINS in .env)
// =====================================================

app.use(
    cors({
        origin(origin, callback) {
            // Same-origin requests, curl, Postman.
            if (!origin || config.cors.origins.includes(origin)) {
                return callback(null, true);
            }

            console.warn("CORS blocked:", origin);

            return callback(null, false);
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
    })
);

if (config.server.requestLogging) {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
        next();
    });
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// =====================================================
// ROUTES
// =====================================================

app.get("/health", async (req, res) => {
    try {
        await db.sequelize.authenticate();

        return res.json({ success: true, env: config.appEnv, database: "up" });
    } catch {
        return res.status(503).json({ success: false, env: config.appEnv, database: "down" });
    }
});

app.use("/", controller);

app.post("/refresh_token", refreshtoken);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
        path: req.originalUrl,
    });
});

app.use((err, req, res, next) => {
    console.error("SERVER ERROR:", err);

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({
        success: false,
        message: "Internal server error",
    });
});

// =====================================================
// START
// =====================================================

const { host, port, https: tls } = config.server;

const server = tls.enabled
    ? https.createServer(
          {
              key: fs.readFileSync(path.resolve(__dirname, tls.keyPath)),
              cert: fs.readFileSync(path.resolve(__dirname, tls.certPath)),
          },
          app
      )
    : http.createServer(app);

server.listen(port, host, () => {
    const scheme = tls.enabled ? "https" : "http";

    console.log(`[${config.appEnv}] API listening on ${scheme}://${host}:${port}  (db: ${config.db.database}@${config.db.host})`);
});

export default app;
