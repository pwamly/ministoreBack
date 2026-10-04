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
 *
 * Uses server local time, matching the existing
 * date filtering behavior.
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
 * RESET SUMMARY
 * =========================================================
 */

const emptySummary = () => ({
  transactions: 0,
  sales: 0,
  paidNow: 0,
  outstanding: 0,
  profit: 0,
  items: 0,

  loans: {
    transactions: 0,
    total: 0,
    paidNow: 0,
    outstanding: 0,
    unpaid: 0,
    partial: 0,
    paid: 0,
  },
});

/**
 * =========================================================
 * MAIN CONTROLLER
 * =========================================================
 */

export default async (req, res) => {
  try {
    // =====================================================
    // VALIDATE MODELS
    // =====================================================

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

    // =====================================================
    // QUERY PARAMETERS
    // =====================================================

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

    // =====================================================
    // NORMALIZE MODE
    // =====================================================

    const cleanMode = String(mode)
      .trim()
      .toLowerCase();

    // =====================================================
    // NORMALIZE SEARCH
    // =====================================================

    const cleanSearch =
      search !== undefined &&
      search !== null &&
      String(search).trim() !== ""
        ? String(search).trim()
        : null;

    // =====================================================
    // NORMALIZE PAYMENT METHOD
    // =====================================================

    const cleanPaymentMethod =
      paymentMethod !== undefined &&
      paymentMethod !== null &&
      String(paymentMethod).trim() !== ""
        ? String(paymentMethod)
            .trim()
            .toLowerCase()
        : null;

    // =====================================================
    // NORMALIZE STATUS
    // =====================================================

    const cleanStatus =
      status !== undefined &&
      status !== null &&
      String(status).trim() !== ""
        ? String(status)
            .trim()
            .toLowerCase()
        : null;

    // =====================================================
    // NORMALIZE PAGE
    // =====================================================

    const cleanPage = Math.max(
      Number(page) || 1,
      1
    );

    // =====================================================
    // NORMALIZE LIMIT
    // =====================================================

    /**
     * IMPORTANT
     *
     * 10,000 is our special "SHOW ALL" value.
     *
     * If the frontend sends:
     *
     *     limit=10000
     *
     * we DO NOT reduce it to 100.
     *
     * Instead:
     *
     *     10,000 => no Sequelize limit
     *            => no offset
     *            => return every matching sale
     *
     * For normal pagination, we still protect
     * the API with a maximum of 5,000.
     */

    const requestedLimit =
      Number(limit) || 20;

    const SHOW_ALL_LIMIT = 10000;

    const isShowAll =
      requestedLimit === SHOW_ALL_LIMIT;

    const cleanLimit = isShowAll
      ? SHOW_ALL_LIMIT
      : Math.min(
          Math.max(
            requestedLimit,
            1
          ),
          5000
        );

    /**
     * Only calculate offset when pagination
     * is actually being used.
     */
    const offset = isShowAll
      ? 0
      : (cleanPage - 1) * cleanLimit;

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
    // VALIDATE PAYMENT METHOD
    // =====================================================

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

    // =====================================================
    // VALIDATE START DATE
    // =====================================================

    if (
      cleanStartDate &&
      !isValidDateString(cleanStartDate)
    ) {
      return res.status(400).json({
        successful: false,

        message:
          "Invalid startDate. Expected format: YYYY-MM-DD",

        received:
          cleanStartDate,
      });
    }

    // =====================================================
    // VALIDATE END DATE
    // =====================================================

    if (
      cleanEndDate &&
      !isValidDateString(cleanEndDate)
    ) {
      return res.status(400).json({
        successful: false,

        message:
          "Invalid endDate. Expected format: YYYY-MM-DD",

        received:
          cleanEndDate,
      });
    }

    // =====================================================
    // VALIDATE DATE RANGE
    // =====================================================

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

    // =====================================================
    // BUILD SALE WHERE
    // =====================================================

    const saleWhere = {};

    // =====================================================
    // DATE FILTER
    // =====================================================

    const now = new Date();

    /**
     * CUSTOM DATE RANGE
     *
     * startDate/endDate have priority over mode.
     */

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

    // =====================================================
    // TODAY
    // =====================================================

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

    // =====================================================
    // WEEKLY
    // =====================================================

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

    // =====================================================
    // MONTHLY
    // =====================================================

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

    // =====================================================
    // YEARLY
    // =====================================================

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

    // =====================================================
    // PAYMENT METHOD FILTER
    // =====================================================

    if (cleanPaymentMethod) {
      saleWhere.paymentMethod =
        cleanPaymentMethod;
    }

    // =====================================================
    // STATUS FILTER
    // =====================================================

    if (cleanStatus) {
      saleWhere.status =
        cleanStatus;
    }

    // =====================================================
    // SEARCH
    // =====================================================

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

    // =====================================================
    // DEBUG
    // =====================================================

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

        requestedLimit,

        cleanLimit,

        isShowAll,

        page:
          cleanPage,

        offset,

        saleWhere,
      }
    );

    // =====================================================
    // BUILD QUERY OPTIONS
    // =====================================================

    const queryOptions = {
      where: saleWhere,

      include: [
        {
          model: salesItems,

          as: "items",

          required: false,
        },
      ],

      order: [
        [
          "createdAt",
          "DESC",
        ],
      ],

      distinct: true,
    };

    /**
     * =====================================================
     * IMPORTANT
     *
     * SHOW ALL MODE
     * =====================================================
     *
     * When limit=10000:
     *
     * DO NOT send:
     *
     *     limit: 10000
     *
     * DO NOT send:
     *
     *     offset: 0
     *
     * Instead we omit both completely.
     *
     * Sequelize will therefore return ALL records
     * matching the date/search/filter conditions.
     */

    if (!isShowAll) {
      queryOptions.limit =
        cleanLimit;

      queryOptions.offset =
        offset;
    }

    // =====================================================
    // GET SALES
    // =====================================================

    const {
      count,
      rows,
    } =
      await sales.findAndCountAll(
        queryOptions
      );

    // =====================================================
    // FORMAT SALES
    // =====================================================

    const formattedSales =
      rows.map((sale) => {
        const items =
          sale.items || [];

        // ---------------------------------------------
        // TOTAL PROFIT
        // ---------------------------------------------

        const totalProfit =
          items.reduce(
            (total, item) =>
              total +
              Number(
                item.profit || 0
              ),
            0
          );

        // ---------------------------------------------
        // TOTAL QUANTITY
        // ---------------------------------------------

        const totalQuantity =
          items.reduce(
            (total, item) =>
              total +
              Number(
                item.quantity || 0
              ),
            0
          );

        // ---------------------------------------------
        // SALE TOTAL
        // ---------------------------------------------

        const saleTotal =
          Number(
            sale.total || 0
          );

        // ---------------------------------------------
        // PAID NOW
        // ---------------------------------------------

        const salePaidNow =
          Number(
            sale.paidNow || 0
          );

        // ---------------------------------------------
        // REMAINING BALANCE
        // ---------------------------------------------

        const remainingBalance =
          Number(
            Math.max(
              saleTotal -
                salePaidNow,
              0
            ).toFixed(2)
          );

        // ---------------------------------------------
        // LOAN STATUS
        // ---------------------------------------------

        let loanStatus =
          null;

        if (
          sale.paymentMethod ===
          "loan"
        ) {
          if (
            remainingBalance <= 0
          ) {
            loanStatus =
              "paid";
          } else if (
            salePaidNow > 0
          ) {
            loanStatus =
              "partial";
          } else {
            loanStatus =
              "unpaid";
          }
        }

        // ---------------------------------------------
        // RETURN SALE
        // ---------------------------------------------

        return {
          id:
            sale.id,

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
            Number(
              sale.subtotal || 0
            ),

          tax:
            Number(
              sale.tax || 0
            ),

          total:
            saleTotal,

          paidNow:
            salePaidNow,

          remainingBalance:
            remainingBalance,

          loanStatus:
            loanStatus,

          cashGiven:
            sale.cashGiven !==
              null &&
            sale.cashGiven !==
              undefined
              ? Number(
                  sale.cashGiven
                )
              : null,

          changeAmount:
            Number(
              sale.changeAmount ||
                0
            ),

          status:
            sale.status,

          createdAt:
            sale.createdAt,

          updatedAt:
            sale.updatedAt,

          totalQuantity:
            totalQuantity,

          totalProfit:
            Number(
              totalProfit.toFixed(
                2
              )
            ),

          items:
            items.map(
              (item) => ({
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
                  Number(
                    item.quantity ||
                      0
                  ),

                unitPrice:
                  Number(
                    item.unitPrice ||
                      0
                  ),

                costPrice:
                  Number(
                    item.costPrice ||
                      0
                  ),

                subtotal:
                  Number(
                    item.subtotal ||
                      0
                  ),

                profit:
                  Number(
                    item.profit ||
                      0
                  ),
              })
            ),
        };
      });

    // =====================================================
    // SUMMARY
    // =====================================================

    const totalSales =
      formattedSales.reduce(
        (total, sale) =>
          total +
          Number(
            sale.total || 0
          ),
        0
      );

    const totalPaidNow =
      formattedSales.reduce(
        (total, sale) =>
          total +
          Number(
            sale.paidNow || 0
          ),
        0
      );

    const totalOutstanding =
      formattedSales.reduce(
        (total, sale) =>
          total +
          Number(
            sale.remainingBalance ||
              0
          ),
        0
      );

    const totalLoanSales =
      formattedSales.reduce(
        (total, sale) =>
          sale.paymentMethod ===
          "loan"
            ? total +
              Number(
                sale.total || 0
              )
            : total,
        0
      );

    const totalLoanPaid =
      formattedSales.reduce(
        (total, sale) =>
          sale.paymentMethod ===
          "loan"
            ? total +
              Number(
                sale.paidNow || 0
              )
            : total,
        0
      );

    const totalLoanOutstanding =
      formattedSales.reduce(
        (total, sale) =>
          sale.paymentMethod ===
          "loan"
            ? total +
              Number(
                sale.remainingBalance ||
                  0
              )
            : total,
        0
      );

    const totalProfit =
      formattedSales.reduce(
        (total, sale) =>
          total +
          Number(
            sale.totalProfit || 0
          ),
        0
      );

    const totalItems =
      formattedSales.reduce(
        (total, sale) =>
          total +
          Number(
            sale.totalQuantity ||
              0
          ),
        0
      );

    // =====================================================
    // LOAN COUNTS
    // =====================================================

    const loanTransactions =
      formattedSales.filter(
        (sale) =>
          sale.paymentMethod ===
          "loan"
      ).length;

    const unpaidLoanTransactions =
      formattedSales.filter(
        (sale) =>
          sale.paymentMethod ===
            "loan" &&
          sale.loanStatus ===
            "unpaid"
      ).length;

    const partialLoanTransactions =
      formattedSales.filter(
        (sale) =>
          sale.paymentMethod ===
            "loan" &&
          sale.loanStatus ===
            "partial"
      ).length;

    const paidLoanTransactions =
      formattedSales.filter(
        (sale) =>
          sale.paymentMethod ===
            "loan" &&
          sale.loanStatus ===
            "paid"
      ).length;

    // =====================================================
    // PAGINATION RESPONSE
    // =====================================================

    /**
     * In SHOW ALL mode:
     *
     * page       = 1
     * limit      = 10000
     * total      = actual matching records
     * totalPages = 1
     * showAll    = true
     *
     * The frontend can then hide pagination.
     */

    const totalPages =
      isShowAll
        ? 1
        : count === 0
        ? 1
        : Math.ceil(
            count /
              cleanLimit
          );

    // =====================================================
    // SUCCESS
    // =====================================================

    return res.status(200).json({
      successful: true,

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
          isShowAll
            ? 1
            : cleanPage,

        limit:
          cleanLimit,

        total:
          count,

        totalPages:
          totalPages,

        showAll:
          isShowAll,
      },

      summary: {
        transactions:
          count,

        sales:
          Number(
            totalSales.toFixed(2)
          ),

        paidNow:
          Number(
            totalPaidNow.toFixed(2)
          ),

        outstanding:
          Number(
            totalOutstanding.toFixed(2)
          ),

        profit:
          Number(
            totalProfit.toFixed(2)
          ),

        items:
          totalItems,

        loans: {
          transactions:
            loanTransactions,

          total:
            Number(
              totalLoanSales.toFixed(2)
            ),

          paidNow:
            Number(
              totalLoanPaid.toFixed(2)
            ),

          outstanding:
            Number(
              totalLoanOutstanding.toFixed(2)
            ),

          unpaid:
            unpaidLoanTransactions,

          partial:
            partialLoanTransactions,

          paid:
            paidLoanTransactions,
        },
      },

      data:
        formattedSales,
    });
  } catch (error) {
    console.error(
      "Get sales error:",
      error
    );

    return res.status(500).json({
      successful: false,

      message:
        "Failed to retrieve sales",

      error:
        error.message ||
        "Failed to retrieve sales",
    });
  }
};
