var db; // Database SQLite globale (var allows redeclaration on reload)
var supabase; // Client Supabase per sincronizzazione cloud (var allows redeclaration on reload)

// VERSIONE DEL FILE PER DEBUG
console.log("🔧 SCRIPT.JS v20260611 caricato - Petre e Alessio sono qui!");

// Filtro per sopprimere i warning non critici di Spotify/PlayReady
(function() {
    const originalWarn = console.warn;
    const originalError = console.error;
    
    const isSpotifyWarning = (message) => {
        const msg = message?.toString() || '';
        return msg.includes('robustness level') || 
               msg.includes('PlayReady') ||
               msg.includes('setServerCertificate') ||
               msg.includes('generateRequest') ||
               msg.includes('requestMediaKeySystemAccess');
    };
    
    console.warn = function(...args) {
        if (!isSpotifyWarning(args[0])) {
            originalWarn.apply(console, args);
        }
    };
    
    console.error = function(...args) {
        if (!isSpotifyWarning(args[0])) {
            originalError.apply(console, args);
        }
    };
})();

// Configurazione Supabase (Inserisci qui i tuoi dati)
const SUPABASE_URL = 'https://ldvcjhlssqijhwonquiy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdmNqaGxzc3Fpamh3b25xdWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDU5MDYsImV4cCI6MjA5MjQyMTkwNn0.TVTvnCQdjLPXVgXTQdfXPQw_EMV58NfUnGw6XzDsUnI';

function initCloud() {
    if (SUPABASE_URL.includes('TUO_PROGETTO')) {
        console.warn("Supabase: Configura URL e Key in script.js per attivare il cloud!");
        return;
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("Supabase: Client inizializzato");
    
    const indicator = document.getElementById('sync-status');
    if (indicator) {
        indicator.style.background = "#22c55e"; // Verde fisso per Supabase (usa HTTPS)
        indicator.style.boxShadow = "0 0 10px #22c55e";
        indicator.title = "Cloud: Supabase Online";
    }

    // Listener Real-time per i cambiamenti
    const channel = supabase.channel('schema-db-changes')
    .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'roadtrip_sync' },
        (payload) => {
            handleCloudUpdate(payload.new);
        }
    )
    .subscribe();
}

async function pushToCloud(id, data) {
    if (!supabase) return;
    const { error } = await supabase
        .from('roadtrip_sync')
        .upsert({ id, payload: data, updated_at: new Date() });
    
    if (error) console.error("Errore push cloud:", error);
}

async function handleCloudUpdate(data) {
    if (!data || !data.id) return;
    const { id, payload } = data;

    if (id === 'cassa') {
        const bmw = payload?.bmw ?? 0;
        const punto = payload?.punto ?? 0;
        const tolls = payload?.tolls ?? 0;
        db.run("UPDATE cassa SET bmw = ?, punto = ?, tolls = ? WHERE id = 1", [bmw, punto, tolls]);
        await saveDBToIndexedDB();
        aggiornaRisultatoCassa(bmw, punto, tolls);
    } else if (id.startsWith('stat/')) {
        const type = id.split('/')[1];
        const value = payload ?? 0;
        db.run("UPDATE stats SET value = ? WHERE id = ?", [value, type]);
        await saveDBToIndexedDB();
        localStats[type] = value;
        renderStats();
    } else if (id.startsWith('check/')) {
        const itemName = id.split('/')[1];
        if (payload?.exists === false) {
            db.run("DELETE FROM checklist WHERE item = ?", [itemName]);
        } else {
            const isChecked = payload?.checked ? 1 : 0;
            db.run("INSERT OR IGNORE INTO checklist (item, is_checked, is_custom) VALUES (?, ?, 1)", [itemName, isChecked]);
            db.run("UPDATE checklist SET is_checked = ? WHERE item = ?", [isChecked, itemName]);
        }
        await saveDBToIndexedDB();
        renderChecklist();
    } else if (id.startsWith('photo/')) {
        const photoId = id.split('/')[1];
        if (payload === null) {
            delete sharedPhotos[photoId];
        } else if (payload) {
            sharedPhotos[photoId] = { ...payload, id: photoId };
        }
        renderCloudPhotos();
    }
}

// Funzione per controllare lo stato del cloud
window.checkCloud = () => {
    if (supabase) {
        console.log("✅ Cloud (Supabase) è connesso");
        alert("✅ Cloud sincronizzato! Dati salvati in Supabase.");
    } else {
        console.log("⚠️ Cloud non disponibile");
        alert("⚠️ Cloud offline - lavoro solo in locale");
    }
};

async function initSQLite() {
    try {
        const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });

        // Elimina il vecchio database IndexedDB per partire da zero
        console.log("SQLite: Cancellazione database IndexedDB vecchio...");
        await deleteDBFromIndexedDB();

        // Crea un database nuovo
        db = new SQL.Database();
        console.log("SQLite: Nuovo database creato in memoria");

        // Crea le tabelle direttamente
        console.log("SQLite: Creazione tabelle...");
        
        try {
            // Tabella stats
            db.run("CREATE TABLE IF NOT EXISTS stats (id TEXT PRIMARY KEY, value INTEGER)");
            console.log("✓ Tabella stats creata");
            
            db.run("INSERT OR IGNORE INTO stats (id, value) VALUES ('hype', 100)");
            db.run("INSERT OR IGNORE INTO stats (id, value) VALUES ('patience', 100)");
            db.run("INSERT OR IGNORE INTO stats (id, value) VALUES ('social', 100)");
            console.log("✓ Valori stats inseriti");
            
            // Tabella cassa - IMPORTANTE: con colonna bmw
            db.run("CREATE TABLE IF NOT EXISTS cassa (id INTEGER PRIMARY KEY, bmw REAL, punto REAL, tolls REAL)");
            console.log("✓ Tabella cassa creata con colonna bmw");
            
            db.run("INSERT OR IGNORE INTO cassa (id, bmw, punto, tolls) VALUES (1, 0, 0, 0)");
            console.log("✓ Riga cassa inserita");
            
            // Tabella checklist
            db.run("CREATE TABLE IF NOT EXISTS checklist (item TEXT PRIMARY KEY, is_checked INTEGER, is_custom INTEGER)");
            console.log("✓ Tabella checklist creata");
            
        } catch (tableErr) {
            console.error("SQLite: Errore creazione tabelle:", tableErr);
            throw tableErr;
        }
        
        // Verifica immediata che la tabella cassa esista e abbia colonna bmw
        try {
            const testResult = db.exec("SELECT bmw FROM cassa WHERE id = 1");
            console.log("✓ Verifica SELECT bmw riuscita:", testResult);
        } catch (verifyErr) {
            console.error("✗ ERRORE: Query SELECT bmw fallita:", verifyErr.message);
            
            // Debug: stampa struttura della tabella
            try {
                const tableInfo = db.exec("PRAGMA table_info(cassa)");
                console.error("Struttura tabella cassa:", tableInfo);
            } catch (pragmaErr) {
                console.error("Errore PRAGMA:", pragmaErr);
            }
            throw verifyErr;
        }
        
        // Salva il database nuovo in IndexedDB
        await saveDBToIndexedDB();
        console.log("✓ Database salvato in IndexedDB");
        
    } catch (err) {
        console.error("✗ ERRORE CRITICO inizializzazione SQLite:", err);
        throw err;
    }
}

// Persistenza Database via IndexedDB
function loadDBFromIndexedDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open("RoadTripDB", 3);
        request.onupgradeneeded = (e) => {
            console.log("SQLite: Upgrade IndexedDB v3 - database ripulito");
            try {
                if (e.target.result.objectStoreNames.contains("files")) {
                    e.target.result.deleteObjectStore("files");
                }
            } catch (err) {}
            e.target.result.createObjectStore("files");
        };
        request.onsuccess = (e) => {
            const idb = e.target.result;
            const transaction = idb.transaction(["files"], "readonly");
            const store = transaction.objectStore("files");
            const getRequest = store.get("trip.sqlite");
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
    });
}

async function saveDBToIndexedDB() {
    if (!db) return;
    const data = db.export();
    return new Promise((resolve) => {
        const request = indexedDB.open("RoadTripDB", 3);
        request.onupgradeneeded = (e) => {
            console.log("SQLite: Upgrade IndexedDB v3 durante save");
            try {
                if (e.target.result.objectStoreNames.contains("files")) {
                    e.target.result.deleteObjectStore("files");
                }
            } catch (err) {}
            e.target.result.createObjectStore("files");
        };
        request.onsuccess = (e) => {
            const idb = e.target.result;
            try {
                const transaction = idb.transaction(["files"], "readwrite");
                transaction.objectStore("files").put(data, "trip.sqlite");
                transaction.oncomplete = () => {
                    console.log("✓ Database salvato in IndexedDB");
                    resolve();
                };
                transaction.onerror = () => {
                    console.error("✗ Errore transazione IndexedDB:", transaction.error);
                    resolve();
                };
            } catch (txErr) {
                console.error("✗ Errore creazione transazione:", txErr);
                resolve();
            }
        };
        request.onerror = () => {
            console.error("✗ Errore apertura IndexedDB:", request.error);
            resolve();
        };
    });
}

async function deleteDBFromIndexedDB() {
    return new Promise((resolve) => {
        const request = indexedDB.deleteDatabase("RoadTripDB");
        request.onsuccess = () => {
            console.log("SQLite: Database IndexedDB eliminato");
            resolve();
        };
        request.onerror = () => resolve();
    });
}


// 1. CONFIGURAZIONE (Supporto per data.json)
let TRIP_CONFIG = {
    destination: {
        name: "Platja d'Aro",
        lat: 41.8056,
        lon: 3.0586,
        date: "2026-08-02T09:00:00"
    },
    group: {
        size: 8,
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
        {id: "pilota1", role: "Il Pilota", name: "Simone", icon: "🏎️", stats: ["+10 Riflessi", "-10 Pazienza nel traffico"]},
        {id: "pilota2", role: "Il Pilota", name: "Petre", icon: "🏎️", stats: ["+10 Precisione di manovra", "-10 Tolleranza ai passeggeri che dormono"]},
        {id: "dj", role: "La DJ", name: "Sara", icon: "🎧", stats: ["+10 Selezione musicale", "-10 Accetta critiche"]},
        {id: "curve", role: "Soffro le curve", name: "Stella", icon: "🤢", stats: ["+10 Pretesa di sedersi davanti", "-10 Resistenza alle curve"]},
        {id: "stories", role: "Il racconta storie", name: "Matteo", icon: "📖", stats: ["+15 Storie divertenti", "-10 Sonnolenza"]},
        {id: "vigile", role: "Sempre vigile", name: "Alessio", icon: "👀", stats: ["+50 Resistenza al sonno", "-20 Silenzio"]},
        {id: "navigatore", role: "La Navigatrice", name: "Noelia", icon: "🗺️", stats: ["+20 Capacità di lettura di Google Maps", "-10 Orientamento reale"]},
        {id: "noemie", role: "La Social Media Manager", name: "Noemie", icon: "📸", stats: ["+20 Foto estetiche", "-15 Pazienza per i selfie sfocati"]}
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
window.salvaCassaCloud = async () => {
    const bmw = parseFloat(document.getElementById('costBmw')?.value) || 0;
    const punto = parseFloat(document.getElementById('costPunto')?.value) || 0;
    const tolls = parseFloat(document.getElementById('costTolls')?.value) || 0;

    // 1. Locale
    db.run("UPDATE cassa SET bmw = ?, punto = ?, tolls = ? WHERE id = 1", [bmw, punto, tolls]);
    await saveDBToIndexedDB();
    
    // 2. Supabase
    pushToCloud('cassa', { bmw, punto, tolls });
    
    aggiornaRisultatoCassa(bmw, punto, tolls);
};

const aggiornaRisultatoCassa = (bmw, punto, tolls) => {
    const resultEl = document.getElementById('result');
    if (!resultEl) return;
    const totale = bmw + punto + tolls; // Somma delle spese
    const quota = totale / 8; // Divisione per 8 persone (hardcoded)
    resultEl.innerText = quota.toFixed(2);

    // Aggiorna i campi solo se non sono quelli attivi (per non interrompere chi sta scrivendo)
    const active = document.activeElement?.id;
    if (active !== 'costBmw')   { const el = document.getElementById('costBmw');   if (el) el.value = bmw || ""; }
    if (active !== 'costPunto') { const el = document.getElementById('costPunto'); if (el) el.value = punto || ""; }
    if (active !== 'costTolls') { const el = document.getElementById('costTolls'); if (el) el.value = tolls || ""; }
};

// --- SISTEMA CHECKLIST CLOUD DEFINITIVO ---

// Funzione per ridisegnare la lista (chiamata sia dal cloud che dal tasto aggiungi)
function renderChecklist() {
    const listDiv = document.getElementById('checkList');
    if (!listDiv) return;
    listDiv.innerHTML = '';

    // Recupera oggetti da SQLite
    const res = db.exec("SELECT item, is_checked, is_custom FROM checklist");
    const allItems = res.length > 0 ? res[0].values : [];

    if (allItems.length === 0) {
        listDiv.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.4); font-size:0.9rem; padding:20px;">La lista è vuota.<br>Aggiungi qualcosa qui sopra! 👆</p>';
        return;
    }

    allItems.forEach(row => {
        const item = row[0];
        const isChecked = row[1] === 1;
        const div = document.createElement('div');
        div.className = "checklist-item";
        div.innerHTML = `
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; width:100%;">
                <input type="checkbox" id="check-${item}" ${isChecked ? 'checked' : ''} 
                       onchange="sendCheckToCloud('${item}', this.checked)">
                <span id="text-${item}" class="${isChecked ? 'strikethrough' : ''}">${item}</span>
            </label>
            <button onclick="removeItem('${item}')" style="background:none; border:none; color:#ff4444; cursor:pointer; padding:5px;">✕</button>
        `;
        listDiv.appendChild(div);
    });
}

// Funzione per salvare la spunta localmente e sincronizzare
window.sendCheckToCloud = async function(item, status) {
    db.run("UPDATE checklist SET is_checked = ? WHERE item = ?", [status ? 1 : 0, item]);
    await saveDBToIndexedDB();
    
    // Sincronizza su Supabase
    pushToCloud(`check/${item}`, { exists: true, checked: status });
    
    renderChecklist();
};

// Funzione per aggiungere nuovi oggetti
window.addItem = async function() {
    const input = document.getElementById('itemInput');
    const val = input.value.trim();
    if (val) {
        try {
            db.run("INSERT INTO checklist (item, is_checked, is_custom) VALUES (?, 0, 1)", [val]);
            await saveDBToIndexedDB();
            
            pushToCloud(`check/${val}`, { exists: true, checked: false });
            
            input.value = '';
            renderChecklist();
        } catch (e) {
            alert("Oggetto già presente!");
        }
    }
};

// Funzione per eliminare un oggetto
window.removeItem = async function(item) {
    db.run("DELETE FROM checklist WHERE item = ?", [item]);
    await saveDBToIndexedDB();
    
    pushToCloud(`check/${item}`, { exists: false });
    
    renderChecklist();
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
    
    el.classList.toggle('checked', isChecked);
    localStorage.setItem(`bingo_item_${idx}`, isChecked);
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
    const ROAD_FACTOR = 1.3; 
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

const initGeolocation = () => {
    if (!navigator.geolocation) {
        console.warn("⚠️ GPS non supportato o disattivato. Nota: su mobile/web, la geolocalizzazione richiede HTTPS (o localhost) per funzionare.");
        updateDistance(MILAN_COORDS.lat, MILAN_COORDS.lon);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            console.log("📍 Posizione GPS ottenuta con successo:", pos.coords.latitude, pos.coords.longitude);
            updateDistance(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
            console.warn("⚠️ Autorizzazione GPS negata o errore:", err.message);
            // Fallback alle coordinate di Milano
            updateDistance(MILAN_COORDS.lat, MILAN_COORDS.lon);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
};


const initApp = async () => {
    console.log("📍 initApp: START");
    
    try {
        console.log("📍 initApp: Calling initSQLite...");
        await initSQLite();
        console.log("📍 initApp: initSQLite done");
        
        console.log("📍 initApp: Calling initCloud...");
        initCloud();
        console.log("📍 initApp: initCloud done");

        try {
            console.log("📍 initApp: Fetching data.json...");
            const res = await fetch('data.json?nocache=' + (Math.random() * 100000));
            if (res.ok) {
                TRIP_CONFIG = await res.json();
                console.log("✅ Dati caricati da JSON");
            }
        } catch(e) {
            console.warn("⚠️ Esecuzione locale senza server", e);
        }
        

        if (supabase) {
            console.log("📍 initApp: Syncing with Supabase...");
            const { data } = await supabase.from('roadtrip_sync').select('*');
            if (data) {
                data.forEach(row => handleCloudUpdate(row));
            }
        }

        // Caricamento dati iniziali da SQLite per UI
        try {
            const cassaRes = db.exec("SELECT bmw, punto, tolls FROM cassa WHERE id = 1");
            if (cassaRes.length > 0) {
                const row = cassaRes[0].values[0];
                aggiornaRisultatoCassa(row[0] || 0, row[1] || 0, row[2] || 0);
            }
        } catch (e) { console.warn("Dati cassa non trovati in DB", e); }

        try {
            const statsRes = db.exec("SELECT id, value FROM stats");
            if (statsRes.length > 0) {
                statsRes[0].values.forEach(row => {
                    localStats[row[0]] = row[1];
                });
            }
        } catch (e) { console.warn("Dati stats non trovati in DB", e); }

        setInterval(updateCountdown, 60000); 
        updateCountdown();
        fetchWeather();
        
        console.log("📍 initApp: Rendering UI...");
        renderTeam();
        renderBingo();
        renderEmergency();
        renderChecklist();
        initGeolocation();
        initPhotoSection();
        renderCloudPhotos();
        renderStats();
        
        initObserver();
        console.log("✅ initApp: COMPLETE");
    } catch (err) {
        console.error("❌ ERRORE CRITICO in initApp:", err);
    }
};


const sharedPhotos = {};
let lightboxCurrentId = null;


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


const compressImage = (file) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const MAX = 700; 
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

            const photoObj = {
                data: compressed,
                by: userName,
                ts: Date.now()
            };

            // 1. Locale
            sharedPhotos[photoId] = { ...photoObj, id: photoId };
            localStorage.setItem('local_photos', JSON.stringify(sharedPhotos));
            renderCloudPhotos();

            // 2. Supabase
            pushToCloud(`photo/${photoId}`, photoObj);

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
    // 1. Locale
    delete sharedPhotos[id];
    localStorage.setItem('local_photos', JSON.stringify(sharedPhotos));
    
    // 2. Supabase
    pushToCloud(`photo/${id}`, null);
    
    renderCloudPhotos();
};



// 13. STATO SQUADRA
// Stato locale stats 
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

window.updateStat = async (type, change) => {
    let val = localStats[type];
    val += change;
    if (val > 100) val = 100;
    if (val < 0) val = 0;
    localStats[type] = val;
    renderStats();
    
    // 1. SQLite
    db.run("UPDATE stats SET value = ? WHERE id = ?", [val, type]);
    await saveDBToIndexedDB();

    // 2. Supabase
    pushToCloud(`stat/${type}`, val);
};

// Caricamento foto locali all'avvio
const savedPhotos = JSON.parse(localStorage.getItem('local_photos') || "{}");
Object.assign(sharedPhotos, savedPhotos);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}