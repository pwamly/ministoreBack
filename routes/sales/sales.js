"use strict";

import { Op } from "sequelize";
import db from "../../models/index.js";

const { sales, salesItems } = db;

/**
 * Check whether a value is a valid YYYY-MM-DD date.
 */
const isValidDateString = (value) => {
  if (!value || typeof value !== "string") {
    return false;
  }

  // Must be exactly YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

/**
 * Create start-of-day Date from YYYY-MM-DD.
 */
const createStartOfDay = (dateString) => {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

/**
 * Create end-of-day Date from YYYY-MM-DD.
 */
const createEndOfDay = (dateString) => {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day, 23, 59, 59, 999);
};

export default async (req, res) => {
  try {
    // =====================================================
    // VALIDATE MODELS
    // =====================================================

    if (!sales) {
      throw new Error("Sales model is not initialized");
    }

    if (!salesItems) {
      throw new Error("Sales items model is not initialized");
    }

    // =====================================================
    // QUERY PARAMETERS
    // =====================================================

    const {
      mode = "all",
      search,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    // =====================================================
    // NORMALIZE
    // =====================================================

    const cleanMode = String(mode).trim().toLowerCase();

    const cleanSearch =
      search !== undefined &&
      search !== null &&
      String(search).trim() !== ""
        ? String(search).trim()
        : null;

    const cleanPage = Math.max(Number(page) || 1, 1);

    const cleanLimit = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const offset = (cleanPage - 1) * cleanLimit;

    // =====================================================
    // NORMALIZE DATES
    // =====================================================

    const cleanStartDate =
      startDate !== undefined &&
      startDate !== null &&
      String(startDate).trim() !== ""
        ? String(startDate).trim()
        : null;

    const cleanEndDate =
      endDate !== undefined &&
      endDate !== null &&
      String(endDate).trim() !== ""
        ? String(endDate).trim()
        : null;

    // =====================================================
    // VALIDATE MODE
    // =====================================================

    const allowedModes = [
      "all",
      "today",
      "weekly",
      "monthly",
      "yearly",
    ];

    if (!allowedModes.includes(cleanMode)) {
      return res.status(400).json({
        successful: false,
        message:
          "Invalid mode. Allowed: all, today, weekly, monthly, yearly",
      });
    }

    // =====================================================
    // VALIDATE CUSTOM DATES
    // =====================================================

    if (cleanStartDate && !isValidDateString(cleanStartDate)) {
      return res.status(400).json({
        successful: false,
        message:
          "Invalid startDate. Expected format: YYYY-MM-DD",
        received: cleanStartDate,
      });
    }

    if (cleanEndDate && !isValidDateString(cleanEndDate)) {
      return res.status(400).json({
        successful: false,
        message:
          "Invalid endDate. Expected format: YYYY-MM-DD",
        received: cleanEndDate,
      });
    }

    // =====================================================
    // VALIDATE DATE RANGE
    // =====================================================

    if (cleanStartDate && cleanEndDate) {
      const start = createStartOfDay(cleanStartDate);
      const end = createEndOfDay(cleanEndDate);

      if (start > end) {
        return res.status(400).json({
          successful: false,
          message: "startDate cannot be after endDate",
        });
      }
    }

    // =====================================================
    // BUILD SALE WHERE
    // =====================================================

    const saleWhere = {};

    // =====================================================
    // DATE FILTER
    // =====================================================

    const now = new Date();

    /*
     * CUSTOM DATE RANGE
     *
     * Custom startDate/endDate takes priority over mode.
     */

    if (cleanStartDate || cleanEndDate) {
      const dateFilter = {};

      if (cleanStartDate) {
        dateFilter[Op.gte] =
          createStartOfDay(cleanStartDate);
      }

      if (cleanEndDate) {
        dateFilter[Op.lte] =
          createEndOfDay(cleanEndDate);
      }

      saleWhere.createdAt = dateFilter;
    }

    /*
     * TODAY
     */

    else if (cleanMode === "today") {
      const start = new Date(now);

      start.setHours(0, 0, 0, 0);

      const end = new Date(now);

      end.setHours(23, 59, 59, 999);

      saleWhere.createdAt = {
        [Op.between]: [start, end],
      };
    }

    /*
     * WEEKLY
     *
     * Monday -> Sunday
     */

    else if (cleanMode === "weekly") {
      const start = new Date(now);

      const day = start.getDay();

      const diff = day === 0 ? 6 : day - 1;

      start.setDate(start.getDate() - diff);

      start.setHours(0, 0, 0, 0);

      const end = new Date(start);

      end.setDate(end.getDate() + 6);

      end.setHours(23, 59, 59, 999);

      saleWhere.createdAt = {
        [Op.between]: [start, end],
      };
    }

    /*
     * MONTHLY
     */

    else if (cleanMode === "monthly") {
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0,
        0
      );

      const end = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );

      saleWhere.createdAt = {
        [Op.between]: [start, end],
      };
    }

    /*
     * YEARLY
     */

    else if (cleanMode === "yearly") {
      const start = new Date(
        now.getFullYear(),
        0,
        1,
        0,
        0,
        0,
        0
      );

      const end = new Date(
        now.getFullYear(),
        11,
        31,
        23,
        59,
        59,
        999
      );

      saleWhere.createdAt = {
        [Op.between]: [start, end],
      };
    }

    // =====================================================
    // SEARCH
    // =====================================================

    if (cleanSearch) {
      saleWhere[Op.or] = [
        {
          invoiceNumber: {
            [Op.like]: `%${cleanSearch}%`,
          },
        },
        {
          customerName: {
            [Op.like]: `%${cleanSearch}%`,
          },
        },
        {
          paymentMethod: {
            [Op.like]: `%${cleanSearch}%`,
          },
        },
        {
          status: {
            [Op.like]: `%${cleanSearch}%`,
          },
        },
      ];
    }

    // =====================================================
    // DEBUG
    // =====================================================

    console.log("GET SALES QUERY:", {
      mode: cleanMode,
      search: cleanSearch,
      startDate: cleanStartDate,
      endDate: cleanEndDate,
      page: cleanPage,
      limit: cleanLimit,
      saleWhere,
    });

    // =====================================================
    // GET SALES
    // =====================================================

    const { count, rows } = await sales.findAndCountAll({
      where: saleWhere,

      include: [
        {
          model: salesItems,
          as: "items",
          required: false,
        },
      ],

      order: [["createdAt", "DESC"]],

      limit: cleanLimit,

      offset,

      distinct: true,
    });

    // =====================================================
    // FORMAT SALES
    // =====================================================

    const formattedSales = rows.map((sale) => {
      const items = sale.items || [];

      const totalProfit = items.reduce(
        (total, item) =>
          total + Number(item.profit || 0),
        0
      );

      const totalQuantity = items.reduce(
        (total, item) =>
          total + Number(item.quantity || 0),
        0
      );

      return {
        id: sale.id,

        invoiceNumber: sale.invoiceNumber,

        customerName: sale.customerName,

        userId: sale.userId,

        paymentMethod: sale.paymentMethod,

        subtotal: Number(sale.subtotal || 0),

        tax: Number(sale.tax || 0),

        total: Number(sale.total || 0),

        cashGiven:
          sale.cashGiven !== null &&
          sale.cashGiven !== undefined
            ? Number(sale.cashGiven)
            : null,

        changeAmount: Number(
          sale.changeAmount || 0
        ),

        status: sale.status,

        createdAt: sale.createdAt,

        updatedAt: sale.updatedAt,

        totalQuantity,

        totalProfit: Number(
          totalProfit.toFixed(2)
        ),

        items: items.map((item) => ({
          id: item.id,

          saleId: item.saleId,

          productId: item.productId,

          sku: item.sku,

          barcode: item.barcode,

          productName: item.productName,

          quantity: Number(item.quantity || 0),

          unitPrice: Number(item.unitPrice || 0),

          costPrice: Number(item.costPrice || 0),

          subtotal: Number(item.subtotal || 0),

          profit: Number(item.profit || 0),
        })),
      };
    });

    // =====================================================
    // SUMMARY
    // =====================================================

    const totalSales = formattedSales.reduce(
      (total, sale) =>
        total + Number(sale.total || 0),
      0
    );

    const totalProfit = formattedSales.reduce(
      (total, sale) =>
        total + Number(sale.totalProfit || 0),
      0
    );

    const totalItems = formattedSales.reduce(
      (total, sale) =>
        total + Number(sale.totalQuantity || 0),
      0
    );

    // =====================================================
    // SUCCESS
    // =====================================================

    return res.status(200).json({
      successful: true,

      message: "Sales retrieved successfully",

      filters: {
        mode: cleanMode,

        search: cleanSearch,

        startDate: cleanStartDate,

        endDate: cleanEndDate,
      },

      pagination: {
        page: cleanPage,

        limit: cleanLimit,

        total: count,

        totalPages:
          count === 0
            ? 1
            : Math.ceil(count / cleanLimit),
      },

      summary: {
        transactions: count,

        sales: Number(
          totalSales.toFixed(2)
        ),

        profit: Number(
          totalProfit.toFixed(2)
        ),

        items: totalItems,
      },

      data: formattedSales,
    });
  } catch (error) {
    console.error("Get sales error:", error);

    return res.status(500).json({
      successful: false,

      message: "Failed to retrieve sales",

      error:
        error.message ||
        "Failed to retrieve sales",
    });
  }
};
