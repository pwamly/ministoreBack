"use strict";

import { v4 as uuidv4 } from "uuid";
import db from "../../models/index.js";

const {
    sequelize,
    product,
    productbarcode,
    productdetails,
    productregulatory,
} = db;

export default async (req, res) => {
    try {
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
            storageInstructions,
        } = req.body;

        // =====================================================
        // VALIDATE MODELS
        // =====================================================

        if (!sequelize) {
            throw new Error("Sequelize instance is not initialized");
        }

        if (!product) {
            throw new Error("Product model is not initialized");
        }

        if (!productdetails) {
            throw new Error(
                "Product details model is not initialized"
            );
        }

        if (!productbarcode) {
            throw new Error(
                "Product barcode model is not initialized"
            );
        }

        if (!productregulatory) {
            throw new Error(
                "Product regulatory model is not initialized"
            );
        }

        // =====================================================
        // VALIDATION
        // =====================================================

        if (!sku || !String(sku).trim()) {
            return res.status(400).json({
                successful: false,
                message: "SKU is required",
            });
        }

        if (!itemName || !String(itemName).trim()) {
            return res.status(400).json({
                successful: false,
                message: "Product name is required",
            });
        }

        if (
            sellingPrice === undefined ||
            sellingPrice === null ||
            sellingPrice === ""
        ) {
            return res.status(400).json({
                successful: false,
                message: "Selling price is required",
            });
        }

        if (Number.isNaN(Number(sellingPrice))) {
            return res.status(400).json({
                successful: false,
                message: "Selling price must be a valid number",
            });
        }

        // =====================================================
        // NORMALIZE VALUES
        // =====================================================

        const cleanSku = String(sku).trim();
        const cleanItemName = String(itemName).trim();

        const cleanBarcode =
            barcode !== undefined &&
            barcode !== null &&
            String(barcode).trim() !== ""
                ? String(barcode).trim()
                : null;

        // =====================================================
        // DUPLICATE SKU
        // =====================================================

        const existingSku = await product.findOne({
            where: {
                sku: cleanSku,
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

        if (cleanBarcode) {
            const existingBarcode =
                await productbarcode.findOne({
                    where: {
                        barcode: cleanBarcode,
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
        // CREATE EVERYTHING IN ONE TRANSACTION
        // =====================================================

        const result = await sequelize.transaction(
            async (transaction) => {
                const productId = uuidv4();

                // =================================================
                // PRODUCT
                // =================================================

                const createdProduct =
                    await product.create(
                        {
                            id: productId,

                            sku: cleanSku,

                            itemName: cleanItemName,

                            productName:
                                productName || cleanItemName,

                            description:
                                description || null,

                            productType:
                                productType || null,

                            brandId:
                                brandId || null,

                            categoryId:
                                categoryId || null,

                            unitId:
                                unitId || null,

                            taxGroupId:
                                taxGroupId || null,

                            status: "active",

                            createdAt: date,
                            updatedAt: date,
                        },
                        {
                            transaction,
                        }
                    );

                // =================================================
                // PRODUCT DETAILS
                // =================================================

                await productdetails.create(
                    {
                        id: uuidv4(),

                        productId,

                        flavor:
                            flavor || null,

                        size:
                            size || null,

                        netWeight:
                            netWeight !== undefined &&
                            netWeight !== null &&
                            netWeight !== ""
                                ? netWeight
                                : null,

                        weightUnit:
                            weightUnit || null,

                        packagingType:
                            packagingType || null,

                        servings:
                            servings !== undefined &&
                            servings !== null &&
                            servings !== ""
                                ? servings
                                : null,

                        servingSize:
                            servingSize || null,

                        costPrice:
                            costPrice !== undefined &&
                            costPrice !== null &&
                            costPrice !== ""
                                ? costPrice
                                : 0,

                        sellingPrice:
                            sellingPrice,

                        wholesalePrice:
                            wholesalePrice !== undefined &&
                            wholesalePrice !== null &&
                            wholesalePrice !== ""
                                ? wholesalePrice
                                : null,

                        minimumSellingPrice:
                            minimumSellingPrice !== undefined &&
                            minimumSellingPrice !== null &&
                            minimumSellingPrice !== ""
                                ? minimumSellingPrice
                                : null,

                        createdAt: date,
                        updatedAt: date,
                    },
                    {
                        transaction,
                    }
                );

                // =================================================
                // PRODUCT BARCODE
                // =================================================

                if (cleanBarcode) {
                    await productbarcode.create(
                        {
                            id: uuidv4(),

                            productId,

                            barcode: cleanBarcode,

                            barcodeType:
                                barcodeType ||
                                "EAN-13",

                            isPrimary: true,

                            createdAt: date,
                            updatedAt: date,
                        },
                        {
                            transaction,
                        }
                    );
                }

                // =================================================
                // PRODUCT REGULATORY
                // =================================================

                await productregulatory.create(
                    {
                        id: uuidv4(),

                        productId,

                        manufacturer:
                            manufacturer || null,

                        countryOfOrigin:
                            countryOfOrigin || null,

                        licenseNumber:
                            licenseNumber || null,

                        mfgDate:
                            mfgDate || null,

                        shelfLifeMonths:
                            shelfLifeMonths !== undefined &&
                            shelfLifeMonths !== null &&
                            shelfLifeMonths !== ""
                                ? shelfLifeMonths
                                : null,

                        allergens:
                            allergens || null,

                        storageInstructions:
                            storageInstructions || null,

                        createdAt: date,
                        updatedAt: date,
                    },
                    {
                        transaction,
                    }
                );

                return createdProduct;
            }
        );

        // =====================================================
        // SUCCESS
        // =====================================================

        return res.status(201).json({
            successful: true,

            message: "Product registered successfully",

            productId: result.id,

            data: {
                id: result.id,
                sku: result.sku,
                itemName: result.itemName,
                productName: result.productName,
                productType: result.productType,
                brandId: result.brandId,
                categoryId: result.categoryId,
                unitId: result.unitId,
                taxGroupId: result.taxGroupId,
                status: result.status,
            },
        });
    } catch (error) {
        // =====================================================
        // ERROR
        // =====================================================

        console.error(
            "Product registration error:",
            error
        );

        // Sequelize validation error
        if (
            error.name ===
            "SequelizeValidationError"
        ) {
            return res.status(400).json({
                successful: false,

                message:
                    "Product validation failed",

                errors: error.errors.map(
                    (item) => ({
                        field: item.path,
                        message: item.message,
                    })
                ),
            });
        }

        // Sequelize unique constraint
        if (
            error.name ===
            "SequelizeUniqueConstraintError"
        ) {
            return res.status(409).json({
                successful: false,

                message:
                    "A product with the same unique value already exists",

                errors: error.errors?.map(
                    (item) => ({
                        field: item.path,
                        message: item.message,
                    })
                ),
            });
        }

        return res.status(500).json({
            successful: false,

            message:
                "Failed to register product",

            error:
                "Failed to register product",
        });
    }
};
