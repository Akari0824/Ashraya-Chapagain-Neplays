const API_URL = "http://localhost:5000/api";

// --- LOGIN ---
function handleLogin() {
    const e = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    if (e === "wazza@gmail.com" && p === "1234") { 
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('admin-dashboard').classList.remove('hidden');
        loadDashboardStats();
    } else { alert("Invalid Credentials"); }
}

function logout() { location.reload(); }

// --- NAVIGATION ---
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(`${pageId}-page`).classList.remove('hidden');
    
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
    if(event) event.currentTarget.classList.add('active');

    // Auto-load data based on page
    if(pageId === 'overview') loadDashboardStats();
    if(pageId === 'registrations') loadAllRegistrations();
    if(pageId === 'tournaments' || pageId === 'matches') loadTournaments();
}

// --- 1. DASHBOARD ---
async function loadDashboardStats() {
    try {
        const res = await fetch(`${API_URL}/admin/stats`);
        const stats = await res.json();
        
        document.getElementById('stat-tournaments').innerText = stats.tournaments || 0;
        document.getElementById('stat-registrations').innerText = stats.registrations || 0;
        document.getElementById('stat-revenue').innerText = (stats.revenue || 0).toLocaleString();
        document.getElementById('stat-refunds').innerText = stats.refunds || 0;

        const regRes = await fetch(`${API_URL}/registrations/all`);
        const regs = await regRes.json();
        document.getElementById('recent-reg-table').innerHTML = regs.slice(0,5).map(r => 
            `<tr><td>${r.team_name}</td><td>${r.tournament_id}</td><td>${new Date(r.registered_at).toLocaleDateString()}</td></tr>`
        ).join('');
    } catch (e) { console.error("Stats Error", e); }
}

// --- 2. TOURNAMENTS ---
async function submitTournament() {
    const data = {
        name: document.getElementById('t-name').value,
        start_date: document.getElementById('t-start-date').value,
        game_type: document.getElementById('t-type').value,
        age_limit: document.getElementById('t-age').value,
        category: document.querySelector('input[name="gender"]:checked').value
    };

    if(!data.name || !data.start_date) return alert("Name & Date required!");

    const res = await fetch(`${API_URL}/tournaments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if(res.ok) { alert("Tournament Created!"); showPage('overview'); }
}

async function loadTournaments() {
    const res = await fetch(`${API_URL}/tournaments`);
    const data = await res.json();
    const sel = document.getElementById('match-tourney-select');
    sel.innerHTML = '<option value="">-- Select --</option>' + data.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
}

// --- 3. REGISTRATIONS & REFUNDS (This connects to the page) ---
async function loadAllRegistrations() {
    try {
        const res = await fetch(`${API_URL}/registrations/all`);
        const data = await res.json();
        const list = document.getElementById('master-reg-list');
        
        list.innerHTML = data.map(r => `
            <tr>
                <td>${r.team_name}</td>
                <td>${r.user_email}</td>
                <td><b style="color:${r.status==='active'?'#10b981':'#ef4444'}">${r.status.toUpperCase()}</b></td>
                <td>
                    ${r.status === 'active' 
                        ? `<button class="btn-cancel" onclick="requestCancel(${r.id}, '${r.start_date}')">Cancel & Refund</button>` 
                        : '<span style="color:#cbd5e1">Processed</span>'}
                </td>
            </tr>
        `).join('');
    } catch (e) { console.error("Reg Load Error", e); }
}

async function requestCancel(id, dateStr) {
    const now = new Date();
    const eventDate = new Date(dateStr);
    const hoursLeft = (eventDate - now) / (1000 * 60 * 60);

    if(hoursLeft < 48) return alert(`Cannot cancel! Only ${hoursLeft.toFixed(1)} hours left (Min: 48h).`);
    
    if(confirm("Confirm cancellation and refund?")) {
        const res = await fetch(`${API_URL}/registrations/cancel`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ registration_id: id })
        });
        if(res.ok) { alert("Cancelled!"); loadAllRegistrations(); }
    }
}

// --- 4. ANNOUNCEMENTS (This was missing before) ---
async function submitNews() {
    const title = document.getElementById('news-title').value;
    const content = document.getElementById('news-content').value;
    const duration = document.getElementById('news-duration').value;

    if(!title || !content) return alert("Please enter Title and Content.");

    let expiry = new Date();
    if(duration === '24h') expiry.setHours(expiry.getHours() + 24);
    if(duration === '1w') expiry.setDate(expiry.getDate() + 7);

    const newsData = {
        title, 
        content,
        expires_at: expiry.toISOString(),
        news_type: 'general' // Defaulting to general for now
    };

    try {
        const res = await fetch(`${API_URL}/news`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(newsData)
        });
        if(res.ok) { 
            alert("News Posted!"); 
            document.getElementById('news-title').value = "";
            document.getElementById('news-content').value = "";
        }
    } catch(e) { alert("Failed to post news"); }
}

// --- 5. MATCH GENERATOR ---
let teamsToMatch = [];
async function loadRegisteredTeams() {
    const id = document.getElementById('match-tourney-select').value;
    if(!id) return;
    const res = await fetch(`${API_URL}/registrations/${id}`);
    const data = await res.json();
    teamsToMatch = data.filter(r => r.status === 'active').map(r => r.team_name);
    document.getElementById('team-count').innerText = teamsToMatch.length;
    document.getElementById('teams-list-display').innerText = teamsToMatch.join(", ");
}

function generateTies() {
    if(teamsToMatch.length < 2) return alert("Need 2+ teams");
    const shuffled = [...teamsToMatch].sort(() => Math.random() - 0.5);
    const div = document.getElementById('match-results');
    div.innerHTML = "";
    for(let i=0; i<shuffled.length; i+=2) {
        div.innerHTML += `<div style="padding:10px; background:white; margin-bottom:5px; border-left:4px solid orange;">
            ${shuffled[i]} <b>VS</b> ${shuffled[i+1] || "BYE"}
        </div>`;
    }
}