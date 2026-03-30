require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const PORT = parseInt(process.env.PORT || '5000', 10);
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:5501';

// Khalti keys
const KHALTI_SECRET_KEY = process.env.KHALTI_SECRET_KEY || 'Key YOUR_TEST_SECRET_KEY_HERE';

// eSewa keys (test credentials — replace with live keys in .env for production)
const ESEWA_PRODUCT_CODE  = process.env.ESEWA_PRODUCT_CODE  || 'EPAYTEST';   // test merchant code
const ESEWA_SECRET_KEY    = process.env.ESEWA_SECRET_KEY    || '8gBm/:&EnhH.1/q'; // test HMAC secret
// Test URL: https://rc-epay.esewa.com.np/api/epay/main/v2/form
// Live URL: https://epay.esewa.com.np/api/epay/main/v2/form
const ESEWA_PAYMENT_URL   = process.env.ESEWA_PAYMENT_URL   || 'https://rc-epay.esewa.com.np/api/epay/main/v2/form';
// Test status check URL: https://rc-epay.esewa.com.np/api/epay/transaction/status/
// Live status check URL: https://epay.esewa.com.np/api/epay/transaction/status/
const ESEWA_STATUS_URL    = process.env.ESEWA_STATUS_URL    || 'https://rc-epay.esewa.com.np/api/epay/transaction/status/';

const uploadDir = './uploads/highlights';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ----------------------------------------------------------
// Helper: generate eSewa HMAC-SHA256 signature
// message format: "total_amount=<amt>,transaction_uuid=<uuid>,product_code=<code>"
// ----------------------------------------------------------
function generateEsewaSignature(totalAmount, transactionUuid) {
    const message = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${ESEWA_PRODUCT_CODE}`;
    return crypto.createHmac('sha256', ESEWA_SECRET_KEY)
        .update(message)
        .digest('base64');
}

// Ensure tables exist
async function initSchema() {
    // Create tables one by one (multiple statements in one query can fail silently)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS tournaments (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            game_type VARCHAR(20) NOT NULL DEFAULT '5vs5',
            category VARCHAR(20) NOT NULL DEFAULT 'Male',
            age_limit VARCHAR(20) NOT NULL DEFAULT 'Open',
            start_date DATE NOT NULL,
            entry_fee INTEGER DEFAULT 5000,
            status VARCHAR(20) DEFAULT 'upcoming'
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS registrations (
            id SERIAL PRIMARY KEY,
            tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
            team_name TEXT NOT NULL,
            user_email TEXT NOT NULL,
            status VARCHAR(20) DEFAULT 'pending',
            pidx TEXT,
            esewa_transaction_uuid TEXT
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS news (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS highlights (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            image_url TEXT NOT NULL,
            description TEXT DEFAULT ''
        )
    `);

    // --- NEW: MESSAGES TABLE ---
    await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            user_email VARCHAR(255) NOT NULL,
            title VARCHAR(255) NOT NULL,
            body TEXT NOT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Add esewa column to existing registrations tables if missing
    await pool.query(`
        ALTER TABLE registrations ADD COLUMN IF NOT EXISTS esewa_transaction_uuid TEXT
    `).catch(() => {});

    // Notifications / inbox table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_email TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type VARCHAR(20) DEFAULT 'info',
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('Database schema ready.');
}

// ==========================================
// NOTIFICATION HELPER
// ==========================================
async function createNotification(user_email, title, message, type = 'info') {
    try {
        await pool.query(
            'INSERT INTO notifications (user_email, title, message, type) VALUES ($1, $2, $3, $4)',
            [user_email, title, message, type]
        );
    } catch (err) {
        console.error('Failed to create notification:', err.message);
    }
}

// ==========================================
// 1. ADMIN DASHBOARD STATS
// ==========================================
app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalTourneys  = await pool.query('SELECT COUNT(*) FROM tournaments');
        const totalRegs      = await pool.query("SELECT COUNT(*) FROM registrations WHERE status = 'active'");
        const totalRevenue   = await pool.query("SELECT COUNT(*) * 5000 as revenue FROM registrations WHERE status = 'active'");
        const pendingRefunds = await pool.query("SELECT COUNT(*) FROM registrations WHERE status = 'cancelled'");

        res.json({
            tournaments:   parseInt(totalTourneys.rows[0].count),
            registrations: parseInt(totalRegs.rows[0].count),
            revenue:       parseInt(totalRevenue.rows[0].revenue) || 0,
            refunds:       parseInt(pendingRefunds.rows[0].count)
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 2. TOURNAMENTS
// ==========================================
app.get('/api/tournaments', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tournaments ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tournaments', async (req, res) => {
    const { name, game_type, category, age_limit, start_date, entry_fee } = req.body;
    try {
        const result = await pool.query(
            "INSERT INTO tournaments (name, game_type, category, age_limit, start_date, entry_fee, status) VALUES ($1, $2, $3, $4, $5, $6, 'upcoming') RETURNING *",
            [name, game_type, category, age_limit, start_date, entry_fee || 5000]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 3. REGISTRATIONS & KHALTI
// ==========================================
app.post('/api/registrations/pay', async (req, res) => {
    const { tournament_id, team_name, user_email, amount } = req.body;
    const amountInPaisa = amount * 100;

    try {
        const newReg = await pool.query(
            `INSERT INTO registrations (tournament_id, team_name, user_email, status)
             VALUES ($1, $2, $3, 'pending') RETURNING id`,
            [tournament_id, team_name, user_email]
        );
        const registrationId = newReg.rows[0].id;

        const khaltiPayload = {
            "return_url": `${BACKEND_URL}/api/khalti/callback`,
            "website_url": BACKEND_URL,
            "amount": amountInPaisa,
            "purchase_order_id": registrationId.toString(),
            "purchase_order_name": `Team ${team_name} Registration`,
            "customer_info": { "name": team_name, "email": user_email, "phone": "9800000000" }
        };

        const khaltiResponse = await axios.post(
            'https://a.khalti.com/api/v2/epayment/initiate/',
            khaltiPayload,
            { headers: { 'Authorization': KHALTI_SECRET_KEY, 'Content-Type': 'application/json' } }
        );

        await pool.query('UPDATE registrations SET pidx = $1 WHERE id = $2', [khaltiResponse.data.pidx, registrationId]);
        res.json({ payment_url: khaltiResponse.data.payment_url });
    } catch (error) {
        res.status(500).json({ error: "Failed to connect to Khalti." });
    }
});

app.get('/api/khalti/callback', async (req, res) => {
    const { pidx, purchase_order_id, status } = req.query;

    if (status === 'Completed') {
        try {
            const verifyResponse = await axios.post(
                'https://a.khalti.com/api/v2/epayment/lookup/',
                { pidx: pidx },
                { headers: { 'Authorization': KHALTI_SECRET_KEY, 'Content-Type': 'application/json' } }
            );

            if (verifyResponse.data.status === 'Completed') {
                await pool.query("UPDATE registrations SET status = 'active' WHERE id = $1", [purchase_order_id]);
                // Notify user of successful Khalti payment
                const kReg = await pool.query(
                    `SELECT r.*, t.name as tournament_name, t.entry_fee FROM registrations r
                     JOIN tournaments t ON r.tournament_id = t.id WHERE r.id = $1`,
                    [purchase_order_id]
                );
                if (kReg.rows[0]) {
                    await createNotification(
                        kReg.rows[0].user_email,
                        'Payment Successful via Khalti',
                        `Your team "${kReg.rows[0].team_name}" is now registered for ${kReg.rows[0].tournament_name}. Entry fee Rs. ${kReg.rows[0].entry_fee || 5000} paid via Khalti. Good luck!`,
                        'success'
                    );
                }
                return res.redirect(`${FRONTEND_URL}/profile.html?payment=success`);
            }
        } catch (error) { console.error("Khalti Verification Error:", error.message); }
    }

    await pool.query("UPDATE registrations SET status = 'failed' WHERE id = $1", [purchase_order_id]);
    res.redirect(`${FRONTEND_URL}/profile.html?payment=failed`);
});

// ==========================================
// 4. ESEWA PAYMENT
// ==========================================
app.post('/api/registrations/pay-esewa', async (req, res) => {
    const { tournament_id, team_name, user_email, amount } = req.body;

    if (!tournament_id || !team_name || !user_email || !amount) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
        const newReg = await pool.query(
            `INSERT INTO registrations (tournament_id, team_name, user_email, status)
             VALUES ($1, $2, $3, 'pending') RETURNING id`,
            [tournament_id, team_name, user_email]
        );
        const registrationId = newReg.rows[0].id;

        const transactionUuid = `NEPLAYS-${registrationId}-${Date.now()}`;

        await pool.query(
            'UPDATE registrations SET esewa_transaction_uuid = $1 WHERE id = $2',
            [transactionUuid, registrationId]
        );

        const totalAmount = Number(amount).toFixed(2);
        const signature   = generateEsewaSignature(totalAmount, transactionUuid);

        res.json({
            esewa_url:        ESEWA_PAYMENT_URL,
            amount:           totalAmount,
            tax_amount:       "0",
            total_amount:     totalAmount,
            transaction_uuid: transactionUuid,
            product_code:     ESEWA_PRODUCT_CODE,
            product_service_charge:  "0",
            product_delivery_charge: "0",
            success_url: `${BACKEND_URL}/api/esewa/callback/success`,
            failure_url: `${BACKEND_URL}/api/esewa/callback/failure`,
            signed_field_names: "total_amount,transaction_uuid,product_code",
            signature:        signature
        });

    } catch (err) {
        console.error("eSewa initiation error:", err.message);
        res.status(500).json({ error: "Failed to initiate eSewa payment." });
    }
});

app.get('/api/esewa/callback/success', async (req, res) => {
    const { data } = req.query;

    if (!data) {
        return res.redirect(`${FRONTEND_URL}/profile.html?payment=failed`);
    }

    try {
        const decoded      = Buffer.from(data, 'base64').toString('utf-8');
        const esewaData    = JSON.parse(decoded);
        const { transaction_uuid, total_amount, status } = esewaData;

        if (status !== 'COMPLETE') {
            return res.redirect(`${FRONTEND_URL}/profile.html?payment=failed`);
        }

        const regResult = await pool.query(
            'SELECT * FROM registrations WHERE esewa_transaction_uuid = $1',
            [transaction_uuid]
        );

        if (regResult.rows.length === 0) {
            console.error("eSewa callback: No registration found for UUID:", transaction_uuid);
            return res.redirect(`${FRONTEND_URL}/profile.html?payment=failed`);
        }

        const reg = regResult.rows[0];

        const statusRes = await axios.get(ESEWA_STATUS_URL, {
            params: {
                product_code:     ESEWA_PRODUCT_CODE,
                total_amount:     total_amount,
                transaction_uuid: transaction_uuid
            }
        });

        if (statusRes.data.status === 'COMPLETE') {
            await pool.query(
                "UPDATE registrations SET status = 'active' WHERE id = $1",
                [reg.id]
            );
            return res.redirect(`${FRONTEND_URL}/profile.html?payment=success&method=esewa`);
        }

        await pool.query(
            "UPDATE registrations SET status = 'failed' WHERE id = $1",
            [reg.id]
        );
        res.redirect(`${FRONTEND_URL}/profile.html?payment=failed`);

    } catch (err) {
        console.error("eSewa success callback error:", err.message);
        res.redirect(`${FRONTEND_URL}/profile.html?payment=failed`);
    }
});

app.get('/api/esewa/callback/failure', async (req, res) => {
    try {
        const { data } = req.query;
        if (data) {
            const decoded   = Buffer.from(data, 'base64').toString('utf-8');
            const esewaData = JSON.parse(decoded);
            if (esewaData.transaction_uuid) {
                await pool.query(
                    "UPDATE registrations SET status = 'failed' WHERE esewa_transaction_uuid = $1",
                    [esewaData.transaction_uuid]
                );
            }
        }
    } catch (_) {}

    res.redirect(`${FRONTEND_URL}/profile.html?payment=failed&method=esewa`);
});

// ==========================================
// 5. REGISTRATIONS (shared)
// ==========================================
app.get('/api/registrations/user/:email', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM registrations WHERE user_email = $1 ORDER BY id DESC', [req.params.email]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/registrations/:tournament_id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM registrations WHERE tournament_id = $1', [req.params.tournament_id]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/registrations/:id/cancel', async (req, res) => {
    try {
        const regId = req.params.id;
        const regResult = await pool.query(
            `SELECT r.*, t.start_date, t.name, t.entry_fee FROM registrations r
             JOIN tournaments t ON r.tournament_id = t.id
             WHERE r.id = $1`, [regId]
        );

        if (regResult.rows.length === 0) return res.status(404).json({ error: "Registration not found" });

        const reg       = regResult.rows[0];
        const startDate = new Date(reg.start_date);
        const now       = new Date();
        const diffHours = (startDate - now) / (1000 * 60 * 60);

        if (diffHours <= 48 && diffHours > 0) {
            return res.status(400).json({ error: "Cancellations are not allowed within 48 hours of the tournament start date." });
        }

        await pool.query("UPDATE registrations SET status = 'cancelled' WHERE id = $1", [regId]);

        // Send cancellation + refund notification to user
        const tournamentName = reg.name || `Tournament #${reg.tournament_id}`;
        await createNotification(
            reg.user_email,
            'Registration Cancelled',
            `Your registration for team "${reg.team_name}" in ${tournamentName} has been cancelled. A refund of Rs. ${reg.entry_fee || 5000} will be processed within 3-5 business days.`,
            'refund'
        );

        res.json({ message: "Registration cancelled successfully." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

app.delete('/api/registrations/:id', async (req, res) => {
    try {
        // Fetch reg details before deleting so we can notify user
        const regData = await pool.query(
            `SELECT r.*, t.name as tournament_name, t.entry_fee FROM registrations r
             JOIN tournaments t ON r.tournament_id = t.id WHERE r.id = $1`,
            [req.params.id]
        );
        const reg = regData.rows[0];

        await pool.query("DELETE FROM registrations WHERE id = $1", [req.params.id]);

        // Notify user about admin-issued refund
        if (reg) {
            await createNotification(
                reg.user_email,
                'Refund Processed by Admin',
                `Admin has processed a refund for your team "${reg.team_name}" in ${reg.tournament_name}. Rs. ${reg.entry_fee || 5000} will be returned to your account within 3-5 business days.`,
                'refund'
            );
        }

        res.json({ message: "Registration refunded and removed." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// ==========================================
// 6. NEWS & ANNOUNCEMENTS
// ==========================================
app.get('/api/news/active', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM news ORDER BY created_at DESC LIMIT 5');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/news', async (req, res) => {
    try {
        const { title, content } = req.body;
        const result = await pool.query(
            'INSERT INTO news (title, content) VALUES ($1, $2) RETURNING *',
            [title, content]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 6.5 NOTIFICATIONS / INBOX
// ==========================================

// Get all notifications for a user (unread first)
app.get('/api/notifications/:email', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM notifications WHERE user_email = $1 ORDER BY is_read ASC, created_at DESC',
            [req.params.email]
        );
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get unread count only (for badge)
app.get('/api/notifications/:email/unread-count', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT COUNT(*) FROM notifications WHERE user_email = $1 AND is_read = FALSE',
            [req.params.email]
        );
        res.json({ count: parseInt(result.rows[0].count) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mark single notification as read
app.post('/api/notifications/:id/read', async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mark ALL notifications as read for a user
app.post('/api/notifications/read-all/:email', async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_email = $1', [req.params.email]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: Publish tie sheet — posts to news AND notifies all registered users
app.post('/api/admin/publish-ties', async (req, res) => {
    const { tournament_id, tournament_name, bracket_text } = req.body;

    if (!tournament_id || !tournament_name || !bracket_text) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
        // 1. Post to news
        await pool.query(
            'INSERT INTO news (title, content) VALUES ($1, $2)',
            [
                `Match Fixtures: ${tournament_name}`,
                `The match bracket for ${tournament_name} has been published!

${bracket_text}`
            ]
        );

        // 2. Get all active registered teams for this tournament
        const regs = await pool.query(
            "SELECT DISTINCT user_email, team_name FROM registrations WHERE tournament_id = $1 AND status = 'active'",
            [tournament_id]
        );

        // 3. Send personal notification to each registered user
        for (const reg of regs.rows) {
            await createNotification(
                reg.user_email,
                `Match Fixtures Published — ${tournament_name}`,
                `Your team "${reg.team_name}" has been placed in the bracket for ${tournament_name}. Check the News section to see the full fixture list. Good luck!`,
                'match'
            );
        }

        res.json({
            success: true,
            notified: regs.rows.length,
            message: `Tie sheet published to news and ${regs.rows.length} team(s) notified.`
        });
    } catch (err) {
        console.error('publish-ties error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 7. HIGHLIGHTS UPLOAD
// ==========================================
const storage = multer.diskStorage({
    destination: './uploads/highlights/',
    filename: (req, file, cb) => cb(null, `hl-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

app.get('/api/highlights', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM highlights ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/highlights', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Image file is required.' });

    try {
        const { title, description } = req.body;
        const imageUrl = `${BACKEND_URL}/uploads/highlights/${req.file.filename}`;
        const result = await pool.query(
            `INSERT INTO highlights (title, image_url, description) VALUES ($1, $2, $3) RETURNING *`,
            [title, imageUrl, description || '']
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: 'Server error uploading highlight' }); }
});

// ==========================================
// 8. MESSAGES SYSTEM
// ==========================================
app.get('/api/messages/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const result = await pool.query(
            'SELECT * FROM messages WHERE user_email = $1 ORDER BY created_at DESC',
            [email]
        );
        res.json(result.rows);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

app.put('/api/messages/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'UPDATE messages SET is_read = TRUE WHERE id = $1 RETURNING *',
            [id]
        );
        res.json(result.rows[0]);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

initSchema().then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});