const API_URL = 'http://localhost:5000/api';

const ADMIN_EMAIL = 'wazza@gmail.com';
const ADMIN_PASSWORD = '1234';

// --- CUSTOM NOTIFICATION SYSTEM ---
function showNotification(type, message) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed top-5 right-5 z-[9999] flex flex-col gap-3 pointer-events-none';
        document.body.appendChild(container);
    }

    const isSuccess = type === 'success';
    const borderColor = isSuccess ? 'border-emerald-500' : 'border-red-500';
    const iconColor = isSuccess ? 'text-emerald-500' : 'text-red-500';
    const iconClass = isSuccess ? 'fa-circle-check' : 'fa-circle-exclamation';
    const title = isSuccess ? 'Success' : 'Error';

    const toast = document.createElement('div');
    toast.className = `transform transition-all duration-300 translate-x-full opacity-0 bg-slate-900 border-l-4 ${borderColor} rounded-lg shadow-2xl p-4 flex items-start gap-4 w-80 pointer-events-auto`;

    toast.innerHTML = `
        <div class="mt-0.5">
            <i class="fa-solid ${iconClass} ${iconColor} text-xl"></i>
        </div>
        <div class="flex-1">
            <h4 class="text-white font-bold text-sm">${title}</h4>
            <p class="text-slate-300 text-xs mt-1 leading-relaxed">${message}</p>
        </div>
        <button onclick="this.parentElement.remove()" class="text-slate-500 hover:text-white transition">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function escapeHtml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

async function apiFetch(url, options = {}) {
    const response = await fetch(url, options);
    let data = null;
    try { data = await response.json(); } catch (err) { data = null; }
    if (!response.ok) {
        const message = data?.error || `Request failed (${response.status})`;
        throw new Error(message);
    }
    return data;
}

// --- LOGIN ---
function handleLogin() {
    const email = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        sessionStorage.setItem('adminAuthenticated', 'true');
        openDashboard();
        return;
    }
    showNotification('error', 'Invalid admin credentials. Please try again.');
}

function openDashboard() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    loadDashboardStats();
}

function logout() {
    sessionStorage.removeItem('adminAuthenticated');
    location.reload(); 
}

// --- NAVIGATION ---
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(`${pageId}-page`).classList.remove('hidden');
    
    if(pageId === 'overview') loadDashboardStats();
    if(pageId === 'registrations') loadAllRegistrations();
    if(pageId === 'tournaments' || pageId === 'matches') loadTournaments();
}

// --- DASHBOARD STATS ---
async function loadDashboardStats() {
    try {
        const stats = await apiFetch(`${API_URL}/admin/stats`);
        document.getElementById('stat-tournaments').innerText = stats.tournaments;
        document.getElementById('stat-revenue').innerText = "Rs. " + stats.revenue;
        document.getElementById('stat-registrations').innerText = stats.registrations;
    } catch (err) { console.error("Error loading stats:", err); }
}

// --- TOURNAMENTS LOGIC ---
async function submitTournament(event) {
    event.preventDefault(); 
    const payload = {
        name: document.getElementById('t-name').value,
        game_type: document.getElementById('t-game').value,
        category: document.getElementById('t-category').value,
        age_limit: document.getElementById('t-age').value,
        start_date: document.getElementById('t-date').value,
        entry_fee: document.getElementById('t-fee').value 
    };

    try {
        await apiFetch(`${API_URL}/tournaments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showNotification('success', 'Tournament launched successfully!');
        document.getElementById('tourney-form').reset();
        loadDashboardStats(); 
        loadTournaments();    
    } catch (err) { 
        showNotification('error', `Failed to create tournament: ${err.message}`); 
    }
}

async function loadTournaments() {
    try {
        const tournaments = await apiFetch(`${API_URL}/tournaments`);
        const matchSelect = document.getElementById('match-tourney-select');
        if (matchSelect) {
            matchSelect.innerHTML = '<option value="">-- Select a Tournament --</option>';
            tournaments.forEach(t => { matchSelect.innerHTML += `<option value="${t.id}">${escapeHtml(t.name)} (${escapeHtml(t.game_type)})</option>`; });
        }
    } catch (err) {}
}

// --- NEWS LOGIC ---
async function submitNews(event) {
    event.preventDefault();
    const payload = {
        title: document.getElementById('n-title').value,
        content: document.getElementById('n-content').value
    };

    try {
        await apiFetch(`${API_URL}/news`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showNotification('success', 'News published successfully!');
        document.getElementById('news-form').reset();
    } catch (err) {
        showNotification('error', `Failed to post news: ${err.message}`);
    }
}

// --- REGISTRATIONS LOGIC & ADMIN CANCELLATION ---
async function loadAllRegistrations() {
    const tbody = document.getElementById('reg-list');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-500">Loading registrations...</td></tr>';

    try {
        const tournaments = await apiFetch(`${API_URL}/tournaments`);
        let allRegs = [];
        
        for (let t of tournaments) {
            const regs = await apiFetch(`${API_URL}/registrations/${t.id}`);
            regs.forEach(r => { r.tournament_name = t.name; allRegs.push(r); });
        }
        
        allRegs.sort((a, b) => b.id - a.id);
        
        if (allRegs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-500">No registrations found.</td></tr>';
            return;
        }
        
        tbody.innerHTML = allRegs.map(r => `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                <td class="p-4 font-bold text-slate-600">#${r.id}</td>
                <td class="p-4 font-bold text-slate-800 uppercase">${escapeHtml(r.team_name)}</td>
                <td class="p-4 text-slate-500">${escapeHtml(r.user_email)}</td>
                <td class="p-4 text-slate-600">${escapeHtml(r.tournament_name)}</td>
                <td class="p-4">
                    <span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        r.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 
                        r.status === 'pending' ? 'bg-yellow-100 text-yellow-600' : 'bg-red-100 text-red-600'
                    }">${r.status}</span>
                </td>
                <td class="p-4 text-right">
                    <button onclick="refundAndRemoveTeam(${r.id})" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm">
                        Refund & Remove
                    </button>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-red-500 font-bold">Failed to load registrations.</td></tr>';
    }
}

async function refundAndRemoveTeam(regId) {
    if (!confirm("Are you sure you want to refund and remove this team? They will be able to register again.")) return;
    
    try {
        await apiFetch(`${API_URL}/registrations/${regId}`, { method: 'DELETE' });
        showNotification('success', "Team successfully refunded and removed from the roster.");
        loadAllRegistrations();
        loadDashboardStats();  
    } catch (err) { 
        showNotification('error', `Failed to remove team: ${err.message}`); 
    }
}

// --- HIGHLIGHTS LOGIC ---
function previewHighlightImage() {
    const preview = document.getElementById('hl-preview-img');
    const fileInput = document.getElementById('hl-image-file');
    const file = fileInput.files[0];
    if (!file) {
        preview.src = '';
        preview.classList.add('hidden');
        return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
        preview.src = reader.result;
        preview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

async function submitHighlight(event) {
    event.preventDefault();
    const form = document.getElementById('highlight-form');
    const formData = new FormData(form);

    try {
        await fetch(`${API_URL}/highlights`, {
            method: 'POST',
            body: formData
        });
        showNotification('success', 'Highlight published successfully.');
        form.reset();
        document.getElementById('hl-preview-img').classList.add('hidden');
    } catch (err) {
        showNotification('error', `Failed to upload highlight: ${err.message}`);
    }
}

// --- TOURNAMENT BRACKET GENERATOR (WITH SVG LINES) ---
let teamsToMatch = [];

async function loadRegisteredTeams() {
    const id = document.getElementById('match-tourney-select').value;
    if(!id) return;
    const data = await apiFetch(`${API_URL}/registrations/${id}`);
    teamsToMatch = data.filter(r => r.status === 'active').map(r => r.team_name);
    
    const countEl = document.getElementById('team-count');
    const listEl = document.getElementById('teams-list-display');
    if(countEl) countEl.innerText = teamsToMatch.length;
    if(listEl) listEl.innerText = teamsToMatch.map(escapeHtml).join(" • ");
}

// Convert bracket rounds array to readable text for news post
function bracketToText(rounds) {
    let text = '';
    rounds.forEach((round, idx) => {
        let roundName = `Round ${idx + 1}`;
        if (idx === rounds.length - 1) roundName = 'Final';
        else if (idx === rounds.length - 2) roundName = 'Semi-Final';
        else if (idx === rounds.length - 3) roundName = 'Quarter-Final';
        text += `\n--- ${roundName} ---\n`;
        round.forEach((match, mIdx) => {
            const t1 = match.t1 || 'BYE';
            const t2 = match.t2 || 'BYE';
            text += `Match ${mIdx + 1}: ${t1} vs ${t2}\n`;
        });
    });
    return text.trim();
}

async function publishTies() {
    const selectEl = document.getElementById('match-tourney-select');
    const tournamentId   = selectEl.value;
    const tournamentName = selectEl.options[selectEl.selectedIndex]?.text || 'Tournament';

    if (!tournamentId) return showNotification('error', 'Please select a tournament first.');
    if (!window._lastGeneratedRounds || window._lastGeneratedRounds.length === 0) {
        return showNotification('error', 'Please generate the tie sheet first before publishing.');
    }

    const bracketText = bracketToText(window._lastGeneratedRounds);
    const btn = document.getElementById('publish-ties-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Publishing...';

    try {
        const res = await apiFetch(`${API_URL}/admin/publish-ties`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tournament_id: tournamentId, tournament_name: tournamentName, bracket_text: bracketText })
        });
        showNotification('success', `Tie sheet published! ${res.notified} team(s) notified via inbox.`);
    } catch (err) {
        showNotification('error', `Failed to publish: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane mr-2"></i> Publish & Notify Teams';
    }
}

function generateTies() {
    if (teamsToMatch.length < 2) {
        return showNotification('error', "You need at least 2 active teams to generate a bracket.");
    }
    
    const shuffled = [...teamsToMatch].sort(() => Math.random() - 0.5);
    const numTeams = shuffled.length;
    const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(numTeams)));
    const numByes = nextPowerOf2 - numTeams;
    
    let matchesR1 = [];
    let tIndex = 0;
    let byesLeft = numByes;
    
    for (let i = 0; i < nextPowerOf2 / 2; i++) {
        if (byesLeft > 0) {
            matchesR1.push({ t1: shuffled[tIndex++], t2: null }); 
            byesLeft--;
        } else {
            matchesR1.push({ t1: shuffled[tIndex++], t2: shuffled[tIndex++] });
        }
    }
    
    let rounds = [matchesR1];
    let currentMatchesCount = matchesR1.length;
    
    while (currentMatchesCount > 1) {
        currentMatchesCount = currentMatchesCount / 2;
        let nextRound = [];
        for (let i = 0; i < currentMatchesCount; i++) {
            nextRound.push({ t1: 'TBD', t2: 'TBD' });
        }
        rounds.push(nextRound);
    }

    // Save to window so publishTies() can access
    window._lastGeneratedRounds = rounds;
    
    const div = document.getElementById('match-results');
    if (!div) return;
    
    let html = `
        <div id="bracket-container" class="relative min-w-max p-10 bg-slate-50 overflow-hidden rounded-2xl">
            <svg id="bracket-lines" class="absolute inset-0 w-full h-full pointer-events-none z-0"></svg>
            <div class="flex items-stretch justify-start gap-16 min-h-[500px] relative z-10">
    `;
    
    rounds.forEach((round, rIdx) => {
        let roundName = `Round ${rIdx + 1}`;
        if (rIdx === rounds.length - 1) roundName = "Final";
        else if (rIdx === rounds.length - 2) roundName = "Semi-Final";
        else if (rIdx === rounds.length - 3) roundName = "Quarter-Final";
        
        html += `
            <div class="bracket-round flex flex-col justify-around min-w-[220px] gap-6">
                <div class="text-center font-bold text-slate-400 uppercase tracking-widest text-xs mb-2">${roundName}</div>
        `;
        
        round.forEach(match => {
            const team1 = match.t1 ? escapeHtml(match.t1) : '<span class="text-slate-400 italic font-normal">BYE (Auto-Advance)</span>';
            const team2 = match.t2 ? escapeHtml(match.t2) : '<span class="text-slate-400 italic font-normal">BYE (Auto-Advance)</span>';
            
            html += `
                <div class="bracket-match flex flex-col bg-white border-2 border-slate-200 rounded-xl shadow-sm z-10 hover:border-blue-500 transition-colors">
                    <div class="px-4 py-3 border-b border-slate-100 font-bold text-slate-800 text-sm truncate">${team1}</div>
                    <div class="px-4 py-3 font-bold text-slate-800 text-sm truncate bg-slate-50 rounded-b-xl">${team2}</div>
                </div>
            `;
        });
        
        html += `</div>`;
    });
    
    html += `
            <div class="bracket-round flex flex-col justify-around min-w-[200px]">
                <div class="text-center font-bold text-orange-500 uppercase tracking-widest text-xs mb-2">Champion</div>
                <div class="champion-match flex items-center justify-center p-6 bg-gradient-to-br from-orange-400 to-orange-600 text-white font-black text-xl rounded-xl shadow-lg border-2 border-orange-300 text-center uppercase tracking-wider z-10">
                    <i class="fa-solid fa-trophy mr-3 text-2xl drop-shadow-md"></i> Winner
                </div>
            </div>
        </div>
    </div>`;
    
    div.innerHTML = html;
    setTimeout(drawBracketLines, 50);

    // Show the Publish & Notify button after bracket is generated
    const existingBtn = document.getElementById('publish-ties-btn');
    if (!existingBtn) {
        const publishBtn = document.createElement('button');
        publishBtn.id = 'publish-ties-btn';
        publishBtn.className = 'mt-6 bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-xl font-bold text-base flex items-center gap-2 shadow-lg transition';
        publishBtn.innerHTML = '<i class="fa-solid fa-paper-plane mr-2"></i> Publish & Notify Teams';
        publishBtn.onclick = publishTies;
        div.parentElement.insertBefore(publishBtn, div.nextSibling);
    }
}

function drawBracketLines() {
    const svg = document.getElementById('bracket-lines');
    const container = document.getElementById('bracket-container');
    if (!svg || !container) return;

    svg.innerHTML = '';
    const rounds = container.querySelectorAll('.bracket-round');
    if (rounds.length < 2) return;

    const containerRect = container.getBoundingClientRect();

    for (let r = 0; r < rounds.length - 1; r++) {
        const matchesCurrent = rounds[r].querySelectorAll('.bracket-match');
        let matchesNext = rounds[r+1].querySelectorAll('.bracket-match');

        if (matchesNext.length === 0) {
            matchesNext = rounds[r+1].querySelectorAll('.champion-match');
        }

        for (let i = 0; i < matchesNext.length; i++) {
            if(i * 2 + 1 >= matchesCurrent.length) break;

            const m1 = matchesCurrent[i * 2];       
            const m2 = matchesCurrent[i * 2 + 1];   
            const target = matchesNext[i];          

            const rect1 = m1.getBoundingClientRect();
            const rect2 = m2.getBoundingClientRect();
            const rectT = target.getBoundingClientRect();

            const x1 = rect1.right - containerRect.left;
            const y1 = rect1.top + rect1.height / 2 - containerRect.top;

            const x2 = rect2.right - containerRect.left;
            const y2 = rect2.top + rect2.height / 2 - containerRect.top;

            const xT = rectT.left - containerRect.left;
            const yT = rectT.top + rectT.height / 2 - containerRect.top;

            const midX = x1 + (xT - x1) / 2;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2} M ${midX} ${yT} L ${xT} ${yT}`;
            
            path.setAttribute('d', d);
            path.setAttribute('stroke', '#cbd5e1');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-linejoin', 'round');
            
            svg.appendChild(path);
        }
    }
}

window.addEventListener('resize', drawBracketLines);

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('tourney-form')?.addEventListener('submit', submitTournament);
    document.getElementById('highlight-form')?.addEventListener('submit', submitHighlight);
    document.getElementById('news-form')?.addEventListener('submit', submitNews);

    const authenticated = sessionStorage.getItem('adminAuthenticated') === 'true';
    if (authenticated) {
        openDashboard();
    }
});