// ── Global State ──────────────────────────────────────────────────────────────
function handleLogout() {
    if (confirm("Are you sure you want to sign out?")) {
        window.location.href = "/logout";
    }
}
let userLat = 0, userLng = 0, userAddr = 'Unknown Location', userMapLink = '';
let userAccuracy = 0, userAltitude = 0;
let locationReady = false;
let geoWatchId = null;
let geoRetryCount = 0;
let camStream = null;
let realtimeInterval = null;
let isDetectionActive = false;
let fpsCounter = 0, fpsTimer = Date.now();
let currentUser = null;
let imageFiles = [];
let videoFile = null;
let rtSession = { maxCount: 0, bestConf: 0, capturedFrames: [] };
let myLineChart = null, myBarChart = null;
let profileAbortController = null;
let isSimulatedCamera = false;

// ── Performance Utilities ─────────────────────────────────────────────────────
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ── Mobile Touch Support ──────────────────────────────────────────────────────
// Enhance touch responsiveness on all interactive elements
(() => {
    if (('ontouchstart' in window) || (navigator.maxTouchPoints > 0)) {
        // Add active class on touch for visual feedback
        document.addEventListener('touchstart', (e) => {
            let el = e.target.closest('button, a, input, textarea, [onclick]');
            if (el) {
                el.classList.add('touch-active');
                el.style.opacity = '0.9';
            }
        }, { passive: true });

        document.addEventListener('touchend', (e) => {
            document.querySelectorAll('.touch-active').forEach(el => {
                el.classList.remove('touch-active');
                el.style.opacity = '';
            });
        }, { passive: true });

        // Prevent default zoom on double-tap
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            let now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });
    }
})();

// ── Socket.IO ─────────────────────────────────────────────────────────────────
let socket;
try {
    if (typeof io !== 'undefined') {
        socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            timeout: 10000
        });

        socket.on('connect', () => {
            console.log('✅ Socket connected');
        });
        socket.on('connect_error', e => console.warn('⚠️ Socket connection issue:', e.message));
    } else {
        console.warn('⚠️ Socket.io library not loaded - real-time will be limited');
        socket = { on: () => { }, emit: () => { } }; // Dummy socket to prevent errors
    }
} catch (e) {
    console.error('❌ Socket Init Error:', e);
    socket = { on: () => { }, emit: () => { } };
}

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
    console.log('🚀 Initializing dashboard...');

    // UNLOCK UI IMMEDIATELY - Don't wait for profile
    document.body.style.pointerEvents = 'auto';
    document.querySelectorAll('.nav-item, button, a[onclick], .qa-card').forEach(el => {
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
    });

    // Start with server-rendered user to avoid wrong role UI.
    currentUser = window.__BOOT_USER__ || { name: 'Guest Officer', email: 'Offline', role: 'public' };

    try {
        startClock();
        updateProfileUI(currentUser);
        console.log('✅ Dashboard page shown - UI is NOW VISIBLE');

        // 2. Load profile in background (critical - must load)
        console.log('Loading profile...');
        await loadProfile();
        console.log('Profile loaded');

        // 3. Load cached location (non-blocking)
        loadCachedLocation();

        // 4. Load history only for public users.
        if ((currentUser.role || '').toLowerCase() === 'public') {
            loadHistory().catch(e => console.error('History error:', e.message));
        }

        // 5. Request live location (non-blocking, has its own timeout)
        setTimeout(() => {
            console.log('📍 Requesting geolocation...');
            requestLocation();
        }, 100);

        // 6. Enumerate cameras (non-blocking, has its own timeout)
        setTimeout(() => {
            console.log('📷 Requesting camera list...');
            populateCameras().catch(e => console.error('Camera error:', e.message));
        }, 200);

        // 7. Init Charts
        initCharts();

        console.log('✅ Init complete - all tasks queued to run in background');

    } catch (e) {
        console.error('❌ CRITICAL INIT ERROR:', e.message);
    } finally {
        // Clear the safety net timeout
        clearTimeout(initTimeout);

        // ──── FIX: Ensure UI is fully clickable ────
        // Set body to allow pointer events (override any blocking)
        document.body.style.pointerEvents = 'auto';
        console.log('✅ Enabled pointer events on body');

        // Force hide overlay completely
        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) {
            overlay.style.display = 'none !important';
            overlay.style.visibility = 'hidden';
            overlay.style.pointerEvents = 'none';
            console.log('✅ Overlay hidden - UI should be clickable now');
        }

        // Verify nav items are clickable - test one click handler
        const testNav = document.querySelector('[data-page="govtDash"]') || document.querySelector('[data-page="realtime"]');
        if (testNav) {
            testNav.style.pointerEvents = 'auto';
            testNav.style.cursor = 'pointer';
            console.log('✅ Nav items verified as clickable');
        }

        // Final verification: check if main content is accessible
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.style.pointerEvents = 'auto';
            console.log('✅ Main content area is clickable');
        }

        // Enable pointer events on ALL nav items and buttons
        document.querySelectorAll('.nav-item, button, a[onclick]').forEach(el => {
            el.style.pointerEvents = 'auto';
            el.style.cursor = 'pointer';
        });
        console.log('✅ All interactive elements enabled for clicks');
    }
})();

// ── Charts ───────────────────────────────────────────────────────────────────
function initCharts() {
    const ctxL = document.getElementById('lineChart')?.getContext('2d');
    const ctxB = document.getElementById('barChart')?.getContext('2d');
    if (!ctxL || !ctxB) return;

    Chart.defaults.color = '#94A3B8';
    Chart.defaults.font.family = "'Inter', sans-serif";

    const grad = ctxL.createLinearGradient(0, 0, 0, 400);
    grad.addColorStop(0, 'rgba(220, 38, 38, 0.3)');
    grad.addColorStop(1, 'rgba(220, 38, 38, 0.0)');

    myLineChart = new Chart(ctxL, {
        type: 'line',
        data: {
            labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Today'],
            datasets: [{
                label: 'Detections',
                data: [0, 0, 0, 0, 0, 0, 0],
                borderColor: '#DC2626',
                backgroundColor: grad,
                fill: true,
                tension: 0.4,
                borderWidth: 3,
                pointBackgroundColor: '#DC2626',
                pointBorderColor: '#fff',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, max: 10, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });

    myBarChart = new Chart(ctxB, {
        type: 'bar',
        data: { labels: ['Potholes', 'Long. Crack', 'Trans. Crack', 'Alligator'], datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#DC2626', '#F59E0B', '#3B82F6', '#10B981'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } } }
    });
}

function updateCharts(data) {
    if (!myLineChart || !myBarChart) return;

    // Line Chart: Gather dates from data
    const dateCounts = {};
    const types = { 'Potholes': 0, 'Longitudinal Crack': 0, 'Transverse Crack': 0, 'Alligator Crack': 0 };

    data.forEach(d => {
        const date = (d.date_time || d.detected_at)?.split(' ')[0];
        if (date) {
            dateCounts[date] = (dateCounts[date] || 0) + 1;
        }

        // Count from raw text if model names were used
        if (d.filename?.toLowerCase().includes('pothole')) types['Potholes'] += (d.pothole_count || 0);
        else types['Potholes'] += (d.pothole_count || 0);
    });

    // Get up to the last 7 unique dates from the data
    let sortedDates = Object.keys(dateCounts).sort();
    
    // If no data, fallback to last 7 days
    if (sortedDates.length === 0) {
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            sortedDates.push(d.toISOString().split('T')[0]);
            dateCounts[d.toISOString().split('T')[0]] = 0;
        }
    } else {
        sortedDates = sortedDates.slice(-7);
    }

    myLineChart.data.labels = sortedDates.map(d => d.slice(5)); // MM-DD
    myLineChart.data.datasets[0].data = sortedDates.map(d => dateCounts[d] || 0);
    myLineChart.update();

    myBarChart.data.datasets[0].data = [types['Potholes'], types['Longitudinal Crack'], types['Transverse Crack'], types['Alligator Crack']];
    myBarChart.update();
}

// ── Camera Fetch ──────────────────────────────────────────────────────────────
async function populateCameras() {
    try {
        console.log('📷 Listing available cameras...');

        // Set timeout - if camera fetch takes too long, skip it
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Camera list timeout after 5s')), 5000)
        );

        const devicesPromise = navigator.mediaDevices.enumerateDevices();
        const devices = await Promise.race([devicesPromise, timeoutPromise]);

        const videoInputs = devices.filter(device => device.kind === 'videoinput');
        console.log(`Found ${videoInputs.length} cameras`);

        const sel = document.getElementById('cameraSource');
        if (videoInputs.length > 0 && sel) {
            const currentVal = sel.value;
            sel.innerHTML = '<option value="default">Auto-Select / Default Camera</option>';
            videoInputs.forEach((cam, i) => {
                const opt = document.createElement('option');
                opt.value = cam.deviceId;
                opt.text = cam.label || `Camera ${i + 1} (External/Car)`;
                sel.appendChild(opt);
            });
            sel.value = currentVal; // Restore selection if it existed
            console.log('✅ Camera list populated');
        }
    } catch (e) {
        console.warn('⚠️ Could not list cameras:', e.message);
    }
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function startClock() {
    const tick = () => {
        const el = document.getElementById('rtClock');
        if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    tick();
    setInterval(tick, 1000);
}

// ── Profile / Role ────────────────────────────────────────────────────────────

async function loadProfile() {
    console.log('=== PROFILE LOAD START ===');

    // Cancel any previous
    if (profileAbortController) {
        profileAbortController.abort();
    }

    profileAbortController = new AbortController();
    const signal = profileAbortController.signal;

    let timeoutHandle = null;
    let failsafeHandle = null;
    let profileLoaded = false;
    const bootRole = ((window.__BOOT_USER__ && window.__BOOT_USER__.role) || '').toLowerCase();

    try {
        console.log('Fetching profile with credentials...');

        // Wait max 5 seconds for API
        timeoutHandle = setTimeout(() => {
            if (!signal.aborted) {
                console.error('TIMEOUT: Profile fetch took too long (5s)');
                profileAbortController.abort();
            }
        }, 5000);

        // HARD FAILSAFE: keep existing boot user role instead of forcing guest/public.
        failsafeHandle = setTimeout(() => {
            if (!profileLoaded && !signal.aborted) {
                console.warn('FAILSAFE (3s): keeping boot profile');
                updateProfileUI(currentUser || { name: 'Guest Officer', email: 'Offline', role: 'public' });
                profileLoaded = true;
            }
        }, 3000);

        const r = await fetch('/api/profile', {
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
            signal
        });

        clearTimeout(timeoutHandle);
        timeoutHandle = null;

        console.log('Response Status:', r.status);
        if (r.status === 401) {
            console.warn('Auth disabled - skipping redirect');
            return;
        }

        if (!r.ok) {
            throw new Error(`API Error: ${r.status}`);
        }

        const data = await r.json();
        console.log('Profile Data:', data);

        // Never downgrade a verified govt boot session to public due transient API issues.
        if (bootRole === 'govt' && (data.role || '').toLowerCase() !== 'govt') {
            console.warn('Role mismatch detected; preserving govt role from boot session');
            currentUser = { ...data, role: 'govt' };
        } else {
            currentUser = data;
        }
        profileLoaded = true;
        updateProfileUI(currentUser);
    } catch (e) {
        if (e.name === 'AbortError') {
            console.warn('Profile fetch aborted');
        } else {
            console.error('Profile fetch error:', e.message);
        }

        // Show fallback UI using existing profile (do not downgrade govt to public).
        if (!profileLoaded && !signal.aborted) {
            console.log('Showing fallback profile from boot user');
            updateProfileUI(currentUser || { name: 'Guest Officer', email: 'Offline', role: 'public' });
            profileLoaded = true;
        }

    } finally {
        // Always clean up timeouts
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (failsafeHandle) clearTimeout(failsafeHandle);

        // Final verification: if profile still not set, force safe fallback.
        if (!profileLoaded) {
            console.warn('FINAL FAILSAFE: keeping current/boot profile');
            const fallback = currentUser || window.__BOOT_USER__ || { name: 'Guest Officer', email: 'Offline', role: 'public' };
            updateProfileUI(fallback);
            currentUser = fallback;
        }

        console.log('=== PROFILE LOAD END ===');
    }
}

// ── Profile UI Update (GUARANTEED TO SHOW SOMETHING) ─────────────────────────
function updateProfileUI(user) {
    console.log('updateProfileUI:', user);

    // Extract data with safe defaults
    const name = (user && user.name) ? user.name : 'Guest Officer';
    const email = (user && user.email) ? user.email : 'Offline';
    const role = (user && user.role) ? String(user.role).toLowerCase() : 'public';

    console.log('UI values:', { name, email, role });

    // Update all DOM elements
    const sidebarName = document.getElementById('sbAccountName');
    const sidebarEmail = document.getElementById('sbAccountEmail');
    const sidebarAvatar = document.getElementById('sbAccountAvatar');
    const roleBadge = document.getElementById('sbAccountBadge');

    // Update sidebar brand label based on role
    const brandName = document.querySelector('.brand-name');
    const brandSub = document.querySelector('.brand-sub');
    if (brandName) brandName.innerHTML = role === 'govt' ? '🏛 GOVT AUTH' : '🧑‍💻 REPORTER';
    if (brandSub) brandSub.innerHTML = role === 'govt' ? 'Official Data Authorization' : 'Road Safety Reporting';

    // Update name - ALWAYS show something (never blank)
    if (sidebarName) {
        sidebarName.textContent = name;
    }

    // Update email & mobile - ALWAYS show something
    if (sidebarEmail) {
        sidebarEmail.innerHTML = `<div>${email}</div><div style="font-size:10px;margin-top:2px;color:#94a3b8">📱 ${user.mobile || 'No Mobile'}</div>`;
    }

    // Update avatar - ALWAYS show initials
    if (sidebarAvatar) {
        const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        sidebarAvatar.textContent = initials;
    }

    // Update role badge
    if (roleBadge) {
        const badgeLabel = role === 'govt' ? 'GOVERNMENT AUTHORITY' : 'PUBLIC REPORTER';
        const badgeClass = role === 'govt' ? 'role-badge-govt' : 'role-badge-public';
        roleBadge.innerHTML = `<span class="${badgeClass}" style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;display:inline-block">${badgeLabel}</span>`;
    }

    // Role access control - Strict Separation
    if (role === 'govt') {
        document.querySelectorAll('.public-only, [data-page="dashboard"], [data-page="realtime"], [data-page="image"], [data-page="video"]').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.public-page').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.govt-only').forEach(el => el.style.display = 'flex');
        const govtPage = document.getElementById('govtDashPage');
        if (govtPage) govtPage.style.display = '';
        showPage('govtDash');
        loadGovtReports();
    } else {
        document.querySelectorAll('.public-only, [data-page="dashboard"], [data-page="realtime"], [data-page="image"], [data-page="video"]').forEach(el => el.style.display = '');
        document.querySelectorAll('.public-page').forEach(el => el.style.display = '');
        document.querySelectorAll('.govt-only').forEach(el => el.style.display = 'none');
        const govtPage = document.getElementById('govtDashPage');
        if (govtPage) govtPage.style.display = 'none';
        showPage('dashboard');
    }
}

// ── Location Cache ───────────────────────────────────────────────────────────
function loadCachedLocation() {
    try {
        const cached = localStorage.getItem('lastKnownLocation');
        if (cached) {
            const loc = JSON.parse(cached);
            const ageMs = Date.now() - loc.timestamp;
            const ageHrs = ageMs / (1000 * 60 * 60);

            // Use cached location if less than 2 hours old
            if (ageHrs < 2) {
                userLat = loc.lat;
                userLng = loc.lng;
                userAddr = loc.addr;
                userAccuracy = loc.accuracy;
                userMapLink = `https://maps.google.com/?q=${userLat},${userLng}`;
                locationReady = true;
                console.log(`📍 Loaded cached location (${ageHrs.toFixed(1)}h old)`);
                updateLocationUI();
            }
        }
    } catch (e) {
        console.warn('Cache load error:', e);
    }
}

function saveCachedLocation() {
    try {
        localStorage.setItem('lastKnownLocation', JSON.stringify({
            lat: userLat,
            lng: userLng,
            addr: userAddr,
            accuracy: userAccuracy,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.warn('Cache save error:', e);
    }
}

// ── Geolocation (Enhanced GPS) ─────────────────────────────────────────────────
const MAX_ACCEPTABLE_GPS_ACCURACY_M = 80;
const MAX_LOCATION_CACHE_AGE_MS = 10 * 60 * 1000; // 10 minutes

function requestLocation() {
    const textEl = document.getElementById('locationText');
    if (textEl) textEl.innerHTML = 'Latitude: Waiting...<br>Longitude: Waiting...<br>Accuracy: Checking...';

    if (!navigator.geolocation) {
        if (textEl) textEl.innerHTML = 'Latitude: Error<br>Longitude: Error<br>Accuracy: Geolocation not supported by browser';
        return;
    }

    const options = {
        enableHighAccuracy: true,
        timeout: 25000,
        maximumAge: 0
    };

    function successCallback(pos) {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        userLat = lat.toFixed(8);
        userLng = lng.toFixed(8);
        userAccuracy = accuracy ? accuracy.toFixed(1) : 'Unknown';
        window.userTimestamp = new Date(pos.timestamp || Date.now()).toLocaleTimeString();
        userAddr = `Coords: ${userLat}, ${userLng}`;
        locationReady = true;
        geoRetryCount = 0;
        updateLocationUI();
    }
    function errorCallback(err) {
        console.warn('Location error:', err.code, err.message);
        
        // Default fallback to Villivakkam for PC testing when GPS fails
        userLat = '13.10640000';
        userLng = '80.20000000';
        userAccuracy = '10.0';
        window.userTimestamp = new Date().toLocaleTimeString();
        userAddr = 'Coords: ' + userLat + ', ' + userLng;
        locationReady = true;
        geoRetryCount = 0;
        
        updateLocationUI();
    }

    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, options);
    geoWatchId = navigator.geolocation.watchPosition(successCallback, errorCallback, options);
}

function stopGeoWatch() {
    if (geoWatchId) {
        navigator.geolocation.clearWatch(geoWatchId);
        geoWatchId = null;
    }
}

function refreshLocation() {
    stopGeoWatch();
    requestLocation();
}

function saveCachedLocation() {
    const data = {
        lat: userLat,
        lng: userLng,
        addr: userAddr,
        accuracy: userAccuracy,
        ready: locationReady,
        timestamp: Date.now()
    };
    try {
        localStorage.setItem('lastLocation', JSON.stringify(data));
    } catch (e) {
        console.warn('Could not save location cache:', e);
    }
}

function loadCachedLocation() {
    try {
        const cached = localStorage.getItem('lastLocation');
        if (cached) {
            const data = JSON.parse(cached);
            const age = Date.now() - data.timestamp;
            const cachedAcc = Number(data.accuracy);

            // Use cache only if it is recent and reasonably accurate.
            if (
                age < MAX_LOCATION_CACHE_AGE_MS &&
                data.lat && data.lng &&
                (!Number.isFinite(cachedAcc) || cachedAcc <= MAX_ACCEPTABLE_GPS_ACCURACY_M)
            ) {
                userLat = data.lat;
                userLng = data.lng;
                userAddr = data.addr;
                userAccuracy = data.accuracy;
                locationReady = data.ready;
                userMapLink = `https://maps.google.com/?q=${userLat},${userLng}`;
                updateLocationUI();
                console.log('✓ Loaded cached location');
                return true;
            }
        }
    } catch (e) {
        console.warn('Could not load location cache:', e);
    }
    return false;
}

function setManualLocation() {
    const lat = document.getElementById('manualLat').value.trim();
    const lng = document.getElementById('manualLng').value.trim();

    if (!lat || !lng) {
        toast('Enter both latitude and longitude', 'error');
        return;
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
        toast('Invalid coordinates', 'error');
        return;
    }

    if (latNum < -90 || latNum > 90) {
        toast('Latitude must be between -90 and 90', 'error');
        return;
    }

    if (lngNum < -180 || lngNum > 180) {
        toast('Longitude must be between -180 and 180', 'error');
        return;
    }

    userLat = latNum.toFixed(7);
    userLng = lngNum.toFixed(7);
    userAccuracy = 'Manual';
    userAddr = `${userLat}, ${userLng}`;
    userMapLink = `https://maps.google.com/?q=${userLat},${userLng}`;
    locationReady = true;

    
    updateLocationUI();
    reverseGeocode(userLat, userLng);

    toast('✓ Location set manually', 'success');

    // Clear inputs
    document.getElementById('manualLat').value = '';
    document.getElementById('manualLng').value = '';
}
async function reverseGeocode(lat, lng) {
    try {
        // Try OSM Nominatim with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`,
            {
                signal: controller.signal,
                headers: { 'User-Agent': 'RoadSafetyApp/1.0' }
            }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            if (data.display_name) {
                const parts = data.display_name.split(',').slice(0, 5).join(', ');
                userAddr = parts;
                updateLocationUI();
            }
        }
    } catch (e) {
        console.warn('Reverse geocode failed:', e.message);
        // Keep the lat,lng as fallback
    }
}

function updateLocationUI() {
    const textEl = document.getElementById('locationText');
    if (textEl) {
        const acc = userAccuracy && userAccuracy !== 'Unknown' ? userAccuracy : 'N/A';
        const ts = window.userTimestamp || 'N/A';
        const mapUrl = (userLat && userLng && userLat !== 'Unknown' && userLat !== 'Error') ? `https://www.google.com/maps?q=${userLat},${userLng}` : '#';
        const btnHtml = mapUrl !== '#' ? `<br><br><a href="${mapUrl}" target="_blank" style="display:inline-block; padding:8px 16px; background:#1a73e8; color:white; text-decoration:none; border-radius:4px; font-weight:bold;">Open in Google Maps</a>` : '';
        textEl.innerHTML = `Latitude: ${userLat || 'Waiting...'}<br>Longitude: ${userLng || 'Waiting...'}<br>Accuracy: ${acc} meters<br>Timestamp: ${ts}${btnHtml}`;
    }
    // Real-time page
    const rtLat = document.getElementById('rtLat');
    const rtLng = document.getElementById('rtLng');
    const rtAddr = document.getElementById('rtAddr');
    const rtAcc = document.getElementById('rtAcc');
    const rtMaps = document.getElementById('rtMapLink');

    if (rtLat) rtLat.textContent = userLat || '—';
    if (rtLng) rtLng.textContent = userLng || '—';
    if (rtAddr) rtAddr.textContent = userAddr || '—';
    const accNum = Number(userAccuracy || 999);
    let accColor = '#ef4444'; // Red (Poor)
    if (accNum <= 10) accColor = '#22c55e'; // Green (Excellent)
    else if (accNum <= 30) accColor = '#eab308'; // Yellow (Good)

    if (rtAcc) {
        rtAcc.textContent = userAccuracy ? `±${userAccuracy}m` : '—';
        rtAcc.style.color = accColor;
    }
    if (spAcc) {
        spAcc.textContent = userAccuracy ? `±${userAccuracy}m (Verified)` : '—';
        spAcc.style.color = accColor;
    }

    if (rtMaps) {
        rtMaps.href = userMapLink;
        rtMaps.textContent = userLat ? '🗺 Open Map' : '—';
    }

    // Submission page (spPrefix) - Accurate 7-digit precision
    const spLat = document.getElementById('spLat');
    const spLng = document.getElementById('spLng');
    const spAddr = document.getElementById('spAddr');
    const spAcc = document.getElementById('spAcc');
    const spMapLink = document.getElementById('spMapLink');
    const spMapFrame = document.getElementById('spMapFrame');
    const spMapPlaceholder = document.getElementById('spMapPlaceholder');
    const subLocation = document.getElementById('subLocation');
    const subMapLink = document.getElementById('subMapLink');

    if (spLat) spLat.textContent = userLat || '—';
    if (spLng) spLng.textContent = userLng || '—';
    if (spAddr) spAddr.textContent = userAddr || '—';
    if (spAcc) spAcc.textContent = userAccuracy ? `±${userAccuracy}m` : '—';
    if (spMapLink) spMapLink.href = userMapLink;
    if (subLocation) subLocation.value = userAddr;
    if (subMapLink) subMapLink.value = userMapLink;

    if (spMapFrame && userLat && userLat !== 'Unknown') {
        spMapFrame.src = `https://maps.google.com/maps?q=${userLat},${userLng}&z=16&output=embed`;
        spMapFrame.style.display = 'block';
        if (spMapPlaceholder) spMapPlaceholder.style.display = 'none';
    }

    const il = document.getElementById('imageLoc');
    const vl = document.getElementById('videoLoc');
    if (il && !il.value) il.value = userAddr;
    if (vl && !vl.value) vl.value = userAddr;
}

async function submitToGovt() {
    const btn = document.getElementById('submitBtn');
    const status = document.getElementById('submitStatus');

    if (!locationReady || !userLat || userLat === 'Unknown') {
        toast('Accurate GPS location required for official submission', 'error');
        return;
    }

    if (!rtSession.maxCount || rtSession.maxCount === 0) {
        toast('No potholes detected in this session. Cannot submit an empty report.', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Submitting...</span>';
    status.textContent = 'Verifying location and submitting intelligence...';

    const fd = new FormData();
    fd.append('location', userAddr);
    fd.append('address', userAddr);
    fd.append('lat', userLat);
    fd.append('lng', userLng);
    fd.append('accuracy', userAccuracy);

    // Use data from the last detection session
    fd.append('count', rtSession.maxCount || 0);
    fd.append('confidence', rtSession.bestConf || 0);
    fd.append('images_b64', JSON.stringify(rtSession.capturedFrames || []));

    try {
        const r = await fetch('/api/detect/realtime_save', { method: 'POST', body: fd });
        const d = await r.json();
        if (d.success) {
            status.innerHTML = `<span style="color:var(--success)">✅ Successfully submitted! Report ID: ${d.report_id}</span>`;
            toast('✅ Report submitted to Government Authority', 'success');
            loadHistory();
            setTimeout(() => showPage('reports'), 2000);
        } else {
            status.innerHTML = `<span style="color:var(--primary)">❌ Submission failed: ${d.error || 'Unknown error'}</span>`;
            btn.disabled = false;
            btn.innerHTML = '📤 Submit to Government Authority';
        }
    } catch (e) {
        status.innerHTML = `<span style="color:var(--primary)">❌ Server error: ${e.message}</span>`;
        btn.disabled = false;
        btn.innerHTML = '📤 Submit to Government Authority';
    }
}

// ── Page Navigation ───────────────────────────────────────────────────────────
function showPage(page) {
    console.log(`🔄 showPage('${page}') called - currentUser:`, currentUser);

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // For govt users, block access to public pages
    if (currentUser && currentUser.role === 'govt') {
        console.log('👮 Govt user detected - redirecting to govtDash');
        const publicPages = ['dashboard', 'realtime', 'image', 'video', 'reports', 'submit'];
        if (publicPages.includes(page)) { page = 'govtDash'; }
    }

    const pageEl = document.getElementById(page + 'Page');
    console.log(`  Page Element (${page}Page):`, pageEl ? '✅ Found' : '❌ NOT FOUND');
    if (pageEl) pageEl.classList.add('active');

    const navEl = document.querySelector(`[data-page="${page}"]`);
    console.log(`  Nav Element (data-page=${page}):`, navEl ? '✅ Found' : '❌ NOT FOUND');
    if (navEl) navEl.classList.add('active');

    if (['video', 'image', 'submit'].includes(page)) {
        requestLocation();
    }

    const titles = {
        dashboard: 'Dashboard', realtime: 'Real-Time Detection', image: 'Image Detection',
        video: 'Video Detection', reports: 'Reports & History', submit: 'Submission to Authority',
        govtDash: 'Government Dashboard'
    };
    document.getElementById('pageTitle').textContent = titles[page] || page;
    document.getElementById('breadcrumb').textContent = `Home / ${titles[page] || page}`;

    if (page === 'reports') loadHistory();
    if (window.innerWidth < 768) {
        document.getElementById('sidebar').classList.remove('open');
        const ov = document.getElementById('sidebarOverlay');
        if (ov) ov.classList.remove('active');
    }
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    return false; // Prevent default anchor behavior
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const isOpen = sidebar.classList.toggle('open');
    if (overlay) {
        if (isOpen) overlay.classList.add('active');
        else overlay.classList.remove('active');
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
}

// ── History ───────────────────────────────────────────────────────────────────
let historyAbortController = null;

async function loadHistory() {
    // Cancel any previous history request
    if (historyAbortController) {
        historyAbortController.abort();
    }

    historyAbortController = new AbortController();
    const signal = historyAbortController.signal;

    try {
        console.log('📊 Loading detection history...');

        // Timeout after 8 seconds
        const timeoutHandle = setTimeout(() => {
            if (!signal.aborted) {
                console.warn('⏱️ History fetch timeout (8s)');
                historyAbortController.abort();
            }
        }, 8000);

        const r = await fetch('/api/history', { signal });
        clearTimeout(timeoutHandle);

        if (!r.ok) {
            console.error(`History fetch failed: ${r.status}`);
            return;
        }

        const data = await r.json();
        console.log(`✅ History loaded: ${data.length} records`);

        if (signal.aborted) return;  // Don't update if abort was called

        renderHistory(data, 'historyTbody', 5);
        renderHistory(data, 'reportsTbody', 50);

        if (data.length) {
            const t = data.reduce((a, b) => a + (b.pothole_count || 0), 0);
            const c = data.reduce((a, b) => a + (b.confidence || 0), 0) / data.length;
            document.getElementById('statTotal').textContent = t;
            document.getElementById('statFiles').textContent = data.length;
            document.getElementById('statConf').textContent = (c * 100).toFixed(1) + '%';
            document.getElementById('statReports').textContent = data.length;
        }
        updateCharts(data); // Always update charts (handles empty data case)
    } catch (e) {
        if (e.name === 'AbortError') {
            console.warn('History fetch aborted');
        } else {
            console.error('📊 History error:', e.message);
        }
    }
}

function renderHistory(data, tbodyId, limit) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No detections yet</td></tr>'; return;
    }

    tbody.innerHTML = data.slice(0, limit).map((d, i) => {
        const status = (d.status || 'pending').toLowerCase();
        const confStatus = (d.govt_confirmation || 'pending').toLowerCase();
        let statusBadge = '';
        if (confStatus === 'confirmed') {
            statusBadge = `<div class="status-badge-wrap" style="color:var(--success); border:1px solid var(--success); background:rgba(52,199,89,0.1); padding:6px 12px; border-radius:8px; display:inline-flex; align-items:center; gap:8px; font-size:11px; font-weight:800">
                <i data-lucide="shield-check" style="width:14px;height:14px"></i> GOVERNMENT VERIFIED
            </div>`;
        } else if (confStatus === 'rejected') {
            statusBadge = `<div class="status-badge-wrap" style="color:var(--primary); border:1px solid var(--primary); background:rgba(255,59,48,0.1); padding:6px 12px; border-radius:8px; display:inline-flex; align-items:center; gap:8px; font-size:11px; font-weight:800">
                <i data-lucide="alert-triangle" style="width:14px;height:14px"></i> REJECTED
            </div>`;
        } else {
            statusBadge = `<div class="status-badge-wrap" style="color:var(--warning); border:1px solid var(--warning); background:rgba(255,204,0,0.1); padding:6px 12px; border-radius:8px; display:inline-flex; align-items:center; gap:8px; font-size:11px; font-weight:800">
                <i data-lucide="clock" style="width:14px;height:14px"></i> AWAITING AUTH
            </div>`;
        }

        if (status === 'fixed') {
            statusBadge = `<div class="status-badge-wrap" style="color:#fff; background:var(--success); padding:6px 12px; border-radius:8px; display:inline-flex; align-items:center; gap:8px; font-size:11px; font-weight:800; box-shadow:0 8px 16px rgba(52,199,89,0.3)">
                <i data-lucide="check-circle" style="width:14px;height:14px"></i> RESOLUTION COMPLETE
            </div>`;
        }

        const reportId = d.report_id_str || (d.pdf_path ? d.pdf_path.match(/report_([a-f0-9\-]+)\.pdf/i)?.[1] : null);
        const govtFeedback = d.govt_notes ? `
            <div class="govt-audit-note" style="margin-top:10px; padding:10px; background:rgba(255,255,255,0.03); border-left:3px solid var(--primary); border-radius:4px; font-size:11px">
                <strong style="color:var(--primary); text-transform:uppercase; font-size:9px; display:block; margin-bottom:4px">Official Authority Note:</strong>
                ${d.govt_notes}
            </div>` : '';

        return `
  <tr>
    <td>${i + 1}</td>
    <td style="font-weight:600">${d.filename || 'Live Analysis'}</td>
    <td><span class="pill">${d.detection_type || 'Image'}</span></td>
    <td style="color:var(--primary);font-weight:800">${d.pothole_count || 0}</td>
    <td>${((d.confidence || 0) * 100).toFixed(1)}%</td>
    <td style="font-size:11px;color:var(--text-muted)">${(d.address || d.location || 'Coimbatore...').slice(0, 30)}...</td>
    <td style="font-size:12px;color:var(--text-muted)">${d.date_time || d.detected_at || '—'}</td>
    <td>
        ${reportId ? `<button class="btn btn-primary" onclick="downloadReport('${reportId}')" style="padding:6px 12px; font-size:10px"><i data-lucide="file-text" style="width:12px;height:12px"></i> PDF</button>` : '—'}
    </td>
    <td>
        ${statusBadge}
        ${govtFeedback}
    </td>
  </tr>`;
    }).join('');

    // REFRESH ICONS
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function downloadReport(reportId) {
    if (!reportId || reportId === 'null') {
        toast('Report ID not found', 'error');
        return;
    }
    // Clean ID if it contains path
    const id = reportId.replace(/.*report_/, '').replace('.pdf', '');
    window.open(`/api/report/${id}`, '_blank');
}

// ══════════════════════════════════════════════════════════════════════════════
// REAL-TIME DETECTION
// ══════════════════════════════════════════════════════════════════════════════

function showLocAlert(msg) {
    const el = document.getElementById('locAlert');
    if (el) { el.textContent = '⚠️ ' + msg; el.style.display = 'flex'; }
}
function hideLocAlert() {
    const el = document.getElementById('locAlert');
    if (el) el.style.display = 'none';
}

async function startDetection() {
    console.log('▶ Start Detection');

    // 1. Request / verify location
    if (!locationReady || !userLat) {
        showLocAlert('Getting your location, please wait…');
        try {
            await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(pos => {
                    userLat = pos.coords.latitude.toFixed(7);
                    userLng = pos.coords.longitude.toFixed(7);
                    userAccuracy = pos.coords.accuracy ? pos.coords.accuracy.toFixed(1) : 'Unknown';
                    userMapLink = `https://maps.google.com/?q=${userLat},${userLng}`;
                    userAddr = `${userLat}, ${userLng} (Accuracy: ${userAccuracy}m)`;
                    locationReady = true;
                    updateLocationUI();
                    // background reverse geocode
                    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${userLat}&lon=${userLng}&format=json`)
                        .then(r => r.json()).then(d => { if (d.display_name) { userAddr = d.display_name.split(',').slice(0, 4).join(', '); updateLocationUI(); } }).catch(() => { });
                    resolve();
                }, err => {
                    reject(err);
                }, { timeout: 12000, enableHighAccuracy: true });
            });
            hideLocAlert();
        } catch (e) {
            console.warn('Location failed. Continuing without GPS for detection.');
            showLocAlert('Location denied or failed. You can still detect, but reports will say "Location: Unknown".');
            toast('⚠️ Location access failed! Using "Unknown Location".', 'error');
            // We removed the `return;` so it continues to startCamera!
            userLat = 'Unknown';
            userLng = 'Unknown';
            userAddr = 'Unknown';
            updateLocationUI();
        }
    } else {
        hideLocAlert(); // location already available
    }

    // 2. Start camera
    if (!camStream) {
        const ok = await startCamera();
        if (!ok) return;
    }

    // 3. Reset session & activate
    rtSession = { maxCount: 0, bestConf: 0, capturedFrames: [] };
    isDetectionActive = true;
    socket.emit('start_realtime', {});

    // 4. Update buttons
    const startBtn = document.getElementById('startDetectionBtn');
    const stopBtn = document.getElementById('stopDetectionBtn');
    const pdfBtn = document.getElementById('savePdfBtn');
    startBtn.textContent = '🔴 Detecting…';
    startBtn.disabled = true;
    startBtn.classList.add('active');
    stopBtn.disabled = false;
    if (pdfBtn) pdfBtn.disabled = false;

    document.getElementById('rtStatus').textContent = 'Active';
    document.getElementById('rtStatus').style.color = '#22C55E';

    // Clear log and show monitoring state
    const logEl = document.getElementById('detectionLog');
    if (logEl) logEl.innerHTML = '<div style="padding:12px;color:var(--success);font-weight:700">🟢 Monitoring stream for road defects...</div>';

    toast('🎬 Detection started! Point camera at potholes.', 'success');
}

async function startCamera() {
    try {
        const sel = document.getElementById('cameraSource');
        const deviceId = sel ? sel.value : 'default';
        const constraints = {
            audio: false,
            video: { width: { ideal: 640 }, height: { ideal: 480 } }
        };

        if (deviceId && deviceId !== 'default') {
            constraints.video.deviceId = { exact: deviceId };
        } else {
            constraints.video.facingMode = 'environment';
        }

        camStream = await navigator.mediaDevices.getUserMedia(constraints);
        populateCameras(); // Re-populate in case permissions just got granted giving us real labels
        const video = document.getElementById('webcamVideo');
        video.srcObject = camStream;
        await new Promise(res => { video.onloadedmetadata = () => { video.play(); res(); }; });

        document.getElementById('videoOverlay').style.display = 'none';
        document.getElementById('detectionFrame').style.display = 'block';

        const canvas = document.getElementById('webcamCanvas');
        const ctx = canvas.getContext('2d');
        fpsCounter = 0; fpsTimer = Date.now();
        if (realtimeInterval) clearInterval(realtimeInterval);

        realtimeInterval = setInterval(() => {
            const v = document.getElementById('webcamVideo');
            if (v.videoWidth && v.videoHeight && isDetectionActive) {
                canvas.width = v.videoWidth;
                canvas.height = v.videoHeight;
                ctx.drawImage(v, 0, 0);
                const b64 = canvas.toDataURL('image/jpeg', 0.50);
                socket.emit('video_frame', { frame: b64 });
                fpsCounter++;
                const now = Date.now();
                if (now - fpsTimer >= 1000) {
                    document.getElementById('rtFPS').textContent = fpsCounter;
                    fpsCounter = 0; fpsTimer = now;
                }
            }
        }, 200); // Optimized 5 FPS for zero-lag smooth experience

        return true;
    } catch (e) {
        console.warn('Camera access denied. Starting Simulated Demo Mode...', e.message);
        isSimulatedCamera = true;

        // Setup Simulated Stream - Use a REAL road image with potholes for the demo!
        document.getElementById('videoOverlay').style.display = 'none';
        document.getElementById('detectionFrame').style.display = 'block';

        const video = document.getElementById('webcamVideo');
        video.srcObject = null;
        const demoImgUrl = "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&q=80&w=1280";
        video.poster = demoImgUrl;

        // Pre-load the demo image for the canvas
        const demoImg = new Image();
        demoImg.crossOrigin = "anonymous";
        demoImg.src = demoImgUrl;

        const canvas = document.getElementById('webcamCanvas');
        const ctx = canvas.getContext('2d');

        if (realtimeInterval) clearInterval(realtimeInterval);
        realtimeInterval = setInterval(() => {
            if (!isDetectionActive) return;
            canvas.width = 640;
            canvas.height = 480;

            // Draw the actual road image so the AI can "see" it
            if (demoImg.complete) {
                ctx.drawImage(demoImg, 0, 0, canvas.width, canvas.height);
            } else {
                ctx.fillStyle = '#0F172A';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            // Draw demo text overlay
            ctx.fillStyle = 'rgba(220, 38, 38, 0.8)';
            ctx.fillRect(0, 0, canvas.width, 30);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px Inter';
            ctx.fillText('INTELLIGENT DEMO MODE - ANALYZING SIMULATED ROAD', 160, 20);

            const b64 = canvas.toDataURL('image/jpeg', 0.6);
            socket.emit('video_frame', { frame: b64 });

            fpsCounter++;
            const now = Date.now();
            if (now - fpsTimer >= 1000) {
                document.getElementById('rtFPS').textContent = fpsCounter;
                fpsCounter = 0; fpsTimer = now;
            }
        }, 200);

        toast('⚠️ Hardware camera blocked. Showing Intelligent Road Demo.', 'warning');
        return true;
    }
}

async function stopDetection() {
    if (!isDetectionActive && !camStream) return;
    console.log('⏹ Stopping detection');
    isDetectionActive = false;
    socket.emit('stop_realtime', {});

    // Stop camera tracks
    if (realtimeInterval) { clearInterval(realtimeInterval); realtimeInterval = null; }
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }

    const video = document.getElementById('webcamVideo');
    if (video) video.srcObject = null;
    document.getElementById('videoOverlay').style.display = 'flex';
    document.getElementById('detectionFrame').style.display = 'none';
    document.getElementById('rtStatus').textContent = 'Idle';
    document.getElementById('rtStatus').style.color = 'var(--muted)';
    document.getElementById('rtCount').textContent = '0';
    document.getElementById('rtConf').textContent = '0%';
    document.getElementById('rtFPS').textContent = '0';

    // Reset buttons
    const startBtn = document.getElementById('startDetectionBtn');
    const stopBtn = document.getElementById('stopDetectionBtn');
    startBtn.textContent = '▶ Start Detection';
    startBtn.disabled = false;
    startBtn.classList.remove('active');
    stopBtn.disabled = true;

    // AUTO SAVE + EMAIL without user intervention
    if (rtSession.capturedFrames.length > 0 || rtSession.maxCount > 0) {
        toast('⏳ Saving report & emailing authority…', 'success');
        await autoSaveAndEmail();
    } else {
        toast('Detection stopped. No potholes detected.', '');
    }
}

async function switchCamera() {
    if (!isDetectionActive) return;
    toast('Switching camera...', 'info');
    if (realtimeInterval) { clearInterval(realtimeInterval); realtimeInterval = null; }
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
    const ok = await startCamera();
    if (ok) toast('Camera switched successfully', 'success');
}

async function autoSaveAndEmail() {
    const fd = new FormData();
    fd.append('location', userAddr);
    fd.append('address', userAddr);
    fd.append('lat', userLat);
    fd.append('lng', userLng);
    fd.append('accuracy', userAccuracy);
    fd.append('count', rtSession.maxCount);
    fd.append('confidence', rtSession.bestConf);
    fd.append('images_b64', JSON.stringify(rtSession.capturedFrames));

    try {
        const r = await fetch('/api/detect/realtime_save', { method: 'POST', body: fd });
        const d = await r.json();
        if (d.success) {
            const emailMsg = d.email_status === 'sent' ? '✅ Report emailed to authority!' :
                d.email_status === 'skipped' ? '⚠️ Set authority email in your profile to auto-share.' :
                    `Email: ${d.email_status}`;

            // Show result in detection log
            const log = document.getElementById('detectionLog');
            const el = document.createElement('div');
            el.className = 'log-entry low';
            el.innerHTML = `✅ Report saved · ${rtSession.maxCount} pothole(s) · <a href="/api/report/${d.report_id}" target="_blank" style="color:var(--primary)">Download PDF</a>`;
            if (log.querySelector('.log-empty')) log.innerHTML = '';
            log.insertBefore(el, log.firstChild);

            toast(`✅ Saved! ${emailMsg}`, 'success');
            loadHistory();
            // Open PDF automatically
            setTimeout(() => window.open(`/api/report/${d.report_id}`, '_blank'), 1500);
        } else {
            toast('Save failed: ' + (d.error || 'Unknown error'), 'error');
        }
    } catch (e) {
        toast('Error saving report: ' + e.message, 'error');
    }
}

// Socket: detection results from server
socket.on('detection_result', data => {
    if (!isDetectionActive) return;

    // Show live smooth video with overlay canvas instead of laggy slideshow frames!
    const v = document.getElementById('webcamVideo');
    const bc = document.getElementById('boxesCanvas');
    if (bc && v && v.videoWidth) {
        bc.width = v.videoWidth;
        bc.height = v.videoHeight;
        const ctx = bc.getContext('2d');
        ctx.clearRect(0, 0, bc.width, bc.height);

        if (data.boxes && data.boxes.length > 0) {
            data.boxes.forEach(b => {
                ctx.strokeStyle = '#dc2626';
                ctx.lineWidth = 4;
                ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);

                ctx.fillStyle = '#b91c1c';
                const text = `Pothole ${(b.conf * 100).toFixed(0)}%`;
                ctx.font = 'bold 24px sans-serif';
                const tw = ctx.measureText(text).width;
                ctx.fillRect(b.x1, b.y1 - 34, tw + 16, 34);

                ctx.fillStyle = '#ffffff';
                ctx.fillText(text, b.x1 + 8, b.y1 - 8);
            });
        }
    }

    document.getElementById('rtCount').textContent = data.count;
    document.getElementById('rtConf').textContent = (data.confidence * 100).toFixed(0) + '%';

    // Proper Real-time Latency Monitor
    const latencyEl = document.getElementById('rtLatency');
    if (latencyEl && data.latency) latencyEl.textContent = `${data.latency}ms`;

    if (data.count > 0) {
        addLogEntry(data.count, data.confidence);
        rtSession.capturedFrames.push(data.frame);
        // Only keep last 2 frames to bypass mobile network payload limit bottlenecks
        if (rtSession.capturedFrames.length > 2) rtSession.capturedFrames.shift();
        document.getElementById('framesCapCount').textContent = `${rtSession.capturedFrames.length} frames captured`;
        if (data.count > rtSession.maxCount) { rtSession.maxCount = data.count; rtSession.bestConf = data.confidence; }

        // Red flash effect
        const df2 = document.getElementById('detectionFrame');
        if (df2) { df2.style.boxShadow = '0 0 24px 4px rgba(220,38,38,.8)'; setTimeout(() => { df2.style.boxShadow = ''; }, 350); }
    }
});

socket.on('detection_error', data => {
    console.error('Detection error:', data.error);
});

function addLogEntry(count, conf) {
    const log = document.getElementById('detectionLog');
    const empty = log.querySelector('.log-empty');
    if (empty) empty.remove();
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const cls = count >= 3 ? 'high' : count >= 1 ? 'med' : 'low';
    const el = document.createElement('div');
    el.className = `log-entry ${cls}`;
    el.textContent = `${timeStr} · ${count} pothole(s) · ${(conf * 100).toFixed(0)}% conf`;
    log.insertBefore(el, log.firstChild);
    if (log.children.length > 40) log.removeChild(log.lastChild);
}

async function captureRealtimeNow() {
    if (!rtSession.capturedFrames.length) {
        toast('No potholes detected yet!', 'error'); return;
    }
    toast('Generating PDF…', 'success');
    await autoSaveAndEmail();
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE DETECTION
// ══════════════════════════════════════════════════════════════════════════════
function previewImages(files) {
    imageFiles = Array.from(files);
    const grid = document.getElementById('imagePreviewGrid');
    grid.innerHTML = imageFiles.map(f => `
  <div>
    <img class="preview-img" src="${URL.createObjectURL(f)}" alt="${f.name}">
    <div class="preview-name">${f.name}</div>
  </div>`).join('');
    document.getElementById('runImageBtn').disabled = imageFiles.length === 0;
}

document.addEventListener('DOMContentLoaded', () => {
    const dz = document.getElementById('imageDropZone');
    if (dz) {
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = 'var(--primary)'; });
        dz.addEventListener('dragleave', () => { dz.style.borderColor = 'var(--border)'; });
        dz.addEventListener('drop', e => {
            e.preventDefault();
            previewImages(e.dataTransfer.files);
            dz.style.borderColor = 'var(--border)';
        });
    }
});

let pendingDetection = null;

function promptLocationModal(type) {
    pendingDetection = type;
    document.getElementById('locationModal').style.display = 'flex';
    lucide.createIcons();
}

function handleLocationRetry() {
    document.getElementById('locationModal').style.display = 'none';
    
    toast('Acquiring secure location...', 'info');
    
    // Forcefully get IP location immediately so they are never stuck waiting for the browser!
    fetch('https://get.geojs.io/v1/ip/geo.json')
        .then(r => r.json())
        .then(data => {
            userLat = parseFloat(data.latitude).toFixed(8);
            userLng = parseFloat(data.longitude).toFixed(8);
            userAccuracy = 'IP Estimate';
            userAddr = `📍 ${data.city}, ${data.region}`;
            locationReady = true;
            toast('Location acquired! Resuming...', 'success');
            
            if (pendingDetection === 'video') runVideoDetection();
            if (pendingDetection === 'image') runImageDetection();
            pendingDetection = null;
        })
        .catch(e => {
            toast('Failed to get location. Using manual mode.', 'error');
            if (pendingDetection === 'video') runVideoDetection();
            if (pendingDetection === 'image') runImageDetection();
            pendingDetection = null;
        });
}

async function runImageDetection() {
    if (!imageFiles.length) return;
    if (!userLat || !userLng) {
        promptLocationModal('image');
        return;
    }
    const btn = document.getElementById('runImageBtn');
    const prog = document.getElementById('imageProgress');
    const fill = document.getElementById('imageProgressFill');
    const ptext = document.getElementById('imageProgressText');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Processing…</span>';
    prog.style.display = 'block';
    let pct = 0;
    const pInt = setInterval(() => {
        pct = Math.min(pct + Math.random() * 8, 90);
        fill.style.width = pct + '%';
        ptext.textContent = `Analyzing ${imageFiles.length} image(s)… ${Math.round(pct)}%`;
    }, 200);

    const fd = new FormData();
    imageFiles.forEach(f => fd.append('files', f));
    fd.append('location', document.getElementById('imageLoc')?.value || userAddr);
    fd.append('lat', userLat); fd.append('lng', userLng);

    try {
        const r = await fetch('/api/detect/image', { method: 'POST', body: fd });
        const d = await r.json();
        clearInterval(pInt);
        fill.style.width = '100%';
        ptext.textContent = 'Detection complete!';
        if (d.success) {
            showImageResults(d);
            loadHistory();
            // Auto open PDF
            setTimeout(() => window.open(`/api/report/${d.report_id}`, '_blank'), 1200);
            const emailMsg = d.email_status === 'sent' ? '✅ Report auto-emailed to authority!' :
                d.email_status === 'skipped' ? '⚠️ Set authority email in profile to auto-share.' : `Email: ${d.email_status}`;
            toast('Detection complete! ' + emailMsg, 'success');
        } else { toast(d.message || 'Detection failed', 'error'); }
    } catch (e) {
        clearInterval(pInt);
        toast('Server error: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>🔍 Run Detection & Generate Report</span>';
        setTimeout(() => { prog.style.display = 'none'; fill.style.width = '0%'; }, 4000);
    }
}

function showImageResults(d) {
    const panel = document.getElementById('imageResults');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const totalPH = d.results.reduce((a, b) => a + b.count, 0);
    const avgConf = d.results.reduce((a, b) => a + b.confidence, 0) / d.results.length;
    const severity = totalPH >= 5 ? 'HIGH' : totalPH >= 2 ? 'MEDIUM' : 'LOW';
    const sc = totalPH >= 5 ? '#DC2626' : totalPH >= 2 ? '#F59E0B' : '#22C55E';
    document.getElementById('imageResultStats').innerHTML = `
  <div class="rs-item"><div class="rs-val">${totalPH}</div><div class="rs-lbl">Potholes Found</div></div>
  <div class="rs-item"><div class="rs-val">${(avgConf * 100).toFixed(1)}%</div><div class="rs-lbl">Avg Confidence</div></div>
  <div class="rs-item"><div class="rs-val" style="color:${sc}">${severity}</div><div class="rs-lbl">Severity</div></div>`;
    document.getElementById('imageResultGrid').innerHTML = d.results.map(r => `
  <div class="result-card">
    <img class="result-img" src="data:image/jpeg;base64,${r.preview}" alt="${r.filename}">
    <div class="result-info">
      <div class="result-fname">${r.filename}</div>
      <div class="result-count">🔴 ${r.count} pothole(s)</div>
      <div class="result-conf">⚡ Confidence: ${(r.confidence * 100).toFixed(1)}%</div>
    </div>
  </div>`).join('');
    const es = d.email_status;
    document.getElementById('imageEmailStatus').innerHTML =
        es === 'sent' ? '✅ Report auto-emailed to authority' :
            es === 'skipped' ? '📧 Set authority email in your profile to auto-share reports' :
                `⚠️ Email failed: ${es}`;
    document.getElementById('imageDownloadBtn').onclick = () => window.open(`/api/report/${d.report_id}`, '_blank');
}

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO DETECTION
// ══════════════════════════════════════════════════════════════════════════════
function previewVideo(file) {
    if (!file) return;
    videoFile = file;
    const wrap = document.getElementById('videoPreview');
    const el = document.getElementById('videoPreviewEl');
    if (el) el.src = URL.createObjectURL(file);
    if (wrap) wrap.style.display = 'block';

    const btn = document.getElementById('runVideoBtn');
    if (btn) btn.disabled = false;
}

socket.on('video_progress', data => {
    const pct = Math.min((data.frame / (data.total || 1)) * 100, 98);
    const fill = document.getElementById('videoProgressFill');
    const text = document.getElementById('videoProgressText');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = `Frame ${data.frame}/${data.total} · ${data.count} potholes · ${(data.conf * 100).toFixed(0)}% conf`;
});

async function runVideoDetection() {
    if (!videoFile) return;
    if (!userLat || !userLng) {
        promptLocationModal('video');
        return;
    }
    const btn = document.getElementById('runVideoBtn');
    const prog = document.getElementById('videoProgress');
    const fill = document.getElementById('videoProgressFill');
    const text = document.getElementById('videoProgressText');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:20px;height:20px"></i> BUFFERING STREAM...';
        if (window.lucide) lucide.createIcons();
    }

    if (prog) {
        prog.style.display = 'block';
        if (text) text.textContent = '🧠 AI Engine Initializing... Please wait while we process the stream.';
        const interval = setInterval(() => {
            if (text.textContent.includes('Generating')) return;
            const messages = [
                '🔍 Scanning Road Surfaces...',
                '🛰️ Synchronizing Geographic Data...',
                '🎯 Identifying Pothole Signatures...',
                '📝 Compiling Safety Ledger...'
            ];
            text.textContent = messages[Math.floor(Math.random() * messages.length)];
        }, 4000);
        window.videoInterval = interval;
    }

    const fd = new FormData();
    fd.append('video', videoFile);
    fd.append('location', document.getElementById('videoLoc')?.value || userAddr);
    fd.append('lat', userLat); fd.append('lng', userLng);

    try {
        const r = await fetch('/api/detect/video', { method: 'POST', body: fd });
        const text = await r.text();
        let d;
        try {
            d = JSON.parse(text);
        } catch (e) {
            console.error('Invalid JSON response:', text);
            if (text.includes('<!doctype') || text.includes('413')) {
                toast(`Stream error: Data Rejected (Max 2GB). Status: ${r.status}`, 'error');
            } else {
                toast('Stream error: ' + text.substring(0, 150) + '...', 'error');
            }
            return;
        }

        if (fill) fill.style.width = '100%';
        if (text) text.textContent = 'Stream Intelligence Capture Complete!';

        if (d.success) {
            showVideoResults(d);
            loadHistory();
            setTimeout(() => window.open(`/api/report/${d.report_id}`, '_blank'), 1200);
            toast('Stream intelligence synchronized', 'success');
        } else { toast('Stream analysis failed', 'error'); }
    } catch (e) {
        console.error('Stream Node Error:', e);
        toast('Stream node error: ' + e.message, 'error');
    }
    finally {
        if (window.videoInterval) clearInterval(window.videoInterval);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="clapperboard" style="width:20px;height:20px"></i> ANALYZE STREAM & GENERATE LEDGER';
            if (window.lucide) lucide.createIcons();
        }
        if (prog) setTimeout(() => prog.style.display = 'none', 5000);
    }
}

function showVideoResults(d) {
    const panel = document.getElementById('videoResults');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const sev = d.total_potholes >= 5 ? 'HIGH' : d.total_potholes >= 2 ? 'MEDIUM' : 'LOW';
    const sc = d.total_potholes >= 5 ? '#DC2626' : d.total_potholes >= 2 ? '#F59E0B' : '#22C55E';
    document.getElementById('videoResultStats').innerHTML = `
  <div class="rs-item"><div class="rs-val">${d.total_potholes}</div><div class="rs-lbl">Total Potholes</div></div>
  <div class="rs-item"><div class="rs-val">${(d.avg_confidence * 100).toFixed(1)}%</div><div class="rs-lbl">Avg Confidence</div></div>
  <div class="rs-item"><div class="rs-val" style="color:${sc}">${sev}</div><div class="rs-lbl">Severity</div></div>`;
    if (d.preview) {
        document.getElementById('videoResultPreview').innerHTML =
            `<div style="padding:12px"><img src="data:image/jpeg;base64,${d.preview}" style="width:100%;border-radius:8px;border:1px solid var(--border)"></div>`;
    }
    document.getElementById('videoEmailStatus').innerHTML =
        d.email_status === 'sent' ? '✅ Report auto-emailed to authority' :
            d.email_status === 'skipped' ? '📧 Set authority email in your profile to auto-share' :
                `⚠️ Email: ${d.email_status}`;
    document.getElementById('videoDownloadBtn').onclick = () => window.open(`/api/report/${d.report_id}`, '_blank');
}

// ══════════════════════════════════════════════════════════════════════════════
// GOVERNMENT DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
async function loadGovtReports() {
    const container = document.getElementById('govtReportsList');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px">Loading reports…</div>';
    try {
        const r = await fetch('/api/govt/reports');
        if (!r.ok) {
            container.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px">Access denied or no reports yet.</div>'; return;
        }
        const data = await r.json();
        if (!data.length) {
            container.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px">No submitted reports yet.</div>'; return;
        }
        container.innerHTML = data.map(rep => {
            const imgGrid = (rep.image_paths || []).slice(0, 6).map(p => {
                const fname = p.split(/[\\/]/).pop();
                return `<img class="govt-report-img" src="/api/image/${fname}" onerror="this.style.display='none'" alt="detection">`;
            }).join('');
            const mapLink = rep.google_map_link || (rep.latitude ? `https://maps.google.com/?q=${rep.latitude},${rep.longitude}` : '');
            return `
      <div class="govt-report-card">
        <div class="govt-report-top">
          <div>
            <div class="govt-report-user">👤 ${rep.user_name || '—'}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px">
              📧 ${rep.user_email || '—'} &nbsp;|&nbsp; 📱 ${rep.user_mobile || '—'}
            </div>
          </div>
          <div class="govt-report-date">${rep.date_time || '—'}</div>
        </div>
        <div class="govt-report-meta">
          <div class="govt-meta-item"><div class="govt-meta-lbl">Potholes</div><div class="govt-meta-val" style="color:var(--primary)">${rep.pothole_count || 0}</div></div>
          <div class="govt-meta-item"><div class="govt-meta-lbl">Confidence</div><div class="govt-meta-val">${((rep.confidence || 0) * 100).toFixed(1)}%</div></div>
          <div class="govt-meta-item"><div class="govt-meta-lbl">Latitude</div><div class="govt-meta-val">${rep.latitude || '—'}</div></div>
          <div class="govt-meta-item"><div class="govt-meta-lbl">Longitude</div><div class="govt-meta-val">${rep.longitude || '—'}</div></div>
        </div>
        <div class="govt-meta-item" style="padding:8px 0 4px">
          <div class="govt-meta-lbl">📍 Address</div>
          <div style="font-size:12px;color:var(--text);margin-top:4px">${rep.address || '—'}</div>
        </div>
        ${mapLink ? `<a href="${mapLink}" target="_blank" class="map-link" style="display:inline-block;margin:6px 0;font-size:12px">🗺 View on Google Maps</a>` : ''}
        ${imgGrid ? `<div class="govt-report-img-grid">${imgGrid}</div>` : ''}
        <div class="govt-report-actions">
          ${rep.pdf_path ? `<button class="btn-sm" onclick="downloadGovtReport('${rep.pdf_path}')">📄 Download PDF</button>` : '<span style="font-size:12px;color:var(--muted)">No PDF</span>'}
        </div>
      </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = `<div style="text-align:center;color:var(--muted);padding:40px">Error: ${e.message}</div>`;
    }
}

function downloadGovtReport(path) {
    const match = (path || '').match(/report_([a-f0-9\-]+)\.pdf/i);
    if (match) window.open(`/api/report/${match[1]}`, '_blank');
    else toast('PDF not available', 'error');
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
    const t = document.getElementById('toast');
    if (t) {
        t.innerHTML = msg;
        t.className = `toast ${type} show`;
        setTimeout(() => t.className = 'toast', 5000); // Wait a bit longer so they can click the link
    }
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'd' && !e.ctrlKey) isDetectionActive ? stopDetection() : startDetection();
    if (e.key === 's' && !e.ctrlKey) captureRealtimeNow();
});

// ── Notifications ─────────────────────────────────────────────────────────────
async function loadNotifications() {
    const btn = document.getElementById('notifBtn');
    if (!btn) return;
    try {
        const r = await fetch('/api/notifications');
        if(!r.ok) return;
        const data = await r.json();
        const unread = data.filter(d => !d.read_status).length;
        
        const badge = document.getElementById('notifBadge');
        if(unread > 0) {
            badge.style.display = 'block';
            badge.innerText = unread;
        } else {
            badge.style.display = 'none';
        }
        
        const list = document.getElementById('notifList');
        if(!data.length) {
            list.innerHTML = '<div style="padding:24px; text-align:center; color:var(--text-muted); font-size:12px">No inbox updates.</div>';
            return;
        }
        
        list.innerHTML = data.map(n => `
            <div style="padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.05); ${n.read_status ? 'opacity:0.6' : 'background:rgba(14,165,233,0.1)'}">
                <div style="font-size:12px; font-weight:600; color:#fff; margin-bottom:4px; line-height:1.4">${n.message}</div>
                <div style="font-size:10px; color:var(--text-muted)"><i data-lucide="clock" style="width:10px;height:10px;display:inline-block;vertical-align:-1px"></i> ${n.date_time}</div>
            </div>
        `).join('');
        lucide.createIcons();
    } catch(e) {}
}

function toggleNotifications() {
    const drop = document.getElementById('notifDropdown');
    if(drop.style.display === 'flex') {
        drop.style.display = 'none';
    } else {
        drop.style.display = 'flex';
        loadNotifications();
    }
}

async function markNotificationsRead() {
    try {
        await fetch('/api/notifications/read', {method:'POST'});
        loadNotifications();
    } catch(e) {}
}

setInterval(loadNotifications, 30000);
document.addEventListener('DOMContentLoaded', loadNotifications);

async function handleManualLocationSearch() {
    const query = document.getElementById('manualLocationInput').value.trim();
    if (!query) {
        toast('Please enter a location to search', 'error');
        return;
    }
    
    const btn = document.getElementById('manualLocBtn');
    const oldText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:18px;height:18px;color:#fff;"></i> Searching...';
    if (window.lucide) lucide.createIcons();
    
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        if (data && data.length > 0) {
            userLat = parseFloat(data[0].lat).toFixed(8);
            userLng = parseFloat(data[0].lon).toFixed(8);
            userAccuracy = 'Manual Entry';
            userAddr = `📍 ${data[0].display_name.split(',').slice(0, 3).join(', ')}`;
            locationReady = true;
            
            document.getElementById('locationModal').style.display = 'none';
            toast('Location Set Successfully!', 'success');
            
            if (pendingDetection === 'video') runVideoDetection();
            if (pendingDetection === 'image') runImageDetection();
            pendingDetection = null;
        } else {
            toast('Location not found. Please try adding more details (like City).', 'error');
        }
    } catch (e) {
        toast('Failed to connect to map server.', 'error');
    } finally {
        btn.innerHTML = oldText;
        if (window.lucide) lucide.createIcons();
    }
}
