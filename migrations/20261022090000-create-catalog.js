"use strict";

import { v4 as uuidv4 } from "uuid";

// Global product catalog shared by every store.
//
// Holds only product identity (name, barcode, size, brand...).
// Prices, costs, stock and sales stay in each store's own
// `products` / `productdetails` / `inventory` rows, which now
// point at their catalog item through products.catalogItemId.

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("catalogItems", {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
            },
            name: {
                type: Sequelize.STRING(200),
                allowNull: false,
            },
            // Global: one catalog item per barcode
            barcode: {
                type: Sequelize.STRING(100),
                allowNull: true,
                unique: true,
            },
            barcodeType: {
                type: Sequelize.STRING(30),
                allowNull: true,
            },
            // Lower-cased name, to find items without a barcode
            nameKey: {
                type: Sequelize.STRING(200),
                allowNull: false,
            },
            description: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            productType: {
                type: Sequelize.STRING(150),
                allowNull: true,
            },
            // Shared lookups only (tenantId IS NULL rows)
            brandId: {
                type: Sequelize.UUID,
                allowNull: true,
                references: { model: "brands", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            categoryId: {
                type: Sequelize.UUID,
                allowNull: true,
                references: { model: "categories", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            unitId: {
                type: Sequelize.UUID,
                allowNull: true,
                references: { model: "units", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            flavor: { type: Sequelize.STRING(100), allowNull: true },
            size: { type: Sequelize.STRING(50), allowNull: true },
            netWeight: { type: Sequelize.DECIMAL(12, 3), allowNull: true },
            weightUnit: { type: Sequelize.STRING(30), allowNull: true },
            packagingType: { type: Sequelize.STRING(100), allowNull: true },
            manufacturer: { type: Sequelize.STRING(200), allowNull: true },
            countryOfOrigin: { type: Sequelize.STRING(100), allowNull: true },
            // Checked by the platform admin
            verified: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            // How many stores sell it (for ranking search results)
            storeCount: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            createdByTenantId: {
                type: Sequelize.UUID,
                allowNull: true,
                references: { model: "tenants", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn("NOW"),
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn("NOW"),
            },
        });

        await queryInterface.addIndex("catalogItems", ["nameKey"], { name: "catalog_items_name_key_idx" });

        await queryInterface.addColumn("products", "catalogItemId", {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "catalogItems", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        });

        // -------------------------------------------------
        // Seed the catalog from every store's products.
        // -------------------------------------------------

        const [rows] = await queryInterface.sequelize.query(`
            SELECT p.id, p.tenantId, p.itemName, p.description, p.productType, p.createdAt,
                   (SELECT id FROM brands WHERE id = p.brandId AND tenantId IS NULL) AS brandId,
                   (SELECT id FROM categories WHERE id = p.categoryId AND tenantId IS NULL) AS categoryId,
                   (SELECT id FROM units WHERE id = p.unitId AND tenantId IS NULL) AS unitId,
                   (SELECT barcode FROM productbarcodes b WHERE b.productId = p.id ORDER BY b.isPrimary DESC LIMIT 1) AS barcode,
                   (SELECT barcodeType FROM productbarcodes b WHERE b.productId = p.id ORDER BY b.isPrimary DESC LIMIT 1) AS barcodeType,
                   d.flavor, d.size, d.netWeight, d.weightUnit, d.packagingType,
                   r.manufacturer, r.countryOfOrigin
              FROM products p
              LEFT JOIN productdetails d ON d.id = (SELECT id FROM productdetails WHERE productId = p.id LIMIT 1)
              LEFT JOIN productregulatory r ON r.productId = p.id
             ORDER BY p.createdAt ASC
        `);

        const byKey = new Map();
        const now = new Date();

        for (const row of rows) {
            const name = String(row.itemName).trim();
            const nameKey = name.toLowerCase().replace(/\s+/g, " ");
            const key = row.barcode ? `b:${row.barcode}` : `n:${nameKey}`;

            let item = byKey.get(key);

            if (!item) {
                // Oldest product wins; later copies only link to it.
                item = {
                    id: uuidv4(),
                    name,
                    barcode: row.barcode || null,
                    barcodeType: row.barcodeType || null,
                    nameKey,
                    description: row.description,
                    productType: row.productType,
                    brandId: row.brandId,
                    categoryId: row.categoryId,
                    unitId: row.unitId,
                    flavor: row.flavor,
                    size: row.size,
                    netWeight: row.netWeight,
                    weightUnit: row.weightUnit,
                    packagingType: row.packagingType,
                    manufacturer: row.manufacturer,
                    countryOfOrigin: row.countryOfOrigin,
                    verified: false,
                    storeCount: 0,
                    createdByTenantId: row.tenantId,
                    createdAt: now,
                    updatedAt: now,
                    productIds: [],
                    tenants: new Set(),
                };

                byKey.set(key, item);
            }

            item.productIds.push(row.id);
            item.tenants.add(row.tenantId);
        }

        for (const item of byKey.values()) {
            const { productIds, tenants, ...data } = item;

            data.storeCount = tenants.size;

            await queryInterface.bulkInsert("catalogItems", [data]);

            await queryInterface.sequelize.query(
                "UPDATE products SET catalogItemId = :catalogItemId WHERE id IN (:productIds)",
                { replacements: { catalogItemId: data.id, productIds } }
            );
        }
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("products", "catalogItemId");
        await queryInterface.dropTable("catalogItems");
    },
};
