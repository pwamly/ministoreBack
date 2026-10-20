"use strict";

// =====================================================
// ROLES & PERMISSIONS
// =====================================================
//
// Routes are protected by permission, never by role name, so a
// role can be changed here without touching any route.
// The login response sends the user's permissions to the
// frontend, which uses the same list to build menus/routes.

export const ROLES = {
    SUPER_ADMIN: "super_admin", // SaaS operator, no tenant
    OWNER: "owner", // store owner, full access to own store
    MANAGER: "manager", // runs the store, cannot manage users/settings
    CASHIER: "cashier", // checkout + own sales only
};

export const TENANT_ROLES = [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER];

export const PERMISSIONS = {
    PRODUCTS_VIEW: "products.view",
    PRODUCTS_MANAGE: "products.manage",
    PRODUCTS_VIEW_COST: "products.view_cost",

    SALES_CREATE: "sales.create",
    SALES_VIEW: "sales.view",
    SALES_VIEW_ALL: "sales.view_all", // without it: only own sales
    SALES_VIEW_PROFIT: "sales.view_profit",

    INVENTORY_VIEW: "inventory.view",
    INVENTORY_MANAGE: "inventory.manage",

    EXPENSES_VIEW: "expenses.view", // without view_all: only own expenses
    EXPENSES_VIEW_ALL: "expenses.view_all",
    EXPENSES_CREATE: "expenses.create",
    EXPENSES_MANAGE: "expenses.manage", // edit/delete any expense, categories

    LOANS_VIEW: "loans.view",
    LOANS_COLLECT: "loans.collect",

    USERS_MANAGE: "users.manage",
    SETTINGS_MANAGE: "settings.manage",

    PLATFORM_MANAGE: "platform.manage",
};

const P = PERMISSIONS;

const MANAGER_PERMISSIONS = [
    P.PRODUCTS_VIEW,
    P.PRODUCTS_MANAGE,
    P.PRODUCTS_VIEW_COST,
    P.SALES_CREATE,
    P.SALES_VIEW,
    P.SALES_VIEW_ALL,
    P.SALES_VIEW_PROFIT,
    P.INVENTORY_VIEW,
    P.INVENTORY_MANAGE,
    P.EXPENSES_VIEW,
    P.EXPENSES_VIEW_ALL,
    P.EXPENSES_CREATE,
    P.EXPENSES_MANAGE,
    P.LOANS_VIEW,
    P.LOANS_COLLECT,
];

export const ROLE_PERMISSIONS = {
    [ROLES.SUPER_ADMIN]: [P.PLATFORM_MANAGE],

    [ROLES.OWNER]: [...MANAGER_PERMISSIONS, P.USERS_MANAGE, P.SETTINGS_MANAGE],

    [ROLES.MANAGER]: MANAGER_PERMISSIONS,

    // Cashier: checkout, own sales, own expenses, loan collection.
    // products.view is needed to search items at checkout.
    [ROLES.CASHIER]: [
        P.PRODUCTS_VIEW,
        P.SALES_CREATE,
        P.SALES_VIEW,
        P.EXPENSES_VIEW,
        P.EXPENSES_CREATE,
        P.LOANS_VIEW,
        P.LOANS_COLLECT,
    ],
};

// =====================================================
// SUBSCRIPTION MODULES
// =====================================================
//
// Core features (products, checkout, sales, users) are in every
// plan. These optional modules are switched on per plan.

export const MODULES = {
    INVENTORY: "inventory",
    EXPENSES: "expenses",
    LOANS: "loans",
};

// Which module a permission belongs to (absent = core).
const PERMISSION_MODULE = {
    [P.INVENTORY_VIEW]: MODULES.INVENTORY,
    [P.INVENTORY_MANAGE]: MODULES.INVENTORY,
    [P.EXPENSES_VIEW]: MODULES.EXPENSES,
    [P.EXPENSES_VIEW_ALL]: MODULES.EXPENSES,
    [P.EXPENSES_CREATE]: MODULES.EXPENSES,
    [P.EXPENSES_MANAGE]: MODULES.EXPENSES,
    [P.LOANS_VIEW]: MODULES.LOANS,
    [P.LOANS_COLLECT]: MODULES.LOANS,
};

export const permissionsForRole = (role) => ROLE_PERMISSIONS[role] || [];

/**
 * Effective permissions = role permissions minus anything whose
 * module is not in the tenant's plan.
 */
export const effectivePermissions = (role, enabledModules = []) =>
    permissionsForRole(role).filter((permission) => {
        const module = PERMISSION_MODULE[permission];

        return !module || enabledModules.includes(module);
    });
