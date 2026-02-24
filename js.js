// Toggle the primary walk state from the main CTA button.
const walkToggle = document.getElementById('walkToggle');
const walkState = document.getElementById('walkState');

let walkActive = false;

if (walkToggle && walkState) {
    walkToggle.addEventListener('click', () => {
        walkActive = !walkActive;
        walkState.textContent = walkActive ? 'Walking' : 'Ready';
        walkToggle.textContent = walkActive ? 'End Walk' : 'Start Walk';
        document.body.classList.toggle('walking', walkActive);
    });
}

// Initialize the map once Leaflet is loaded.
const map = L.map('map', { zoomControl: false }).setView([55.6761, 12.5683], 14);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

L.marker([55.6761, 12.5683]).addTo(map)
    .bindPopup('Copenhagen')
    .openPopup();

// Prevent rendering glitches when the map is in a freshly animated container.
setTimeout(() => map.invalidateSize(), 120);
