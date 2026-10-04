"use strict";

import { Op } from "sequelize";
import db from "../../models/index.js";

const {
  sales,
  salesItems,
  min_user,
} = db;

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

  const [year, month, day] =
    value.split("-").map(Number);

  const date = new Date(
    year,
    month - 1,
    day
  );

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

/**
 * Create start-of-day Date from YYYY-MM-DD.
 *
 * Uses server local time.
 */
const createStartOfDay = (
  dateString
) => {
  const [year, month, day] =
    dateString.split("-").map(Number);

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
const createEndOfDay = (
  dateString
) => {
  const [year, month, day] =
    dateString.split("-").map(Number);

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

    if (!min_user) {
      throw new Error(
        "min_user model is not initialized"
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
     * =====================================================
     * SPECIAL SHOW-ALL MODE
     * =====================================================
     *
     * When the UI sends:
     *
     *     limit=10000
     *
     * we treat 10000 as:
     *
     *     SHOW ALL
     *
     * We intentionally DO NOT pass:
     *
     *     limit: 10000
     *
     * to Sequelize.
     *
     * We also DO NOT pass:
     *
     *     offset: 0
     *
     * This means Sequelize retrieves every matching
     * record.
     */

    const requestedLimit =
      Number(limit) || 20;

    const SHOW_ALL_LIMIT = 10000;

    const isShowAll =
      requestedLimit ===
      SHOW_ALL_LIMIT;

    /**
     * Maximum normal pagination limit.
     *
     * This does NOT affect limit=10000.
     */
    const MAX_PAGE_LIMIT = 5000;

    const cleanLimit = isShowAll
      ? SHOW_ALL_LIMIT
      : Math.min(
          Math.max(
            requestedLimit,
            1
          ),
          MAX_PAGE_LIMIT
        );

    /**
     * Offset is only used when
     * pagination is enabled.
     */
    const offset = isShowAll
      ? 0
      : (cleanPage - 1) *
        cleanLimit;

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

    // =====================================================
    // VALIDATE END DATE
    // =====================================================

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
     * Custom date range has priority
     * over mode.
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
        // =================================================
        // SALE ITEMS
        // =================================================
        {
          model: salesItems,

          as: "items",

          required: false,
        },

        // =================================================
        // USER
        // =================================================
        {
          model: min_user,

          as: "user",

          required: false,

          attributes: [
            "id",
            "first_name",
            "last_name",
            "username",
          ],
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

    // =====================================================
    // PAGINATION
    // =====================================================

    /**
     * Only add limit and offset when
     * we are NOT in SHOW ALL mode.
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

        // =================================================
        // USER
        // =================================================

        const user =
          sale.user || null;

        const userName =
          user
            ? [
                user.first_name,
                user.last_name,
              ]
                .filter(Boolean)
                .join(" ")
                .trim() || null
            : null;

        const username =
          user?.username || null;

        // =================================================
        // TOTAL PROFIT
        // =================================================

        const totalProfit =
          items.reduce(
            (total, item) =>
              total +
              Number(
                item.profit || 0
              ),
            0
          );

        // =================================================
        // TOTAL QUANTITY
        // =================================================

        const totalQuantity =
          items.reduce(
            (total, item) =>
              total +
              Number(
                item.quantity || 0
              ),
            0
          );

        // =================================================
        // SALE TOTAL
        // =================================================

        const saleTotal =
          Number(
            sale.total || 0
          );

        // =================================================
        // PAID NOW
        // =================================================

        const salePaidNow =
          Number(
            sale.paidNow || 0
          );

        // =================================================
        // REMAINING BALANCE
        // =================================================

        const remainingBalance =
          Number(
            Math.max(
              saleTotal -
                salePaidNow,
              0
            ).toFixed(2)
          );

        // =================================================
        // LOAN STATUS
        // =================================================

        let loanStatus = null;

        if (
          sale.paymentMethod ===
          "loan"
        ) {
          if (
            remainingBalance <=
            0
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

        // =================================================
        // RETURN SALE
        // =================================================

        return {
          id:
            sale.id,

          invoiceNumber:
            sale.invoiceNumber,

          customerName:
            sale.customerName,

          customerMobile:
            sale.customerMobile,

          // =================================================
          // USER INFORMATION
          // =================================================

          userId:
            sale.userId,

          userName:
            userName,

          username:
            username,

          // =================================================
          // PAYMENT
          // =================================================

          paymentMethod:
            sale.paymentMethod,

          // =================================================
          // AMOUNTS
          // =================================================

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

          // =================================================
          // LOAN
          // =================================================

          loanStatus:
            loanStatus,

          // =================================================
          // CASH
          // =================================================

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

          // =================================================
          // STATUS
          // =================================================

          status:
            sale.status,

          // =================================================
          // DATES
          // =================================================

          createdAt:
            sale.createdAt,

          updatedAt:
            sale.updatedAt,

          // =================================================
          // TOTALS
          // =================================================

          totalQuantity:
            totalQuantity,

          totalProfit:
            Number(
              totalProfit.toFixed(
                2
              )
            ),

          // =================================================
          // ITEMS
          // =================================================

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
     * SHOW ALL:
     *
     * page       = 1
     * limit      = 10000
     * total      = actual matching records
     * totalPages = 1
     * showAll    = true
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

      // ===================================================
      // FILTERS
      // ===================================================

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

      // ===================================================
      // PAGINATION
      // ===================================================

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

      // ===================================================
      // SUMMARY
      // ===================================================

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
              totalLoanSales.toFixed(
                2
              )
            ),

          paidNow:
            Number(
              totalLoanPaid.toFixed(
                2
              )
            ),

          outstanding:
            Number(
              totalLoanOutstanding.toFixed(
                2
              )
            ),

          unpaid:
            unpaidLoanTransactions,

          partial:
            partialLoanTransactions,

          paid:
            paidLoanTransactions,
        },
      },

      // ===================================================
      // DATA
      // ===================================================

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
