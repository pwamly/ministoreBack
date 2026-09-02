'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('inventory', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4
      },

      productId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      quantity: {
        type: Sequelize.DECIMAL(15, 3),
        allowNull: false,
        defaultValue: 0
      },

      reorderLevel: {
        type: Sequelize.DECIMAL(15, 3),
        allowNull: false,
        defaultValue: 0
      },

      reorderQuantity: {
        type: Sequelize.DECIMAL(15, 3),
        allowNull: false,
        defaultValue: 0
      },

      location: {
        type: Sequelize.STRING(150),
        allowNull: true
      },

      batchNumber: {
        type: Sequelize.STRING(100),
        allowNull: true
      },

      expiryDate: {
        type: Sequelize.DATE,
        allowNull: true
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

    await queryInterface.addIndex(
      'inventory',
      ['productId'],
      {
        unique: true,
        name: 'inventory_product_unique'
      }
    );

    await queryInterface.addIndex(
      'inventory',
      ['expiryDate'],
      {
        name: 'inventory_expiry_date'
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('inventory');
  }
};
