"use strict";

import { Router } from "express";
import isAdmin from "../middleware/auth/isAdmin.js";
import regProduct from "./products/registerProduct.js";
import products from "./products/getProducts.js";
import regSales from "./sales/regSales.js";
import sales from "./sales/sales.js";
import editProduct from "./products/editProduct.js";
// import users from "./users";

const api = Router();

api.post("/product-reg", regProduct);
api.get("/getProducts", products);
api.put("/products/:id", editProduct);

// sales
api.post("/reg-sales", regSales);
api.get("/get-sales", sales);
export default api;