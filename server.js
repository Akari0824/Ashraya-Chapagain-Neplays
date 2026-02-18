const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// --- TOURNAMENT ROUTES ---

// Get all tournaments
app.get('/api/tournaments', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tournaments ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Add a tournament
app.post('/api/tournaments', async (req, res) => {
    const { name, game_type, category, age_limit } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO tournaments (name, game_type, category, age_limit) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, game_type, category, age_limit]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// --- ANNOUNCEMENT ROUTES ---

app.post('/api/announcements', async (req, res) => {
    const { content } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO announcements (content) VALUES ($1) RETURNING *',
            [content]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.listen(5000, () => {
    console.log('Server is running on port 5000');
});

app.post('/api/register', async (req, res) => {
    const { tournament_id, team_name, user_email } = req.body;

    try {
        // 1. Check current registration count
        const countResult = await pool.query(
            'SELECT COUNT(*) FROM registrations WHERE tournament_id = $1',
            [tournament_id]
        );
        
        if (parseInt(countResult.rows[0].count) >= 25) {
            return res.status(400).json({ error: "Tournament is full (Limit: 25 teams)." });
        }

        // 2. Attempt to register (The UNIQUE constraint in SQL handles the "only once" rule)
        const result = await pool.query(
            'INSERT INTO registrations (tournament_id, team_name, user_email) VALUES ($1, $2, $3) RETURNING *',
            [tournament_id, team_name, user_email]
        );
        
        res.json({ message: "Registration successful!", data: result.rows[0] });

    } catch (err) {
        if (err.code === '23505') { // PostgreSQL unique violation error code
            res.status(400).json({ error: "You have already registered for this tournament." });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

app.post('/api/matches/save', async (req, res) => {
    const { tournament_id, matches } = req.body;
    try {
        // Clear old matches for this tournament if re-generating
        await pool.query('DELETE FROM matches WHERE tournament_id = $1', [tournament_id]);

        // Insert new matches
        for (let match of matches) {
            await pool.query(
                'INSERT INTO matches (tournament_id, team_a, team_b) VALUES ($1, $2, $3)',
                [tournament_id, match.teamA, match.teamB]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/api/registrations/cancel', async (req, res) => {
    const { registration_id } = req.body;

    try {
        // 1. Get the registration and tournament date
        const data = await pool.query(
            `SELECT r.*, t.created_at as tournament_start 
             FROM registrations r 
             JOIN tournaments t ON r.tournament_id = t.id 
             WHERE r.id = $1`, [registration_id]
        );

        if (data.rows.length === 0) return res.status(404).send("Not found");

        const reg = data.rows[0];
        const now = new Date();
        const tournamentDate = new Date(reg.tournament_start); // Replace with your actual tournament event date
        
        // 2. 48-Hour Rule Check
        const hoursDifference = (tournamentDate - now) / (1000 * 60 * 60);

        if (hoursDifference < 48) {
            return res.status(400).json({ 
                error: "Cancellation denied. It is less than 48 hours before the event." 
            });
        }

        // 3. Update status to 'cancelled'
        await pool.query('UPDATE registrations SET status = $1 WHERE id = $2', ['cancelled', registration_id]);
        
        res.json({ message: "Registration cancelled. Refund process initiated." });

    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalTourneys = await pool.query('SELECT COUNT(*) FROM tournaments');
        const totalRegs = await pool.query("SELECT COUNT(*) FROM registrations WHERE status = 'active'");
        const totalRevenue = await pool.query("SELECT COUNT(*) * 5000 as revenue FROM registrations WHERE status = 'active'"); // Assuming 5000 fee
        const pendingRefunds = await pool.query("SELECT COUNT(*) FROM registrations WHERE status = 'cancelled'");

        res.json({
            tournaments: totalTourneys.rows[0].count,
            registrations: totalRegs.rows[0].count,
            revenue: totalRevenue.rows[0].revenue || 0,
            refunds: pendingRefunds.rows[0].count
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});