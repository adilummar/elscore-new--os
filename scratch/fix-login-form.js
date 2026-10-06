const fs = require('fs');

const path = 'apps/web/src/app/(auth)/login/page.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  '<label className="text-sm font-medium text-slate-700">Email address</label>',
  '<label htmlFor="email" className="text-sm font-medium text-slate-700">Email address</label>'
);
content = content.replace(
  '<Input name="email" type="email" required placeholder="you@elscore.internal" />',
  '<Input id="email" name="email" type="email" autoComplete="username" required placeholder="you@elscore.internal" />'
);

content = content.replace(
  '<label className="text-sm font-medium text-slate-700">Password</label>',
  '<label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>'
);
content = content.replace(
  '<Input name="password" type="password" required />',
  '<Input id="password" name="password" type="password" autoComplete="current-password" required />'
);

fs.writeFileSync(path, content);
console.log('Login form fixed');
