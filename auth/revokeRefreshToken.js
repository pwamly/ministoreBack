"use strict";
import {db} from "../models/index.js";
const {  min_user} = db;

export default async(req, res) => {
    try {
        const { id } = req.body;
        let { token_version } = await min_user.findOne({ where: { id: id } });
        const user = await min_user.update({ token_version: token_version + 1 }, { where: { id: id } });
        if (user) {
            return res.status(200).json({ successful: true });
        }
        return res.status(401).json({ successful: false });
    } catch (error) {
        console.log(error);
    }
};