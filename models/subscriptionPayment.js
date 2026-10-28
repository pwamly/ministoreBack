"use strict";

// A store paying for its subscription (see services/billing.js).

export default (sequelize, DataTypes) => {
    const subscriptionPayment = sequelize.define(
        "subscriptionPayment",
        {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },
            tenantId: { type: DataTypes.UUID, allowNull: false },
            planId: { type: DataTypes.UUID, allowNull: false },
            periods: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
            amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
            currency: { type: DataTypes.STRING(10), allowNull: false },
            provider: { type: DataTypes.STRING(30), allowNull: false },
            orderReference: { type: DataTypes.STRING(20), allowNull: false, unique: true },
            providerPaymentId: { type: DataTypes.STRING(100), allowNull: true },
            channel: { type: DataTypes.STRING(50), allowNull: true },
            phone: { type: DataTypes.STRING(20), allowNull: true },
            // pending | paid | failed | review (paid the wrong amount) | rejected (manual proof refused)
            status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "pending" },
            message: { type: DataTypes.STRING(255), allowNull: true },
            periodStart: { type: DataTypes.DATE, allowNull: true },
            periodEnd: { type: DataTypes.DATE, allowNull: true },
            paidAt: { type: DataTypes.DATE, allowNull: true },
            createdBy: { type: DataTypes.CHAR(36), allowNull: true },
        },
        {
            tableName: "subscriptionPayments",
            modelName: "subscriptionPayment",
            timestamps: true,
            underscored: false,
        }
    );

    subscriptionPayment.associate = (models) => {
        subscriptionPayment.belongsTo(models.tenant, { foreignKey: "tenantId", as: "tenant" });
        subscriptionPayment.belongsTo(models.plan, { foreignKey: "planId", as: "plan" });
    };

    return subscriptionPayment;
};
