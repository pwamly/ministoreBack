"use strict";

import { Op } from "sequelize";
import db from "../../models/index.js";

const { sales, salesItems } = db;

/**
 * =========================================================
 * DATE HELPERS
 * =========================================================
 */

/**
 * Check whether a value is a valid YYYY-MM-DD date.
 */
const isValidDateString = (value) => {
  if (!value || typeof value !== "string") {
    return false;
  }

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

  return new Date(
    year,
    month - 1,
    day,
    0,
    0,
    0,
    0
  );
};

/**
 * Create end-of-day Date from YYYY-MM-DD.
 */
const createEndOfDay = (dateString) => {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(
    year,
    month - 1,
    day,
    23,
    59,
    59,
    999
  );
};

/**
 * =========================================================
 * NUMBER HELPERS
 * =========================================================
 */

const toNumber = (value) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) => {
  return Number(toNumber(value).toFixed(2));
};

/**
 * =========================================================
 * FORMAT SALE
 * =========================================================
 *
 * This is shared between:
 *
 * 1. Paginated table data
 * 2. Full summary data
 *
 * Keeping this in one place prevents the two calculations
 * from becoming inconsistent.
 */
const formatSale = (sale) => {
  const items = Array.isArray(sale.items)
    ? sale.items
    : [];

  /**
   * TOTAL PROFIT
   */
  const totalProfit = items.reduce(
    (total, item) => {
      return (
        total +
        toNumber(item.profit)
      );
    },
    0
  );

  /**
   * TOTAL QUANTITY
   */
  const totalQuantity = items.reduce(
    (total, item) => {
      return (
        total +
        toNumber(item.quantity)
      );
    },
    0
  );

  /**
   * SALE TOTAL
   */
  const saleTotal = toNumber(
    sale.total
  );

  /**
   * PAID NOW
   */
  const salePaidNow = toNumber(
    sale.paidNow
  );

  /**
   * REMAINING BALANCE
   *
   * Only loans should normally have a
   * remaining balance.
   */
  const remainingBalance = roundMoney(
    Math.max(
      saleTotal - salePaidNow,
      0
    )
  );

  /**
   * LOAN STATUS
   */
  let loanStatus = null;

  if (sale.paymentMethod === "loan") {
    if (remainingBalance <= 0) {
      loanStatus = "paid";
    } else if (salePaidNow > 0) {
      loanStatus = "partial";
    } else {
      loanStatus = "unpaid";
    }
  }

  /**
   * RETURN FORMATTED SALE
   */
  return {
    id: sale.id,

    invoiceNumber:
      sale.invoiceNumber,

    customerName:
      sale.customerName,

    customerMobile:
      sale.customerMobile,

    userId:
      sale.userId,

    paymentMethod:
      sale.paymentMethod,

    subtotal:
      toNumber(sale.subtotal),

    tax:
      toNumber(sale.tax),

    total:
      saleTotal,

    paidNow:
      salePaidNow,

    remainingBalance:
      remainingBalance,

    loanStatus:
      loanStatus,

    cashGiven:
      sale.cashGiven !== null &&
      sale.cashGiven !== undefined
        ? toNumber(sale.cashGiven)
        : null,

    changeAmount:
      toNumber(sale.changeAmount),

    status:
      sale.status,

    createdAt:
      sale.createdAt,

    updatedAt:
      sale.updatedAt,

    totalQuantity:
      totalQuantity,

    totalProfit:
      roundMoney(totalProfit),

    items:
      items.map((item) => ({
        id:
          item.id,

        saleId:
          item.saleId,

        productId:
          item.productId,

        sku:
          item.sku,

        barcode:
          item.barcode,

        productName:
          item.productName,

        quantity:
          toNumber(item.quantity),

        unitPrice:
          toNumber(item.unitPrice),

        costPrice:
          toNumber(item.costPrice),

        subtotal:
          toNumber(item.subtotal),

        profit:
          toNumber(item.profit),
      })),
  };
};

/**
 * =========================================================
 * BUILD SUMMARY
 * =========================================================
 *
 * IMPORTANT:
 *
 * This function receives ALL matching sales,
 * not just the current pagination page.
 */
const buildSummary = (formattedSales) => {
  const totalSales = formattedSales.reduce(
    (total, sale) => {
      return (
        total +
        toNumber(sale.total)
      );
    },
    0
  );

  const totalPaidNow = formattedSales.reduce(
    (total, sale) => {
      return (
        total +
        toNumber(sale.paidNow)
      );
    },
    0
  );

  const totalOutstanding = formattedSales.reduce(
    (total, sale) => {
      return (
        total +
        toNumber(sale.remainingBalance)
      );
    },
    0
  );

  const totalProfit = formattedSales.reduce(
    (total, sale) => {
      return (
        total +
        toNumber(sale.totalProfit)
      );
    },
    0
  );

  const totalItems = formattedSales.reduce(
    (total, sale) => {
      return (
        total +
        toNumber(sale.totalQuantity)
      );
    },
    0
  );

  /**
   * =======================================================
   * LOANS
   * =======================================================
   */

  const loanSales = formattedSales.filter(
    (sale) =>
      sale.paymentMethod === "loan"
  );

  const loanTransactions =
    loanSales.length;

  const totalLoanSales = loanSales.reduce(
    (total, sale) => {
      return (
        total +
        toNumber(sale.total)
      );
    },
    0
  );

  const totalLoanPaid = loanSales.reduce(
    (total, sale) => {
      return (
        total +
        toNumber(sale.paidNow)
      );
    },
    0
  );

  const totalLoanOutstanding =
    loanSales.reduce(
      (total, sale) => {
        return (
          total +
          toNumber(
            sale.remainingBalance
          )
        );
      },
      0
    );

  const unpaidLoanTransactions =
    loanSales.filter(
      (sale) =>
        sale.loanStatus === "unpaid"
    ).length;

  const partialLoanTransactions =
    loanSales.filter(
      (sale) =>
        sale.loanStatus === "partial"
    ).length;

  const paidLoanTransactions =
    loanSales.filter(
      (sale) =>
        sale.loanStatus === "paid"
    ).length;

  return {
    transactions:
      formattedSales.length,

    sales:
      roundMoney(totalSales),

    paidNow:
      roundMoney(totalPaidNow),

    outstanding:
      roundMoney(totalOutstanding),

    profit:
      roundMoney(totalProfit),

    items:
      totalItems,

    loans: {
      transactions:
        loanTransactions,

      total:
        roundMoney(totalLoanSales),

      paidNow:
        roundMoney(totalLoanPaid),

      outstanding:
        roundMoney(
          totalLoanOutstanding
        ),

      unpaid:
        unpaidLoanTransactions,

      partial:
        partialLoanTransactions,

      paid:
        paidLoanTransactions,
    },
  };
};

/**
 * =========================================================
 * CONTROLLER
 * =========================================================
 */

export default async (req, res) => {
  try {
    /**
     * =======================================================
     * VALIDATE MODELS
     * =======================================================
     */

    if (!sales) {
      throw new Error(
        "Sales model is not initialized"
      );
    }

    if (!salesItems) {
      throw new Error(
        "Sales items model is not initialized"
      );
    }

    /**
     * =======================================================
     * QUERY PARAMETERS
     * =======================================================
     */

    const {
      mode = "all",
      search,
      startDate,
      endDate,
      paymentMethod,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    /**
     * =======================================================
     * NORMALIZE
     * =======================================================
     */

    const cleanMode =
      String(mode)
        .trim()
        .toLowerCase();

    const cleanSearch =
      search !== undefined &&
      search !== null &&
      String(search).trim() !== ""
        ? String(search).trim()
        : null;

    const cleanPaymentMethod =
      paymentMethod !== undefined &&
      paymentMethod !== null &&
      String(paymentMethod).trim() !== ""
        ? String(paymentMethod)
            .trim()
            .toLowerCase()
        : null;

    const cleanStatus =
      status !== undefined &&
      status !== null &&
      String(status).trim() !== ""
        ? String(status)
            .trim()
            .toLowerCase()
        : null;

    const cleanPage = Math.max(
      Number(page) || 1,
      1
    );

    /**
     * =======================================================
     * IMPORTANT
     * =======================================================
     *
     * Keep the normal API page size capped.
     *
     * The table gets a maximum of 100 records per request.
     *
     * The SUMMARY is calculated separately from ALL
     * matching records.
     */
    const cleanLimit = Math.min(
      Math.max(
        Number(limit) || 20,
        1
      ),
      100
    );

    const offset =
      (cleanPage - 1) *
      cleanLimit;

    /**
     * =======================================================
     * NORMALIZE DATES
     * =======================================================
     */

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

    /**
     * =======================================================
     * VALIDATE MODE
     * =======================================================
     */

    const allowedModes = [
      "all",
      "today",
      "weekly",
      "monthly",
      "yearly",
    ];

    if (
      !allowedModes.includes(
        cleanMode
      )
    ) {
      return res.status(400).json({
        successful: false,

        message:
          "Invalid mode. Allowed: all, today, weekly, monthly, yearly",
      });
    }

    /**
     * =======================================================
     * VALIDATE PAYMENT METHOD
     * =======================================================
     */

    const allowedPaymentMethods = [
      "cash",
      "card",
      "mobile",
      "mobile_money",
      "loan",
      "bank",
    ];

    if (
      cleanPaymentMethod &&
      !allowedPaymentMethods.includes(
        cleanPaymentMethod
      )
    ) {
      return res.status(400).json({
        successful: false,

        message:
          "Invalid paymentMethod. Allowed: cash, card, mobile, mobile_money, bank, loan",
      });
    }

    /**
     * =======================================================
     * VALIDATE CUSTOM DATES
     * =======================================================
     */

    if (
      cleanStartDate &&
      !isValidDateString(
        cleanStartDate
      )
    ) {
      return res.status(400).json({
        successful: false,

        message:
          "Invalid startDate. Expected format: YYYY-MM-DD",

        received:
          cleanStartDate,
      });
    }

    if (
      cleanEndDate &&
      !isValidDateString(
        cleanEndDate
      )
    ) {
      return res.status(400).json({
        successful: false,

        message:
          "Invalid endDate. Expected format: YYYY-MM-DD",

        received:
          cleanEndDate,
      });
    }

    /**
     * =======================================================
     * VALIDATE DATE RANGE
     * =======================================================
     */

    if (
      cleanStartDate &&
      cleanEndDate
    ) {
      const start =
        createStartOfDay(
          cleanStartDate
        );

      const end =
        createEndOfDay(
          cleanEndDate
        );

      if (start > end) {
        return res.status(400).json({
          successful: false,

          message:
            "startDate cannot be after endDate",
        });
      }
    }

    /**
     * =======================================================
     * BUILD SALE WHERE
     * =======================================================
     */

    const saleWhere = {};

    /**
     * =======================================================
     * DATE FILTER
     * =======================================================
     *
     * Custom dates take priority over mode.
     */

    const now = new Date();

    if (
      cleanStartDate ||
      cleanEndDate
    ) {
      const dateFilter = {};

      if (cleanStartDate) {
        dateFilter[Op.gte] =
          createStartOfDay(
            cleanStartDate
          );
      }

      if (cleanEndDate) {
        dateFilter[Op.lte] =
          createEndOfDay(
            cleanEndDate
          );
      }

      saleWhere.createdAt =
        dateFilter;
    }

    /**
     * TODAY
     */
    else if (
      cleanMode === "today"
    ) {
      const start =
        new Date(now);

      start.setHours(
        0,
        0,
        0,
        0
      );

      const end =
        new Date(now);

      end.setHours(
        23,
        59,
        59,
        999
      );

      saleWhere.createdAt = {
        [Op.between]: [
          start,
          end,
        ],
      };
    }

    /**
     * WEEKLY
     *
     * Monday -> Sunday
     */
    else if (
      cleanMode === "weekly"
    ) {
      const start =
        new Date(now);

      const day =
        start.getDay();

      const diff =
        day === 0
          ? 6
          : day - 1;

      start.setDate(
        start.getDate() -
          diff
      );

      start.setHours(
        0,
        0,
        0,
        0
      );

      const end =
        new Date(start);

      end.setDate(
        end.getDate() + 6
      );

      end.setHours(
        23,
        59,
        59,
        999
      );

      saleWhere.createdAt = {
        [Op.between]: [
          start,
          end,
        ],
      };
    }

    /**
     * MONTHLY
     */
    else if (
      cleanMode === "monthly"
    ) {
      const start =
        new Date(
          now.getFullYear(),
          now.getMonth(),
          1,
          0,
          0,
          0,
          0
        );

      const end =
        new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
          999
        );

      saleWhere.createdAt = {
        [Op.between]: [
          start,
          end,
        ],
      };
    }

    /**
     * YEARLY
     */
    else if (
      cleanMode === "yearly"
    ) {
      const start =
        new Date(
          now.getFullYear(),
          0,
          1,
          0,
          0,
          0,
          0
        );

      const end =
        new Date(
          now.getFullYear(),
          11,
          31,
          23,
          59,
          59,
          999
        );

      saleWhere.createdAt = {
        [Op.between]: [
          start,
          end,
        ],
      };
    }

    /**
     * =======================================================
     * PAYMENT METHOD FILTER
     * =======================================================
     */

    if (cleanPaymentMethod) {
      saleWhere.paymentMethod =
        cleanPaymentMethod;
    }

    /**
     * =======================================================
     * STATUS FILTER
     * =======================================================
     */

    if (cleanStatus) {
      saleWhere.status =
        cleanStatus;
    }

    /**
     * =======================================================
     * SEARCH
     * =======================================================
     */

    if (cleanSearch) {
      saleWhere[Op.or] = [
        {
          invoiceNumber: {
            [Op.like]:
              `%${cleanSearch}%`,
          },
        },
        {
          customerName: {
            [Op.like]:
              `%${cleanSearch}%`,
          },
        },
        {
          customerMobile: {
            [Op.like]:
              `%${cleanSearch}%`,
          },
        },
        {
          paymentMethod: {
            [Op.like]:
              `%${cleanSearch}%`,
          },
        },
        {
          status: {
            [Op.like]:
              `%${cleanSearch}%`,
          },
        },
      ];
    }

    /**
     * =======================================================
     * DEBUG
     * =======================================================
     */

    console.log(
      "GET SALES QUERY:",
      {
        mode:
          cleanMode,

        search:
          cleanSearch,

        paymentMethod:
          cleanPaymentMethod,

        status:
          cleanStatus,

        startDate:
          cleanStartDate,

        endDate:
          cleanEndDate,

        page:
          cleanPage,

        limit:
          cleanLimit,

        offset,

        saleWhere,
      }
    );

    /**
     * =======================================================
     * 1. GET PAGINATED SALES
     * =======================================================
     *
     * This is ONLY for the table.
     */
    const {
      count,
      rows,
    } = await sales.findAndCountAll({
      where:
        saleWhere,

      include: [
        {
          model:
            salesItems,

          as:
            "items",

          required:
            false,
        },
      ],

      order: [
        [
          "createdAt",
          "DESC",
        ],
      ],

      limit:
        cleanLimit,

      offset,

      distinct:
        true,
    });

    /**
     * Format table rows.
     */
    const formattedSales =
      rows.map(formatSale);

    /**
     * =======================================================
     * 2. GET ALL MATCHING SALES FOR SUMMARY
     * =======================================================
     *
     * IMPORTANT:
     *
     * There is NO limit and NO offset here.
     *
     * Therefore September 1 -> September 30 summary
     * includes every matching September sale, even if
     * there are 500, 1,000 or more transactions.
     *
     * This is the critical fix.
     */
    const allSalesForSummary =
      await sales.findAll({
        where:
          saleWhere,

        include: [
          {
            model:
              salesItems,

            as:
              "items",

            required:
              false,
          },
        ],

        attributes: [
          "id",
          "paymentMethod",
          "total",
          "paidNow",
        ],
      });

    /**
     * Format ALL matching sales for summary.
     */
    const formattedSummarySales =
      allSalesForSummary.map(
        formatSale
      );

    /**
     * =======================================================
     * BUILD FULL SUMMARY
     * =======================================================
     */

    const summary =
      buildSummary(
        formattedSummarySales
      );

    /**
     * =======================================================
     * SUCCESS
     * =======================================================
     */

    return res.status(200).json({
      successful:
        true,

      message:
        "Sales retrieved successfully",

      filters: {
        mode:
          cleanMode,

        search:
          cleanSearch,

        paymentMethod:
          cleanPaymentMethod,

        status:
          cleanStatus,

        startDate:
          cleanStartDate,

        endDate:
          cleanEndDate,
      },

      pagination: {
        page:
          cleanPage,

        limit:
          cleanLimit,

        total:
          count,

        totalPages:
          count === 0
            ? 1
            : Math.ceil(
                count /
                  cleanLimit
              ),
      },

      /**
       * FULL DATE-RANGE SUMMARY
       *
       * This is NOT page-specific.
       */
      summary,

      /**
       * ONLY CURRENT PAGE
       */
      data:
        formattedSales,
    });
  } catch (error) {
    console.error(
      "Get sales error:",
      error
    );

    return res.status(500).json({
      successful:
        false,

      message:
        "Failed to retrieve sales",

      error:
        error.message ||
        "Failed to retrieve sales",
    });
  }
};
