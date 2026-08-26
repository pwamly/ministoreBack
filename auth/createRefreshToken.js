"use strict";

import pkg from 'jsonwebtoken';
const { sign } = pkg;

export default  async(credetentials, db) => {
    const { id } = credetentials;
    const min_user = db.min_user || db;

    const refresh_token = sign({...credetentials },
        process.env.REFRESHTOKEN_SECRETE, {
            expiresIn: "7d",
        }
    );
    try {
        const tokensaved = await min_user.update({ refresh_token }, {
            where: { id: id },
        });
        if (tokensaved) {
            return refresh_token;
        }
    } catch (error) {
        console.log(error);
    }
    return refresh_token;
};