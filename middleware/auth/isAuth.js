"use strict";
import dotenv from "dotenv";  // ES Module import
import pkg from 'jsonwebtoken';
const { verify } = pkg;
dotenv.config();  // Load environment variables from .env file

export default async(req, res, next) => {
    const auHeader = req.headers["authorization"];
    const token = auHeader && auHeader.split(" ")[1];
    if (!token) {
        res.statusMessage = "No Authorization Header";
        return res
            .status(401)
            .json({ data: { message: "No Authorization Header" } });
    }

    var payload = await verify(
        token,
        process.env.ACCESSTOKEN_SECRETE,
        (error, user) => {
            // console.log("users", error);
            if (error) {
                console.log("auth error..........", error);
                res.statusMessage = "NOT HAVE ACCESS!";
                return res.status(403).json({ data: { message: "NOT HAVE ACCESS!" } });
            }
            if (user) {
                req.payload = user;
                // console.log(user);
            }

            next();
        }
    );
};