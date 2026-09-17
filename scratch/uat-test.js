const http = require('http');

function request(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '200.234.39.163',
      port: 80,
      path: '/api/v1' + path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    
    const req = http.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, data: parsed });
        } catch(e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function getItems(res) {
  if (!res.data) return null;
  if (Array.isArray(res.data.data?.data)) return res.data.data.data;
  if (Array.isArray(res.data.data)) return res.data.data;
  if (Array.isArray(res.data)) return res.data;
  if (res.data.data?.data) return res.data.data.data;
  if (res.data.data) return res.data.data;
  return res.data;
}

async function run() {
  console.log("=== F1 UAT SCRIPT ===");
  try {
    const ceoLogin = await request('POST', '/auth/login', { email: 'admin@elscore.internal', password: 'ChangeMe123!' });
    const ceoToken = getItems(ceoLogin).accessToken;
    console.log("CEO Login:", ceoLogin.status);

    const deps = await request('GET', '/departments?limit=100', null, ceoToken);
    const depId = getItems(deps)[0].id;
    
    const roles = await request('GET', '/roles?limit=100', null, ceoToken);
    const rolesItems = getItems(roles);
    
    const hrManagerRole = rolesItems.find(r => r.code === 'HR_MANAGER').id;
    const hrAssistantRole = rolesItems.find(r => r.code === 'HR_ASSISTANT').id;

    // 2. Create HR Manager User
    console.log("\\n-- SCENARIO: User Creation --");
    const hrEmail = 'hrmanager_test' + Date.now() + '@elscore.test';
    const hrRes = await request('POST', '/users', {
      email: hrEmail, password: 'TestPassword123!', firstName: 'HR', lastName: 'Test', departmentId: depId, roleId: hrManagerRole
    }, ceoToken);
    console.log("Create HR Manager:", hrRes.status);
    const hrUserId = getItems(hrRes).id;
    const hrEmpId = getItems(hrRes).employee.businessId;
    console.log("Business ID returned:", hrEmpId);
    
    // Login as HR Manager
    const hrLogin = await request('POST', '/auth/login', { email: hrEmail, password: 'TestPassword123!' });
    const hrToken = getItems(hrLogin).accessToken;

    // 3. Create Custom Role
    console.log("\\n-- SCENARIO: Custom Role --");
    const roleRes = await request('POST', '/roles', {
      code: 'CUSTOM_LEAD_READER_' + Date.now(),
      name: 'Lead Reader',
      description: 'Can only read leads'
    }, ceoToken);
    console.log("Create Custom Role:", roleRes.status);
    const customRoleId = getItems(roleRes).id;

    const permsRes = await request('GET', '/permissions?limit=100', null, ceoToken);
    const permsItems = getItems(permsRes);
    
    const leadReadPerm = permsItems.find(p => p.code === 'lead.read').id;

    const assignPermRes = await request('PATCH', `/roles/${customRoleId}/permissions`, {
      action: 'ADD', permissionId: leadReadPerm
    }, ceoToken);
    console.log("Assign Permission to Custom Role:", assignPermRes.status);

    const verifyRole = await request('GET', `/roles/${customRoleId}`, null, ceoToken);
    console.log("Role Permissions Check:", getItems(verifyRole).permissions.some(p => p.permissionId === leadReadPerm));

    // 4. Protected Roles check
    console.log("\\n-- SCENARIO: Protected Roles --");
    const ceoRoleId = rolesItems.find(r => r.code === 'CEO').id;
    const protectRes = await request('PATCH', `/roles/${ceoRoleId}/permissions`, {
      action: 'ADD', permissionId: leadReadPerm
    }, ceoToken);
    console.log("Modify CEO role:", protectRes.status); 

    // 5. Create HR Assistant for delegation
    const hrAssistantEmail = 'hrassistant_' + Date.now() + '@elscore.test';
    const hrAsstRes = await request('POST', '/users', {
      email: hrAssistantEmail, password: 'TestPassword123!', firstName: 'HR', lastName: 'Assistant', departmentId: depId, roleId: hrAssistantRole
    }, ceoToken);
    console.log("Create HR Assistant:", hrAsstRes.status);
    const asstUserId = getItems(hrAsstRes).id;

    // 6. Delegation
    console.log("\\n-- SCENARIO: Delegation --");
    const userReadPerm = permsItems.find(p => p.code === 'user.read' && p.isDelegatable);
    const delegRes = await request('POST', `/users/${asstUserId}/permissions`, {
      permissionId: userReadPerm.id
    }, ceoToken);
    console.log("Delegate delegatable permission:", delegRes.status);

    const refManagePerm = permsItems.find(p => p.code === 'reference.manage');
    const delegRefRes = await request('POST', `/users/${asstUserId}/permissions`, {
      permissionId: refManagePerm.id
    }, ceoToken);
    console.log("Delegate NON-delegatable permission (reference.manage):", delegRefRes.status); // Expected: 400 Bad Request

    // 7. Termination
    console.log("\\n-- SCENARIO: Termination --");
    const asstEmpRes = await request('GET', `/users/${asstUserId}`, null, ceoToken);
    const asstEmpId = getItems(asstEmpRes).employee.id;

    const termRes = await request('PATCH', `/employees/${asstEmpId}/status`, {
      status: 'TERMINATED', reason: 'Fired for test'
    }, ceoToken);
    console.log("Terminate Employee:", termRes.status);
    
    const postTermUser = await request('GET', `/users/${asstUserId}`, null, ceoToken);
    console.log("User Status after Termination:", getItems(postTermUser).status);
    console.log("Employee Status after Termination:", getItems(postTermUser).employee.employmentStatus);

    // 8. Rehire
    console.log("\\n-- SCENARIO: Rehire --");
    const rehireRes = await request('PATCH', `/employees/${asstEmpId}/status`, {
      status: 'ACTIVE', reason: 'Rehired for test'
    }, ceoToken);
    console.log("Rehire Employee:", rehireRes.status);
    const postRehireUser = await request('GET', `/users/${asstUserId}`, null, ceoToken);
    console.log("Employee ID matches?", getItems(postRehireUser).employee.id === asstEmpId);

    // 9. Unauthorized User
    console.log("\\n-- SCENARIO: Unauthorized User --");
    const salesEmail = 'uat_sca@elscore.test';
    const salesLogin = await request('POST', '/auth/login', { email: salesEmail, password: 'Test@1234!' });
    const salesToken = getItems(salesLogin).accessToken;
    const salesAttempt = await request('GET', '/audit?limit=10', null, salesToken);
    console.log("Sales Counsellor Audit Read:", salesAttempt.status); // Expected 403

    // 10. Co-Founder Check
    console.log("\\n-- SCENARIO: Co-Founder --");
    const cfEmail = 'cf_test_' + Date.now() + '@elscore.internal';
    const cfRole = rolesItems.find(r => r.code === 'CO_FOUNDER').id;
    await request('POST', '/users', {
      email: cfEmail, password: 'ChangeMe123!', firstName: 'Co', lastName: 'Founder', departmentId: depId, roleId: cfRole
    }, ceoToken);
    const cfLogin = await request('POST', '/auth/login', { email: cfEmail, password: 'ChangeMe123!' });
    const cfToken = getItems(cfLogin).accessToken;
    const cfAttemptMutation = await request('POST', '/roles', { code: 'TEST', name: 'TEST' }, cfToken);
    console.log("Co-Founder Create Role:", cfAttemptMutation.status); // Expected: 403

    // 11. Audit log check
    console.log("\\n-- SCENARIO: Audit Logs --");
    const auditRes = await request('GET', '/audit?limit=5', null, ceoToken);
    const auditItems = getItems(auditRes);
    console.log("Audit logs count:", auditItems.length);
    if(auditItems.length > 0) {
      console.log("Actions recorded:", auditItems.map(a => a.action).join(', '));
      const leaked = JSON.stringify(auditItems).includes('ChangeMe123!');
      console.log("Secret leakage detected?", leaked);
    }
  } catch (e) {
    console.error("Test Error:", e);
  }
}
run();
