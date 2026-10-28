"use strict";

// Payment providers. Each exposes:
//   name, isConfigured(), initiatePayment({ amount, currency, orderReference, phone }),
//   fetchPayment(orderReference)
// Statuses are normalised to pending | paid | failed.

import clickpesa from "./clickpesa.js";

const providers = { [clickpesa.name]: clickpesa };

/** Provider used for new payments. */
export const defaultProvider = clickpesa;

export const getProvider = (name) => providers[name] || null;
