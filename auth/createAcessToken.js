"use strict";
import pkg from 'jsonwebtoken';
const { sign, verify } = pkg;
export default  (profile) => {
    const access_token = sign(profile, process.env.ACCESSTOKEN_SECRETE, {
        expiresIn: "1m",
    });
    return access_token;
};