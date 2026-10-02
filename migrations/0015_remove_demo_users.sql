-- Migration 0015: Remove demo, test, and preset accounts from D1 users table
-- Ensures no hardcoded demo or development credentials persist in production database
DELETE FROM users WHERE email IN (
  'dev-superadmin@local.test',
  'subadmin@rongdhonutrade.com',
  'sakib@gmail.com',
  'operations@rongdhonu.com',
  'staff@rongdhonutrade.com',
  'inventory@rongdhonutrade.com',
  'orders@rongdhonutrade.com',
  'admin.staff@rongdhonutrade.com',
  'customer@gmail.com',
  'tanvir@gmail.com',
  'updater@local.test',
  'viewer@local.test',
  'finance@local.test',
  'customer@local.test'
) OR id IN (
  'dev-admin-1',
  'user-sub-rahman',
  'user-cust-sakib',
  'user-subadmin-operations',
  'user-subadmin-staff',
  'user-subadmin-inventory',
  'user-subadmin-orders',
  'user-admin-assistant',
  'user-cust-demo',
  'user-cust-tanvir',
  'test-user-update-only',
  'test-user-view-only',
  'test-user-financial-mgr',
  'test-customer-1'
);
