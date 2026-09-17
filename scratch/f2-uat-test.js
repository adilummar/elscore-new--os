const http = require('http');

async function request(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '200.234.39.163', // Staging server as used previously
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
  console.log("=== F2 UAT SCRIPT ===");
  try {
    // 1. Get tokens
    const c1Login = await request('POST', '/auth/login', { email: 'uat_sca@elscore.test', password: 'Test@1234!' });
    const c1Token = getItems(c1Login).accessToken;
    console.log("Counsellor Login Status:", c1Login.status);
    
    const shLogin = await request('POST', '/auth/login', { email: 'uat_sh@elscore.test', password: 'Test@1234!' });
    const shToken = getItems(shLogin).accessToken;
    console.log("Sales Head Login Status:", shLogin.status);

    // Get Subjects, Curriculums, Grades
    const sRes = await request('GET', '/reference/subjects', null, c1Token);
    const cRes = await request('GET', '/reference/curricula', null, c1Token);
    const gRes = await request('GET', '/reference/grades', null, c1Token);
    
    const sId = getItems(sRes)[0].id;
    const cId = getItems(cRes)[0].id;
    const gId = getItems(gRes)[0].id;

    // SCENARIO: Multi-Student Creation (Direct Counsellor - Self Assigned)
    console.log("\\n-- SCENARIO: Multi-Student Atomic Creation --");
    const testPhone = '5551000' + Date.now().toString().slice(-4);
    const leadPayload = {
      firstName: 'Parent',
      lastName: 'Multiple',
      primaryPhone: testPhone,
      source: 'DIRECT',
      students: [
        {
          firstName: 'Student A',
          requirements: [
            { subjectId: sId, curriculumId: cId, gradeId: gId },
            { subjectId: sId, curriculumId: cId, gradeId: gId }
          ]
        },
        {
          firstName: 'Student B',
          requirements: [
            { subjectId: sId, curriculumId: cId, gradeId: gId }
          ]
        },
        {
          firstName: 'Student C',
          requirements: [
            { subjectId: sId, curriculumId: cId, gradeId: gId },
            { subjectId: sId, curriculumId: cId, gradeId: gId }
          ]
        }
      ]
    };

    const cRes1 = await request('POST', '/leads', leadPayload, c1Token);
    console.log("Lead Create Status:", cRes1.status);
    if (cRes1.status !== 201) {
      console.log("Error:", cRes1.data);
      return;
    }
    const createdLead = getItems(cRes1).lead;
    console.log("Business ID:", createdLead.businessId);

    // Fetch Lead Details
    const leadDetailRes = await request('GET', `/leads/${createdLead.id}`, null, c1Token);
    const leadDetails = getItems(leadDetailRes);
    console.log("Assigned To ID:", leadDetails.assignedToUserId);
    console.log("Students Count:", leadDetails.students.length);
    let reqCount = 0;
    leadDetails.students.forEach((s, idx) => {
      console.log(`Student ${['A', 'B', 'C'][idx]}: ${s.requirements.length} requirements`);
      reqCount += s.requirements.length;
    });
    console.log("Total Requirements:", reqCount);

    // SCENARIO: Duplicate
    console.log("\\n-- SCENARIO: Duplicate Lead Warning --");
    const dupRes = await request('POST', '/leads', { ...leadPayload, students: [] }, c1Token);
    console.log("Duplicate Attempt Status:", dupRes.status);
    console.log("Warnings Length:", getItems(dupRes).warnings?.length);

    // SCENARIO: Single Regression & Marketing RR
    console.log("\\n-- SCENARIO: Marketing Lead (Sales Head) -> RR Assignment --");
    const mktgPhone = '5552000' + Date.now().toString().slice(-4);
    const headRes = await request('POST', '/leads', {
      firstName: 'Marketing',
      primaryPhone: mktgPhone,
      source: 'META_FACEBOOK',
      students: [
        {
          firstName: 'Single Student',
          requirements: [
            { subjectId: sId, curriculumId: cId, gradeId: gId }
          ]
        }
      ]
    }, shToken);
    console.log("Head Creation Status:", headRes.status);
    const headLead = getItems(headRes).lead;
    
    const mktgDetail = await request('GET', `/leads/${headLead.id}`, null, shToken);
    console.log("RR Assigned To ID:", getItems(mktgDetail).assignedToUserId);

    // SCENARIO: Rollback
    console.log("\\n-- SCENARIO: Atomic Rollback --");
    const rollPhone = '5553000' + Date.now().toString().slice(-4);
    const rollRes = await request('POST', '/leads', {
      firstName: 'Rollback',
      primaryPhone: rollPhone,
      source: 'WEBSITE',
      students: [
        {
          firstName: 'Invalid Student',
          requirements: [
            { subjectId: 'not-a-uuid', curriculumId: cId, gradeId: gId }
          ]
        }
      ]
    }, c1Token);
    console.log("Rollback Attempt Status:", rollRes.status);
    // Should be 400 Bad Request
    // Ensure no lead was created
    const searchRes = await request('GET', `/leads?search=${rollPhone}`, null, shToken);
    console.log("Found leads with rollback phone:", getItems(searchRes)?.length);

  } catch (e) {
    console.error("Test Error:", e);
  }
}
run();
