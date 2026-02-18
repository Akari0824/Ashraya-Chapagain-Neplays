// --- MOCK DATABASE ---
const db = {
    users: [
        { id: 1, name: 'Admin User', email: 'admin@neplays.com', role: 'admin', password: '123' },
        { id: 2, name: 'Sanjay Gupta', email: 'sanjay@gmail.com', role: 'user', password: '123' }
    ],
    tournaments: [
        { id: 101, name: 'Kathmandu Valley Inter-College', date: '2023-11-15', fee: 5000, status: 'Open', image: 'https://images.unsplash.com/photo-1546519638-68e109498ee2?auto=format&fit=crop&q=80&w=800', max_teams: 16 },
        { id: 102, name: 'National Pro League', date: '2023-12-01', fee: 10000, status: 'Upcoming', image: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&q=80&w=800', max_teams: 8 },
        { id: 103, name: 'Corporate Cup 2024', date: '2024-01-10', fee: 15000, status: 'Open', image: 'https://images.unsplash.com/photo-1519861531473-920026393112?auto=format&fit=crop&q=80&w=800', max_teams: 12 }
    ],
    news: [
        { id: 1, title: "Registration Open for Valley Cup!", date: "2023-10-01", content: "We are excited to announce that registration is now open for the biggest college tournament in Kathmandu." },
        { id: 2, title: "New Rule Changes for 2024 Season", date: "2023-10-05", content: "FIBA has updated the rules regarding fouls. Please check the rulebook before your next game." },
        { id: 3, title: "Sanjay Gupta wins MVP", date: "2023-09-20", content: "In a stunning display of skill, Sanjay Gupta secured the MVP title for the Summer League." }
    ],
    sliderImages: [
        { id: 1, url: 'https://images.unsplash.com/photo-1519861531473-920026393112?auto=format&fit=crop&q=80&w=1600', caption: 'Inter-College Finals 2023' },
        { id: 2, url: 'https://images.unsplash.com/photo-1546519638-68e109498ee2?auto=format&fit=crop&q=80&w=1600', caption: 'Dharan Regional Qualifiers' },
        { id: 3, url: 'https://images.unsplash.com/photo-1505666287802-931dc83948e9?auto=format&fit=crop&q=80&w=1600', caption: 'National Team Training Camp' }
    ]
};

// --- AUTH & COMMON LOGIC ---
const app = {
    getCurrentUser: () => {
        const userStr = localStorage.getItem('currentUser');
        return userStr ? JSON.parse(userStr) : null;
    },

    initNav: () => {
        const user = app.getCurrentUser();
        const authLinks = document.getElementById('auth-links');
        
        if (user) {
            authLinks.innerHTML = `
                <button onclick="app.logout()" class="cursor-pointer hover:text-orange-500 transition mr-2">Logout</button>
                <div class="w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-lg cursor-pointer hover:ring-4 hover:ring-orange-200 transition border-2 border-white" title="Dashboard">
                    ${user.name.charAt(0)}
                </div>
            `;
        } else {
            authLinks.innerHTML = `
                <a href="login.html" class="cursor-pointer hover:text-orange-500 transition">Login</a>
                <a href="register.html" class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-full font-bold text-sm cursor-pointer transition">Register</a>
            `;
        }
    },

    login: (email, password) => {
        const user = db.users.find(u => u.email === email && u.password === password);
        if (user) {
            localStorage.setItem('currentUser', JSON.stringify(user));
            window.location.href = 'index.html';
        } else {
            alert('Invalid credentials. Try: admin@neplays.com / 123');
        }
    },

    logout: () => {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    },

    register: (name, email, password) => {
        const newUser = { id: Date.now(), name, email, password, role: 'user' };
        localStorage.setItem('currentUser', JSON.stringify(newUser));
        alert('Account Created Successfully!');
        window.location.href = 'index.html';
    },

    // --- SLIDER LOGIC ---
    slider: {
        index: 0,
        interval: null,
        init: () => {
            app.slider.render();
            app.slider.interval = setInterval(app.slider.next, 4000);
        },
        next: () => {
            app.slider.index = (app.slider.index + 1) % db.sliderImages.length;
            app.slider.render();
        },
        prev: () => {
            app.slider.index = (app.slider.index - 1 + db.sliderImages.length) % db.sliderImages.length;
            app.slider.render();
        },
        render: () => {
            const container = document.getElementById('slider-container');
            if(!container) return;
            const img = db.sliderImages[app.slider.index];
            container.innerHTML = `
                <div class="fade-anim w-full h-full relative">
                    <img src="${img.url}" class="w-full h-full object-cover">
                    <div class="absolute bottom-8 right-8 bg-black/60 text-white px-4 py-2 rounded-lg text-sm font-medium backdrop-blur-sm">
                        <i class="fa-solid fa-camera mr-2 text-orange-400"></i> ${img.caption}
                    </div>
                </div>
            `;
        }
    },

    // --- RENDERERS ---
    renderTournaments: () => {
        const container = document.getElementById('tournament-grid');
        if(!container) return;
        
        container.innerHTML = db.tournaments.map(t => `
            <div class="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition border border-slate-100 flex flex-col h-full">
                <div class="h-48 overflow-hidden relative">
                    <img src="${t.image}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                    <div class="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-slate-900 uppercase tracking-wide">${t.status}</div>
                </div>
                <div class="p-6 flex-1 flex flex-col">
                    <div class="flex justify-between items-start mb-2">
                        <h3 class="text-2xl font-bold leading-tight w-2/3 text-slate-800">${t.name}</h3>
                        <div class="text-right"><p class="text-orange-600 font-bold text-lg">Rs. ${t.fee}</p></div>
                    </div>
                    <div class="text-slate-500 text-sm space-y-2 mb-6">
                        <p><i class="fa-regular fa-calendar mr-2"></i> Starts ${t.date}</p>
                        <p><i class="fa-solid fa-users mr-2"></i> Max ${t.max_teams} Teams</p>
                    </div>
                    <button onclick="app.initiateRegistration('${t.name}', ${t.fee})" class="mt-auto w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-orange-500 transition">REGISTER TEAM</button>
                </div>
            </div>
        `).join('');
    },

    renderNews: () => {
        const container = document.getElementById('news-container');
        if(!container) return;
        
        container.innerHTML = db.news.map(n => `
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition">
                <div class="flex items-center gap-3 mb-2">
                    <span class="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded-full">ANNOUNCEMENT</span>
                    <span class="text-slate-400 text-xs"><i class="fa-regular fa-calendar mr-1"></i> ${n.date}</span>
                </div>
                <h3 class="text-2xl font-bold mb-3 text-slate-800">${n.title}</h3>
                <p class="text-slate-600 leading-relaxed">${n.content}</p>
            </div>
        `).join('');
    },

    initiateRegistration: (name, fee) => {
        const user = app.getCurrentUser();
        if(!user) {
            alert("You must login to register for a tournament.");
            window.location.href = 'login.html';
            return;
        }
        
        const modal = document.getElementById('payment-modal');
        const content = document.getElementById('payment-content');
        if(modal && content) {
            content.innerHTML = `
                <div class="bg-slate-900 p-6 text-white text-center border-b-4 border-orange-500">
                    <h3 class="text-2xl font-bold brand-font">CONFIRM REGISTRATION</h3>
                    <p class="opacity-80">${name}</p>
                </div>
                <div class="p-6">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-slate-700 mb-1">Team Name</label>
                        <input type="text" id="team-name" class="w-full px-4 py-2 rounded-lg border border-slate-300" placeholder="Enter Team Name">
                    </div>
                    <div class="bg-slate-50 p-4 rounded-lg mb-6 border border-slate-200">
                        <div class="flex justify-between text-lg font-bold">
                            <span>Total Fee</span>
                            <span class="text-orange-600">Rs. ${fee}</span>
                        </div>
                    </div>
                    <button onclick="alert('Payment Successful via Khalti! Registration Confirmed.'); document.getElementById('payment-modal').classList.add('hidden');" class="w-full khalti-purple text-white py-3 rounded-lg font-bold flex justify-center items-center gap-2">
                        Pay with Khalti
                    </button>
                    <button onclick="document.getElementById('payment-modal').classList.add('hidden')" class="w-full mt-3 text-slate-500 text-sm">Cancel</button>
                </div>
            `;
            modal.classList.remove('hidden');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.initNav();
    if(document.getElementById('slider-container')) app.slider.init();
    if(document.getElementById('tournament-grid')) app.renderTournaments();
    if(document.getElementById('news-container')) app.renderNews();
});

