import { fetchApi } from './apps/web/src/lib/api/client';

async function run() {
  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@elscore.internal', password: 'ChangeMe123!' })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.accessToken;

  const res = await fetch('http://localhost:3001/api/v1/analytics/ceo/finance', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(await res.text());
}
run();
