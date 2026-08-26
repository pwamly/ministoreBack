'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('products', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4
      },

      sku: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },

      barcode: {
        type: Sequelize.STRING(50),
        allowNull: true,
        unique: true
      },

      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },

      brand: {
        type: Sequelize.STRING(100),
        allowNull: true
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      price: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },

      costPrice: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
        defaultValue: 0
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('products');
  }
};
