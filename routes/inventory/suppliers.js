"use strict";

// GET  /suppliers       list (search, status)
// POST /suppliers       create
// PUT  /suppliers/:id   update / deactivate

import { Router } from "express";
import { Op } from "sequelize";

import db from "../../models/index.js";
import { can } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { handler, badRequest, notFound, cleanString, isProvided, pagination, paginationMeta } from "../../utils/http.js";

const { supplier } = db;

const router = Router();

const FIELDS = ["name", "contactPerson", "phone", "email", "address", "city", "taxNumber", "notes"];

const pick = (body) => {
    const data = {};

    for (const field of FIELDS) {
        if (body[field] !== undefined) {
            data[field] = cleanString(body[field]);
        }
    }

    if (body.status !== undefined) {
        if (!["active", "inactive"].includes(body.status)) {
            throw badRequest("status must be active or inactive");
        }

        data.status = body.status;
    }

    return data;
};

router.get(
    "/suppliers",
    can(PERMISSIONS.INVENTORY_VIEW),
    handler(async (req, res) => {
        const page = pagination(req.query, { defaultLimit: 50 });
        const where = { tenantId: req.tenantId };

        if (isProvided(req.query.status)) {
            where.status = req.query.status;
        }

        if (isProvided(req.query.search)) {
            const term = `%${String(req.query.search).trim()}%`;

            where[Op.or] = [
                { name: { [Op.like]: term } },
                { contactPerson: { [Op.like]: term } },
                { phone: { [Op.like]: term } },
            ];
        }

        const { rows, count } = await supplier.findAndCountAll({
            where,
            order: [["name", "ASC"]],
            limit: page.limit,
            offset: page.offset,
        });

        return res.json({ successful: true, data: rows, pagination: paginationMeta(page, count) });
    })
);

router.post(
    "/suppliers",
    can(PERMISSIONS.INVENTORY_MANAGE),
    handler(async (req, res) => {
        const data = pick(req.body);

        if (!data.name) {
            throw badRequest("Supplier name is required");
        }

        const created = await supplier.create({ ...data, tenantId: req.tenantId });

        return res.status(201).json({ successful: true, message: "Supplier added", data: created });
    })
);

router.put(
    "/suppliers/:id",
    can(PERMISSIONS.INVENTORY_MANAGE),
    handler(async (req, res) => {
        const found = await supplier.findOne({ where: { id: req.params.id, tenantId: req.tenantId } });

        if (!found) {
            throw notFound("Supplier not found");
        }

        const data = pick(req.body);

        if (data.name === null) {
            throw badRequest("Supplier name cannot be empty");
        }

        await found.update(data);

        return res.json({ successful: true, message: "Supplier updated", data: found });
    })
);

export default router;
