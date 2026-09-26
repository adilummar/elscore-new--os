const fs = require('fs');

const apiFile = `
function getCookie(name: string) {
  const value = \`; \${document.cookie}\`;
  const parts = value.split(\`; \${name}=\`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
  return null;
}

export async function clientApi(endpoint: string, options: RequestInit = {}) {
  const token = getCookie('accessToken');
  const headers = new Headers(options.headers);
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  
  if (token) {
    headers.set('Authorization', \`Bearer \${token}\`);
  }

  const BASE_URL = 'http://localhost:3001/api/v1';

  const res = await fetch(\`\${BASE_URL}\${endpoint}\`, {
    ...options,
    headers
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'API Error');
  }

  const text = await res.text();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (parsed && 'data' in parsed && 'timestamp' in parsed) {
    return parsed.data;
  }
  return parsed;
}
`;

fs.writeFileSync('apps/web/src/app/(app)/tutor-hr/api.ts', apiFile);
console.log('Fixed API file');
