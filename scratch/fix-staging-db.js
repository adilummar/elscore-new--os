const { execSync } = require('child_process');
try {
  execSync(`ssh root@200.234.39.163 "su - postgres -c \\"psql -d elscore_os_staging -c 'INSERT INTO \\\\\\"Sequence\\\\\\" (id, \\\\\\"entityType\\\\\\", prefix, \\\\\\"nextNumber\\\\\\", \\\\\\"createdAt\\\\\\", \\\\\\"updatedAt\\\\\\") VALUES (gen_random_uuid(), ''LED'', ''LED-'', 1000, now(), now()) ON CONFLICT (\\\\\\"entityType\\\\\\") DO NOTHING; INSERT INTO \\\\\\"Sequence\\\\\\" (id, \\\\\\"entityType\\\\\\", prefix, \\\\\\"nextNumber\\\\\\", \\\\\\"createdAt\\\\\\", \\\\\\"updatedAt\\\\\\") VALUES (gen_random_uuid(), ''STU'', ''STU-'', 1000, now(), now()) ON CONFLICT (\\\\\\"entityType\\\\\\") DO NOTHING; INSERT INTO \\\\\\"Sequence\\\\\\" (id, \\\\\\"entityType\\\\\\", prefix, \\\\\\"nextNumber\\\\\\", \\\\\\"createdAt\\\\\\", \\\\\\"updatedAt\\\\\\") VALUES (gen_random_uuid(), ''RQT'', ''RQT-'', 1000, now(), now()) ON CONFLICT (\\\\\\"entityType\\\\\\") DO NOTHING;'\\""`, { stdio: 'inherit' });
  console.log("SQL injected successfully!");
} catch (e) {
  console.error("Failed", e);
}
