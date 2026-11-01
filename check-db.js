// Read-only diagnostic: shows the definition of the follow_ups_lead_active_idx index.
//
// Usage (the connection string is read from the environment and is never stored in the repository):
//   DATABASE_URL=postgresql://USER@HOST:PORT/DBNAME node check-db.js
//
// It prints the name of the database it is connected to, so you can confirm it is the one you intended
// before reading anything from the output. It runs a single SELECT and writes nothing.
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Export it for this command only; do not commit credentials.');
  process.exit(1);
}

const client = new Client({ connectionString });

client
  .connect()
  .then(async () => {
    const db = await client.query('SELECT current_database() AS database');
    console.log(`Connected to database: ${db.rows[0].database}`);
    const result = await client.query(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'follow_ups_lead_active_idx'",
    );
    console.log(result.rows);
    await client.end();
  })
  .catch(async (error) => {
    console.error('check-db failed:', error.message);
    try {
      await client.end();
    } catch {
      // connection was never established
    }
    process.exit(1);
  });
