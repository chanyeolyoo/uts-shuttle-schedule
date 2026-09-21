document.addEventListener('DOMContentLoaded', () => {
    const state = {
        currentDir: 'broadway_to_botany',
        currentTime: new Date(),
        selectedTrip: null,
        selectedStop: '',
        reminderMins: 5,
        alertsEnabled: false,
        notifiedBuses: new Set()
    };

    // DOM Elements
    const timeEl = document.getElementById('current-time');
    const listEl = document.getElementById('schedule-list');
    const dirB2B = document.getElementById('dir-b2b');
    const dirB2BRev = document.getElementById('dir-b2b_rev');
    const themeToggle = document.getElementById('theme-toggle');
    const stopSelector = document.getElementById('stop-selector');
    const alertMinsInput = document.getElementById('alert-mins');
    const btnNotifyPerm = document.getElementById('btn-notify-perm');
    const btnLiveMap = document.getElementById('btn-live-map');
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    const closeModal = document.getElementById('close-modal');
    const modalTripTime = document.getElementById('modal-trip-time');
    const modalDirection = document.getElementById('modal-direction');
    const modalStops = document.getElementById('modal-stops');
    const mapModal = document.getElementById('map-modal');
    const mapContent = document.getElementById('map-content');
    const closeMap = document.getElementById('close-map');
    const liveMapFrame = document.getElementById('live-map-frame');

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

    // --- Alert Utilities ---
    const playAlertSound = () => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.5);
        } catch (e) {
            console.error('Audio playback failed:', e);
        }
    };

    const sendNotification = (title, body) => {
        if (Notification.permission === 'granted') {
            new Notification(title, { body });
        }
    };

    // --- Schedule Logic ---
    const getNextServiceDay = (currentDate) => {
        const serviceDays = window.busData.serviceDays || [1, 2, 3, 4, 5];
        let dayOffset = 0;
        while (true) {
            const checkDate = new Date(currentDate);
            checkDate.setDate(currentDate.getDate() + dayOffset);
            if (serviceDays.includes(checkDate.getDay())) {
                return { offset: dayOffset, dayName: checkDate.toLocaleDateString('en-US', { weekday: 'long' }) };
            }
            dayOffset++;
            if (dayOffset > 7) return { offset: 0, dayName: '' }; // Safety break
        }
    };

    const populateStops = () => {
        const dirData = window.busData[state.currentDir];
        if (!dirData) return;

        const firstTrip = [...(dirData.am || []), ...(dirData.pm || [])][0];
        if (!firstTrip) return;

        // Ensure a valid stop is selected for this direction
        if (!state.selectedStop || !firstTrip.stops.some(s => s.name === state.selectedStop)) {
            state.selectedStop = firstTrip.stops[0].name;
        }

        stopSelector.innerHTML = '';
        firstTrip.stops.forEach((stop, index) => {
            const isSelected = state.selectedStop === stop.name;

            const stopContainer = document.createElement('div');
            stopContainer.className = `flex flex-col items-center cursor-pointer group transition-all duration-200 ${isSelected ? 'scale-110' : ''}`;

            stopContainer.innerHTML = `
                <div class="w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                    isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-400 dark:bg-gray-800 dark:border-gray-500'
                }"></div>
                <span class="text-[10px] mt-2 transition-all duration-200 ${
                    isSelected ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                }">${stop.name}</span>
            `;

            stopContainer.addEventListener('click', () => {
                state.selectedStop = stop.name;
                populateStops();
                renderSchedule();
            });

            stopSelector.appendChild(stopContainer);

            if (index < firstTrip.stops.length - 1) {
                const line = document.createElement('div');
                line.className = 'flex-1 h-0.5 bg-gray-300 dark:bg-gray-700 mt-2';
                stopSelector.appendChild(line);
            }
        });
    };

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
            const tripsWithTimes = allTripsRaw.map(trip => {
                if (state.currentDir === 'broadway_to_botany') {
                    const boardingStop = trip.stops.find(s => s.name === state.selectedStop);
                    const alightingStop = trip.stops[trip.stops.length - 1];
                    return {
                        ...trip,
                        boardingTime: boardingStop ? boardingStop.time : trip.departure,
                        alightingTime: alightingStop.time,
                        boardingStopName: state.selectedStop,
                        alightingStopName: alightingStop.name
                    };
                } else {
                    const boardingStop = trip.stops[0];
                    const alightingStop = trip.stops.find(s => s.name === state.selectedStop);
                    return {
                        ...trip,
                        boardingTime: boardingStop.time,
                        alightingTime: alightingStop ? alightingStop.time : trip.departure,
                        boardingStopName: boardingStop.name,
                        alightingStopName: state.selectedStop
                    };
                }
            });

            const now = state.currentTime;
            const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            // Filter out buses that have already passed boarding point
            const serviceInfo = getNextServiceDay(now);
            const isTodayServiceDay = serviceInfo.offset === 0;

            let futureTrips = [];
            if (isTodayServiceDay) {
                futureTrips = tripsWithTimes.filter(trip => trip.boardingTime >= currentTimeStr);
            }

            let isNextDay = false;
            let displayDay = '';

            if (futureTrips.length === 0) {
                isNextDay = true;
                futureTrips = tripsWithTimes;
                if (isTodayServiceDay) {
                    const tomorrow = new Date(now);
                    tomorrow.setDate(now.getDate() + 1);
                    const nextDayInfo = getNextServiceDay(tomorrow);
                    state.dayOffset = 1 + nextDayInfo.offset;
                    displayDay = nextDayInfo.dayName;
                } else {
                    state.dayOffset = serviceInfo.offset;
                    displayDay = serviceInfo.dayName;
                }
            } else {
                state.dayOffset = 0;
                displayDay = '';
            }

            let nextBusId = null;
            if (futureTrips.length > 0) {
                nextBusId = futureTrips[0].id;
            }

            // Sort: Next Bus first, then others chronologically by boarding time
            const sortedTrips = [...futureTrips].sort((a, b) => {
                if (a.id === nextBusId) return -1;
                if (b.id === nextBusId) return 1;
                return a.boardingTime.localeCompare(b.boardingTime);
            });

            // Logic for alerts
            if (nextBusId && state.alertsEnabled) {
                const nextBus = futureTrips.find(t => t.id === nextBusId);
                const [hrs, mins] = nextBus.boardingTime.split(':').map(Number);
                const arrivalTime = new Date();
                arrivalTime.setHours(hrs, mins, 0, 0);
                arrivalTime.setDate(arrivalTime.getDate() + (state.dayOffset || 0));

                const diffMins = Math.round((arrivalTime - now) / 60000);
                if (diffMins <= state.reminderMins && !state.notifiedBuses.has(nextBusId)) {
                    state.notifiedBuses.add(nextBusId);
                    playAlertSound();
                    sendNotification(
                        'Bus Arrival Alert!',
                        `The next bus to ${state.currentDir === 'broadway_to_botany' ? 'Botany' : state.selectedStop} arrives at ${state.currentDir === 'broadway_to_botany' ? state.selectedStop : 'Botany'} in ${diffMins} minutes.`
                    );
                }
            }

            listEl.innerHTML = '';
            if (sortedTrips.length === 0) {
                listEl.innerHTML = '<p class="text-center text-gray-500 py-10">No more buses scheduled for today.</p>';
                return;
            }
            sortedTrips.forEach(trip => {
                const isNext = trip.id === nextBusId;
                const card = document.createElement('div');
                card.className = `p-4 rounded-2xl cursor-pointer transition-all duration-200 transform active:scale-95 ${
                    isNext ? 'next-bus shadow-lg' : 'bg-white dark:bg-gray-800 shadow-sm'
                }`;

                let timeUntil = '';
                if (isNext) {
                    const depTime = new Date();
                    const [hrs, mins] = trip.boardingTime.split(':').map(Number);
                    depTime.setHours(hrs, mins, 0, 0);
                    depTime.setDate(depTime.getDate() + (state.dayOffset || 0));

                    const diff = Math.round((depTime - now) / 60000);
                    timeUntil = `Leaves in ${diff}m`;
                }

                card.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div class="flex-1">
                            <div class="flex items-baseline gap-2">
                                ${isNextDay ? `<span class="text-[10px] font-bold uppercase text-blue-500 dark:text-blue-400 mr-1">${displayDay}</span>` : ''}
                                <p class="text-2xl font-bold tabular-nums">${trip.boardingTime}</p>
                                <p class="text-xs text-gray-400 dark:text-gray-500 font-medium"> &rarr; ${trip.alightingTime}</p>
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                ${trip.boardingStopName} &rarr; ${trip.alightingStopName}
                            </p>
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

    // --- Modal Logic ---
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

            stopEl.innerHTML = `
                <div class="flex flex-col items-center">
                    <div class="w-4 h-4 rounded-full z-10 ${isFirst ? 'bg-blue-500' : isLast ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}"></div>
                    ${!isLast ? '<div class="w-0.5 h-full bg-gray-200 dark:bg-gray-700 absolute top-4 bottom-0"></div>' : ''}
                </div>
                <div class="flex-1">
                    <p class="text-sm font-medium">${stop.name}</p>
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

    // --- Direction Toggle Logic ---
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
        populateStops();
        renderSchedule();
    };

    dirB2B.addEventListener('click', () => setDirection('broadway_to_botany'));
    dirB2BRev.addEventListener('click', () => setDirection('botany_to_broadway'));

    // --- Stop Selection & Alerts Logic ---

    alertMinsInput.addEventListener('input', () => {
        state.reminderMins = parseInt(alertMinsInput.value, 10) || 5;
    });

    btnNotifyPerm.addEventListener('click', () => {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                state.alertsEnabled = true;
                alert('Notifications enabled!');
            } else {
                alert('Notifications permission denied.');
            }
        });
    });

    // --- Live Map Logic ---
    btnLiveMap.addEventListener('click', () => {
        liveMapFrame.src = 'https://maps.busminder.com.au/route/live/a6d25365-6b07-4546-9d4f-52ea8d1785e4';
        mapModal.classList.remove('hidden');
        mapModal.classList.add('flex');
        setTimeout(() => {
            mapContent.classList.remove('translate-y-full');
        }, 10);
    });

    closeMap.addEventListener('click', () => {
        mapContent.classList.add('translate-y-full');
        setTimeout(() => {
            mapModal.classList.add('hidden');
            mapModal.classList.remove('flex');
            liveMapFrame.src = ''; // Stop loading/playing
        }, 300);
    });

    // --- Time Update Logic ---
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

    // Initialize everything
    populateStops();
    setInterval(updateClock, 1000);
    updateClock();
});
