'use strict';

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('suppliers', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4
      },

      name: {
        type: Sequelize.STRING(200),
        allowNull: false
      },

      contactPerson: {
        type: Sequelize.STRING(150),
        allowNull: true
      },

      phone: {
        type: Sequelize.STRING(50),
        allowNull: true
      },

      email: {
        type: Sequelize.STRING(150),
        allowNull: true
      },

      address: {
        type: Sequelize.STRING(255),
        allowNull: true
      },

      city: {
        type: Sequelize.STRING(100),
        allowNull: true
      },

      taxNumber: {
        type: Sequelize.STRING(100),
        allowNull: true
      },

      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      status: {
        type: Sequelize.ENUM(
          'active',
          'inactive'
        ),
        allowNull: false,
        defaultValue: 'active'
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
      'suppliers',
      ['name'],
      {
        name: 'suppliers_name_index'
      }
    );

    await queryInterface.addIndex(
      'suppliers',
      ['phone'],
      {
        name: 'suppliers_phone_index'
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('suppliers');
  }
};
