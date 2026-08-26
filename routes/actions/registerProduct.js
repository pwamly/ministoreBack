"use strict";

import { v4 as uuidv4 } from "uuid";
import { Op } from "sequelize";

import sequelize from "../../config/database.js";

import products from "../../models/products.js";
import productbarcodes from "../../models/productbarcodes.js";
import productdetails from "../../models/productdetails.js";
import productregulatory from "../../models/productregulatory.js";

export default async (req, res) => {

    const date = new Date();

    const {
        sku,
        itemName,
        productName,
        description,
        productType,

        brandId,
        categoryId,
        unitId,
        taxGroupId,

        flavor,
        size,
        netWeight,
        weightUnit,
        packagingType,
        servings,
        servingSize,

        costPrice,
        sellingPrice,
        wholesalePrice,
        minimumSellingPrice,

        barcode,
        barcodeType,

        manufacturer,
        countryOfOrigin,
        licenseNumber,
        mfgDate,
        shelfLifeMonths,
        allergens,
        storageInstructions
    } = req.body;

    try {

        // =====================================================
        // VALIDATION
        // =====================================================

        if (!sku) {
            return res.status(400).json({
                successful: false,
                message: "SKU is required",
            });
        }

        if (!itemName) {
            return res.status(400).json({
                successful: false,
                message: "Product name is required",
            });
        }

        if (!sellingPrice) {
            return res.status(400).json({
                successful: false,
                message: "Selling price is required",
            });
        }

        // =====================================================
        // DUPLICATE SKU
        // =====================================================

        const existingSku =
            await products.findOne({
                where: {
                    sku
                },
                raw: true,
            });

        if (existingSku) {
            return res.status(403).json({
                successful: false,
                message: "Product SKU already exists",
            });
        }

        // =====================================================
        // DUPLICATE BARCODE
        // =====================================================

        if (barcode) {

            const existingBarcode =
                await productbarcodes.findOne({
                    where: {
                        barcode
                    },
                    raw: true,
                });

            if (existingBarcode) {
                return res.status(403).json({
                    successful: false,
                    message: "Barcode already exists",
                });
            }
        }

        // =====================================================
        // TRANSACTION
        // =====================================================

        const result =
            await sequelize.transaction(
                async (transaction) => {

                    const productId =
                        uuidv4();

                    // -----------------------------------------
                    // PRODUCT
                    // -----------------------------------------

                    const product =
                        await products.create(
                            {
                                id: productId,

                                sku,
                                itemName,
                                productName,
                                description,
                                productType,

                                brandId,
                                categoryId,
                                unitId,
                                taxGroupId,

                                status: "active",

                                createdAt: date,
                                updatedAt: date,
                            },
                            {
                                transaction
                            }
                        );

                    // -----------------------------------------
                    // PRODUCT DETAILS
                    // -----------------------------------------

                    await productdetails.create(
                        {
                            id: uuidv4(),

                            productId,

                            flavor,
                            size,
                            netWeight,
                            weightUnit,
                            packagingType,
                            servings,
                            servingSize,

                            costPrice:
                                costPrice || 0,

                            sellingPrice:
                                sellingPrice || 0,

                            wholesalePrice:
                                wholesalePrice || null,

                            minimumSellingPrice:
                                minimumSellingPrice || null,

                            createdAt: date,
                            updatedAt: date,
                        },
                        {
                            transaction
                        }
                    );

                    // -----------------------------------------
                    // BARCODE
                    // -----------------------------------------

                    if (barcode) {

                        await productbarcodes.create(
                            {
                                id: uuidv4(),

                                productId,

                                barcode,

                                barcodeType:
                                    barcodeType ||
                                    "EAN-13",

                                isPrimary: true,

                                createdAt: date,
                                updatedAt: date,
                            },
                            {
                                transaction
                            }
                        );
                    }

                    // -----------------------------------------
                    // REGULATORY
                    // -----------------------------------------

                    await productregulatory.create(
                        {
                            id: uuidv4(),

                            productId,

                            manufacturer,
                            countryOfOrigin,
                            licenseNumber,
                            mfgDate,
                            shelfLifeMonths,
                            allergens,
                            storageInstructions,

                            createdAt: date,
                            updatedAt: date,
                        },
                        {
                            transaction
                        }
                    );

                    return product;
                }
            );

        // =====================================================
        // SUCCESS
        // =====================================================

        return res.status(201).json({
            successful: true,

            message:
                "Product registered successfully",

            productId:
                result.id,
        });

    } catch (error) {

        console.log(
            "Product registration error:",
            error
        );

        return res.status(500).json({
            successful: false,

            message:
                "Failed to register product",

            error:
                error.message,
        });
    }
};
