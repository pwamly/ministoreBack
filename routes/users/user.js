"use strict";

import { v4 as uuidv4 } from "uuid";
import nb_user from "../../models/nb_user.js";
import paginate from "../../afterwares/pagenate.js";
import { Model, Op, json } from "sequelize";

const getUsers = async (req, res) => {
    const { q, pageInfo } = req.query;  // Destructure query parameters
    const { sortBy, sortOrder, page, limit } = pageInfo;  // Destructure pagination parameters from pageInfo
    
    try {
        // Querying the nb_user table with pagination and sorting
        const { rows, count } = await nb_user.findAndCountAll({
            attributes: [
                "first_name",
                "last_name",
                "username",
                "email",
                "userRole",
                "phone",
            ],
            where: q ? {
                [Op.or]: [
                    { first_name: { [Op.like]: `%${q}%` } },
                    { last_name: { [Op.like]: `%${q}%` } },
                    { username: { [Op.like]: `%${q}%` } },
                    { email: { [Op.like]: `%${q}%` } }
                ]
            } : {},  // If there's a search query 'q', filter by relevant fields

            order: [
                [sortBy, sortOrder]
            ],
            raw: true,  // Ensures raw results from Sequelize
        });

        // Pagination handling
        const data = paginate({
            totalCount: count,
            currentPage: page,
            pageSize: limit,
            data: rows,
        });

        // Return the paginated data
        return res.json(data);
    } catch (error) {
        console.log("Error:", error);  // Log error for debugging
        return res.status(500).json({ message: "An error occurred while fetching users." });
    }
};

// Default export
export default getUsers;
