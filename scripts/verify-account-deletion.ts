import { deleteUserFromD1 } from '../src/server/db';
import { hashPassword, verifyPassword } from '../src/server/auth';
import { getTestAdminToken } from './test-auth-helper';

async function runTests() {
  console.log('--- STARTING ACCOUNT DELETION VERIFICATION ---');

  // Test 1: Unit testing deleteUserFromD1 verifies affected rows and cleans tokens
  console.log('Test 1: deleteUserFromD1 affected rows verification');
  const tracker = { tokenCleared: false, userDeleted: false };

  const mockDbSuccess: any = {
    prepare: (sql: string) => ({
      bind: (...args: any[]) => ({
        run: async () => {
          if (sql.includes('password_reset_tokens')) {
            tracker.tokenCleared = true;
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('users')) {
            tracker.userDeleted = true;
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      }),
    }),
  };

  const resSuccess = await deleteUserFromD1(mockDbSuccess, 'target-admin-123');
  console.assert(resSuccess === true, 'deleteUserFromD1 must return true when changes > 0');
  console.assert(tracker.tokenCleared === true, 'deleteUserFromD1 must clear user reset tokens');
  console.assert(tracker.userDeleted === true, 'deleteUserFromD1 must delete user from users table');
  console.log('✅ deleteUserFromD1 deletes user and cleans tokens');

  // Test 1b: deleteUserFromD1 returns false if 0 rows deleted
  const mockDbNoChanges: any = {
    prepare: () => ({
      bind: () => ({
        run: async () => ({ success: true, meta: { changes: 0 } }),
      }),
    }),
  };
  const resNoChange = await deleteUserFromD1(mockDbNoChanges, 'non-existent-user');
  console.assert(resNoChange === false, 'deleteUserFromD1 must return false when changes === 0');
  console.log('✅ deleteUserFromD1 returns false if account does not exist');

  // Test 2: API Login as Super Admin and create a test Admin account
  console.log('Test 2: Super Admin login and test Admin creation');
  const testSuperToken = await getTestAdminToken('http://localhost:3000');

  const superHeaders = {
    'Content-Type': 'application/json',
    'Cookie': `auth_token=${testSuperToken}`,
    'Authorization': `Bearer ${testSuperToken}`,
  };

  // Create a temporary test Admin account
  const createAdminRes = await fetch('http://localhost:3000/api/users', {
    method: 'POST',
    headers: superHeaders,
    body: JSON.stringify({
      id: 'test-admin-temp-001',
      name: 'Temporary Admin User',
      email: 'temp.admin@example.com',
      role: 'admin',
      password: 'TempAdminPass2026!',
    }),
  });
  console.assert(createAdminRes.status === 201, `Create admin must return 201, got ${createAdminRes.status}`);
  const createdAdminData = await createAdminRes.json();
  console.log('✅ Temporary Admin account created:', createdAdminData.user?.email);

  // Test 3: Verify the new Admin can log in
  console.log('Test 3: Verify temporary Admin can log in before deletion');
  const tempLoginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: 'temp.admin@example.com',
      password: 'TempAdminPass2026!',
    }),
  });
  console.assert(tempLoginRes.status === 200, `Temp admin login must succeed, got ${tempLoginRes.status}`);
  console.log('✅ Temporary Admin logged in successfully');

  // Test 4: Verify the new Admin appears in GET /api/users
  console.log('Test 4: Verify Admin appears in user listing');
  const listBeforeRes = await fetch('http://localhost:3000/api/users', {
    method: 'GET',
    headers: superHeaders,
  });
  const listBefore = await listBeforeRes.json();
  const foundBefore = listBefore.users?.find((u: any) => u.email === 'temp.admin@example.com');
  console.assert(Boolean(foundBefore), 'Created admin must be present in user directory');
  console.log('✅ Temporary Admin found in user directory');

  // Test 5: Super Admin protection: Cannot delete Super Admin account
  console.log('Test 5: Protection check - cannot delete Super Admin');
  const delSuperRes = await fetch('http://localhost:3000/api/users/cmt413uec@gmail.com', {
    method: 'DELETE',
    headers: superHeaders,
  });
  console.assert(delSuperRes.status === 403, `Deleting super admin must be forbidden (403), got ${delSuperRes.status}`);
  console.log('✅ Super Admin account is permanently protected against deletion');

  // Test 6: Delete the test Admin from Super Admin
  console.log('Test 6: Super Admin deletes the temporary Admin account');
  const deleteRes = await fetch(`http://localhost:3000/api/users/${foundBefore.id}`, {
    method: 'DELETE',
    headers: superHeaders,
  });
  console.assert(deleteRes.status === 200, `Deleting admin must succeed with 200, got ${deleteRes.status}`);
  const deleteData = await deleteRes.json();
  console.assert(deleteData.success === true, 'Delete response must report success');
  console.log('✅ Temporary Admin deletion API call succeeded');

  // Test 7: Verify user listing after deletion (does not reappear upon re-fetch)
  console.log('Test 7: Verify user listing after deletion');
  const listAfterRes = await fetch('http://localhost:3000/api/users', {
    method: 'GET',
    headers: superHeaders,
  });
  const listAfter = await listAfterRes.json();
  const foundAfter = listAfter.users?.find((u: any) => u.email === 'temp.admin@example.com' || u.id === foundBefore.id);
  console.assert(!foundAfter, 'Deleted admin must NOT appear in user directory after refresh');
  console.log('✅ Deleted Admin is gone from user directory and does not return');

  // Test 8: Login with deleted credentials must fail
  console.log('Test 8: Login attempt with deleted credentials must fail');
  const postDeleteLoginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: 'temp.admin@example.com',
      password: 'TempAdminPass2026!',
    }),
  });
  console.assert(postDeleteLoginRes.status === 401, `Deleted user login must fail with 401, got ${postDeleteLoginRes.status}`);
  console.log('✅ Deleted Admin cannot log in');

  // Test 9: Deleting non-existent user returns 404
  console.log('Test 9: Deleting non-existent user returns 404');
  const nonExistentRes = await fetch('http://localhost:3000/api/users/non-existent-user-id-999', {
    method: 'DELETE',
    headers: superHeaders,
  });
  console.assert(nonExistentRes.status === 404, `Deleting non-existent user must return 404, got ${nonExistentRes.status}`);
  console.log('✅ Non-existent user deletion correctly returns 404');

  // Test 10: Orders and ecommerce records are untouched
  console.log('Test 10: Verify orders API works and orders are preserved');
  const ordersRes = await fetch('http://localhost:3000/api/orders', {
    method: 'GET',
    headers: superHeaders,
  });
  console.assert(ordersRes.status === 200, `Orders fetch must succeed, got ${ordersRes.status}`);
  const ordersData = await ordersRes.json();
  console.assert(Array.isArray(ordersData.orders), 'Orders list must remain intact');
  console.log(`✅ Ecommerce orders preserved (${ordersData.orders.length} orders present)`);

  console.log('--- ALL ACCOUNT DELETION TESTS PASSED SUCCESSFULLY ---');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
