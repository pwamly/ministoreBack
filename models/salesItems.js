"use strict";

export default (sequelize, DataTypes) => {
  const salesItems = sequelize.define(
    "salesItems",
    {
      id: {
        type: DataTypes.UUID,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },

      saleId: {
        type: DataTypes.UUID,
        allowNull: false,
      },

      productId: {
        type: DataTypes.UUID,
        allowNull: false,
      },

      sku: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },

      barcode: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },

      productName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },

      quantity: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: false,
      },

      unitPrice: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
      },

      costPrice: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },

      subtotal: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
      },
      profit: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      tableName: "salesItems",
      modelName: "salesItems",
      timestamps: true,
      underscored: false,
    },
  );

  salesItems.associate = (models) => {
    salesItems.belongsTo(models.sales, {
      foreignKey: "saleId",
      targetKey: "id",
      as: "sale",
    });

    salesItems.belongsTo(models.product, {
      foreignKey: "productId",
      targetKey: "id",
      as: "product",
    });
  };

  return salesItems;
};
