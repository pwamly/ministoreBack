"use strict";

import { Router } from "express";
import isAdmin from "../middleware/auth/isAdmin.js";
import regProduct from "./products/registerProduct.js";
import products from "./products/getProducts.js";
// import users from "./users";

const api = Router();

api.use("/product-reg", regProduct);
api.get("/getProducts", products);

export default api;