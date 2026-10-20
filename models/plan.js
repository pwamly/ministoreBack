"use strict";

export default (sequelize, DataTypes) => {
    const plan = sequelize.define(
        "plan",
        {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },

            code: {
                type: DataTypes.STRING(50),
                allowNull: false,
            },

            name: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },

            price: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },

            currency: {
                type: DataTypes.STRING(10),
                allowNull: false,
                defaultValue: "TZS",
            },

            billingCycle: {
                type: DataTypes.STRING(20),
                allowNull: false,
                defaultValue: "monthly",
            },

            // NULL = unlimited
            maxUsers: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },

            maxProducts: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },

            // Module keys (see config/permissions.js MODULES).
            // Stored as JSON text so MySQL and MariaDB behave the same.
            modules: {
                type: DataTypes.TEXT,
                allowNull: false,
                defaultValue: "[]",
                get() {
                    const raw = this.getDataValue("modules");

                    try {
                        const parsed = JSON.parse(raw || "[]");

                        return Array.isArray(parsed) ? parsed : [];
                    } catch {
                        return [];
                    }
                },
                set(value) {
                    this.setDataValue(
                        "modules",
                        JSON.stringify(Array.isArray(value) ? value : [])
                    );
                },
            },

            status: {
                type: DataTypes.STRING(20),
                allowNull: false,
                defaultValue: "active",
            },
        },
        {
            tableName: "plans",
            modelName: "plan",
            timestamps: true,
            underscored: false,
        }
    );

    plan.associate = (models) => {
        plan.hasMany(models.tenant, {
            foreignKey: "planId",
            sourceKey: "id",
            as: "tenants",
        });
    };

    return plan;
};
