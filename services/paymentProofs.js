"use strict";

// Screenshots of manual subscription payments, stored as files:
//   <UPLOADS_DIR>/payment-proofs/<paymentId>.<jpg|png|webp>
// Served only through the platform admin API, never as static files.

import fs from "fs/promises";
import path from "path";

import config from "../config/index.js";
import { badRequest } from "../utils/http.js";

// Base64 of this many bytes still fits the 1mb JSON body limit.
export const MAX_PROOF_BYTES = 650 * 1024;

const TYPES = [
    { ext: "jpg", mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
    { ext: "png", mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
    { ext: "webp", mime: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WEBP
];

const proofDir = () => path.resolve(config.uploadsDir, "payment-proofs");

/** "data:image/jpeg;base64,..." -> { buffer, type }, checked by content, not by the claimed type. */
export const decodeProof = (dataUrl) => {
    const match = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ""));

    if (!match) {
        throw badRequest("Attach a screenshot of the payment (JPG or PNG)");
    }

    const buffer = Buffer.from(match[1], "base64");

    if (buffer.length > MAX_PROOF_BYTES) {
        throw badRequest("The screenshot is too large. Use a smaller image.");
    }

    const type = TYPES.find(
        (candidate) =>
            candidate.magic.every((byte, index) => buffer[index] === byte) &&
            (candidate.ext !== "webp" || buffer.subarray(8, 12).toString("ascii") === "WEBP")
    );

    if (!type) {
        throw badRequest("The screenshot must be a JPG, PNG or WebP image");
    }

    return { buffer, type };
};

export const saveProof = async (paymentId, { buffer, type }) => {
    await fs.mkdir(proofDir(), { recursive: true });
    await fs.writeFile(path.join(proofDir(), `${paymentId}.${type.ext}`), buffer);
};

/** The stored screenshot as a data URL, or null when missing. */
export const readProof = async (paymentId) => {
    for (const type of TYPES) {
        try {
            const buffer = await fs.readFile(path.join(proofDir(), `${paymentId}.${type.ext}`));
            return `data:${type.mime};base64,${buffer.toString("base64")}`;
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
    }

    return null;
};
