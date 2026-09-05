"use strict";

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
        const { id } = req.params;

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

            status,
        } = req.body;

        // =====================================================
        // VALIDATE MODELS
        // =====================================================

        if (!sequelize) {
            throw new Error(
                "Sequelize instance is not initialized"
            );
        }

        if (!product) {
            throw new Error(
                "Product model is not initialized"
            );
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
        // VALIDATE PRODUCT ID
        // =====================================================

        if (!id || !String(id).trim()) {
            return res.status(400).json({
                successful: false,
                message: "Product ID is required",
            });
        }

        // =====================================================
        // FIND PRODUCT
        // =====================================================

        const existingProduct = await product.findOne({
            where: {
                id,
            },
        });

        if (!existingProduct) {
            return res.status(404).json({
                successful: false,
                message: "Product not found",
            });
        }

        // =====================================================
        // DUPLICATE SKU CHECK
        // =====================================================

        if (
            sku !== undefined &&
            String(sku).trim() !== ""
        ) {
            const cleanSku = String(sku).trim();

            const duplicateSku =
                await product.findOne({
                    where: {
                        sku: cleanSku,
                    },
                });

            if (
                duplicateSku &&
                duplicateSku.id !== id
            ) {
                return res.status(409).json({
                    successful: false,
                    message:
                        "Product SKU already exists",
                });
            }
        }

        // =====================================================
        // BARCODE CHECK
        // =====================================================

        let existingBarcode = null;

        if (
            barcode !== undefined &&
            barcode !== null &&
            String(barcode).trim() !== ""
        ) {
            const cleanBarcode =
                String(barcode).trim();

            existingBarcode =
                await productbarcode.findOne({
                    where: {
                        barcode: cleanBarcode,
                    },
                });

            if (
                existingBarcode &&
                existingBarcode.productId !== id
            ) {
                return res.status(409).json({
                    successful: false,
                    message:
                        "Barcode already belongs to another product",
                });
            }
        }

        // =====================================================
        // TRANSACTION
        // =====================================================

        const result =
            await sequelize.transaction(
                async (transaction) => {

                    const now = new Date();

                    // =================================================
                    // UPDATE PRODUCT
                    // =================================================

                    const productData = {};

                    if (sku !== undefined) {
                        productData.sku =
                            String(sku).trim();
                    }

                    if (itemName !== undefined) {
                        productData.itemName =
                            String(itemName).trim();
                    }

                    if (
                        productName !== undefined
                    ) {
                        productData.productName =
                            productName || null;
                    }

                    if (
                        description !== undefined
                    ) {
                        productData.description =
                            description || null;
                    }

                    if (
                        productType !== undefined
                    ) {
                        productData.productType =
                            productType || null;
                    }

                    if (
                        brandId !== undefined
                    ) {
                        productData.brandId =
                            brandId || null;
                    }

                    if (
                        categoryId !== undefined
                    ) {
                        productData.categoryId =
                            categoryId || null;
                    }

                    if (
                        unitId !== undefined
                    ) {
                        productData.unitId =
                            unitId || null;
                    }

                    if (
                        taxGroupId !== undefined
                    ) {
                        productData.taxGroupId =
                            taxGroupId || null;
                    }

                    if (status !== undefined) {
                        productData.status =
                            status;
                    }

                    productData.updatedAt = now;

                    await product.update(
                        productData,
                        {
                            where: {
                                id,
                            },
                            transaction,
                        }
                    );

                    // =================================================
                    // FIND PRODUCT DETAILS
                    // =================================================

                    const details =
                        await productdetails.findOne({
                            where: {
                                productId: id,
                            },
                            transaction,
                        });

                    const detailsData = {};

                    if (
                        flavor !== undefined
                    ) {
                        detailsData.flavor =
                            flavor || null;
                    }

                    if (size !== undefined) {
                        detailsData.size =
                            size || null;
                    }

                    if (
                        netWeight !== undefined
                    ) {
                        detailsData.netWeight =
                            netWeight === "" ||
                            netWeight === null
                                ? null
                                : netWeight;
                    }

                    if (
                        weightUnit !== undefined
                    ) {
                        detailsData.weightUnit =
                            weightUnit || null;
                    }

                    if (
                        packagingType !==
                        undefined
                    ) {
                        detailsData.packagingType =
                            packagingType || null;
                    }

                    if (
                        servings !== undefined
                    ) {
                        detailsData.servings =
                            servings === "" ||
                            servings === null
                                ? null
                                : servings;
                    }

                    if (
                        servingSize !==
                        undefined
                    ) {
                        detailsData.servingSize =
                            servingSize || null;
                    }

                    // =================================================
                    // PRICES
                    // =================================================

                    if (
                        costPrice !== undefined
                    ) {
                        detailsData.costPrice =
                            costPrice === "" ||
                            costPrice === null
                                ? 0
                                : costPrice;
                    }

                    if (
                        sellingPrice !==
                        undefined
                    ) {
                        detailsData.sellingPrice =
                            sellingPrice;
                    }

                    if (
                        wholesalePrice !==
                        undefined
                    ) {
                        detailsData.wholesalePrice =
                            wholesalePrice === "" ||
                            wholesalePrice === null
                                ? null
                                : wholesalePrice;
                    }

                    if (
                        minimumSellingPrice !==
                        undefined
                    ) {
                        detailsData.minimumSellingPrice =
                            minimumSellingPrice ===
                                "" ||
                            minimumSellingPrice ===
                                null
                                ? null
                                : minimumSellingPrice;
                    }

                    detailsData.updatedAt = now;

                    if (details) {
                        await productdetails.update(
                            detailsData,
                            {
                                where: {
                                    productId: id,
                                },
                                transaction,
                            }
                        );
                    }

                    // =================================================
                    // BARCODE
                    // =================================================

                    if (
                        barcode !== undefined
                    ) {
                        const cleanBarcode =
                            barcode === null ||
                            String(barcode).trim() === ""
                                ? null
                                : String(
                                      barcode
                                  ).trim();

                        const primaryBarcode =
                            await productbarcode.findOne(
                                {
                                    where: {
                                        productId:
                                            id,
                                        isPrimary:
                                            true,
                                    },
                                    transaction,
                                }
                            );

                        if (
                            cleanBarcode ===
                            null
                        ) {
                            // Remove primary barcode
                            if (
                                primaryBarcode
                            ) {
                                await productbarcode.destroy(
                                    {
                                        where: {
                                            id: primaryBarcode.id,
                                        },
                                        transaction,
                                    }
                                );
                            }
                        } else if (
                            primaryBarcode
                        ) {
                            await productbarcode.update(
                                {
                                    barcode:
                                        cleanBarcode,

                                    barcodeType:
                                        barcodeType ||
                                        primaryBarcode.barcodeType ||
                                        "EAN-13",

                                    updatedAt:
                                        now,
                                },
                                {
                                    where: {
                                        id: primaryBarcode.id,
                                    },
                                    transaction,
                                }
                            );
                        } else {
                            await productbarcode.create(
                                {
                                    id:
                                        crypto.randomUUID(),

                                    productId:
                                        id,

                                    barcode:
                                        cleanBarcode,

                                    barcodeType:
                                        barcodeType ||
                                        "EAN-13",

                                    isPrimary:
                                        true,

                                    createdAt:
                                        now,

                                    updatedAt:
                                        now,
                                },
                                {
                                    transaction,
                                }
                            );
                        }
                    }

                    // =================================================
                    // REGULATORY
                    // =================================================

                    const regulatory =
                        await productregulatory.findOne(
                            {
                                where: {
                                    productId:
                                        id,
                                },
                                transaction,
                            }
                        );

                    const regulatoryData =
                        {};

                    if (
                        manufacturer !==
                        undefined
                    ) {
                        regulatoryData.manufacturer =
                            manufacturer ||
                            null;
                    }

                    if (
                        countryOfOrigin !==
                        undefined
                    ) {
                        regulatoryData.countryOfOrigin =
                            countryOfOrigin ||
                            null;
                    }

                    if (
                        licenseNumber !==
                        undefined
                    ) {
                        regulatoryData.licenseNumber =
                            licenseNumber ||
                            null;
                    }

                    if (
                        mfgDate !== undefined
                    ) {
                        regulatoryData.mfgDate =
                            mfgDate || null;
                    }

                    if (
                        shelfLifeMonths !==
                        undefined
                    ) {
                        regulatoryData.shelfLifeMonths =
                            shelfLifeMonths ===
                                "" ||
                            shelfLifeMonths ===
                                null
                                ? null
                                : shelfLifeMonths;
                    }

                    if (
                        allergens !==
                        undefined
                    ) {
                        regulatoryData.allergens =
                            allergens || null;
                    }

                    if (
                        storageInstructions !==
                        undefined
                    ) {
                        regulatoryData.storageInstructions =
                            storageInstructions ||
                            null;
                    }

                    regulatoryData.updatedAt =
                        now;

                    if (regulatory) {
                        await productregulatory.update(
                            regulatoryData,
                            {
                                where: {
                                    productId:
                                        id,
                                },
                                transaction,
                            }
                        );
                    }

                    // =================================================
                    // RETURN UPDATED PRODUCT
                    // =================================================

                    return await product.findOne({
                        where: {
                            id,
                        },
                        include: [
                            {
                                model: productdetails,
                                as: "details",
                            },
                            {
                                model: productbarcode,
                                as: "barcodes",
                            },
                            {
                                model: productregulatory,
                                as: "regulatory",
                            },
                        ],
                        transaction,
                    });
                }
            );

        // =====================================================
        // SUCCESS
        // =====================================================

        return res.status(200).json({
            successful: true,

            message:
                "Product updated successfully",

            data: result,
        });

    } catch (error) {

        console.error(
            "Product update error:",
            error
        );

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

        if (
            error.name ===
            "SequelizeUniqueConstraintError"
        ) {
            return res.status(409).json({
                successful: false,

                message:
                    "A product with the same unique value already exists",

                errors:
                    error.errors?.map(
                        (item) => ({
                            field: item.path,
                            message:
                                item.message,
                        })
                    ),
            });
        }

        return res.status(500).json({
            successful: false,

            message:
                "Failed to update product",

            error:
                "Failed to update product",
        });
    }
};
