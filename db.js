<<<<<<< HEAD
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
=======
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',           // Your default username
    host: 'localhost',
    database: 'tournament_hub',  // The name you just created in pgAdmin
    password: 'YOUR_PASSWORD',   // Put your pgAdmin password here
    port: 5432,
});

module.exports = pool;
>>>>>>> 84199ff811d9f2486bf853f0adaa9f0c3e895e69
