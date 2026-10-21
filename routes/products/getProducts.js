"use strict";

import { db } from "../../models/index.js";
import paginate from "../../afterwares/pagenate.js";

import { Op } from "sequelize";
import moment from "moment";
import { has } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";

// =====================================================
// MODELS
// =====================================================

const {
    product,
    productdetails,
    productbarcode,
    brand,
    category,
    unit,
    taxgroup,
    inventory,
    productregulatory,
} = db;

// =====================================================
// GET PRODUCTS
// =====================================================

export default async (req, res) => {

    // Every query is limited to the caller's store.
    let where = {
        tenantId: req.tenantId,
    };

    const {
        day,
        status,
        categoryId,
        brandId,
        stock,
    } = req.query;

    // The Products page sends `search`, checkout sends `q`.
    const q = req.query.q ?? req.query.search;

    // =====================================================
    // PAGINATION
    // =====================================================

    const {
        sortBy = "createdAt",
        sortOrder = "DESC",
        page = 1,
        limit = 10,
        offset = 0,
    } = req.query;

    try {

        // =====================================================
        // SEARCH
        // =====================================================

        if (q && String(q).trim()) {

            const search = String(q).trim();

            // ---------------------------------------------
            // FIND PRODUCTS BY BARCODE
            // ---------------------------------------------

            const barcodeMatches =
                await productbarcode.findAll({
                    where: {
                        tenantId: req.tenantId,
                        barcode: search,
                    },

                    attributes: ["productId"],

                    raw: true,
                });

            const barcodeProductIds =
                barcodeMatches.map(
                    (item) => item.productId
                );

            // ---------------------------------------------
            // PRODUCT SEARCH
            // ---------------------------------------------

            where[Op.or] = [
                // SKU
                {
                    sku: {
                        [Op.like]: `%${search}%`,
                    },
                },

                // ITEM NAME
                {
                    itemName: {
                        [Op.like]: `%${search}%`,
                    },
                },

                // PRODUCT NAME
                {
                    productName: {
                        [Op.like]: `%${search}%`,
                    },
                },
            ];

            // ---------------------------------------------
            // ADD BARCODE RESULTS
            // ---------------------------------------------

            if (barcodeProductIds.length > 0) {

                where[Op.or].push({
                    id: {
                        [Op.in]: barcodeProductIds,
                    },
                });
            }
        }

        // =====================================================
        // DATE FILTER
        // =====================================================

        if (day === "day") {

            where.createdAt = {
                [Op.gte]: moment()
                    .subtract(1, "day")
                    .toDate(),
            };
        }

        if (day === "week") {

            where.createdAt = {
                [Op.gte]: moment()
                    .subtract(7, "days")
                    .toDate(),
            };
        }

        if (day === "month") {

            where.createdAt = {
                [Op.gte]: moment()
                    .subtract(30, "days")
                    .toDate(),
            };
        }

        // =====================================================
        // STATUS
        // =====================================================

        // Removed products only show when asked for.
        if (status) {
            where.status = status;
        } else {
            where.status = {
                [Op.ne]: "removed",
            };
        }

        // =====================================================
        // STOCK LEVEL (in | low | out)
        // =====================================================

        if (["in", "low", "out"].includes(stock)) {
            const stockCondition =
                stock === "out"
                    ? { quantity: { [Op.gt]: 0 } }
                    : stock === "low"
                      ? {
                            quantity: { [Op.gt]: 0 },
                            [Op.and]: db.sequelize.where(db.sequelize.col("quantity"), Op.lte, db.sequelize.col("reorderLevel")),
                        }
                      : {
                            quantity: { [Op.gt]: 0 },
                            [Op.and]: db.sequelize.where(db.sequelize.col("quantity"), Op.gt, db.sequelize.col("reorderLevel")),
                        };

            const stockIds = (
                await inventory.findAll({
                    where: { tenantId: req.tenantId, ...stockCondition },
                    attributes: ["productId"],
                    raw: true,
                })
            ).map((row) => row.productId);

            // "out" = no stock record, or nothing on the shelf.
            where.id =
                stock === "out"
                    ? { [Op.notIn]: stockIds.length ? stockIds : [""] }
                    : { [Op.in]: stockIds.length ? stockIds : [""] };
        }

        // =====================================================
        // CATEGORY
        // =====================================================

        if (categoryId) {
            where.categoryId = categoryId;
        }

        // =====================================================
        // BRAND
        // =====================================================

        if (brandId) {
            where.brandId = brandId;
        }

        // =====================================================
        // PAGINATION VALUES
        // =====================================================

        const currentPage =
            Number(page) || 1;

        // limit=all returns every product (capped for safety).
        const pageSize =
            limit === "all"
                ? 10000
                : Math.min(Number(limit) || 10, 10000);

        const pageOffset =
            Number(offset) ||
            (currentPage - 1) * pageSize;

        // =====================================================
        // SORTING
        // =====================================================

        const allowedSortFields = [
            "id",
            "sku",
            "itemName",
            "productName",
            "productType",
            "status",
            "createdAt",
            "updatedAt",
        ];

        const safeSortBy =
            allowedSortFields.includes(sortBy)
                ? sortBy
                : "createdAt";

        const safeSortOrder =
            String(sortOrder).toUpperCase() === "ASC"
                ? "ASC"
                : "DESC";

        // =====================================================
        // GET PRODUCTS
        // =====================================================

        const {
            rows,
            count,
        } = await product.findAndCountAll({

            where,

            offset: pageOffset,

            limit: pageSize,

            // Important because product hasMany barcodes
            distinct: true,

            order: [
                [
                    safeSortBy,
                    safeSortOrder,
                ],
            ],

            include: [

                // =================================================
                // BRAND
                // =================================================

                {
                    model: brand,
                    as: "brand",

                    required: false,

                    attributes: [
                        "id",
                        "name",
                        "status",
                    ],
                },

                // =================================================
                // CATEGORY
                // =================================================

                {
                    model: category,
                    as: "category",

                    required: false,

                    attributes: [
                        "id",
                        "name",
                        "status",
                    ],
                },

                // =================================================
                // UNIT
                // =================================================

                {
                    model: unit,
                    as: "unit",

                    required: false,

                    attributes: [
                        "id",
                        "name",
                        "status",
                    ],
                },

                // =================================================
                // TAX GROUP
                // =================================================

                {
                    model: taxgroup,
                    as: "taxGroup",

                    required: false,

                    attributes: [
                        "id",
                        "name",
                        "status",
                    ],
                },

                // =================================================
                // PRODUCT DETAILS
                // =================================================

                {
                    model: productdetails,
                    as: "details",

                    required: false,
                },

                // =================================================
                // PRODUCT BARCODES
                // =================================================

                {
                    model: productbarcode,
                    as: "barcodes",

                    required: false,
                },

                // =================================================
                // MANUFACTURER / ORIGIN (for the edit form)
                // =================================================

                {
                    model: productregulatory,
                    as: "regulatory",

                    required: false,

                    attributes: [
                        "manufacturer",
                        "countryOfOrigin",
                    ],
                },

                // =================================================
                // STOCK
                // =================================================

                {
                    model: inventory,
                    as: "inventory",

                    required: false,

                    attributes: [
                        "quantity",
                        "reorderLevel",
                        "reorderQuantity",
                        "location",
                    ],
                },
            ],
        });

        // =====================================================
        // NO PRODUCTS
        // =====================================================

        const summary =
            await productSummary(req.tenantId);

        if (!rows || rows.length === 0) {

            return res.status(200).json({

                successful: true,

                data: [],

                total: 0,

                summary,

                pagination: {
                    currentPage,
                    pageSize,
                    totalPages: 0,
                    totalItems: 0,
                },

            });
        }

        // =====================================================
        // CONVERT SEQUELIZE INSTANCES TO JSON
        // =====================================================

        const canSeeCost =
            has(req, PERMISSIONS.PRODUCTS_VIEW_COST);

        const newdata =
            rows.map((item) => {

                const json = item.toJSON();

                // Cashiers must not see buying prices.
                if (!canSeeCost && json.details) {
                    delete json.details.costPrice;
                }

                return json;

            });

        // =====================================================
        // PAGINATION
        // =====================================================

        let data = paginate({

            totalCount: count,

            currentPage,

            pageSize,

            data: newdata,

        });

        // =====================================================
        // RESPONSE
        // =====================================================

        data = {

            ...data,

            successful: true,

            total: count,

            summary,

        };

        return res.status(200).json(data);

    } catch (error) {

        console.error(
            "Product report error:",
            error
        );

        return res.status(500).json({

            successful: false,

            message:
                "Failed to fetch products",

            error:
                "Failed to fetch products",

        });
    }
};

// =====================================================
// SUMMARY (whole store, ignores filters)
// =====================================================

async function productSummary(tenantId) {

    const [total, active, removed, lowStock] =
        await Promise.all([
            product.count({ where: { tenantId, status: { [Op.ne]: "removed" } } }),

            product.count({ where: { tenantId, status: "active" } }),

            product.count({ where: { tenantId, status: "removed" } }),

            // Needs restocking: at or below the reorder level.
            inventory.count({
                where: {
                    tenantId,
                    quantity: {
                        [Op.lte]: db.sequelize.col("reorderLevel"),
                    },
                },
                include: [
                    {
                        model: product,
                        as: "product",
                        attributes: [],
                        where: { status: { [Op.ne]: "removed" } },
                    },
                ],
            }),
        ]);

    return {
        total,
        active,
        inactive: total - active,
        removed,
        lowStock,
    };
}
