const STORAGE_KEY = "doggout.app.state.v2";
const LEGACY_STORAGE_KEY = "doggout.app.state.v1";

const AVATAR_CATALOG = [
    // Edit avatar prices here (the `cost` field).
    { id: "mascot", name: "Mascot", cost: 0, src: "assets/mascot_logo.png" },
    { id: "doggo_1", name: "Doggo One", cost: 20, src: "assets/doggo_1.png" },
    { id: "doggo_2", name: "Doggo Two", cost: 35, src: "assets/doggo_2.png" },
    { id: "bulldog_1", name: "Bulldog One", cost: 65, src: "assets/bulldog1.png" },
    { id: "bulldog_2", name: "Bulldog Two", cost: 80, src: "assets/bulldog2.png" },
    { id: "chihuahua_1", name: "Chihuahua One", cost: 95, src: "assets/chihuahua1.png" },
    { id: "chihuahua_2", name: "Chihuahua Two", cost: 110, src: "assets/chihuahua2.png" },
    { id: "borzoi_1", name: "Borzoi One", cost: 130, src: "assets/borzoi1.png" },
    { id: "borzoi_2", name: "Borzoi Two", cost: 150, src: "assets/borzoi2.png" },
    { id: "borzoi_3", name: "Borzoi Three", cost: 170, src: "assets/borzoi3.png" },
    { id: "white_retriever_1", name: "White Retriever One", cost: 190, src: "assets/white retriever1.png" },
    { id: "white_retriever_2", name: "White Retriever Two", cost: 210, src: "assets/white retriever2.png" },
    { id: "white_retriever_3", name: "White Retriever Three", cost: 230, src: "assets/white retriever3.png" },
    { id: "afghan_hound", name: "Afghan Hound", cost: 300, src: "assets/Afghan_Hound.png" },
];

/**
 * GPS distance tracker using watchPosition + Haversine.
 * Designed to be reusable and to filter noisy readings.
 */
class GpsDistanceTracker {
    constructor(options = {}) {
        this.earthRadiusMeters = 6371000;
        this.maxAcceptedAccuracy = options.maxAcceptedAccuracy ?? 12;
        this.minDistanceStepMeters = options.minDistanceStepMeters ?? 10;
        this.maxWalkingSpeedMps = options.maxWalkingSpeedMps ?? 3.5;
        this.requiredConsecutiveMoves = options.requiredConsecutiveMoves ?? 3;
        this.totalMeters = 0;
        this.previousAccepted = null;
        this.watchId = null;
        this.onUpdate = null;
        this.onError = null;
        this.consecutiveMoveCandidates = 0;
    }

    start(onUpdate, onError) {
        if (!navigator.geolocation) {
            if (onError) {
                onError(new Error("Geolocation is not supported by this browser."));
            }
            return false;
        }

        if (!window.isSecureContext) {
            if (onError) {
                onError(new Error("Geolocation requires HTTPS (or localhost)."));
            }
            return false;
        }

        this.onUpdate = onUpdate;
        this.onError = onError;

        this.watchId = navigator.geolocation.watchPosition(
            (position) => this.processPosition(position),
            (error) => this.handleWatchError(error),
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 15000
            }
        );
        return true;
    }

    stop() {
        if (typeof this.watchId === "number") {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }

    reset() {
        this.totalMeters = 0;
        this.previousAccepted = null;
        this.consecutiveMoveCandidates = 0;
    }

    processPosition(position) {
        const { latitude, longitude, accuracy } = position.coords;

        // Ignore low-quality GPS samples.
        if (!Number.isFinite(accuracy) || accuracy > this.maxAcceptedAccuracy) {
            return;
        }

        const currentPoint = { latitude, longitude };

        if (!this.previousAccepted) {
            this.previousAccepted = { ...currentPoint, timestamp: position.timestamp };
            this.emitUpdate(position, this.totalMeters);
            return;
        }

        const stepMeters = this.calculateHaversineDistance(
            this.previousAccepted.latitude,
            this.previousAccepted.longitude,
            currentPoint.latitude,
            currentPoint.longitude
        );

        const elapsedSeconds = Math.max(
            0,
            (position.timestamp - (this.previousAccepted.timestamp ?? position.timestamp)) / 1000
        );
        const speedMps = elapsedSeconds > 0 ? stepMeters / elapsedSeconds : 0;

        // Ignore impossible jumps/spikes from GPS.
        if (speedMps > this.maxWalkingSpeedMps) {
            this.consecutiveMoveCandidates = 0;
            return;
        }

        // Dynamic step threshold based on reported sample accuracy.
        const dynamicMinStep = Math.max(this.minDistanceStepMeters, accuracy * 0.6);

        // Ignore micro-jumps caused by GPS jitter.
        if (stepMeters < dynamicMinStep) {
            this.consecutiveMoveCandidates = 0;
            this.previousAccepted = { ...currentPoint, timestamp: position.timestamp };
            return;
        }

        // Require multiple significant samples before counting movement.
        this.consecutiveMoveCandidates += 1;
        if (this.consecutiveMoveCandidates < this.requiredConsecutiveMoves) {
            this.previousAccepted = { ...currentPoint, timestamp: position.timestamp };
            return;
        }

        this.totalMeters += stepMeters;
        this.previousAccepted = { ...currentPoint, timestamp: position.timestamp };
        this.emitUpdate(position, this.totalMeters);
    }

    emitUpdate(position, totalMeters) {
        if (this.onUpdate) {
            this.onUpdate({
                position,
                totalMeters
            });
        }
    }

    handleWatchError(error) {
        if (this.onError) {
            this.onError(error);
        }
    }

    calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        const dLat = this.degreesToRadians(lat2 - lat1);
        const dLon = this.degreesToRadians(lon2 - lon1);
        const radLat1 = this.degreesToRadians(lat1);
        const radLat2 = this.degreesToRadians(lat2);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(radLat1) *
                Math.cos(radLat2) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return this.earthRadiusMeters * c;
    }

    degreesToRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
}

function createDefaultState() {
    return {
        bagCount: 12,
        noPoopStreak: 0,
        history: [],
        pointBalance: 0,
        unlockedAvatars: ["mascot"],
        currentAvatar: "mascot"
    };
}

const ui = {
    walkToggle: document.getElementById("walkToggle"),
    walkState: document.getElementById("walkState"),
    liveIndicator: document.getElementById("liveIndicator"),
    clockValue: document.getElementById("clockValue"),
    brandLogo: document.getElementById("brandLogo"),
    lastWalkValue: document.getElementById("lastWalkValue"),
    durationValue: document.getElementById("durationValue"),
    distanceValue: document.getElementById("distance"),
    poopStatusValue: document.getElementById("poopStatusValue"),
    pointsValue: document.getElementById("pointsValue"),
    bagsValue: document.getElementById("bagsValue"),
    moodValue: document.getElementById("moodValue"),
    sessionSummary: document.getElementById("sessionSummary"),
    historyList: document.getElementById("historyList"),
    historySummary: document.getElementById("historySummary"),
    profileAvatar: document.getElementById("profileAvatar"),
    profileAvatarName: document.getElementById("profileAvatarName"),
    profilePointsValue: document.getElementById("profilePointsValue"),
    profileBagsValue: document.getElementById("profileBagsValue"),
    profileWalkCount: document.getElementById("profileWalkCount"),
    shopPointsValue: document.getElementById("shopPointsValue"),
    shopGrid: document.getElementById("shopGrid"),
    goalImageOne: document.getElementById("goalImageOne"),
    goalImageTwo: document.getElementById("goalImageTwo"),
    goalTitleOne: document.getElementById("goalTitleOne"),
    goalTitleTwo: document.getElementById("goalTitleTwo"),
    goalStatusOne: document.getElementById("goalStatusOne"),
    goalStatusTwo: document.getElementById("goalStatusTwo"),
    goalPointsOne: document.getElementById("goalPointsOne"),
    goalPointsTwo: document.getElementById("goalPointsTwo"),
    goalProgressOne: document.getElementById("goalProgressOne"),
    goalProgressTwo: document.getElementById("goalProgressTwo"),
    goalButtonOne: document.getElementById("goalButtonOne"),
    goalButtonTwo: document.getElementById("goalButtonTwo"),
    tabs: Array.from(document.querySelectorAll(".tab[data-tab]")),
    views: Array.from(document.querySelectorAll(".app-view[data-view]"))
};

const appState = loadState();
const walkSession = {
    active: false,
    startedAt: 0,
    timerId: null,
    watchId: null,
    durationMs: 0,
    distanceM: 0,
    lastPosition: null,
    route: []
};

let map = null;
let routeLine = null;
let currentMarker = null;
let activeTab = "walk";
let activeGoalSlotOne = null;
let activeGoalSlotTwo = null;
let coarsePointerQuery = null;
const gpsTracker = new GpsDistanceTracker({
    maxAcceptedAccuracy: 12,
    minDistanceStepMeters: 10,
    maxWalkingSpeedMps: 3.5,
    requiredConsecutiveMoves: 3
});

init();

function init() {
    initDeviceMode();
    initMap();
    initClock();
    bindEvents();
    setActiveTab("walk");
    renderAll();
}

function bindEvents() {
    if (ui.walkToggle) {
        ui.walkToggle.addEventListener("click", () => {
            if (walkSession.active) {
                stopWalk();
                return;
            }

            startWalk();
        });
    }

    ui.tabs.forEach((tabButton) => {
        tabButton.addEventListener("click", () => {
            const tabName = tabButton.dataset.tab;
            if (!tabName) {
                return;
            }
            setActiveTab(tabName);
        });
    });

    if (ui.goalButtonOne) {
        ui.goalButtonOne.addEventListener("click", () => handleGoalAction(activeGoalSlotOne));
    }

    if (ui.goalButtonTwo) {
        ui.goalButtonTwo.addEventListener("click", () => handleGoalAction(activeGoalSlotTwo));
    }

    window.addEventListener("resize", applyDeviceModeClass);

    if (coarsePointerQuery && typeof coarsePointerQuery.addEventListener === "function") {
        coarsePointerQuery.addEventListener("change", applyDeviceModeClass);
    } else if (coarsePointerQuery && typeof coarsePointerQuery.addListener === "function") {
        coarsePointerQuery.addListener(applyDeviceModeClass);
    }
}

function initDeviceMode() {
    if (typeof window.matchMedia === "function") {
        coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    }
    applyDeviceModeClass();
}

function isMobileDevice() {
    const userAgent = navigator.userAgent || "";
    const mobileAgentPattern = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|Opera Mini/i;
    const hasMobileUAData = Boolean(navigator.userAgentData && navigator.userAgentData.mobile);
    const hasMobileUserAgent = mobileAgentPattern.test(userAgent);
    const hasCoarsePointer = coarsePointerQuery ? coarsePointerQuery.matches : false;
    const isSmallTouchViewport = hasCoarsePointer && window.innerWidth <= 1024;
    return hasMobileUAData || hasMobileUserAgent || isSmallTouchViewport;
}

function applyDeviceModeClass() {
    const mobile = isMobileDevice();
    document.body.classList.toggle("device-mobile", mobile);
    document.body.classList.toggle("device-desktop", !mobile);

    if (map) {
        setTimeout(() => map.invalidateSize(), 80);
    }
}

function setActiveTab(tabName) {
    activeTab = tabName;

    ui.tabs.forEach((tabButton) => {
        tabButton.classList.toggle("is-active", tabButton.dataset.tab === tabName);
    });

    ui.views.forEach((view) => {
        view.classList.toggle("is-active", view.dataset.view === tabName);
    });

    if (tabName === "walk" && map) {
        setTimeout(() => map.invalidateSize(), 80);
    }
}

function initClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    if (!ui.clockValue) {
        return;
    }

    ui.clockValue.textContent = new Date().toLocaleTimeString("da-DK", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function initMap() {
    if (!window.L) {
        setText(ui.liveIndicator, "Map unavailable");
        return;
    }

    map = L.map("map", { zoomControl: false }).setView([55.6761, 12.5683], 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    routeLine = L.polyline([], { color: "#0f9a8b", weight: 4 }).addTo(map);
    setTimeout(() => map.invalidateSize(), 150);
}

function startWalk() {
    const hasBag = confirm("Did you remember a poop bag?");
    if (!hasBag) {
        alert("Walk not started. Grab a bag first.");
        return;
    }

    walkSession.active = true;
    walkSession.startedAt = Date.now();
    walkSession.durationMs = 0;
    walkSession.distanceM = 0;
    walkSession.lastPosition = null;
    walkSession.route = [];

    if (routeLine) {
        routeLine.setLatLngs([]);
    }

    if (currentMarker && map) {
        map.removeLayer(currentMarker);
        currentMarker = null;
    }

    gpsTracker.reset();
    const started = gpsTracker.start(handleGpsUpdate, handleGpsError);
    if (!started) {
        return;
    }

    walkSession.timerId = setInterval(() => {
        walkSession.durationMs = Date.now() - walkSession.startedAt;
        updateLiveSessionFields();
    }, 1000);

    setText(ui.walkState, "Walking");
    setText(ui.walkToggle, "End Walk");
    setText(ui.liveIndicator, "Tracking");
    setText(ui.poopStatusValue, "Pending");
    setText(ui.moodValue, "Active");
    setText(ui.sessionSummary, "Walk in progress...");
    document.body.classList.add("walking");
    setActiveTab("walk");
    updateLiveSessionFields();
}

function stopWalk() {
    if (!walkSession.active) {
        return;
    }

    walkSession.active = false;
    walkSession.durationMs = Date.now() - walkSession.startedAt;

    if (walkSession.timerId) {
        clearInterval(walkSession.timerId);
        walkSession.timerId = null;
    }

    gpsTracker.stop();

    const didPoop = confirm("Did your dog poop on this walk?");

    if (didPoop) {
        appState.bagCount = Math.max(0, appState.bagCount - 1);
        appState.noPoopStreak = 0;
        if (appState.bagCount === 0) {
            alert("Bag count is 0. Restock before the next walk.");
        }
    } else {
        appState.noPoopStreak += 1;
        if (appState.noPoopStreak > 1) {
            alert("Your dog has skipped poop more than once. Check if everything is okay.");
        }
    }

    const earnedPoints = calculatePoints(walkSession.distanceM, walkSession.durationMs, didPoop);
    appState.pointBalance += earnedPoints;

    const session = {
        endedAt: Date.now(),
        durationMs: walkSession.durationMs,
        distanceM: walkSession.distanceM,
        didPoop,
        points: earnedPoints,
        mood: calculateMood(earnedPoints, didPoop, appState.noPoopStreak)
    };

    appState.history.unshift(session);
    appState.history = appState.history.slice(0, 80);

    setText(ui.walkState, "Ready");
    setText(ui.walkToggle, "Start Walk");
    setText(ui.liveIndicator, "GPS Off");
    document.body.classList.remove("walking");

    saveState(appState);
    renderAll();

    if (map && walkSession.route.length > 1) {
        map.fitBounds(L.latLngBounds(walkSession.route), { padding: [24, 24] });
    }
}

function cancelWalk(reason) {
    walkSession.active = false;

    if (walkSession.timerId) {
        clearInterval(walkSession.timerId);
        walkSession.timerId = null;
    }

    gpsTracker.stop();

    setText(ui.walkState, "Ready");
    setText(ui.walkToggle, "Start Walk");
    setText(ui.liveIndicator, "GPS Off");
    document.body.classList.remove("walking");
    renderAll();
    setText(ui.sessionSummary, reason);
}

function handleGpsUpdate(sample) {
    const lat = sample.position.coords.latitude;
    const lng = sample.position.coords.longitude;
    const current = [lat, lng];
    walkSession.distanceM = sample.totalMeters;

    walkSession.lastPosition = current;
    walkSession.route.push(current);

    if (routeLine) {
        routeLine.addLatLng(current);
    }

    if (map && !currentMarker) {
        currentMarker = L.circleMarker(current, {
            radius: 7,
            color: "#0f9a8b",
            weight: 2,
            fillColor: "#0f9a8b",
            fillOpacity: 0.4
        }).addTo(map);
        map.setView(current, 16);
    } else if (currentMarker) {
        currentMarker.setLatLng(current);
    }

    updateLiveSessionFields();
}

function handleGpsError(error) {
    const message = error && error.message ? error.message : String(error);
    setText(ui.liveIndicator, "GPS Error");
    setText(ui.sessionSummary, `GPS issue: ${message}`);

    if (walkSession.active && (error.code === 1 || error.code === 2)) {
        alert("GPS permission is required to track a walk.");
        cancelWalk("Walk cancelled due to GPS issue.");
    } else if (walkSession.active) {
        cancelWalk("Walk cancelled due to GPS issue.");
    }
}

function updateLiveSessionFields() {
    const projected = calculatePoints(walkSession.distanceM, walkSession.durationMs, false);
    setText(ui.durationValue, formatDuration(walkSession.durationMs));
    setText(ui.distanceValue, formatDistance(walkSession.distanceM));
    setText(ui.pointsValue, String(appState.pointBalance + projected));
    setText(
        ui.sessionSummary,
        `Live: ${formatDistance(walkSession.distanceM)} in ${formatDuration(walkSession.durationMs)}`
    );
    renderGoalCards();
}

function renderAll() {
    renderWalkView();
    renderGoalCards();
    renderHistoryView();
    renderProfileView();
    renderShopView();
    renderAvatar();
    setActiveTab(activeTab);
}

function renderGoalCards() {
    const totalEarnedPoints =
        getTotalEarnedPoints() +
        (walkSession.active ? calculatePoints(walkSession.distanceM, walkSession.durationMs, false) : 0);

    const goals = getNextGoalAvatars(totalEarnedPoints);
    activeGoalSlotOne = goals[0] ? goals[0].id : null;
    activeGoalSlotTwo = goals[1] ? goals[1].id : null;

    const goalBindings = [
        {
            avatar: goals[0],
            imageElement: ui.goalImageOne,
            titleElement: ui.goalTitleOne,
            statusElement: ui.goalStatusOne,
            pointsElement: ui.goalPointsOne,
            progressElement: ui.goalProgressOne,
            buttonElement: ui.goalButtonOne
        },
        {
            avatar: goals[1],
            imageElement: ui.goalImageTwo,
            titleElement: ui.goalTitleTwo,
            statusElement: ui.goalStatusTwo,
            pointsElement: ui.goalPointsTwo,
            progressElement: ui.goalProgressTwo,
            buttonElement: ui.goalButtonTwo
        }
    ];

    goalBindings.forEach((goal) => {
        const avatar = goal.avatar;
        if (!avatar) {
            setText(goal.titleElement, "All Goals Done");
            setText(goal.statusElement, "All avatar goals are completed.");
            setText(goal.pointsElement, "100%");
            if (goal.progressElement) {
                goal.progressElement.style.width = "100%";
            }
            if (goal.imageElement) {
                goal.imageElement.src = "assets/mascot_logo.png";
                goal.imageElement.alt = "All goals complete";
            }
            setText(goal.buttonElement, "Open Shop");
            if (goal.buttonElement) {
                goal.buttonElement.disabled = false;
            }
            return;
        }

        const isOwned = appState.unlockedAvatars.includes(avatar.id);
        const isEquipped = appState.currentAvatar === avatar.id;
        const reachedGoal = totalEarnedPoints >= avatar.cost;
        const progressPercent =
            avatar.cost > 0 ? Math.min(100, Math.round((totalEarnedPoints / avatar.cost) * 100)) : 100;
        const progressPoints = Math.min(totalEarnedPoints, avatar.cost);

        if (goal.imageElement) {
            goal.imageElement.src = avatar.src;
            goal.imageElement.alt = `${avatar.name} goal image`;
        }
        setText(goal.titleElement, `${avatar.name} Goal`);

        if (goal.progressElement) {
            goal.progressElement.style.width = `${progressPercent}%`;
        }
        setText(goal.pointsElement, `${progressPoints} / ${avatar.cost}`);

        if (isEquipped) {
            setText(goal.statusElement, "Equipped right now");
            setText(goal.buttonElement, "Equipped");
            if (goal.buttonElement) {
                goal.buttonElement.disabled = true;
            }
            return;
        }

        if (isOwned) {
            setText(goal.statusElement, "Unlocked. Tap to use.");
            setText(goal.buttonElement, "Use Avatar");
            if (goal.buttonElement) {
                goal.buttonElement.disabled = false;
            }
            return;
        }

        const pointsRemaining = Math.max(0, avatar.cost - totalEarnedPoints);
        if (reachedGoal) {
            setText(goal.statusElement, "Goal reached. Unlock from P Shop.");
            setText(goal.buttonElement, "Open Shop");
        } else {
            setText(goal.statusElement, `Reach ${avatar.cost} total points (${pointsRemaining} left)`);
            setText(goal.buttonElement, "View Goal");
        }

        if (goal.buttonElement) {
            goal.buttonElement.disabled = false;
        }
    });
}

function renderWalkView() {
    setText(ui.bagsValue, String(appState.bagCount));

    if (walkSession.active) {
        updateLiveSessionFields();
        return;
    }

    setText(ui.pointsValue, String(appState.pointBalance));

    if (appState.history.length === 0) {
        setText(ui.lastWalkValue, "No walks yet");
        setText(ui.durationValue, "0:00");
        setText(ui.distanceValue, "0 m");
        setText(ui.poopStatusValue, "Unknown");
        setText(ui.moodValue, "Ready");
        setText(ui.sessionSummary, "No session saved yet.");
        return;
    }

    const session = appState.history[0];
    const ended = new Date(session.endedAt);
    setText(
        ui.lastWalkValue,
        ended.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })
    );
    setText(ui.durationValue, formatDuration(session.durationMs));
    setText(ui.distanceValue, formatDistance(session.distanceM));
    setText(ui.poopStatusValue, session.didPoop ? "Yes" : "No");
    setText(ui.moodValue, session.mood);
    setText(
        ui.sessionSummary,
        `Last walk earned ${session.points} pts. Balance: ${appState.pointBalance}`
    );
}

function renderHistoryView() {
    if (!ui.historyList || !ui.historySummary) {
        return;
    }

    ui.historyList.innerHTML = "";

    if (appState.history.length === 0) {
        const emptyItem = document.createElement("li");
        emptyItem.className = "history-item";
        emptyItem.innerHTML = "<p>No walks yet. Start your first walk from the Walk tab.</p>";
        ui.historyList.appendChild(emptyItem);
        setText(ui.historySummary, "No walks recorded yet.");
        return;
    }

    const totals = appState.history.reduce(
        (sum, session) => {
            sum.distanceM += Number(session.distanceM) || 0;
            sum.durationMs += Number(session.durationMs) || 0;
            return sum;
        },
        { distanceM: 0, durationMs: 0 }
    );

    setText(
        ui.historySummary,
        `${appState.history.length} walks | ${formatDistance(totals.distanceM)} | ${formatDuration(totals.durationMs)}`
    );

    appState.history.slice(0, 20).forEach((session) => {
        const item = document.createElement("li");
        const timeLabel = new Date(session.endedAt).toLocaleString("da-DK", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });

        item.className = "history-item";
        item.innerHTML = `
            <time>${timeLabel}</time>
            <p>${formatDistance(session.distanceM)} | ${formatDuration(session.durationMs)}</p>
            <p>Poop: ${session.didPoop ? "Yes" : "No"} | Points: ${session.points}</p>
        `;
        ui.historyList.appendChild(item);
    });
}

function renderProfileView() {
    const avatar = getAvatarById(appState.currentAvatar);
    setText(ui.profileAvatarName, avatar.name);
    setText(ui.profilePointsValue, String(appState.pointBalance));
    setText(ui.profileBagsValue, String(appState.bagCount));
    setText(ui.profileWalkCount, String(appState.history.length));

    if (ui.profileAvatar) {
        ui.profileAvatar.src = avatar.src;
        ui.profileAvatar.alt = avatar.name;
    }
}

function renderShopView() {
    if (!ui.shopGrid) {
        return;
    }

    setText(ui.shopPointsValue, String(appState.pointBalance));
    ui.shopGrid.innerHTML = "";

    AVATAR_CATALOG.forEach((avatar) => {
        const isOwned = appState.unlockedAvatars.includes(avatar.id);
        const isEquipped = appState.currentAvatar === avatar.id;
        const canBuy = appState.pointBalance >= avatar.cost;

        const card = document.createElement("article");
        card.className = "shop-item";

        const button = document.createElement("button");
        button.type = "button";

        if (isEquipped) {
            button.textContent = "Equipped";
            button.disabled = true;
        } else if (isOwned) {
            button.textContent = "Use";
        } else {
            button.textContent = `Buy ${avatar.cost}`;
            button.disabled = !canBuy;
        }

        button.addEventListener("click", () => {
            handleAvatarAction(avatar.id);
        });

        const details = document.createElement("div");
        details.innerHTML = `
            <h3>${avatar.name}</h3>
            <p>${isOwned ? "Owned" : `${avatar.cost} points`}</p>
        `;

        const image = document.createElement("img");
        image.src = avatar.src;
        image.alt = avatar.name;

        card.appendChild(image);
        card.appendChild(details);
        card.appendChild(button);
        ui.shopGrid.appendChild(card);
    });
}

function handleAvatarAction(avatarId) {
    const avatar = getAvatarById(avatarId);
    const isOwned = appState.unlockedAvatars.includes(avatar.id);

    if (!isOwned) {
        if (appState.pointBalance < avatar.cost) {
            alert("Not enough points for this avatar.");
            return;
        }

        appState.pointBalance -= avatar.cost;
        appState.unlockedAvatars.push(avatar.id);
    }

    appState.currentAvatar = avatar.id;
    saveState(appState);
    renderAll();
}

function renderAvatar() {
    const avatar = getAvatarById(appState.currentAvatar);
    if (ui.brandLogo) {
        ui.brandLogo.src = avatar.src;
        ui.brandLogo.alt = avatar.name;
    }
}

function handleGoalAction(avatarId) {
    if (!avatarId) {
        setActiveTab("shop");
        return;
    }

    const avatar = getAvatarById(avatarId);
    const isOwned = appState.unlockedAvatars.includes(avatar.id);
    if (isOwned) {
        appState.currentAvatar = avatar.id;
        saveState(appState);
        renderAll();
        setActiveTab("profile");
        return;
    }

    const totalEarnedPoints = getTotalEarnedPoints();
    const pointsNeeded = Math.max(0, avatar.cost - totalEarnedPoints);
    if (pointsNeeded > 0) {
        alert(`${avatar.name} goal: earn ${pointsNeeded} more total points.`);
    } else {
        alert(`${avatar.name} goal reached. Open P Shop to unlock.`);
    }
    setActiveTab("shop");
}

function getAvatarById(avatarId) {
    return AVATAR_CATALOG.find((entry) => entry.id === avatarId) || AVATAR_CATALOG[0];
}

function getTotalEarnedPoints() {
    return appState.history.reduce((sum, session) => sum + (Number(session.points) || 0), 0);
}

function getNextGoalAvatars(totalEarnedPoints) {
    const pool = AVATAR_CATALOG.filter((avatar) => avatar.id !== "mascot");
    const incomplete = pool.filter((avatar) => {
        const isOwned = appState.unlockedAvatars.includes(avatar.id);
        const reachedGoal = totalEarnedPoints >= avatar.cost;
        return !isOwned && !reachedGoal;
    });

    if (incomplete.length >= 2) {
        return incomplete.slice(0, 2);
    }

    if (incomplete.length === 1) {
        return [incomplete[0], null];
    }

    return [null, null];
}

function calculatePoints(distanceM, durationMs, didPoop) {
    const distancePoints = Math.round(distanceM / 100);
    const minutePoints = Math.floor(durationMs / 60000);
    const poopBonus = didPoop ? 2 : 0;
    return distancePoints + minutePoints + poopBonus;
}

function calculateMood(points, didPoop, noPoopStreak) {
    if (!didPoop && noPoopStreak > 1) {
        return "Check in";
    }
    if (points >= 20) {
        return "Great";
    }
    if (points >= 10) {
        return "Happy";
    }
    if (points >= 4) {
        return "Okay";
    }
    return "Low";
}

function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDistance(meters) {
    return `${(Math.max(0, meters) / 1000).toFixed(2)} km`;
}

function setText(element, value) {
    if (!element) {
        return;
    }
    element.textContent = value;
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!raw) {
            return createDefaultState();
        }

        const parsed = JSON.parse(raw);
        const defaults = createDefaultState();
        const history = Array.isArray(parsed.history) ? parsed.history : [];
        const fallbackPoints = history.reduce(
            (sum, session) => sum + (Number(session.points) || 0),
            0
        );
        const pointBalance = Number.isFinite(parsed.pointBalance)
            ? parsed.pointBalance
            : fallbackPoints;

        const unlocked = Array.isArray(parsed.unlockedAvatars)
            ? Array.from(new Set(["mascot", ...parsed.unlockedAvatars]))
            : ["mascot"];

        const currentAvatar = unlocked.includes(parsed.currentAvatar)
            ? parsed.currentAvatar
            : "mascot";

        return {
            bagCount: Number.isFinite(parsed.bagCount) ? parsed.bagCount : defaults.bagCount,
            noPoopStreak: Number.isFinite(parsed.noPoopStreak) ? parsed.noPoopStreak : defaults.noPoopStreak,
            history,
            pointBalance,
            unlockedAvatars: unlocked,
            currentAvatar
        };
    } catch (error) {
        console.error("Could not load app state:", error);
        return createDefaultState();
    }
}

function saveState(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error("Could not save app state:", error);
    }
}
