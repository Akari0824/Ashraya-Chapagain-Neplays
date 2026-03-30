const API_URL = 'http://localhost:5000/api';

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
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

const app = {
    init: () => {
        app.initNav();
        app.renderTournaments();
        app.renderNews();
        app.loadHighlights();

        if (window.location.pathname.includes('profile.html')) {
            app.profile.init();
        }
    },

    initNav: async () => {
        const authLinks = document.getElementById('auth-links');
        if (!authLinks) return;

        const userEmail = localStorage.getItem('userEmail');
        if (userEmail) {
            const savedProfile = JSON.parse(localStorage.getItem(`profileData_${userEmail}`)) || {};
            const displayName = savedProfile.name || userEmail.split('@')[0];

            // Fetch unread notification count for bell badge
            let unreadCount = 0;
            try {
                const nr = await fetch(`${API_URL}/notifications/${encodeURIComponent(userEmail)}/unread-count`);
                if (nr.ok) { const nd = await nr.json(); unreadCount = nd.count || 0; }
            } catch(e) {}

            const badgeHtml = unreadCount > 0
                ? `<span class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">${unreadCount > 9 ? '9+' : unreadCount}</span>`
                : '';

            authLinks.innerHTML = `
                <a href="profile.html#messages" class="relative text-slate-300 hover:text-orange-500 transition mr-2" title="Messages">
                    <i class="fa-solid fa-bell text-xl"></i>
                    ${badgeHtml}
                </a>
                <a href="profile.html" class="text-sm text-slate-300 hover:text-orange-500 mr-4 transition">
                    <i class="fa-solid fa-user"></i> ${escapeHtml(displayName)}
                </a>
                <button onclick="app.logout()" class="text-red-400 hover:text-red-500 font-bold transition">Logout</button>
            `;
        } else {
            authLinks.innerHTML = `
                <a href="login.html" class="hover:text-orange-500 transition font-bold mr-4">Login</a>
                <a href="register.html" class="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-full font-bold text-sm transition">Register</a>
            `;
        }
    },

    logout: () => {
        localStorage.removeItem('userEmail');
        window.location.href = 'index.html';
    },

    renderTournaments: async () => {
        const featured = document.getElementById('featured-tournaments');
        const grid = document.getElementById('tournament-grid');
        if (!featured && !grid) return;

        const email = localStorage.getItem('userEmail');
        let userRegs = [];
        if (email) {
            try {
                const rRes = await fetch(`${API_URL}/registrations/user/${email}`);
                if (rRes.ok) userRegs = await rRes.json();
            } catch(e) {}
        }

        try {
            const res = await fetch(`${API_URL}/tournaments`);
            const tournaments = await res.json();

            if (tournaments.length === 0) {
                const msg = '<p class="col-span-full text-center text-slate-500 py-10">No active tournaments right now.</p>';
                if (featured) featured.innerHTML = msg;
                if (grid) grid.innerHTML = msg;
                return;
            }

            const html = tournaments.map(t => {
                const activeReg = userRegs.find(r => r.tournament_id === t.id && r.status !== 'cancelled');
                
                const actionButton = activeReg 
                    ? `<button onclick="app.cancelRegistration(${activeReg.id})" class="bg-red-500 text-white px-5 py-2 rounded-lg font-bold hover:bg-red-600 transition">Cancel</button>`
                    : `<button onclick="app.openRegistration(${t.id}, '${escapeHtml(t.name)}', ${t.entry_fee || 5000})" class="bg-slate-900 text-white px-5 py-2 rounded-lg font-bold hover:bg-orange-500 transition">Register</button>`;

                return `
                <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 hover:shadow-xl transition group flex flex-col h-full">
                    <div class="h-48 bg-slate-900 relative flex items-center justify-center">
                        <i class="fa-solid fa-trophy text-6xl text-slate-700 group-hover:text-orange-500 transition transform group-hover:scale-110"></i>
                        <div class="absolute top-4 right-4 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">OPEN</div>
                    </div>
                    <div class="p-6 flex-grow flex flex-col">
                        <div class="text-sm text-orange-500 font-bold mb-2"><i class="fa-regular fa-calendar"></i> ${new Date(t.start_date).toLocaleDateString()}</div>
                        <h3 class="text-2xl font-bold mb-3 brand-font text-slate-800">${escapeHtml(t.name)}</h3>
                        <div class="flex flex-wrap gap-2 mb-6">
                            <span class="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded font-medium">${escapeHtml(t.game_type)}</span>
                            <span class="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded font-medium">${escapeHtml(t.category)}</span>
                            <span class="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded font-medium">${escapeHtml(t.age_limit)}</span>
                        </div>
                        <div class="mt-auto border-t border-slate-100 pt-4 flex justify-between items-center">
                            <div><span class="block text-xs text-slate-400">Entry Fee</span><span class="text-lg font-bold text-slate-800">Rs. ${t.entry_fee || 5000}</span></div>
                            ${actionButton}
                        </div>
                    </div>
                </div>
            `}).join('');

            if (featured) featured.innerHTML = html;
            if (grid) grid.innerHTML = html;
        } catch (err) { console.error("Error loading tournaments:", err); }
    },

    cancelRegistration: async (regId) => {
        if (!confirm("Are you sure you want to cancel this registration?")) return;
        
        try {
            const res = await fetch(`${API_URL}/registrations/${regId}/cancel`, { method: 'POST' });
            const data = await res.json();
            
            if (res.ok) {
                showNotification('success', 'Registration cancelled. Your team has been withdrawn.');
                app.renderTournaments(); 
            } else {
                showNotification('error', data.error);
            }
        } catch (err) { 
            showNotification('error', 'Error connecting to server.'); 
        }
    },

    openRegistration: (tournamentId, tournamentName, fee) => {
        if (!localStorage.getItem('userEmail')) {
            showNotification('error', 'Please log in or register an account first!');
            setTimeout(() => { window.location.href = "login.html"; }, 1500);
            return;
        }

        let modal = document.createElement('div');
        modal.id = 'payment-modal';
        modal.className = 'fixed inset-0 bg-slate-900/80 flex items-center justify-center z-[100] backdrop-blur-sm';
        document.body.appendChild(modal);

        modal.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl m-4 animate-fade-in">
                <div class="bg-slate-900 p-6 text-white relative">
                    <button onclick="document.getElementById('payment-modal').remove()" class="absolute top-4 right-4 text-slate-400 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
                    <h2 class="text-3xl font-bold brand-font mb-1">REGISTER TEAM</h2>
                    <p class="text-slate-300 text-sm">${tournamentName}</p>
                </div>
                <div class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-bold text-slate-700 mb-1">Team Name</label>
                        <input type="text" id="reg-team-name" class="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-orange-500 outline-none" placeholder="Enter Team Name">
                    </div>

                    <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                        <span class="font-bold text-slate-600">Total Entry Fee</span>
                        <span class="text-xl font-bold text-slate-800">Rs. ${fee}</span>
                    </div>

                    <!-- Payment method selector -->
                    <div>
                        <p class="text-sm font-bold text-slate-700 mb-3">Choose Payment Method</p>
                        <div class="grid grid-cols-2 gap-3">
                            <label id="esewa-option" class="cursor-pointer flex flex-col items-center gap-2 p-4 border-2 border-slate-200 rounded-xl hover:border-green-500 transition has-[:checked]:border-green-500 has-[:checked]:bg-green-50">
                                <input type="radio" name="payment-method" value="esewa" class="sr-only" checked>
                                <img src="https://esewa.com.np/common/images/esewa_logo.png" alt="eSewa" class="h-8 object-contain">
                                <span class="text-xs font-bold text-green-700">eSewa</span>
                            </label>
                            <label id="khalti-option" class="cursor-pointer flex flex-col items-center gap-2 p-4 border-2 border-slate-200 rounded-xl hover:border-purple-500 transition has-[:checked]:border-purple-500 has-[:checked]:bg-purple-50">
                                <input type="radio" name="payment-method" value="khalti" class="sr-only">
                                <img src="https://khalti.com/static/khalti-logo.svg" alt="Khalti" class="h-8 object-contain">
                                <span class="text-xs font-bold text-purple-700">Khalti</span>
                            </label>
                        </div>
                    </div>

                    <button onclick="app.submitRegistration(${tournamentId}, ${fee})"
                        class="w-full mt-2 bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold text-lg flex justify-center items-center gap-2 transition shadow-lg"
                        id="pay-btn">
                        <i class="fa-solid fa-wallet"></i> Pay with eSewa
                    </button>

                    <!-- Hidden eSewa form — submitted programmatically -->
                    <form id="esewa-form" method="POST" target="_self" class="hidden">
                        <input type="hidden" name="amount">
                        <input type="hidden" name="tax_amount">
                        <input type="hidden" name="total_amount">
                        <input type="hidden" name="transaction_uuid">
                        <input type="hidden" name="product_code">
                        <input type="hidden" name="product_service_charge">
                        <input type="hidden" name="product_delivery_charge">
                        <input type="hidden" name="success_url">
                        <input type="hidden" name="failure_url">
                        <input type="hidden" name="signed_field_names">
                        <input type="hidden" name="signature">
                    </form>
                </div>
            </div>
        `;

        // Update button label + colour when method changes
        modal.querySelectorAll('input[name="payment-method"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const btn = document.getElementById('pay-btn');
                if (radio.value === 'esewa') {
                    btn.className = 'w-full mt-2 bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold text-lg flex justify-center items-center gap-2 transition shadow-lg';
                    btn.innerHTML = '<i class="fa-solid fa-wallet"></i> Pay with eSewa';
                } else {
                    btn.className = 'w-full mt-2 bg-[#5C2D91] hover:opacity-90 text-white py-4 rounded-xl font-bold text-lg flex justify-center items-center gap-2 transition shadow-lg';
                    btn.innerHTML = '<i class="fa-solid fa-wallet"></i> Pay with Khalti';
                }
            });
        });
    },

    submitRegistration: async (tournamentId, amount) => {
        const teamName = document.getElementById('reg-team-name').value.trim();
        const email    = localStorage.getItem('userEmail');
        const method   = document.querySelector('input[name="payment-method"]:checked')?.value || 'esewa';

        if (!teamName) return showNotification('error', 'Please enter a Team Name.');

        const payload = { tournament_id: tournamentId, team_name: teamName, user_email: email, amount };

        try {
            if (method === 'khalti') {
                // --- Khalti flow (unchanged) ---
                const res  = await fetch(`${API_URL}/registrations/pay`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.payment_url) { window.location.href = data.payment_url; }
                else { showNotification('error', 'Khalti payment initiation failed.'); }

            } else {
                // --- eSewa flow ---
                const res  = await fetch(`${API_URL}/registrations/pay-esewa`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                if (!data.esewa_url) {
                    return showNotification('error', 'eSewa payment initiation failed.');
                }

                // Populate hidden form and submit to eSewa
                const form = document.getElementById('esewa-form');
                form.action = data.esewa_url;
                form.querySelector('[name="amount"]').value                   = data.amount;
                form.querySelector('[name="tax_amount"]').value               = data.tax_amount;
                form.querySelector('[name="total_amount"]').value             = data.total_amount;
                form.querySelector('[name="transaction_uuid"]').value         = data.transaction_uuid;
                form.querySelector('[name="product_code"]').value             = data.product_code;
                form.querySelector('[name="product_service_charge"]').value   = data.product_service_charge;
                form.querySelector('[name="product_delivery_charge"]').value  = data.product_delivery_charge;
                form.querySelector('[name="success_url"]').value              = data.success_url;
                form.querySelector('[name="failure_url"]').value              = data.failure_url;
                form.querySelector('[name="signed_field_names"]').value       = data.signed_field_names;
                form.querySelector('[name="signature"]').value                = data.signature;
                form.submit();
            }
        } catch (error) {
            showNotification('error', 'Error connecting to payment gateway.');
        }
    },

    // NEWS LOGIC
    renderNews: async () => {
        const container = document.getElementById('news-container');
        if (!container) return;

        try {
            const res = await fetch(`${API_URL}/news/active`);
            const news = await res.json();
            
            if (news.length === 0) {
                container.innerHTML = '<p class="text-slate-500 py-4">No recent announcements.</p>';
                return;
            }

            container.innerHTML = news.map(item => `
                <div class="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-orange-500 mb-4 hover:shadow-md transition">
                    <h3 class="text-xl font-bold mb-2 brand-font text-slate-800">${escapeHtml(item.title)}</h3>
                    <p class="text-slate-600 text-sm leading-relaxed whitespace-pre-line">${escapeHtml(item.content)}</p>
                    <p class="text-xs text-slate-400 mt-3 font-bold uppercase tracking-widest"><i class="fa-regular fa-clock"></i> ${new Date(item.created_at).toLocaleDateString()}</p>
                </div>
            `).join('');
        } catch (err) { console.error("Error loading news:", err); }
    },

    // HIGHLIGHTS LOGIC
    loadHighlights: async () => {
        const gallery = document.getElementById('highlights-gallery');
        if (!gallery) return;
        try {
            const res = await fetch(`${API_URL}/highlights`);
            const photos = await res.json();

            if (photos.length === 0) {
                gallery.innerHTML = '<p class="w-full text-center text-slate-500 py-10">No highlights available right now.</p>';
                return;
            }

            gallery.innerHTML = photos.map(p => `
                <div onclick="app.openHighlightModal('${p.image_url}', '${escapeHtml(p.title)}', '${escapeHtml(p.description || 'Experience the thrill of the event!')}')" 
                     class="cursor-pointer flex-none w-[280px] sm:w-[350px] group relative overflow-hidden rounded-2xl h-72 bg-slate-900 shadow-lg snap-center hover:shadow-xl hover:shadow-orange-500/20 transition-all duration-300">
                    <img src="${p.image_url}" class="w-full h-full object-cover opacity-80 transition duration-700 group-hover:scale-110 group-hover:opacity-100">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-6">
                        <div class="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                            <p class="text-white font-bold text-xl uppercase tracking-wider brand-font">${escapeHtml(p.title)}</p>
                            <p class="text-orange-400 text-xs mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-100 font-bold uppercase tracking-widest">
                                View Details <i class="fa-solid fa-arrow-right ml-1"></i>
                            </p>
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (err) {}
    },

    openHighlightModal: (url, title, description) => {
        const modal = document.getElementById('highlight-modal');
        const modalContent = document.getElementById('highlight-modal-content');
        
        document.getElementById('modal-image').src = url;
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-desc').innerText = description;
        
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modalContent.classList.remove('scale-95');
        }, 10);
    },

    closeHighlightModal: () => {
        const modal = document.getElementById('highlight-modal');
        const modalContent = document.getElementById('highlight-modal-content');
        
        modal.classList.add('opacity-0');
        modalContent.classList.add('scale-95');
        
        setTimeout(() => { modal.classList.add('hidden'); }, 300); 
    },

    profile: {
        init: () => {
            const email = localStorage.getItem('userEmail');
            if (!email) { window.location.href = 'login.html'; return; }

            const savedProfile = JSON.parse(localStorage.getItem(`profileData_${email}`)) || {};
            document.getElementById('profile-name').innerText = savedProfile.name || email.split('@')[0];
            if (savedProfile.location) document.getElementById('profile-location-display').innerHTML = `<i class="fa-solid fa-location-dot mr-1"></i> ${escapeHtml(savedProfile.location)}`;
            if (savedProfile.bio) document.getElementById('profile-bio').innerText = savedProfile.bio;
            if (savedProfile.image) document.getElementById('profile-image').src = savedProfile.image;

            const urlParams = new URLSearchParams(window.location.search);
            const paymentStatus = urlParams.get('payment');
            
            if (paymentStatus === 'success') {
                const method = urlParams.get('method') === 'esewa' ? 'eSewa' : 'Khalti';
                showNotification('success', `${method} Payment Successful! Your team is registered.`);
                window.history.replaceState({}, document.title, window.location.pathname);
            } else if (paymentStatus === 'failed' || paymentStatus === 'error') {
                const method = urlParams.get('method') === 'esewa' ? 'eSewa' : 'Khalti';
                showNotification('error', `${method} Payment Failed or Cancelled. Please try again.`);
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            app.profile.loadTeams(email);
            app.profile.loadNotifications(email);

            // If URL has #messages hash, switch to messages tab automatically
            if (window.location.hash === '#messages') {
                setTimeout(() => app.profile.switchTab('messages'), 100);
            }
        },

        loadTeams: async (email) => {
            const container = document.getElementById('my-teams-list');
            try {
                const res = await fetch(`${API_URL}/registrations/user/${email}`);
                const teams = await res.json();
                const countEl = document.getElementById('profile-tourney-count');
                if (countEl) countEl.innerText = teams.length;

                if (teams.length === 0) {
                    container.innerHTML = `<div class="p-4 bg-slate-50 rounded-xl text-center text-slate-500 text-sm border">No teams registered yet.</div>`;
                    return;
                }

                container.innerHTML = teams.map(t => `
                    <div class="p-5 rounded-xl border-2 flex flex-col md:flex-row md:justify-between md:items-center gap-4 transition ${t.status === 'active' ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}">
                        <div>
                            <h4 class="font-bold text-lg text-slate-800 uppercase tracking-wide">${escapeHtml(t.team_name)}</h4>
                            <p class="text-xs text-slate-500 font-medium">Tournament #${t.tournament_id}</p>
                        </div>
                        <span class="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest shadow-sm self-start md:self-auto ${t.status === 'active' ? 'bg-green-500 text-white' : 'bg-slate-500 text-white'}">
                            ${t.status}
                        </span>
                    </div>
                `).join('');
            } catch (err) {}
        },

        // Load and render notifications inbox
        loadNotifications: async (email) => {
            const container = document.getElementById('notifications-list');
            if (!container) return;

            try {
                const res = await fetch(`${API_URL}/notifications/${encodeURIComponent(email)}`);
                const notes = await res.json();

                // Update bell badge count
                const unread = notes.filter(n => !n.is_read).length;
                const badge = document.getElementById('notif-badge');
                if (badge) {
                    badge.textContent = unread > 9 ? '9+' : unread;
                    badge.classList.toggle('hidden', unread === 0);
                }

                if (notes.length === 0) {
                    container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-16 text-slate-400">
                            <i class="fa-solid fa-bell-slash text-5xl mb-4 opacity-30"></i>
                            <p class="font-bold text-lg">No messages yet</p>
                            <p class="text-sm">Notifications about payments, refunds and match fixtures will appear here.</p>
                        </div>`;
                    return;
                }

                const iconMap = {
                    refund:  { icon: 'fa-money-bill-wave', color: 'text-blue-500',   bg: 'bg-blue-50',   border: 'border-blue-200' },
                    success: { icon: 'fa-circle-check',    color: 'text-green-500',  bg: 'bg-green-50',  border: 'border-green-200' },
                    match:   { icon: 'fa-sitemap',         color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
                    info:    { icon: 'fa-circle-info',     color: 'text-slate-500',  bg: 'bg-slate-50',  border: 'border-slate-200' },
                };

                container.innerHTML = notes.map(n => {
                    const style = iconMap[n.type] || iconMap['info'];
                    const timeAgo = new Date(n.created_at).toLocaleString();
                    return `
                        <div id="notif-${n.id}" onclick="app.profile.markRead(${n.id}, '${email}')"
                             class="flex gap-4 p-4 rounded-xl border-2 cursor-pointer transition hover:shadow-md
                                    ${n.is_read ? 'border-slate-100 bg-white opacity-70' : `${style.border} ${style.bg}`}">
                            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm border ${style.border}">
                                <i class="fa-solid ${style.icon} ${style.color}"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex justify-between items-start gap-2">
                                    <h4 class="font-bold text-slate-800 text-sm">${escapeHtml(n.title)}</h4>
                                    ${!n.is_read ? '<span class="flex-shrink-0 w-2 h-2 bg-orange-500 rounded-full mt-1"></span>' : ''}
                                </div>
                                <p class="text-slate-600 text-xs mt-1 leading-relaxed">${escapeHtml(n.message)}</p>
                                <p class="text-slate-400 text-xs mt-2"><i class="fa-regular fa-clock mr-1"></i>${timeAgo}</p>
                            </div>
                        </div>`;
                }).join('');

            } catch (err) { console.error('Error loading notifications:', err); }
        },

        markRead: async (notifId, email) => {
            try {
                await fetch(`${API_URL}/notifications/${notifId}/read`, { method: 'POST' });
                // Refresh notifications to update badge + read state
                app.profile.loadNotifications(email);
                app.initNav();
            } catch(e) {}
        },

        markAllRead: async (email) => {
            try {
                await fetch(`${API_URL}/notifications/read-all/${encodeURIComponent(email)}`, { method: 'POST' });
                app.profile.loadNotifications(email);
                app.initNav();
            } catch(e) {}
        },

        switchTab: (tab) => {
            const tabs = ['teams', 'messages'];
            tabs.forEach(t => {
                document.getElementById(`tab-${t}`)?.classList.toggle('hidden', t !== tab);
                document.getElementById(`tab-btn-${t}`)?.classList.toggle('border-orange-500', t === tab);
                document.getElementById(`tab-btn-${t}`)?.classList.toggle('text-orange-500', t === tab);
                document.getElementById(`tab-btn-${t}`)?.classList.toggle('border-transparent', t !== tab);
                document.getElementById(`tab-btn-${t}`)?.classList.toggle('text-slate-500', t !== tab);
            });
        },

        toggleEdit: () => {
            const modal = document.getElementById('edit-modal');
            if (modal.classList.contains('hidden')) {
                const email = localStorage.getItem('userEmail');
                const savedProfile = JSON.parse(localStorage.getItem(`profileData_${email}`)) || {};
                document.getElementById('edit-name').value = savedProfile.name || '';
                document.getElementById('edit-location').value = savedProfile.location || '';
                document.getElementById('edit-bio').value = savedProfile.bio || '';
                document.getElementById('edit-image').value = savedProfile.image || '';
                modal.classList.remove('hidden');
                return;
            }
            modal.classList.add('hidden');
        },

        save: (form) => {
            event.preventDefault(); 
            const email = localStorage.getItem('userEmail');
            const profileData = { name: form.name.value, location: form.location.value, bio: form.bio.value, image: form.image.value };

            localStorage.setItem(`profileData_${email}`, JSON.stringify(profileData));

            if (profileData.name) document.getElementById('profile-name').innerText = profileData.name;
            if (profileData.location) document.getElementById('profile-location-display').innerHTML = `<i class="fa-solid fa-location-dot mr-1"></i> ${escapeHtml(profileData.location)}`;
            if (profileData.bio) document.getElementById('profile-bio').innerText = profileData.bio;
            if (profileData.image) document.getElementById('profile-image').src = profileData.image;

            app.initNav();
            app.profile.toggleEdit();
        }
    }
};

document.addEventListener('DOMContentLoaded', app.init);