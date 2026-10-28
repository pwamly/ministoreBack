"use strict";

// POST /webhooks/clickpesa   payment results from ClickPesa (public)
//
// The body is not trusted: it only says which payment to re-check
// with the provider's API (services/billing.js confirmPayment).

import { Router } from "express";

import db from "../../models/index.js";
import { confirmPayment } from "../../services/billing.js";

const router = Router();

router.post("/clickpesa", async (req, res) => {
    const orderReference = req.body?.data?.orderReference;

    // Acknowledge straight away; ClickPesa only needs a 2xx.
    res.status(200).json({ received: true });

    if (typeof orderReference !== "string" || !/^[A-Za-z0-9]{1,20}$/.test(orderReference)) {
        return;
    }

    try {
        const payment = await db.subscriptionPayment.findOne({ where: { orderReference, provider: "clickpesa" } });

        // Payments not started by billing (e.g. other ClickPesa products) are ignored.
        if (payment) {
            await confirmPayment(orderReference);
        }
    } catch (error) {
        console.error(`ClickPesa webhook for ${orderReference} failed:`, error);
    }
});

export default router;
