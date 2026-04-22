/**
 * ROAD TRIP CORE SCRIPT
 * Configurazione e logica per il viaggio di gruppo
 */

// 1. CONFIGURAZIONE (Supporto per data.json)
let TRIP_CONFIG = {
    destination: {
        name: "Platja d'Aro",
        lat: 41.8056,
        lon: 3.0586,
        date: "2026-08-02T09:00:00"
    },
    group: {
        size: 7,
        items: []
    },
    emergency: {
        address: "Carrer Esempio 123, Platja d'Aro, Spain",
        numbers: [
            {name: "Emergenza Europea", number: "112"},
            {name: "Pronto Soccorso Locale", number: "+34 123 456 789"}
        ]
    },
    team: [
        {id: "pilota", role: "Il Pilota", name: "Marco", icon: "🏎️", stats: ["+10 Riflessi", "-5 Pazienza nel traffico"]},
        {id: "dj", role: "Il DJ", name: "Luca", icon: "🎧", stats: ["+10 Selezione musicale", "-10 Accetta critiche"]},
        {id: "panini", role: "Quello dei Panini", name: "Giovanni", icon: "🥪", stats: ["+15 Approvvigionamento carboidrati", "-5 Spazio libero"]},
        {id: "navigatore", role: "Il Navigatore", name: "Simone", icon: "🗺️", stats: ["+20 Capacità di Google Maps", "-10 Orientamento reale"]}
    ],
    bingo: [
        "Macchina gialla", "Tizio che dorme a bocca aperta", "Autogrill con nome strano",
        "Sorpasso a destra", "Canzone imbarazzante alla radio", "Coda per incidente",
        "Gabbiano gigante", "Sole che acceca", "Cartello incomprensibile"
    ]
};

// 2. LOGICA COUNTDOWN
const updateCountdown = () => {
    const countdownEl = document.getElementById('countdown');
    if (!countdownEl) return;

    const diff = new Date(TRIP_CONFIG.destination.date) - new Date();
    
    if (diff <= 0) {
        countdownEl.innerText = "SI PARTE! 🚗💨";
        return;
    }

    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);

    countdownEl.innerText = `${d}g ${h}o ${m}m alla partenza`;
};

// 3. NAVIGAZIONE (Deep Linking)
window.naviga = (platform) => {
    const { lat, lon } = TRIP_CONFIG.destination;
    const urls = {
        google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`,
        waze: `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`
    };
    window.open(urls[platform], '_blank');
};

// 4. CASSA CARBURANTE (Real-time)
window.salvaCassaCloud = () => {
    const kia = parseFloat(document.getElementById('costKia')?.value) || 0;
    const punto = parseFloat(document.getElementById('costPunto')?.value) || 0;
    const tolls = parseFloat(document.getElementById('costTolls')?.value) || 0;

    // Aggiorna UI localmente subito
    aggiornaRisultatoCassa(kia, punto, tolls);

    // Invia al cloud — tutti lo vedranno in tempo reale
    tripNode.get('cassa').put({ kia, punto, tolls });
};

const aggiornaRisultatoCassa = (kia, punto, tolls) => {
    const resultEl = document.getElementById('result');
    if (!resultEl) return;
    const totale = kia + punto + tolls; // Somma delle spese
    const quota = totale / (TRIP_CONFIG.group.size || 7);
    resultEl.innerText = quota.toFixed(2);

    // Aggiorna i campi solo se non sono quelli attivi (per non interrompere chi sta scrivendo)
    const active = document.activeElement?.id;
    if (active !== 'costKia')   { const el = document.getElementById('costKia');   if (el) el.value = kia || ""; }
    if (active !== 'costPunto') { const el = document.getElementById('costPunto'); if (el) el.value = punto || ""; }
    if (active !== 'costTolls') { const el = document.getElementById('costTolls'); if (el) el.value = tolls || ""; }
};

// 5. CHECKLIST CON MEMORIA E FILTRI
let currentFilter = 'all';

const renderChecklist = () => {
    const listDiv = document.getElementById('checkList');
    if (!listDiv) return;
    listDiv.innerHTML = '';

    const customItems = JSON.parse(localStorage.getItem('custom_items') || '[]');
    const allItems = [...TRIP_CONFIG.group.items, ...customItems];

    document.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-filter-${currentFilter}`);
    if (activeBtn) activeBtn.classList.add('active');

    allItems.forEach(item => {
        const isChecked = localStorage.getItem(`trip_item_${item}`) === 'true';
        
        if (currentFilter === 'missing' && isChecked) return;
        if (currentFilter === 'done' && !isChecked) return;

        const div = document.createElement('div');
        div.className = "checklist-item";
        
        div.innerHTML = `
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; width:100%;">
                <input type="checkbox" 
                       id="check-${item}" 
                       ${isChecked ? 'checked' : ''} 
                       onchange="tripNode.get('checklist_states').get('${item.replace(/'/g, "\\'")}').put(this.checked)">
                <span id="text-${item}" class="${isChecked ? 'strikethrough' : ''}">${item}</span>
            </label>
            <button class="btn-delete" onclick="deleteItem('${item.replace(/'/g, "\\'")}')" title="Elimina">×</button>
        `;
        listDiv.appendChild(div);
    });
};

window.setFilter = (filter) => {
    currentFilter = filter;
    renderChecklist();
};

window.deleteItem = (item) => {
    if (typeof tripNode !== 'undefined') {
        tripNode.get('checklist_items').get(item).put(null); // Rimuove da Gun
    } else {
        let customItems = JSON.parse(localStorage.getItem('custom_items') || '[]');
        customItems = customItems.filter(i => i !== item);
        localStorage.setItem('custom_items', JSON.stringify(customItems));
        renderChecklist();
    }
};

const initChecklist = () => {
    renderChecklist();
};

window.toggleItem = (item, checked) => {
    toggleCheck(item, checked);
};

window.toggleCheck = (item, status) => {
    if (typeof tripNode !== 'undefined') {
        tripNode.get('checklist_states').get(item).put(status);
    } else {
        localStorage.setItem(`trip_item_${item}`, status);
        renderChecklist(); 
    }
};

window.addNewItem = () => {
    const input = document.getElementById('newItemInput');
    const val = input.value.trim();
    if (!val) return;

    if (typeof tripNode !== 'undefined') {
        tripNode.get('checklist_items').get(val).put(true);
    } else {
        const customItems = JSON.parse(localStorage.getItem('custom_items') || '[]');
        if (!TRIP_CONFIG.group.items.includes(val) && !customItems.includes(val)) {
            customItems.push(val);
            localStorage.setItem('custom_items', JSON.stringify(customItems));
            renderChecklist();
        }
    }
    input.value = '';
};

window.handleKeyPress = (e) => {
    if (e.key === 'Enter') {
        addNewItem();
    }
};

// 6. METEO
const fetchWeather = async () => {
    const { lat, lon } = TRIP_CONFIG.destination;
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const data = await res.json();
        const temp = data.current_weather.temperature;
        const code = data.current_weather.weathercode;
        
        let icon = "☀️";
        let suggestion = "Perfetto per la spiaggia! 🏖️";
        if (code >= 1 && code <= 3) { icon = "⛅"; suggestion = "Ottimo per passeggiare! 🚶‍♂️"; }
        if (code >= 45 && code <= 48) { icon = "🌫️"; suggestion = "Guida con prudenza! 🚗"; }
        if (code >= 51 && code <= 67) { icon = "🌧️"; suggestion = "Consigliata visita al coperto o Museo! 🏛️"; }
        if (code >= 71 && code <= 82) { icon = "❄️"; suggestion = "Fa freddo, copritevi! 🧥"; }
        if (code >= 95) { icon = "⛈️"; suggestion = "Restate al sicuro al chiuso! 🏠"; }

        const tempEl = document.getElementById('weather-temp');
        const iconEl = document.getElementById('weather-icon');
        const suggEl = document.getElementById('weather-suggestion');
        
        if (tempEl && iconEl) {
            tempEl.innerText = `${temp}°C`;
            iconEl.innerText = icon;
            if(suggEl) suggEl.innerText = suggestion;
        }
    } catch (e) {
        console.error("Errore meteo", e);
    }
};

// 7. ROADMAP ANIMATION
const initObserver = () => {
    const stops = document.querySelectorAll('.roadmap-stop');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    stops.forEach(stop => observer.observe(stop));
};

// 8. RENDER TEAM
const renderTeam = () => {
    const container = document.getElementById('teamContainer');
    if (!container || !TRIP_CONFIG.team) return;
    
    let html = '';
    TRIP_CONFIG.team.forEach(member => {
        const stats = member.stats.map(s => `<li style="font-size: 0.75rem; color: var(--text-dim);">${s}</li>`).join('');
        html += `
            <div class="team-card">
                <div class="team-icon">${member.icon}</div>
                <h3 class="team-role">${member.role}</h3>
                <p class="team-name">${member.name}</p>
                <ul class="team-stats" style="margin-top: 8px; list-style: none; padding: 0;">${stats}</ul>
            </div>
        `;
    });
    container.innerHTML = html;
};

// 9. RENDER BINGO
const renderBingo = () => {
    const container = document.getElementById('bingoContainer');
    if (!container || !TRIP_CONFIG.bingo) return;
    
    let html = '';
    TRIP_CONFIG.bingo.forEach((item, index) => {
        const isChecked = localStorage.getItem(`bingo_item_${index}`) === 'true';
        html += `
            <div class="bingo-cell ${isChecked ? 'checked' : ''}" 
                 data-idx="${index}" 
                 onclick="toggleBingo(this)">
                ${item}
            </div>
        `;
    });
    container.innerHTML = html;
};

window.toggleBingo = (el) => {
    const idx = el.getAttribute('data-idx');
    const isChecked = !el.classList.contains('checked');
    
    // Invia al cloud Gun
    if (typeof tripNode !== 'undefined') {
        tripNode.get('bingo').get(idx).put(isChecked);
    } else {
        // Fallback locale se non c'è internet
        el.classList.toggle('checked', isChecked);
        localStorage.setItem(`bingo_item_${idx}`, isChecked);
    }
};

// 10. RENDER EMERGENCY
const renderEmergency = () => {
    const container = document.getElementById('emergencyContainer');
    const data = TRIP_CONFIG.emergency;
    if (!container || !data) return;

    let numbersHtml = data.numbers.map(n => `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 0.9rem;">${n.name}</span>
            <a href="tel:${n.number.replace(/\s+/g, '')}" class="btn-sos-call">${n.number}</a>
        </div>
    `).join('');

    const { lat, lon } = TRIP_CONFIG.destination;
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

    container.innerHTML = `
        <div class="sos-card">
            <h3 style="color: white; margin-bottom: 12px;">🚑 Numeri Utili</h3>
            ${numbersHtml}
            <hr class="sos-divider">
            <h3 style="color: white; margin-bottom: 8px; margin-top: 15px;">📍 Il Nostro Alloggio</h3>
            <p style="font-size: 0.85rem; color: #fbcfe8;">${data.address}</p>
            <a href="${mapsLink}" target="_blank" class="btn-sos-maps mt-2" style="display: block; margin-top: 15px;">Apri su Google Maps</a>
        </div>
    `;
};

// 11. PROGRESSO VIAGGIO (Distanza e GPS)
const MILAN_COORDS = { lat: 45.4642, lon: 9.1900 };

const getDistanceInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

const updateDistance = (currentLat, currentLon) => {
    const { lat: destLat, lon: destLon } = TRIP_CONFIG.destination;
    const ROAD_FACTOR = 1.3; // Fattore per passare da linea d'aria a percorso stradale reale
    
    // Calcoliamo la distanza totale fissa da Milano per la barra di progresso
    const totalDistance = getDistanceInKm(MILAN_COORDS.lat, MILAN_COORDS.lon, destLat, destLon) * ROAD_FACTOR;
    const currentDistance = getDistanceInKm(currentLat, currentLon, destLat, destLon) * ROAD_FACTOR;
    
    let progress = ((totalDistance - currentDistance) / totalDistance) * 100;
    if (progress < 0) progress = 0;
    if (progress > 100) progress = 100;

    const barEl = document.getElementById('distance-bar');
    const textEl = document.getElementById('distance-text');
    
    if (barEl) barEl.style.width = `${progress}%`;
    if (textEl) {
        textEl.innerHTML = `${Math.round(currentDistance)} km alla meta <span style="font-size: 0.7rem; opacity: 0.7;">(su ${Math.round(totalDistance)} km totali)</span>`;
    }
};

// Updated initGeolocation to fallback to city input if manual permission denied
const initGeolocation = () => {
    // Richiesta esplicita all'utente
    const wantsGPS = confirm("Vuoi attivare la geolocalizzazione per vedere a che punto sei del viaggio? 🚗\n(Verrà aperta anche una mappa con la posizione attuale)");
    
    if (wantsGPS && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { lat: destLat, lon: destLon } = TRIP_CONFIG.destination;
                updateDistance(pos.coords.latitude, pos.coords.longitude);
                // Suggerimento di usare Maps
                window.open(`https://www.google.com/maps/dir/${pos.coords.latitude},${pos.coords.longitude}/${destLat},${destLon}`, '_blank');
            },
            (err) => {
                console.warn('Geolocalizzazione negata');
                updateDistance(MILAN_COORDS.lat, MILAN_COORDS.lon); // Fallback a Milano
            }
        );
    } else {
        updateDistance(MILAN_COORDS.lat, MILAN_COORDS.lon); // Fallback a Milano
    }
};

// INIZIALIZZAZIONE CON FETCH
const initApp = async () => {
    try {
        const res = await fetch('data.json');
        if (res.ok) {
            TRIP_CONFIG = await res.json();
            console.log("Dati caricati da JSON");
        }
    } catch(e) {
        console.warn("Esecuzione locale senza server, utilizzo i dati di default", e);
    }
    
    setInterval(updateCountdown, 60000); 
    updateCountdown();
    fetchWeather();
    
    renderTeam();
    renderBingo();
    renderEmergency();
    initChecklist();
    initGeolocation();
    initPhotoSection();
    renderCloudPhotos();
    renderStats();
    
    initObserver();
};

// 12. CLOUD FOTO CONDIVISO
// -------------------------------------------------------

// Mappa locale delle foto ricevute da Gun (id -> {data, by, ts})
const sharedPhotos = {};
let lightboxCurrentId = null;

// --- Gestione Nome Utente ---
window.savePhotoName = () => {
    const input = document.getElementById('photoUserName');
    const name = input ? input.value.trim() : '';
    if (!name) { alert('Inserisci il tuo nome!'); return; }
    localStorage.setItem('photo_user_name', name);
    applyPhotoName(name);
};

window.changePhotoName = () => {
    localStorage.removeItem('photo_user_name');
    const namePrompt = document.getElementById('namePrompt');
    const uploadSection = document.getElementById('uploadSection');
    if (namePrompt) namePrompt.style.display = 'block';
    if (uploadSection) uploadSection.style.display = 'none';
};

const applyPhotoName = (name) => {
    const namePrompt = document.getElementById('namePrompt');
    const uploadSection = document.getElementById('uploadSection');
    const display = document.getElementById('currentUserDisplay');
    if (namePrompt) namePrompt.style.display = 'none';
    if (uploadSection) uploadSection.style.display = 'block';
    if (display) display.innerText = `👤 ${name}`;
};

const initPhotoSection = () => {
    const saved = localStorage.getItem('photo_user_name');
    if (saved) {
        applyPhotoName(saved);
        const input = document.getElementById('photoUserName');
        if (input) input.value = saved;
    }
};

// --- Compressione Immagine (Canvas) ---
const compressImage = (file) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const MAX = 700; // px max lato lungo
                let { width, height } = img;
                if (width > height && width > MAX) {
                    height = Math.round((height * MAX) / width);
                    width = MAX;
                } else if (height > MAX) {
                    width = Math.round((width * MAX) / height);
                    height = MAX;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.65));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

// --- Upload Foto su Gun ---
window.handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const userName = localStorage.getItem('photo_user_name') || 'Anonimo';
    const btnText = document.getElementById('uploadBtnText');
    const progressBox = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');

    if (progressBox) progressBox.style.display = 'block';
    if (btnText) btnText.innerText = `⏳ Caricamento...`;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const pct = Math.round(((i) / files.length) * 100);
        if (progressBar) progressBar.style.width = `${pct}%`;

        try {
            const compressed = await compressImage(file);
            const photoId = `photo_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

            if (typeof tripNode !== 'undefined') {
                tripNode.get('cloud_photos').get(photoId).put({
                    data: compressed,
                    by: userName,
                    ts: Date.now(),
                    id: photoId
                });
            }
        } catch (err) {
            console.error('Errore compressione foto:', err);
        }
    }

    if (progressBar) progressBar.style.width = '100%';
    setTimeout(() => {
        if (progressBox) progressBox.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
        if (btnText) btnText.innerText = `📸 Carica Foto`;
    }, 800);

    // Reset input
    e.target.value = '';
};

// --- Render Galleria Cloud ---
const renderCloudPhotos = () => {
    const gallery = document.getElementById('photoGallery');
    const countEl = document.getElementById('sharedPhotoCount');
    if (!gallery) return;

    const photos = Object.values(sharedPhotos)
        .filter(p => p && p.data)
        .sort((a, b) => (b.ts || 0) - (a.ts || 0));

    if (countEl) {
        countEl.innerText = photos.length === 0
            ? 'Nessuna foto ancora... Caricane una!'
            : `📷 ${photos.length} foto nel cloud`;
    }

    if (photos.length === 0) {
        gallery.innerHTML = '';
        return;
    }

    gallery.innerHTML = photos.map(photo => {
        const date = photo.ts ? new Date(photo.ts).toLocaleDateString('it-IT', { day:'2-digit', month:'short' }) : '';
        return `
            <div class="cloud-photo-card" onclick="openLightbox('${photo.id}')">
                <img src="${photo.data}" alt="Foto di ${photo.by}" loading="lazy">
                <div class="cloud-photo-tag">
                    <span>👤 ${photo.by || 'Anonimo'}</span>
                    <span style="opacity:0.7; font-weight:normal;">${date}</span>
                </div>
                <button class="cloud-photo-delete" onclick="event.stopPropagation(); deleteCloudPhoto('${photo.id}')" title="Elimina">✕</button>
            </div>
        `;
    }).join('');
};

// --- Lightbox ---
window.openLightbox = (id) => {
    const photo = sharedPhotos[id];
    if (!photo) return;
    lightboxCurrentId = id;
    const lb = document.getElementById('photoLightbox');
    const img = document.getElementById('lightboxImg');
    const cap = document.getElementById('lightboxCaption');
    if (img) img.src = photo.data;
    if (cap) {
        const date = photo.ts ? new Date(photo.ts).toLocaleString('it-IT') : '';
        cap.innerText = `📸 Da: ${photo.by || 'Anonimo'}  ·  ${date}`;
    }
    if (lb) lb.classList.add('open');
};

window.closeLightbox = () => {
    const lb = document.getElementById('photoLightbox');
    if (lb) lb.classList.remove('open');
    lightboxCurrentId = null;
};

window.deleteLightboxPhoto = () => {
    if (lightboxCurrentId) {
        deleteCloudPhoto(lightboxCurrentId);
        closeLightbox();
    }
};

// --- Elimina Foto ---
window.deleteCloudPhoto = (id) => {
    if (typeof tripNode !== 'undefined') {
        tripNode.get('cloud_photos').get(id).put(null);
    }
    delete sharedPhotos[id];
    renderCloudPhotos();
};



// 13. STATO SQUADRA
// Stato locale stats (aggiornato in tempo reale da Gun)
const localStats = { hype: 100, patience: 100, social: 100 };

const renderStats = () => {
    ['hype', 'patience', 'social'].forEach(type => {
        const val = localStats[type];
        const bar = document.getElementById(`bar-${type}`);
        const text = document.getElementById(`val-${type}`);
        if (bar) bar.style.width = `${val}%`;
        if (text) text.innerText = `${val}%`;
    });
};

window.updateStat = (type, change) => {
    let val = localStats[type];
    val += change;
    if (val > 100) val = 100;
    if (val < 0) val = 0;
    localStats[type] = val;
    renderStats();
    // Pubblica su Gun — sincronizza con tutti i telefoni
    if (typeof tripNode !== 'undefined') {
        tripNode.get('stats').get(type).put(val);
    }
};

// --- GUN.JS CONFIGURATION ---
// Relay aggiornati e funzionanti (i precedenti Heroku erano offline)
const gun = Gun([
    'https://gun-manhattan.herokuapp.com/gun',
    'https://relay.peer.ooo/gun'
]);

// Questa è la "stanza" del vostro viaggio. Non cambiarla!
const tripNode = gun.get('roadtrip_platja_daro_2026_final_v1');

// Gestione connettività
gun.on('hi', peer => {
    console.log("Connesso al relay:", peer);
    const indicator = document.getElementById('sync-status');
    if (indicator) {
        indicator.style.background = "#22c55e";
        indicator.style.boxShadow = "0 0 8px #22c55e";
    }
});

// =====================================================
// SINCRONIZZAZIONE IN TEMPO REALE - TUTTI I DISPOSITIVI
// =====================================================

// Ascolto aggiornamenti Stats (hype, patience, social)
tripNode.get('stats').map().on((val, type) => {
    if (val !== null && typeof val === 'number') {
        localStats[type] = val;
        renderStats();
    }
});

// Ascolto aggiornamenti Bingo dagli altri telefoni
tripNode.get('bingo').map().on((val, idx) => {
    if (!idx || idx === '_' || idx.startsWith('_')) return;
    
    // Cerchiamo la casella tramite l'attributo data-idx
    const btn = document.querySelector(`[data-idx="${idx}"]`);
    if (btn) {
        btn.classList.toggle('checked', val === true);
    }
    
    // Salviamo anche localmente per quando riapri il sito
    localStorage.setItem(`bingo_item_${idx}`, val);
});

// Riceve i dati dagli altri telefoni in tempo reale
tripNode.get('cassa').on((data) => {
    if (!data) return;
    
    // Aggiorna i campi di input
    const elKia = document.getElementById('costKia');
    const elPunto = document.getElementById('costPunto');
    const elTolls = document.getElementById('costTolls');

    // Li aggiorniamo solo se l'utente non ci sta scrivendo sopra in questo momento
    if (document.activeElement !== elKia)   elKia.value = data.kia || "";
    if (document.activeElement !== elPunto) elPunto.value = data.punto || "";
    if (document.activeElement !== elTolls)  elTolls.value = data.tolls || "";
    
    // Ricalcola il totale a testa
    aggiornaRisultatoCassa(data.kia || 0, data.punto || 0, data.tolls || 0);
});

// Ascolto nuovi oggetti Checklist "Da non dimenticare"
tripNode.get('checklist_items').map().on((val, item) => {
    if (!item || item === '_' || item.startsWith('_')) return; // Ignora metadati Gun
    let customItems = JSON.parse(localStorage.getItem('custom_items') || '[]');
    if (val === true) {
        if (!customItems.includes(item) && !TRIP_CONFIG.group.items.includes(item)) {
            customItems.push(item);
        }
    } else if (val === null || val === false) {
        customItems = customItems.filter(i => i !== item);
    }
    localStorage.setItem('custom_items', JSON.stringify(customItems));
    renderChecklist();
});



// Ascolto foto del cloud (da tutti i dispositivi)
tripNode.get('cloud_photos').map().on((photo, id) => {
    if (!id || id === '_' || id.startsWith('_')) return;
    if (photo && photo.data) {
        sharedPhotos[id] = { ...photo, id };
    } else {
        delete sharedPhotos[id];
    }
    renderCloudPhotos();
});

// COPIA QUESTO IN FONDO AL FILE script.js
tripNode.get('checklist_states').map().on((val, item) => {
    if (!item || item.startsWith('_')) return;

    // Aggiorna memoria locale
    localStorage.setItem(`trip_item_${item}`, val);

    // Aggiorna visivamente la checkbox
    const cb = document.getElementById(`check-${item}`);
    if (cb) cb.checked = val;

    // Aggiorna visivamente il testo (barrato/normale)
    const txt = document.getElementById(`text-${item}`);
    if (txt) {
        if (val) {
            txt.style.textDecoration = "line-through";
            txt.style.opacity = "0.5";
        } else {
            txt.style.textDecoration = "none";
            txt.style.opacity = "1";
        }
    }
});

document.addEventListener('DOMContentLoaded', initApp);