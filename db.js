const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',           // Your default username
    host: 'localhost',
    database: 'tournament_hub',  // The name you just created in pgAdmin
    password: 'YOUR_PASSWORD',   // Put your pgAdmin password here
    port: 5432,
});

module.exports = pool;