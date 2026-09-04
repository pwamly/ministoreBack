"use strict";

import db from "../models/index.js";

import {} from "./revokeRefreshToken.js";
import pkg from "jsonwebtoken";
const { verify } = pkg;
const { min_user } = db;

export default async (req, res) => {
  const { token } = req.body;
  try {
    const payload = verify(token, process.env.ACCESSTOKEN_SECRETE);
    const { id } = payload;

    let { token_version } = await min_user.findOne({ where: { id: id } });
    const user = await min_user.update(
      { token_version: token_version + 1 },
      { where: { id: id } },
    );
    if (user) {
      res.clearCookie("jto", {
        httpOnly: true,
        secure: true,
      });

      return res.status(200).json({ successful: true });
    }
  } catch (error) {
    console.log(error);
    return res.status(401).json({ successful: false });
  }
};
