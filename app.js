document.addEventListener('DOMContentLoaded', () => {
    const state = {
        currentDir: 'broadway_to_botany',
        selectedStop: null,
        currentTime: new Date(),
        selectedTrip: null,
        reminderMins: 5,
        notifiedBuses: new Set(),
        alertsEnabled: false,
        audioCtx: null,
    };

    // DOM Elements
    const timeEl = document.getElementById('current-time');
    const listEl = document.getElementById('schedule-list');
    const dirB2B = document.getElementById('dir-b2b');
    const dirB2BRev = document.getElementById('dir-b2b_rev');
    const stopSelect = document.getElementById('stop-select');
    const alertMinsInput = document.getElementById('alert-mins');
    const btnNotifyPerm = document.getElementById('btn-notify-perm');
    const themeToggle = document.getElementById('theme-toggle');
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    const closeModal = document.getElementById('close-modal');
    const modalTripTime = document.getElementById('modal-trip-time');
    const modalDirection = document.getElementById('modal-direction');
    const modalStops = document.getElementById('modal-stops');

    const btnLiveMap = document.getElementById('btn-live-map');
    const mapModal = document.getElementById('map-modal');
    const mapContent = document.getElementById('map-content');
    const closeMap = document.getElementById('close-map');
    const liveMapFrame = document.getElementById('live-map-frame');
    const mapFallback = document.getElementById('map-fallback');

    // --- Alert & Sound Logic ---

    const playAlertSound = async () => {
        try {
            if (!state.audioCtx) return;
            if (state.audioCtx.state === 'suspended') await state.audioCtx.resume();

            const beep = (freq, duration, volume) => {
                const osc = state.audioCtx.createOscillator();
                const gain = state.audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, state.audioCtx.currentTime);
                gain.gain.setValueAtTime(volume, state.audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, state.audioCtx.currentTime + duration);
                osc.connect(gain);
                gain.connect(state.audioCtx.destination);
                osc.start();
                osc.stop(state.audioCtx.currentTime + duration);
            };

            // Alarm sequence: 3 quick beeps
            for (let i = 0; i < 3; i++) {
                beep(880, 0.3, 0.2);
                await new Promise(resolve => setTimeout(resolve, 400));
            }
        } catch (e) {
            console.error('Audio alert failed:', e);
        }
    };

    const sendNotification = async (title, body) => {
        if (Notification.permission === 'granted') {
            try {
                const registration = await navigator.serviceWorker.ready;
                registration.showNotification(title, {
                    body: body,
                    icon: 'https://cdn-icons-png.flaticon.com/512/3440/3440869.png',
                    badge: 'https://cdn-icons-png.flaticon.com/512/3440/3440869.png',
                    vibrate: [200, 100, 200],
                    tag: 'bus-alert'
                });
            } catch (e) {
                // Fallback to window notification if SW fails
                new Notification(title, { body });
            }
        }
    };

    btnNotifyPerm.addEventListener('click', async () => {
        if (state.alertsEnabled) {
            state.alertsEnabled = false;
            btnNotifyPerm.classList.remove('bg-green-100', 'dark:bg-green-900/30', 'text-green-600', 'dark:text-green-400');
            btnNotifyPerm.classList.add('bg-blue-100', 'dark:bg-blue-900/30', 'text-blue-600', 'dark:text-blue-400');
            btnNotifyPerm.innerHTML = '<i class="fas fa-bell"></i> Enable Alerts';
            alert('Alerts disabled.');
            return;
        }

        let permission = Notification.permission;
        if (permission === 'default') {
            permission = await Notification.requestPermission();
        }
        // Initialize AudioContext on user gesture to bypass autoplay blocks
        if (!state.audioCtx) {
            state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (permission === 'granted') {
            state.alertsEnabled = true;
            btnNotifyPerm.classList.remove('bg-blue-100', 'dark:bg-blue-900/30', 'text-blue-600', 'dark:text-blue-400');
            btnNotifyPerm.classList.add('bg-green-100', 'dark:bg-green-900/30', 'text-green-600', 'dark:text-green-400');
            btnNotifyPerm.innerHTML = '<i class="fas fa-check-circle"></i> Alerts On';
            alert('Notifications enabled! You will be alerted when your bus is close.');
        } else {
            state.alertsEnabled = true;
            btnNotifyPerm.classList.remove('bg-blue-100', 'dark:bg-blue-900/30', 'text-blue-600', 'dark:text-blue-400');
            btnNotifyPerm.classList.add('bg-green-100', 'dark:bg-green-900/30', 'text-green-600', 'dark:text-green-400');
            btnNotifyPerm.innerHTML = '<i class="fas fa-volume-up"></i> Audio Alerts On';
            alert('Notification permission ' + permission + '. You will still hear audio alerts if the tab is open.');
        }
    });

    alertMinsInput.addEventListener('change', (e) => {
        state.reminderMins = parseInt(e.target.value) || 5;
    });

    // --- Theme Logic ---
    const updateTheme = (isDark) => {
        if (isDark) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    };

    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        updateTheme(isDark);
    });

    if (localStorage.getItem('theme') === 'dark' ||
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }

    // Station Selection Logic
    const updateStopOptions = () => {
        if (!window.busData) return;
        const dirData = window.busData[state.currentDir];
        const firstTrip = dirData.am[0] || dirData.pm[0];
        if (!firstTrip) return;
        const availableStops = firstTrip.stops.slice(0, -1);
        stopSelect.innerHTML = '';
        availableStops.forEach(stop => {
            const option = document.createElement('option');
            option.value = stop.name;
            option.textContent = stop.name;
            stopSelect.appendChild(option);
        });
        state.selectedStop = stopSelect.value;
    };

    stopSelect.addEventListener('change', () => {
        state.selectedStop = stopSelect.value;
        renderSchedule();
    });

    // Schedule Rendering Logic
    const renderSchedule = () => {
        try {
            if (!window.busData) {
                listEl.innerHTML = '<p class="text-center text-red-500 py-10">Error: Timetable data not loaded.</p>';
                return;
            }
            const dirData = window.busData[state.currentDir];
            if (!dirData) {
                listEl.innerHTML = `<p class="text-center text-gray-500 py-10">No data for direction: ${state.currentDir}</p>`;
                return;
            }
            const allTripsRaw = [...(dirData.am || []), ...(dirData.pm || [])];
            const tripsWithStopTimes = allTripsRaw.map(trip => {
                const stop = trip.stops.find(s => s.name === state.selectedStop);
                return { ...trip, stopTime: stop ? stop.time : trip.departure };
            });

            const now = state.currentTime;
            const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            let nextBusId = null;
            for (const trip of tripsWithStopTimes) {
                if (trip.stopTime >= currentTimeStr) {
                    nextBusId = trip.id;
                    break;
                }
            }

            if (nextBusId && state.alertsEnabled) {
                const nextBus = tripsWithStopTimes.find(t => t.id === nextBusId);
                const [hrs, mins] = nextBus.stopTime.split(':').map(Number);
                const arrivalTime = new Date();
                arrivalTime.setHours(hrs, mins, 0, 0);
                if (arrivalTime < now) arrivalTime.setDate(arrivalTime.getDate() + 1);
                const diffMins = Math.round((arrivalTime - now) / 60000);
                if (diffMins <= state.reminderMins && !state.notifiedBuses.has(nextBusId)) {
                    state.notifiedBuses.add(nextBusId);
                    playAlertSound();
                    sendNotification(
                        'Bus Arrival Alert!',
                        `The next bus to ${state.currentDir === 'broadway_to_botany' ? 'Botany' : 'Broadway'} arrives at ${state.selectedStop} in ${diffMins} minutes.`
                    );
                }
            }

            const sortedTrips = [...tripsWithStopTimes].sort((a, b) => {
                if (a.id === nextBusId) return -1;
                if (b.id === nextBusId) return 1;
                return a.stopTime.localeCompare(b.stopTime);
            });

            listEl.innerHTML = '';
            if (sortedTrips.length === 0) {
                listEl.innerHTML = '<p class="text-center text-gray-500 py-10">No buses scheduled.</p>';
                return;
            }
            sortedTrips.forEach(trip => {
                const isNext = trip.id === nextBusId;
                const card = document.createElement('div');
                card.className = `p-4 rounded-2xl cursor-pointer transition-all duration-200 transform active:scale-95 ${
                    isNext ? 'next-bus shadow-lg' : 'bg-white dark:bg-gray-800 shadow-sm'
                }`;
                const timeDisplay = trip.stopTime;
                const destination = state.currentDir === 'broadway_to_botany' ? 'Botany (Lord St)' : 'Broadway (Thomas St)';
                let timeUntil = '';
                if (isNext) {
                    const depTime = new Date();
                    const [hrs, mins] = trip.stopTime.split(':').map(Number);
                    depTime.setHours(hrs, mins, 0, 0);
                    if (depTime < now) depTime.setDate(depTime.getDate() + 1);
                    const diff = Math.round((depTime - now) / 60000);
                    timeUntil = `Leaves in ${diff}m`;
                }
                card.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="text-2xl font-bold tabular-nums">${timeDisplay}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400">${destination}</p>
                        </div>
                        <div class="text-right">
                            ${isNext ? `<span class="text-xs font-bold text-yellow-600 dark:text-yellow-400 block mb-1">NEXT BUS</span>` : ''}
                            <p class="text-sm font-medium ${isNext ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-400'}">${timeUntil || ''}</p>
                            <i class="fas fa-chevron-right text-gray-300 dark:text-gray-600 ml-2"></i>
                        </div>
                    </div>
                `;
                card.addEventListener('click', () => openTripDetail(trip));
                listEl.appendChild(card);
            });
        } catch (e) {
            console.error('renderSchedule error:', e);
            listEl.innerHTML = `<p class="text-center text-red-500 py-10">An error occurred while loading the schedule.</p>`;
        }
    };

    const openTripDetail = (trip) => {
        state.selectedTrip = trip;
        modalTripTime.textContent = trip.departure;
        modalDirection.textContent = state.currentDir === 'broadway_to_botany' ? 'Broadway &rarr; Botany' : 'Botany &rarr; Broadway';
        modalStops.innerHTML = '';
        trip.stops.forEach((stop, index) => {
            const stopEl = document.createElement('div');
            stopEl.className = 'flex items-center gap-4 relative';
            const isFirst = index === 0;
            const isLast = index === trip.stops.length - 1;
            const isSelected = stop.name === state.selectedStop;
            stopEl.innerHTML = `
                <div class="flex flex-col items-center">
                    <div class="w-4 h-4 rounded-full z-10 ${isSelected ? 'bg-yellow-500 ring-4 ring-yellow-200 dark:ring-yellow-900' : isFirst ? 'bg-blue-500' : isLast ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}"></div>
                    ${!isLast ? '<div class="w-0.5 h-full bg-gray-200 dark:bg-gray-700 absolute top-4 bottom-0"></div>' : ''}
                </div>
                <div class="flex-1 ${isSelected ? 'bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg' : ''}">
                    <p class="text-sm font-medium ${isSelected ? 'text-yellow-700 dark:text-yellow-300' : ''}">${stop.name}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">${stop.time}</p>
                </div>
            `;
            modalStops.appendChild(stopEl);
        });
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        }, 10);
    };

    const closeTripDetail = () => {
        modalContent.classList.add('scale-95', 'opacity-0');
        modalContent.classList.remove('scale-100', 'opacity-100');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 200);
    };

    closeModal.addEventListener('click', closeTripDetail);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeTripDetail();
    });

    const openMapModal = () => {
        const mapUrl = 'https://maps.busminder.com.au/route/live/a6d25365-6b07-4546-9d4f-52ea8d1785e4';
        liveMapFrame.src = mapUrl;
        mapModal.classList.remove('hidden');
        mapModal.classList.add('flex');
        setTimeout(() => {
            mapContent.classList.remove('translate-y-full');
            mapContent.classList.add('translate-y-0');
        }, 10);
    };

    const closeMapModal = () => {
        mapContent.classList.add('translate-y-full');
        mapContent.classList.remove('translate-y-0');
        setTimeout(() => {
            mapModal.classList.add('hidden');
            mapModal.classList.remove('flex');
            liveMapFrame.src = '';
        }, 300);
    };

    btnLiveMap.addEventListener('click', openMapModal);
    closeMap.addEventListener('click', closeMapModal);

    const setDirection = (dir) => {
        state.currentDir = dir;
        if (dir === 'broadway_to_botany') {
            dirB2B.classList.add('bg-white', 'dark:bg-gray-700', 'shadow-sm');
            dirB2B.classList.remove('text-gray-600', 'dark:text-gray-400');
            dirB2BRev.classList.remove('bg-white', 'dark:bg-gray-700', 'shadow-sm');
            dirB2BRev.classList.add('text-gray-600', 'dark:text-gray-400');
        } else {
            dirB2BRev.classList.add('bg-white', 'dark:bg-gray-700', 'shadow-sm');
            dirB2BRev.classList.remove('text-gray-600', 'dark:text-gray-400');
            dirB2B.classList.remove('bg-white', 'dark:bg-gray-700', 'shadow-sm');
            dirB2B.classList.add('text-gray-600', 'dark:text-gray-400');
        }
        updateStopOptions();
        renderSchedule();
    };

    dirB2B.addEventListener('click', () => setDirection('broadway_to_botany'));
    dirB2BRev.addEventListener('click', () => setDirection('botany_to_broadway'));

    const updateClock = () => {
        state.currentTime = new Date();
        const now = state.currentTime.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        timeEl.textContent = now;
        renderSchedule();
    };

    updateStopOptions();
    setInterval(updateClock, 1000);
    updateClock();
});
