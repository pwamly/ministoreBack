"use strict";

import { v4 as uuidv4 } from "uuid";
import { vehiclereports } from "../../models/index.js";
const { Model, Op, json } = require("sequelize");
import paginate from "../../afterwares/pagenate.js";

export default async(req, res) => {
    let where = {};
    const { q, pageInfo } = req.query;
    const { sortBy, sortOrder, page, limit } = pageInfo;
    if (q) {
        where = {
            ...where,
            [Op.or]: {
                vihecleRegno: {
                    [Op.like]: "%" + q + "%",
                },
                phone: {
                    [Op.like]: "%" + q + "%",
                },
            },
        };

        try {
            const { rows, count } = await vehiclereports.findAndCountAll({
                order: [
                    [sortBy, sortOrder]
                ],
                where,
                raw: true,
            });

            const data = paginate({
                totalCount: count,
                currentPage: page,
                pageSize: limit,
                data: rows,
            });

            return res.json(data);
        } catch (error) {
        }

        return;
    }
};
// module.exports = { allreports, reportById, inspect };