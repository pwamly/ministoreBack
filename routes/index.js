"use strict";

// Everything here runs after isAuth (see controller/index.js), so
// req.user / req.tenantId / req.permissions are always set.
// Every route declares the permission it needs.

import { Router } from "express";

import { can, requireTenant } from "../middleware/auth/authorize.js";
import { PERMISSIONS as P } from "../config/permissions.js";
import { sessionProfile } from "../services/auth.js";

import regProduct from "./products/registerProduct.js";
import products from "./products/getProducts.js";
import editProduct from "./products/editProduct.js";
import unregisteredItems from "./products/unregisteredItems.js";
import catalog from "./products/catalog.js";
import productActions from "./products/productActions.js";
import importProducts from "./products/importProducts.js";
import dashboard from "./reports/dashboard.js";
import notifications from "./reports/notifications.js";
import regSales from "./sales/regSales.js";
import sales from "./sales/sales.js";
import loans from "./loans/index.js";
import inventory from "./inventory/index.js";
import suppliers from "./inventory/suppliers.js";
import expenses from "./expenses/index.js";
import users from "./users/index.js";
import tenant from "./tenant/index.js";
import platform from "./platform/index.js";
import billing from "./billing/index.js";

const api = Router();

// Current user's profile + permissions (frontend session bootstrap).
api.get("/me", (req, res) =>
    res.json({ successful: true, profile: sessionProfile(req.user, req.tenant) })
);

// SaaS operator - not inside any store.
api.use(platform);

// Everything below is store data.
api.use(requireTenant);

// products
api.post("/product-reg", can(P.PRODUCTS_MANAGE), regProduct);
api.post("/registerProduct", can(P.PRODUCTS_MANAGE), regProduct); // name used by the frontend
api.get("/getProducts", can(P.PRODUCTS_VIEW), products);
api.put("/products/:id", can(P.PRODUCTS_MANAGE), editProduct);

// sales / checkout
api.post("/reg-sales", can(P.SALES_CREATE), regSales);
api.get("/get-sales", can(P.SALES_VIEW), sales);

// modules (each router checks its own permissions)
api.use(unregisteredItems);
api.use(catalog);
api.use(productActions);
api.use(importProducts);
api.use(dashboard);
api.use(notifications);
api.use(loans);
api.use(inventory);
api.use(suppliers);
api.use(expenses);
api.use(users);
api.use(tenant);
api.use(billing);

export default api;
