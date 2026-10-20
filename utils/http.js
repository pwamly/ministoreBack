"use strict";

// Small helpers shared by the newer routes (inventory, expenses,
// loans, users, tenant).

export class HttpError extends Error {
    constructor(status, message, extra = {}) {
        super(message);
        this.status = status;
        this.extra = extra;
    }
}

export const badRequest = (message, extra) => new HttpError(400, message, extra);
export const notFound = (message = "Not found") => new HttpError(404, message);
export const conflict = (message) => new HttpError(409, message);

/**
 * Wraps an async route: HttpError -> its status, Sequelize
 * validation/unique errors -> 400/409, anything else -> 500.
 */
export const handler = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, next);
    } catch (error) {
        if (res.headersSent) {
            return next(error);
        }

        if (error instanceof HttpError) {
            return res.status(error.status).json({
                successful: false,
                message: error.message,
                ...error.extra,
            });
        }

        if (error.name === "SequelizeValidationError") {
            return res.status(400).json({
                successful: false,
                message: "Validation failed",
                errors: error.errors.map((item) => ({ field: item.path, message: item.message })),
            });
        }

        if (error.name === "SequelizeUniqueConstraintError") {
            return res.status(409).json({
                successful: false,
                message: "A record with the same value already exists",
                errors: error.errors?.map((item) => ({ field: item.path, message: item.message })),
            });
        }

        console.error(`${req.method} ${req.originalUrl} failed:`, error);

        return res.status(500).json({
            successful: false,
            message: "Something went wrong. Please try again.",
        });
    }
};

export const isProvided = (value) =>
    value !== undefined && value !== null && String(value).trim() !== "";

export const cleanString = (value) => (isProvided(value) ? String(value).trim() : null);

export const round2 = (value) => Number(Number(value).toFixed(2));
export const round3 = (value) => Number(Number(value).toFixed(3));

/** Parse a finite number or throw a 400 with `label` in the message. */
export const requireNumber = (value, label, { min = -Infinity, gt } = {}) => {
    const number = Number(value);

    if (!isProvided(value) || !Number.isFinite(number)) {
        throw badRequest(`${label} must be a valid number`);
    }

    if (gt !== undefined && !(number > gt)) {
        throw badRequest(`${label} must be greater than ${gt}`);
    }

    if (number < min) {
        throw badRequest(`${label} must be at least ${min}`);
    }

    return number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isDateString = (value) =>
    typeof value === "string" && DATE_RE.test(value) && !Number.isNaN(Date.parse(value));

/** page/limit from the query string, capped. */
export const pagination = (query, { defaultLimit = 20, maxLimit = 200 } = {}) => {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));

    return { page, limit, offset: (page - 1) * limit };
};

export const paginationMeta = ({ page, limit }, totalItems) => ({
    currentPage: page,
    pageSize: limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
});
