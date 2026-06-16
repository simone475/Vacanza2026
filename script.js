var db; // Database SQLite globale (var allows redeclaration on reload)
var supabase; // Client Supabase per sincronizzazione cloud (var allows redeclaration on reload)

// --- CACHE FOTO IN INDEXEDDB (Previene crash di localStorage da 5MB) ---
const PhotoStore = {
    open() {
        return new Promise((resolve) => {
            const request = indexedDB.open("RoadTripPhotos", 1);
            request.onupgradeneeded = (e) => {
                if (!e.target.result.objectStoreNames.contains("images")) {
                    e.target.result.createObjectStore("images");
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = () => resolve(null);
        });
    },
    async get(id) {
        const db = await this.open();
        if (!db) return null;
        return new Promise((resolve) => {
            const tx = db.transaction("images", "readonly");
            const req = tx.objectStore("images").get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    },
    async set(id, data) {
        const db = await this.open();
        if (!db) return;
        return new Promise((resolve) => {
            const tx = db.transaction("images", "readwrite");
            tx.objectStore("images").put(data, id);
            tx.oncomplete = () => resolve();
        });
    },
    async delete(id) {
        const db = await this.open();
        if (!db) return;
        return new Promise((resolve) => {
            const tx = db.transaction("images", "readwrite");
            tx.objectStore("images").delete(id);
            tx.oncomplete = () => resolve();
        });
    }
};

function dataURLtoBlob(dataurl) {
    try {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    } catch (e) {
        console.error("Errore conversione base64 in blob:", e);
        return null;
    }
}

// VERSIONE DEL FILE PER DEBUG
console.log("🔧 SCRIPT.JS v20260611.1 caricato - Cache IndexedDB attiva");

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
        const people = payload?.people ?? 8;
        db.run("UPDATE cassa SET bmw = ?, punto = ?, tolls = ? WHERE id = 1", [bmw, punto, tolls]);
        await saveDBToIndexedDB();
        const peopleEl = document.getElementById('peopleCount');
        if (peopleEl && document.activeElement?.id !== 'peopleCount') peopleEl.value = people;
        localStorage.setItem('cassa_people', people);
        aggiornaRisultatoCassa(bmw, punto, tolls);
    } else if (id.startsWith('stat/')) {
        const type = id.split('/')[1];
        const value = payload ?? 0;
        db.run("UPDATE stats SET value = ? WHERE id = ?", [value, type]);
        await saveDBToIndexedDB();
        localStats[type] = value;
        renderStats();
    } else if (id.startsWith('check/')) {
        // Decodifica il nome dell'item (supporta nomi con '/' multipli)
        const itemName = id.substring('check/'.length);
        if (payload?.exists === false) {
            db.run("DELETE FROM checklist WHERE item = ?", [itemName]);
        } else {
            const isChecked = payload?.checked ? 1 : 0;
            // UPSERT: aggiunge se non esiste, aggiorna se esiste
            db.run("INSERT OR REPLACE INTO checklist (item, is_checked, is_custom) VALUES (?, ?, 1)", [itemName, isChecked]);
        }
        await saveDBToIndexedDB();
        renderChecklist();
    } else if (id.startsWith('photo/')) {
        const photoId = id.split('/')[1];
        if (payload === null) {
            delete sharedPhotos[photoId];
            const savedLocal = JSON.parse(localStorage.getItem('local_photos') || "{}");
            delete savedLocal[photoId];
            localStorage.setItem('local_photos', JSON.stringify(savedLocal));
            await PhotoStore.delete(photoId);
        } else if (payload) {
            if (payload.data) {
                // Salviamo l'immagine in base64 in IndexedDB per non pesare su localStorage
                await PhotoStore.set(photoId, payload.data);
                sharedPhotos[photoId] = {
                    id: photoId,
                    by: payload.by,
                    ts: payload.ts,
                    url: null
                };
            } else {
                // Usiamo la URL pubblica di Supabase Storage
                sharedPhotos[photoId] = {
                    id: photoId,
                    by: payload.by,
                    ts: payload.ts,
                    url: payload.url
                };
            }
            localStorage.setItem('local_photos', JSON.stringify(sharedPhotos));
        }
        renderCloudPhotos();
    } else if (id.startsWith('bingo/')) {
        const bingoId = id.split('/')[1];
        const isChecked = payload?.checked ? 1 : 0;
        db.run("INSERT OR REPLACE INTO bingo (id, is_checked) VALUES (?, ?)", [bingoId, isChecked]);
        await saveDBToIndexedDB();
        renderBingo();
    } else if (id.startsWith('quote/')) {
        const quoteId = id.split('/')[1];
        if (payload === null) {
            db.run("DELETE FROM quotes WHERE id = ?", [quoteId]);
        } else {
            db.run("INSERT OR REPLACE INTO quotes (id, text, author, ts) VALUES (?, ?, ?, ?)", [quoteId, payload.text, payload.author, payload.ts]);
        }
        await saveDBToIndexedDB();
        renderQuotes();
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

        // NON cancelliamo più il DB: carichiamo quello salvato (se esiste)
        const savedData = await loadDBFromIndexedDB();
        if (savedData) {
            db = new SQL.Database(savedData);
            console.log("SQLite: Database caricato da IndexedDB");
        } else {
            db = new SQL.Database();
            console.log("SQLite: Nuovo database creato in memoria");
        }

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
            
            // Tabella quotes
            db.run("CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, text TEXT, author TEXT, ts INTEGER)");
            console.log("✓ Tabella quotes creata");
            
            // Tabella bingo
            db.run("CREATE TABLE IF NOT EXISTS bingo (id TEXT PRIMARY KEY, is_checked INTEGER)");
            console.log("✓ Tabella bingo creata");
            
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


// 1. CONFIGURAZIONE (caricata da data.json, fallback minimo)
let TRIP_CONFIG = {
    destination: { name: "Platja d'Aro", lat: 41.8056, lon: 3.0586, date: "2026-08-02T09:00:00" },
    group: { size: 8, items: [] },
    emergency: { address: "", numbers: [] },
    team: [],
    bingo: []
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
    const people = parseInt(document.getElementById('peopleCount')?.value) || 8;

    localStorage.setItem('cassa_people', people);

    // 1. Locale
    db.run("UPDATE cassa SET bmw = ?, punto = ?, tolls = ? WHERE id = 1", [bmw, punto, tolls]);
    await saveDBToIndexedDB();
    
    // 2. Supabase
    pushToCloud('cassa', { bmw, punto, tolls, people });
    
    aggiornaRisultatoCassa(bmw, punto, tolls);
};

const aggiornaRisultatoCassa = (bmw, punto, tolls) => {
    const resultEl = document.getElementById('result');
    const peopleLabel = document.getElementById('peopleLabel');
    if (!resultEl) return;
    const people = parseInt(document.getElementById('peopleCount')?.value) || 8;
    const totale = bmw + punto + tolls;
    const quota = totale / people;
    resultEl.innerText = quota.toFixed(2);
    if (peopleLabel) peopleLabel.innerText = people;

    const active = document.activeElement?.id;
    if (active !== 'costBmw')   { const el = document.getElementById('costBmw');   if (el) el.value = bmw || ""; }
    if (active !== 'costPunto') { const el = document.getElementById('costPunto'); if (el) el.value = punto || ""; }
    if (active !== 'costTolls') { const el = document.getElementById('costTolls'); if (el) el.value = tolls || ""; }
    if (active !== 'peopleCount') { const el = document.getElementById('peopleCount'); if (el) el.value = people || 8; }
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

    // Effetto coriandoli quando si spunta un elemento!
    if (status && typeof confetti === 'function') {
        confetti({ particleCount: 30, spread: 40, origin: { y: 0.85 } });
        
        // Verifica se tutti gli elementi sono spuntati per una celebrazione completa
        try {
            const checkRes = db.exec("SELECT COUNT(*) FROM checklist WHERE is_checked = 0");
            const remaining = checkRes.length > 0 ? checkRes[0].values[0][0] : 0;
            if (remaining === 0) {
                setTimeout(() => {
                    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
                }, 300);
            }
        } catch (e) {}
    }
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

// 9. RENDER BINGO (con sync Supabase)
const seedBingo = () => {
    if (!TRIP_CONFIG.bingo) return;
    const res = db.exec("SELECT COUNT(*) FROM bingo");
    const count = res.length > 0 ? res[0].values[0][0] : 0;
    if (count === 0 && TRIP_CONFIG.bingo.length > 0) {
        TRIP_CONFIG.bingo.forEach((item, idx) => {
            db.run("INSERT OR IGNORE INTO bingo (id, is_checked) VALUES (?, 0)", [`bingo_${idx}`]);
        });
        saveDBToIndexedDB();
    }
};

const renderBingo = () => {
    const container = document.getElementById('bingoContainer');
    if (!container || !TRIP_CONFIG.bingo) return;

    const res = db.exec("SELECT id, is_checked FROM bingo ORDER BY id");
    const checkMap = {};
    if (res.length > 0) {
        res[0].values.forEach(row => { checkMap[row[0]] = row[1] === 1; });
    }

    let html = '';
    TRIP_CONFIG.bingo.forEach((item, index) => {
        const key = `bingo_${index}`;
        const isChecked = checkMap[key] || false;
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

window.toggleBingo = async (el) => {
    const idx = el.getAttribute('data-idx');
    const isChecked = !el.classList.contains('checked');
    const key = `bingo_${idx}`;
    
    el.classList.toggle('checked', isChecked);

    // 1. SQLite
    db.run("INSERT OR REPLACE INTO bingo (id, is_checked) VALUES (?, ?)", [key, isChecked ? 1 : 0]);
    await saveDBToIndexedDB();

    // 2. Supabase
    pushToCloud(`bingo/${key}`, { checked: isChecked });

    if (isChecked && typeof confetti === 'function') {
        confetti({
            particleCount: 50,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.8 }
        });
        confetti({
            particleCount: 50,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.8 }
        });
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
                const savedPeople = parseInt(localStorage.getItem('cassa_people')) || 8;
                const peopleEl = document.getElementById('peopleCount');
                if (peopleEl) peopleEl.value = savedPeople;
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
        setInterval(fetchWeather, 1800000); // Refresh meteo ogni 30 min
        
        console.log("📍 initApp: Rendering UI...");
        renderTeam();
        seedBingo();
        renderBingo();
        renderEmergency();
        renderChecklist();
        initGeolocation();
        initPhotoSection();
        renderCloudPhotos();
        renderStats();
        renderQuotes();
        renderItinerary();
        
        initObserver();

        // Nascondi splash screen
        const splash = document.getElementById('loading-splash');
        if (splash) splash.classList.add('hidden');

        console.log("✅ initApp: COMPLETE");
    } catch (err) {
        // Nascondi splash anche in caso di errore
        const splash = document.getElementById('loading-splash');
        if (splash) splash.classList.add('hidden');
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
            
            let publicUrl = null;
            
            // Prova l'upload binario su Supabase Storage
            if (supabase) {
                try {
                    const blob = dataURLtoBlob(compressed);
                    if (blob) {
                        const fileName = `${photoId}.jpg`;
                        const { data, error } = await supabase.storage.from('photos').upload(fileName, blob, {
                            contentType: 'image/jpeg',
                            upsert: true
                        });
                        
                        if (error) {
                            console.warn("Supabase Storage error:", error.message);
                        } else {
                            const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);
                            publicUrl = urlData?.publicUrl;
                        }
                    }
                } catch (storageErr) {
                    console.warn("Supabase Storage fail fallback:", storageErr);
                }
            }

            // Metadati da sincronizzare
            const photoMeta = {
                by: userName,
                ts: Date.now(),
                url: publicUrl
            };

            const syncPayload = { ...photoMeta };
            if (!publicUrl) {
                syncPayload.data = compressed; // Manda il base64 in Supabase come fallback
            }

            // 1. Salvataggio locale in PhotoStore (IndexedDB)
            await PhotoStore.set(photoId, compressed);

            // 2. Metadati leggeri in memoria
            sharedPhotos[photoId] = {
                id: photoId,
                by: userName,
                ts: photoMeta.ts,
                url: publicUrl
            };
            
            localStorage.setItem('local_photos', JSON.stringify(sharedPhotos));
            renderCloudPhotos();

            // 3. Spingiamo su Supabase (se c'è la URL usa quella, altrimenti invia Base64 compressa come fallback)
            pushToCloud(`photo/${photoId}`, syncPayload);

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
        .filter(p => p && (p.url || p.id))
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
        const imgSrc = photo.url || 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27 width%3D%271%27 height%3D%271%27 viewBox%3D%270 0 1 1%27%2F%3E';
        return `
            <div class="cloud-photo-card" onclick="openLightbox('${photo.id}')">
                <img id="img-${photo.id}" src="${imgSrc}" alt="Foto di ${photo.by}" loading="lazy">
                <div class="cloud-photo-tag">
                    <span>👤 ${photo.by || 'Anonimo'}</span>
                    <span style="opacity:0.7; font-weight:normal;">${date}</span>
                </div>
                <button class="cloud-photo-delete" onclick="event.stopPropagation(); deleteCloudPhoto('${photo.id}')" title="Elimina">✕</button>
            </div>
        `;
    }).join('');

    // Carica asincronamente da IndexedDB per le foto che non hanno URL
    photos.forEach(async (photo) => {
        if (!photo.url) {
            const cachedData = await PhotoStore.get(photo.id);
            const imgEl = document.getElementById(`img-${photo.id}`);
            if (imgEl && cachedData) {
                imgEl.src = cachedData;
            }
        }
    });
};

// --- Lightbox con Swipe-to-close ---
let lightboxTouchStartX = 0;

window.openLightbox = async (id) => {
    const photo = sharedPhotos[id];
    if (!photo) return;
    lightboxCurrentId = id;
    const lb = document.getElementById('photoLightbox');
    const img = document.getElementById('lightboxImg');
    const cap = document.getElementById('lightboxCaption');
    if (img) {
        if (photo.url) {
            img.src = photo.url;
        } else {
            img.src = 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27 width%3D%271%27 height%3D%271%27%2F%3E';
            const cachedData = await PhotoStore.get(photo.id);
            if (cachedData) img.src = cachedData;
        }
    }
    if (cap) {
        const date = photo.ts ? new Date(photo.ts).toLocaleString('it-IT') : '';
        cap.innerText = `📸 Da: ${photo.by || 'Anonimo'}  ·  ${date}`;
    }
    if (lb) {
        lb.classList.add('open');
        lb.ontouchstart = (e) => { lightboxTouchStartX = e.touches[0].clientX; };
        lb.ontouchend = (e) => {
            const dx = e.changedTouches[0].clientX - lightboxTouchStartX;
            if (Math.abs(dx) > 80) closeLightbox();
        };
    }
};

window.closeLightbox = () => {
    const lb = document.getElementById('photoLightbox');
    if (lb) {
        lb.classList.remove('open');
        lb.ontouchstart = null;
        lb.ontouchend = null;
    }
    lightboxCurrentId = null;
};

window.deleteLightboxPhoto = () => {
    if (lightboxCurrentId) {
        deleteCloudPhoto(lightboxCurrentId);
        closeLightbox();
    }
};

// --- Elimina Foto ---
window.deleteCloudPhoto = async (id) => {
    // 1. Locale
    delete sharedPhotos[id];
    localStorage.setItem('local_photos', JSON.stringify(sharedPhotos));
    await PhotoStore.delete(id);
    
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

// --- LOGICA BACHECA DELLE PERLE (con modifica) ---
let editingQuoteId = null;

window.addQuote = async () => {
    const textInput = document.getElementById('quoteInput');
    const authorInput = document.getElementById('quoteAuthor');
    if (!textInput || !authorInput) return;
    const text = textInput.value.trim();
    const author = authorInput.value.trim();
    
    if (!text) { alert("Inserisci una perla!"); return; }
    if (!author) { alert("Chi l'ha detta?"); return; }

    if (editingQuoteId) {
        // Modifica citazione esistente
        const ts = Date.now();
        db.run("UPDATE quotes SET text = ?, author = ?, ts = ? WHERE id = ?", [text, author, ts, editingQuoteId]);
        await saveDBToIndexedDB();
        pushToCloud(`quote/${editingQuoteId}`, { text, author, ts });
        editingQuoteId = null;
    } else {
        // Nuova citazione
        const quoteId = `q_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const ts = Date.now();
        db.run("INSERT OR REPLACE INTO quotes (id, text, author, ts) VALUES (?, ?, ?, ?)", [quoteId, text, author, ts]);
        await saveDBToIndexedDB();
        pushToCloud(`quote/${quoteId}`, { text, author, ts });

        if (typeof confetti === 'function') {
            confetti({ particleCount: 30, spread: 40, origin: { y: 0.8 } });
        }
    }

    textInput.value = '';
    authorInput.value = '';
    document.getElementById('quoteSubmitBtn').innerText = '✓';
    renderQuotes();
};

window.editQuote = (quoteId, text, author) => {
    document.getElementById('quoteInput').value = text;
    document.getElementById('quoteAuthor').value = author;
    editingQuoteId = quoteId;
    document.getElementById('quoteSubmitBtn').innerText = '✎';
    document.getElementById('quoteCancelBtn').style.display = 'flex';
    document.getElementById('quoteInput').focus();
};

window.cancelQuoteEdit = () => {
    editingQuoteId = null;
    document.getElementById('quoteInput').value = '';
    document.getElementById('quoteAuthor').value = '';
    document.getElementById('quoteSubmitBtn').innerText = '✓';
    document.getElementById('quoteCancelBtn').style.display = 'none';
};

window.deleteQuote = async (quoteId) => {
    if (editingQuoteId === quoteId) cancelQuoteEdit();
    db.run("DELETE FROM quotes WHERE id = ?", [quoteId]);
    await saveDBToIndexedDB();
    pushToCloud(`quote/${quoteId}`, null);
    renderQuotes();
};

const renderQuotes = () => {
    const container = document.getElementById('quotesContainer');
    if (!container || !db) return;

    container.innerHTML = '';

    try {
        const res = db.exec("SELECT id, text, author, ts FROM quotes ORDER BY ts DESC");
        const rows = res.length > 0 ? res[0].values : [];

        if (rows.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.4); font-size:0.8rem; padding:15px;">Nessuna perla memorizzata... Ancora! 🎙️</p>';
            return;
        }

        rows.forEach(row => {
            const id = row[0];
            const text = row[1];
            const author = row[2];
            const ts = row[3];
            const dateStr = new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

            const div = document.createElement('div');
            div.className = 'quote-card';
            div.dataset.id = id;
            div.dataset.text = text;
            div.dataset.author = author;
            div.innerHTML = `
                <p class="quote-text">« ${text.replace(/</g, '&lt;')} »</p>
                <div class="quote-author">
                    <span>— ${author.replace(/</g, '&lt;')} (${dateStr})</span>
                    <div style="display:flex;gap:6px;">
                        <button class="quote-delete-btn quote-edit-btn" title="Modifica" style="color:var(--accent-blue);">✎</button>
                        <button class="quote-delete-btn quote-del-btn" title="Elimina">✕</button>
                    </div>
                </div>
            `;
            div.querySelector('.quote-edit-btn').onclick = () => editQuote(div.dataset.id, div.dataset.text, div.dataset.author);
            div.querySelector('.quote-del-btn').onclick = () => deleteQuote(div.dataset.id);
            container.appendChild(div);
        });
    } catch (e) {
        console.warn("Errore rendering quotes:", e);
    }
};

// --- ITINERARIO ---
const ITINERARY_KEY = 'roadtrip_itinerary';

function loadItinerary() {
    try {
        return JSON.parse(localStorage.getItem(ITINERARY_KEY)) || [];
    } catch { return []; }
}

function saveItinerary(items) {
    localStorage.setItem(ITINERARY_KEY, JSON.stringify(items));
}

function renderItinerary() {
    const container = document.getElementById('itineraryContainer');
    if (!container) return;
    const items = loadItinerary();

    if (items.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.4);font-size:0.8rem;padding:15px;">Aggiungi una tappa all\'itinerario! 📍</p>';
        return;
    }

    items.sort((a, b) => (a.day || 0) - (b.day || 0) || (a.id || '').localeCompare(b.id || ''));

    container.innerHTML = items.map((item, idx) => `
        <div class="itinerary-card">
            <span class="itinerary-day">G${item.day}</span>
            <span class="itinerary-text">${item.text}</span>
            <button class="itinerary-delete" onclick="deleteItineraryItem(${idx})" title="Elimina">✕</button>
        </div>
    `).join('');
}

window.addItineraryItem = () => {
    const dayInput = document.getElementById('itineraryDay');
    const textInput = document.getElementById('itineraryText');
    const day = parseInt(dayInput?.value);
    const text = textInput?.value.trim();

    if (!day || day < 1) { alert('Inserisci un giorno valido!'); return; }
    if (!text) { alert('Inserisci cosa si fa!'); return; }

    const items = loadItinerary();
    items.push({ id: Date.now() + '_' + Math.random().toString(36).substr(2, 4), day, text });
    saveItinerary(items);
    renderItinerary();

    dayInput.value = '';
    textInput.value = '';
};

window.deleteItineraryItem = (idx) => {
    const items = loadItinerary();
    items.splice(idx, 1);
    saveItinerary(items);
    renderItinerary();
};

window.clearItinerary = () => {
    if (!confirm('Resettare tutto l\'itinerario?')) return;
    saveItinerary([]);
    renderItinerary();
};

// --- LOGICA EVENTI RAPIDI STATISTICHE ---
window.triggerQuickEvent = async (event) => {
    if (event === 'coda') {
        alert("🚨 Coda in autostrada! Il traffico snerva i piloti e ammoscia l'hype...");
        await updateStat('hype', -15);
        await updateStat('patience', -20);
        await updateStat('social', -10);
    } else if (event === 'caffe') {
        alert("☕ Pausa caffè all'autogrill! Ricarichiamo le batterie e l'hype sale!");
        await updateStat('hype', 15);
        await updateStat('patience', 20);
        await updateStat('social', 25);
    } else if (event === 'sara') {
        alert("🎵 Sara DJ ha messo una hit estiva pazzesca! L'Hype vola, ma occhio alla pazienza dei piloti!");
        await updateStat('hype', 30);
        await updateStat('patience', -15);
    } else if (event === 'mare') {
        alert("🌊 SI PARTE SUL SERIO! Si vede il mare all'orizzonte! Hype ed energia al 100%!");
        await updateStat('hype', 100);
        await updateStat('patience', 100);
        await updateStat('social', 100);
        
        if (typeof confetti === 'function') {
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
        }
    }
};

// Caricamento foto locali all'avvio
const savedPhotos = JSON.parse(localStorage.getItem('local_photos') || "{}");
Object.assign(sharedPhotos, savedPhotos);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}