"use strict";

// const { isInt } = require("../utils");

const paginator = (req, res, next) => {
    const {
        page = 1,
        pageSize = 10,
        sortBy = "createdAt",
        sortOrder = "desc",
    } = req.query;
    let pageInfo = { page, pageSize, sortBy, sortOrder };

    const mispelled = req.sortOrder && !req.sortOrder.matches(/^(?:asc|desc)$/i);

    // Check if client has mispelled the the sort order. (Should be asc or desc)
    if (mispelled) {
        return res.status(400).json({
            error: "Invalid sort order.",
            args: {
                sortOrder: req.sortOrder,
            },
        });
    }

    pageInfo.pageSize = req.query.limit || pageInfo.pageSize;
    pageInfo.page = req.query.page || pageInfo.page;

    pageInfo.pageStatus = req.query.page ? true : false;

    pageInfo = { ...pageInfo };
    pageInfo.offset = (parseInt(pageInfo.page, 10) - 1) * parseInt(pageInfo.pageSize);
    pageInfo.limit = pageInfo.offset + parseInt(pageInfo.pageSize);

    req.query.pageInfo = pageInfo;

    next();
};

// Default export
export default paginator;
