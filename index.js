"use strict";

import dotenv from "dotenv";
import express from "express";
import controller from "./controller/index.js";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import refreshtoken from "./auth/refreshtoken.js";
import cors from "cors";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;

// =====================================================
// HTTPS
// =====================================================

const options = {
  key: fs.readFileSync(path.join(__dirname, "cert", "server.key")),

  cert: fs.readFileSync(path.join(__dirname, "cert", "server.crt")),
};

// =====================================================
// CORS
// =====================================================

const allowedOrigins = [
  "https://192.168.1.173:3000",
  "http://192.168.1.173:3000",
  "https://localhost:3000",
  "http://localhost:3000",
  "https://192.168.1.173:3000",
  "http://192.168.1.173:3000",
  "https://localhost:3000",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      console.log("CORS Origin:", origin);

      // Allow Postman, curl, etc.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("❌ CORS blocked:", origin);

      return callback(null, false);
    },

    credentials: true,

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
    ],
  }),
);

// =====================================================
// REQUEST LOGGER
// =====================================================

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);

  console.log("Origin:", req.headers.origin || "none");

  next();
});

// =====================================================
// BODY PARSER
// =====================================================

app.use(bodyParser.json());

app.use(
  bodyParser.urlencoded({
    extended: true,
  }),
);

// =====================================================
// COOKIES
// =====================================================

app.use(cookieParser());

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "HTTPS server is working",
  });
});

// =====================================================
// ROUTES
// =====================================================

app.use("/", controller);

// =====================================================
// REFRESH TOKEN
// =====================================================

app.post("/refresh_token", refreshtoken);

// =====================================================
// 404
// =====================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
  });
});

// =====================================================
// ERROR HANDLER
// =====================================================

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
// HTTPS SERVER
// =====================================================

https.createServer(options, app).listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("=================================");
  console.log("HTTPS SERVER RUNNING");
  console.log("=================================");
  console.log(`https://192.168.1.173:${PORT}`);
  console.log(`https://192.168.1.173:${PORT}/health`);
  console.log("=================================");
  console.log("");
});
