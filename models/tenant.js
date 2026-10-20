"use strict";

// A tenant is one subscribing business (store). Every business
// row carries tenantId, and every query filters by it.

export default (sequelize, DataTypes) => {
    const tenant = sequelize.define(
        "tenant",
        {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },

            name: {
                type: DataTypes.STRING(150),
                allowNull: false,
            },

            slug: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },

            email: {
                type: DataTypes.STRING(150),
                allowNull: true,
            },

            phone: {
                type: DataTypes.STRING(50),
                allowNull: true,
            },

            address: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },

            currency: {
                type: DataTypes.STRING(10),
                allowNull: false,
                defaultValue: "TZS",
            },

            planId: {
                type: DataTypes.UUID,
                allowNull: false,
            },

            // active | suspended
            status: {
                type: DataTypes.STRING(20),
                allowNull: false,
                defaultValue: "active",
            },

            // trial | active | past_due | cancelled
            subscriptionStatus: {
                type: DataTypes.STRING(20),
                allowNull: false,
                defaultValue: "trial",
            },

            trialEndsAt: {
                type: DataTypes.DATE,
                allowNull: true,
            },

            // NULL = no end date
            subscriptionEndsAt: {
                type: DataTypes.DATE,
                allowNull: true,
            },

            allowNegativeStock: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
        },
        {
            tableName: "tenants",
            modelName: "tenant",
            timestamps: true,
            underscored: false,
        }
    );

    tenant.associate = (models) => {
        tenant.belongsTo(models.plan, {
            foreignKey: "planId",
            targetKey: "id",
            as: "plan",
        });

        tenant.hasMany(models.min_user, {
            foreignKey: "tenantId",
            sourceKey: "id",
            as: "users",
        });
    };

    return tenant;
};
