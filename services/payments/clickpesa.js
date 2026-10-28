"use strict";

// ClickPesa mobile money collection (USSD push).
// Docs: https://docs.clickpesa.com

import crypto from "crypto";

import config from "../../config/index.js";
import { HttpError } from "../../utils/http.js";

const settings = () => config.payments.clickpesa;

export const isConfigured = () => Boolean(settings().clientId && settings().apiKey);

// Tokens are valid for 1 hour. Pre-KYC accounts get 100 API calls a
// day including token requests, so reuse one for most of its life.
const TOKEN_TTL_MS = 55 * 60 * 1000;

let cachedToken = null;

const providerError = (message) => new HttpError(502, message, { code: "PAYMENT_PROVIDER_ERROR" });

const request = async (path, { method = "GET", headers = {}, body } = {}) => {
    const response = await fetch(`${settings().baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));

    return { status: response.status, ok: response.ok, data };
};

const getToken = async () => {
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
        return cachedToken.value;
    }

    const { ok, data } = await request("/generate-token", {
        method: "POST",
        headers: { "client-id": settings().clientId, "api-key": settings().apiKey },
    });

    if (!ok || !data.token) {
        throw providerError("Could not connect to the payment provider");
    }

    // Already includes the "Bearer " prefix.
    cachedToken = { value: data.token, expiresAt: Date.now() + TOKEN_TTL_MS };

    return cachedToken.value;
};

const authed = async (path, options = {}) => {
    let result = await request(path, { ...options, headers: { Authorization: await getToken() } });

    if (result.status === 401) {
        cachedToken = null;
        result = await request(path, { ...options, headers: { Authorization: await getToken() } });
    }

    return result;
};

const canonicalize = (value) => {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(canonicalize);

    return Object.keys(value)
        .sort()
        .reduce((sorted, key) => ({ ...sorted, [key]: canonicalize(value[key]) }), {});
};

/** HMAC-SHA256 of the key-sorted JSON payload, hex. */
const checksum = (payload) =>
    crypto.createHmac("sha256", settings().checksumKey).update(JSON.stringify(canonicalize(payload))).digest("hex");

/** ClickPesa status -> ours. */
const mapStatus = (status) => {
    if (status === "SUCCESS" || status === "SETTLED") return "paid";
    if (status === "FAILED") return "failed";

    return "pending";
};

/**
 * Sends the payment prompt to the customer's phone.
 * @returns {{ status, providerPaymentId, channel }}
 */
export const initiatePayment = async ({ amount, currency, orderReference, phone }) => {
    const payload = { amount: String(amount), currency, orderReference, phoneNumber: phone };

    if (settings().checksumKey) {
        payload.checksum = checksum(payload);
    }

    const { ok, status, data } = await authed("/payments/initiate-ussd-push-request", {
        method: "POST",
        body: payload,
    });

    if (!ok) {
        if (status === 400) {
            throw new HttpError(400, data.message || "The payment request was rejected. Check the phone number.");
        }

        throw providerError(data.message || "The payment provider could not start the payment");
    }

    return { status: mapStatus(data.status), providerPaymentId: data.id || null, channel: data.channel || null };
};

/**
 * Asks ClickPesa for the payment's current state.
 * @returns {{ status, amount, currency, providerPaymentId, channel, message } | null}  null = unknown to ClickPesa
 */
export const fetchPayment = async (orderReference) => {
    const { ok, status, data } = await authed(`/payments/${encodeURIComponent(orderReference)}`);

    if (status === 404) {
        return null;
    }

    if (!ok) {
        throw providerError("Could not check the payment status");
    }

    // The endpoint returns a list; a paid attempt wins over failed retries.
    const records = Array.isArray(data) ? data : [data];
    const record =
        records.find((item) => mapStatus(item.status) === "paid") ||
        records.find((item) => mapStatus(item.status) === "pending") ||
        records[0];

    if (!record) {
        return null;
    }

    return {
        status: mapStatus(record.status),
        amount: Number(record.collectedAmount),
        currency: record.collectedCurrency,
        providerPaymentId: record.id || null,
        channel: record.channel || null,
        message: record.message || null,
    };
};

export default { name: "clickpesa", isConfigured, initiatePayment, fetchPayment };
