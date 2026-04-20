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

// 4. CASSA AUTOMATICA
window.recalcCassa = () => {
    const costKia = parseFloat(document.getElementById('costKia').value) || 0;
    const costPunto = parseFloat(document.getElementById('costPunto').value) || 0;
    const costTolls = parseFloat(document.getElementById('costTolls').value) || 0;
    const resultEl = document.getElementById('result');

    if (!resultEl) return;

    const totalTrip = costKia + costPunto + costTolls;
    const perPerson = totalTrip / TRIP_CONFIG.group.size;

    resultEl.innerText = perPerson.toFixed(2);
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
            <label class="checklist-label">
                <input type="checkbox" 
                       ${isChecked ? 'checked' : ''} 
                       onchange="toggleItem('${item.replace(/'/g, "\\'")}', this.checked)"
                       class="checklist-checkbox">
                <span class="${isChecked ? 'strikethrough' : 'text-normal'}">${item}</span>
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
    let customItems = JSON.parse(localStorage.getItem('custom_items') || '[]');
    customItems = customItems.filter(i => i !== item);
    localStorage.setItem('custom_items', JSON.stringify(customItems));
    localStorage.removeItem(`trip_item_${item}`);
    renderChecklist();
};

const initChecklist = () => {
    renderChecklist();
};

window.toggleItem = (item, checked) => {
    localStorage.setItem(`trip_item_${item}`, checked);
    renderChecklist(); 
};

window.addNewItem = () => {
    const input = document.getElementById('newItemInput');
    const val = input.value.trim();
    if (!val) return;

    const customItems = JSON.parse(localStorage.getItem('custom_items') || '[]');
    if (!TRIP_CONFIG.group.items.includes(val) && !customItems.includes(val)) {
        customItems.push(val);
        localStorage.setItem('custom_items', JSON.stringify(customItems));
        renderChecklist();
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
            <div class="bingo-cell ${isChecked ? 'checked' : ''}" onclick="toggleBingo(${index}, this)">
                ${item}
            </div>
        `;
    });
    container.innerHTML = html;
};

window.toggleBingo = (index, el) => {
    const isChecked = el.classList.toggle('checked');
    localStorage.setItem(`bingo_item_${index}`, isChecked);
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
    renderPhotos();
    
    initObserver();
};

// 12. GALLERIA FOTO
window.handlePhotoUpload = (e) => {
    const files = e.target.files;
    if (!files) return;

    for (let file of files) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const photos = JSON.parse(localStorage.getItem('trip_photos') || '[]');
            photos.push(event.target.result);
            try {
                localStorage.setItem('trip_photos', JSON.stringify(photos));
                renderPhotos();
            } catch (err) {
                alert("Memoria locale piena! Cancella qualche foto o usa l'album condiviso.");
            }
        };
        reader.readAsDataURL(file);
    }
};

const renderPhotos = () => {
    const container = document.getElementById('photoGallery');
    if (!container) return;
    const photos = JSON.parse(localStorage.getItem('trip_photos') || '[]');
    
    if (photos.length === 0) {
        container.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-dim); padding: 20px;">Nessuna foto ancora...</p>';
        return;
    }

    container.innerHTML = photos.map((src, index) => `
        <div class="photo-item">
            <img src="${src}" onclick="window.open('${src}', '_blank')">
            <button class="photo-delete" onclick="deletePhoto(${index})">✕</button>
        </div>
    `).join('');
};

window.deletePhoto = (index) => {
    const photos = JSON.parse(localStorage.getItem('trip_photos') || '[]');
    photos.splice(index, 1);
    localStorage.setItem('trip_photos', JSON.stringify(photos));
    renderPhotos();
};

document.addEventListener('DOMContentLoaded', initApp);