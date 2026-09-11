const { Client } = require('pg');
const c = new Client({ host:'localhost', port:5432, database:'elscore_os_dev', user:'postgres', password:'postgres' });
c.connect().then(async () => {
  const r = await c.query("SELECT indexdef FROM pg_indexes WHERE indexname = 'follow_ups_lead_active_idx'");
  console.log(r.rows);
  await c.end();
}).catch(e => console.log('err:', e));
