const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

const pool = new Pool({
    user: process.env.PGUSER || 'postgres',
    host: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || 'tournament_hub',
    password: process.env.PGPASSWORD || '1234',
    port: parseInt(process.env.PGPORT || '5432', 10),
});

module.exports = pool;
