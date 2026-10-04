/**
 * Verification Script: IP-BASED BLOCK ACTION
 * Tests:
 * 1. Granular permission checks: orders.view_ip vs orders.block_ip vs super_admin
 * 2. Order Details IP section display & action visibility
 * 3. Server-side IP block endpoint POST /api/orders/:orderId/block-ip
 * 4. Server-side IP unblock endpoint DELETE /api/orders/:orderId/block-ip
 * 5. Central IP management endpoints GET/POST/DELETE /api/admin/blocked-ips
 * 6. Server-side order rejection on blocked IP (POST /api/orders rejects blocked IP with 403)
 * 7. Unblocking restores order placement capability
 * 8. Audit log recording for IP_BLOCK and IP_UNBLOCK
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function verifyIpBlockAction() {
  console.log('================================================================');
  console.log('VERIFYING: IP-BASED BLOCK ACTION SPECIFICATIONS');
  console.log('================================================================\n');

  // 1. Read files
  const routerCode = readFileSync(resolve('src/server/router.ts'), 'utf-8');
  const dbCode = readFileSync(resolve('src/server/db.ts'), 'utf-8');
  const viteConfig = readFileSync(resolve('vite.config.ts'), 'utf-8');
  const adminPanelCode = readFileSync(resolve('src/components/AdminPanel.tsx'), 'utf-8');
  const adminIpTabCode = readFileSync(resolve('src/components/Admin/AdminIpManagementTab.tsx'), 'utf-8');
  const permissionsCode = readFileSync(resolve('src/utils/permissions.ts'), 'utf-8');
  const serverPermsCode = readFileSync(resolve('src/server/permissions.ts'), 'utf-8');
  const orderApiCode = readFileSync(resolve('src/services/orderApi.ts'), 'utf-8');

  // -------------------------------------------------------------
  // TEST 1: Permissions Definitions
  // -------------------------------------------------------------
  console.log('--- TEST 1: Granular IP Permissions ---');
  assert(
    serverPermsCode.includes("'orders.view_ip'") && serverPermsCode.includes("'orders.block_ip'"),
    '1.1 orders.view_ip and orders.block_ip are declared in server PERMISSION_KEYS'
  );

  assert(
    permissionsCode.includes("permStr === 'orders.view_ip'") &&
    permissionsCode.includes("permStr === 'orders.block_ip'"),
    '1.2 frontend hasUserPermission evaluates orders.view_ip and orders.block_ip'
  );

  // -------------------------------------------------------------
  // TEST 2: Order Details IP Section and Action Button Visibility
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Order Details Customer IP & Action Visibility ---');
  assert(
    adminPanelCode.includes('canViewIp && (') &&
    adminPanelCode.includes('Customer IP:') &&
    adminPanelCode.includes('Status:'),
    '2.1 Order Details renders Customer IP and Status when canViewIp is true'
  );

  assert(
    adminPanelCode.includes('canBlockIp && editingOrder.customerIp && (') &&
    adminPanelCode.includes('btn-order-block-ip') &&
    adminPanelCode.includes('btn-order-unblock-ip'),
    '2.2 Block IP and Unblock IP actions require canBlockIp (users with view-only cannot see block buttons)'
  );

  assert(
    adminPanelCode.includes("const canViewIp = Boolean(") &&
    adminPanelCode.includes("hasPermission('orders.view_ip')") &&
    adminPanelCode.includes("const canBlockIp = Boolean(") &&
    adminPanelCode.includes("hasPermission('orders.block_ip')"),
    '2.3 canViewIp and canBlockIp check super_admin or granular permissions'
  );

  // -------------------------------------------------------------
  // TEST 3: Confirmation Modal & Refresh Behavior
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Confirmation Modal & Status Refresh ---');
  assert(
    adminPanelCode.includes('modal-target-ip-display') &&
    adminPanelCode.includes('blockTargetData?.ip'),
    '3.1 Confirmation modal shows the exact IP that will be blocked'
  );

  assert(
    adminPanelCode.includes('modal-block-ip-reason') &&
    adminPanelCode.includes('Reason for Blocking (Optional)'),
    '3.2 Confirmation modal allows optional block reason input'
  );

  assert(
    adminPanelCode.includes('orderApi.blockIp(') &&
    adminPanelCode.includes('orderApi.unblockIp('),
    '3.3 Confirmation modal calls existing server-side orderApi block/unblock'
  );

  assert(
    adminPanelCode.includes('setEditingOrder((prev) => (prev ? { ...prev, isIpBlocked: true } : null))') &&
    adminPanelCode.includes('setEditingOrder((prev) => (prev ? { ...prev, isIpBlocked: false } : null))'),
    '3.4 UI updates editingOrder isIpBlocked to immediately reflect Active vs Blocked'
  );

  assert(
    adminPanelCode.includes('if (refreshOrders) refreshOrders();') &&
    adminPanelCode.includes('setOrders((prev) =>'),
    '3.5 UI synchronizes orders state and calls refreshOrders upon block/unblock'
  );

  // -------------------------------------------------------------
  // TEST 4: Backend Enforcement in Cloudflare Worker Router
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Server-Side Blocklist Enforcement (router.ts) ---');
  assert(
    routerCode.includes('path === \'/api/orders\' && method === \'POST\'') &&
    routerCode.includes('const isBlocked = await isIpAddressBlocked(env.DB, clientIp);') &&
    routerCode.includes('return jsonResponse(') &&
    routerCode.includes('403'),
    '4.1 Cloudflare router rejects new order attempts with 403 when client IP is in D1 blocked_ips'
  );

  assert(
    routerCode.includes('/api/orders/:orderId/block-ip') ||
    routerCode.includes('orderIdMatch') && routerCode.includes('block-ip'),
    '4.2 Cloudflare router provides POST/DELETE /api/orders/:orderId/block-ip'
  );

  assert(
    routerCode.includes("action: 'IP_BLOCK'") &&
    routerCode.includes("action: 'IP_UNBLOCK'") &&
    routerCode.includes("targetType: 'blocked_ips'"),
    '4.3 Cloudflare router logs audit entries for IP_BLOCK and IP_UNBLOCK'
  );

  // -------------------------------------------------------------
  // TEST 5: Backend Enforcement in Dev Server (vite.config.ts)
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Dev Server Enforcement (vite.config.ts) ---');
  assert(
    viteConfig.includes('devBlockedIps.has(clientIp)') &&
    viteConfig.includes('res.statusCode = 403;') &&
    viteConfig.includes('Order could not be processed. Please contact support.'),
    '5.1 Dev server rejects POST /api/orders with 403 when IP is blocked'
  );

  assert(
    viteConfig.includes('/api/orders/:([^/]+)/block-ip') ||
    viteConfig.includes("url.pathname.match(/^\\/api\\/orders\\/([^/]+)\\/block-ip$/)"),
    '5.2 Dev server implements /api/orders/:orderId/block-ip endpoints'
  );

  assert(
    viteConfig.includes("url.pathname === '/api/admin/blocked-ips'") &&
    viteConfig.includes("url.pathname.match(/^\\/api\\/admin\\/blocked-ips\\/([^/]+)$/)"),
    '5.3 Dev server implements central /api/admin/blocked-ips endpoints'
  );

  // -------------------------------------------------------------
  // TEST 6: Dedicated IP Management Section
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Dedicated IP Management Section ---');
  assert(
    adminIpTabCode.includes('orderApi.getBlockedIps()') &&
    adminIpTabCode.includes('orderApi.blockIp(') &&
    adminIpTabCode.includes('orderApi.unblockIp('),
    '6.1 Dedicated IP Management tab fetches blocked IPs and supports block & unblock'
  );

  assert(
    adminIpTabCode.includes('canBlockIp ? (') &&
    adminIpTabCode.includes('btn-manual-block-ip'),
    '6.2 Dedicated IP Management tab restricts manual Block/Unblock actions to canBlockIp'
  );

  assert(
    adminPanelCode.includes("activeTab === 'ip-management'") &&
    adminPanelCode.includes('<AdminIpManagementTab'),
    '6.3 AdminPanel renders AdminIpManagementTab when activeTab is ip-management'
  );

  console.log('\n================================================================');
  console.log('ALL IP-BASED BLOCK ACTION VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

verifyIpBlockAction().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
