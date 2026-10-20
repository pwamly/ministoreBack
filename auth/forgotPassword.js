"use strict";

import { randomInt } from "crypto";
import jwt from "jsonwebtoken";

import config from "../config/index.js";
import db from "../models/index.js";

const { sign } = jwt;
const { min_user } = db;

/**
 * Creates a 15-minute recovery code for the account.
 *
 * The code must reach the user out-of-band (email/SMS). No
 * sender is wired up yet, so in development it is printed to
 * the server console. It is never returned in the response,
 * otherwise anyone could reset anyone's password.
 */
export default async (req, res) => {
    const { email } = req.body;

    const generic = {
        successful: true,
        message: "If the account exists, a recovery code has been sent.",
    };

    if (!email) {
        return res.status(400).json({ successful: false, message: "Email is required" });
    }

    try {
        const user = await min_user.findOne({ where: { email } });

        if (!user) {
            return res.status(200).json(generic);
        }

        const code = randomInt(100000, 1000000);

        const recoveryCode = sign({ code, id: user.id }, config.auth.recoverySecret, {
            expiresIn: "15m",
        });

        await user.update({ recoveryCode });

        // TODO: send `code` by email/SMS once a provider is configured.
        if (config.isDev) {
            console.log(`[dev] recovery code for ${email}: ${code}`);
        }

        return res.status(200).json(generic);
    } catch (error) {
        console.error("FORGOT PASSWORD ERROR:", error);

        return res.status(500).json({ successful: false, message: "Something went wrong" });
    }
};
