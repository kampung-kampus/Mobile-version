// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Global variables
    let timestampDiv;
    let legendControl;
    let currentViewMode = 'polyline';
    let heatmapLayer = null;
    let viewToggleButton = null;
    let errorControl = null;

    // Initialize map centered on Woodlands Checkpoint
    const map = L.map('map').setView([1.445, 103.768], 15);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    // Speed band color logic - 4 bands
    function getColor(speedBand) {
        if (speedBand === 1) {
            return '#ab1121'; // Red: 0-10 km/h
        } else if (speedBand === 2 || speedBand === 3) {
            return '#f27e57'; // Orange: 11-30 km/h
        } else if (speedBand === 4 || speedBand === 5) {
            return '#fafaa2'; // Yellow: 31-50 km/h
        } else if (speedBand === 6 || speedBand === 7) {
            return '#82e681'; // Green: >51 km/h
        } else {
            return '#999'; // Default gray
        }
    }

    // Modular Traffic Layer Refresh
    let polylineLayerGroup = L.layerGroup();
    let heatmapLayerGroup = L.layerGroup();

    // Add initial layer based on current view mode
    if (currentViewMode === 'polyline') {
        polylineLayerGroup.addTo(map);
    } else {
        heatmapLayerGroup.addTo(map);
    }

    function updateTimestamp() {
        if (timestampDiv) {
            const now = new Date();
            timestampDiv.innerHTML = `Last updated: ${now.toLocaleString('en-SG', { hour12: false })}`;
        }
    }

    function showLoadingMessage() {
        hideErrorMessage();
        errorControl = L.control({ position: 'topcenter' });
        errorControl.onAdd = function() {
            const div = L.DomUtil.create('div', 'loading-message');
            div.innerHTML = '<strong>Loading:</strong> Fetching latest traffic data...';
            return div;
        };
        errorControl.addTo(map);
    }

    function showErrorMessage(message = 'Unable to load traffic data. Please check your connection or try again later.') {
        hideErrorMessage();
        errorControl = L.control({ position: 'topcenter' });
        errorControl.onAdd = function() {
            const div = L.DomUtil.create('div', 'error-message');
            div.innerHTML = `<strong>Connection Issue:</strong> ${message}`;
            return div;
        };
        errorControl.addTo(map);
        
        // Remove after 10 seconds
        setTimeout(() => {
            hideErrorMessage();
        }, 10000);
    }

    function hideErrorMessage() {
        if (errorControl) {
            map.removeControl(errorControl);
            errorControl = null;
        }
    }

 function loadTrafficData() {
    showLoadingMessage();
    updateTimestamp();

    const apiKey = "325y4IwcQU+mqCX5P+D01g==";
    const targetUrl = 'https://datamall2.mytransport.sg/ltaodataservice/TrafficSpeedBands';

    // Try direct fetch first (might work on some servers)
    fetch(targetUrl, {
        headers: {
            'AccountKey': apiKey,
            'accept': 'application/json'
        },
        mode: 'cors'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        hideErrorMessage();
        console.log('Direct fetch successful!');
        processTrafficData(data);
    })
    .catch(directError => {
        console.log('Direct fetch failed, trying CORS proxy:', directError.message);
        
        // Fallback to CORS proxy
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        const fullUrl = proxyUrl + encodeURIComponent(targetUrl);
        
        fetch(fullUrl, {
            headers: {
                'AccountKey': apiKey,
                'accept': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            hideErrorMessage();
            console.log('CORS proxy successful!');
            processTrafficData(data);
        })
        .catch(proxyError => {
            console.error('CORS proxy also failed:', proxyError);
            showErrorMessage('Unable to load traffic data due to CORS restrictions. Please try running this from a local server.');
            updateTimestamp();
        });
    });
}

    // Extract data processing into separate function for reuse
    function processTrafficData(data) {
        console.log('Traffic data received:', data.value ? data.value.length : 0, 'segments');
        
        // Clear both layers
        polylineLayerGroup.clearLayers();
        heatmapLayerGroup.clearLayers();
        
        const heatPoints = [];
        let segmentCount = 0;

        // Check if data has the expected structure
        if (!data.value || !Array.isArray(data.value)) {
            console.error('Unexpected data structure:', data);
            showErrorMessage('Received invalid data format from server.');
            return;
        }

        data.value.forEach(segment => {
            const lat1 = parseFloat(segment.StartLat);
            const lon1 = parseFloat(segment.StartLon);
            const lat2 = parseFloat(segment.EndLat);
            const lon2 = parseFloat(segment.EndLon);

            // Filter for causeway area
            if (lat1 > 1.44 && lat1 < 1.446 && lon1 > 103.765 && lon1 < 103.77) {
                segmentCount++;
                
                // Add polyline to polyline layer group
                L.polyline([[lat1, lon1], [lat2, lon2]], {
                    color: getColor(segment.SpeedBand),
                    weight: 6,
                    opacity: 0.8
                }).bindPopup(`
                    <strong>${segment.RoadName}</strong><br>
                    Speed: ${segment.MinimumSpeed}–${segment.MaximumSpeed} km/h<br>
                    Speed Band: ${segment.SpeedBand}
                `).addTo(polylineLayerGroup);

                // Add heat point with higher intensity for better visibility
                const intensity = (8 - segment.SpeedBand) * 0.3;
                heatPoints.push([lat1, lon1, intensity]);
            }
        });

        console.log('Segments in view area:', segmentCount);
        console.log('Heat points created:', heatPoints.length);

        // Create heatmap layer
        if (heatPoints.length > 0) {
            // Remove old heatmap layer if it exists
            if (heatmapLayer) {
                heatmapLayerGroup.removeLayer(heatmapLayer);
            }
            
            // Create new heatmap layer with enhanced visibility
            heatmapLayer = L.heatLayer(heatPoints, {
                radius: 40,
                blur: 20,
                maxZoom: 17,
                minOpacity: 0.3
            });
            
            heatmapLayerGroup.addLayer(heatmapLayer);
            console.log('Heatmap layer created');
        } else {
            console.warn('No heat points to display');
        }
        
        // Update view based on current mode
        updateViewMode();
    }

    // Refresh every 60 seconds
    setInterval(() => {
        loadTrafficData();
    }, 60000);

    // Add legend - 4 speed bands
    legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        div.id = 'legend-box';
        const speedBands = [
            { label: '0–10 km/h', color: '#ab1121' },
            { label: '11–30 km/h', color: '#f27e57' },
            { label: '31–50 km/h', color: '#fafaa2' },
            { label: '>51 km/h', color: '#82e681' }
        ];
        const labels = speedBands.map(band => {
            return `<i style="background:${band.color}; width:18px; height:18px; display:inline-block; margin-right:8px; border:1px solid #ccc;"></i>${band.label}`;
        });
        div.innerHTML = `<strong>Speed Bands</strong><br>${labels.join('<br>')}`;
        return div;
    };
    legendControl.addTo(map);

    // Add checkpoint markers
    L.marker([1.445, 103.768]).addTo(map).bindPopup("Woodlands Checkpoint");
    L.marker([1.462, 103.763]).addTo(map).bindPopup("Johor Bahru CIQ");

    // Add legend toggle button
    const legendToggle = L.control({ position: 'topright' });
    legendToggle.onAdd = function () {
        const div = L.DomUtil.create('div', 'info');
        div.innerHTML = '<button onclick="toggleLegend()">Toggle Legend</button>';
        return div;
    };
    legendToggle.addTo(map);

    // Add view toggle button (heatmap/polyline)
    const viewToggle = L.control({ position: 'topright' });
    viewToggle.onAdd = function () {
        const div = L.DomUtil.create('div', 'info');
        viewToggleButton = document.createElement('button');
        viewToggleButton.innerHTML = currentViewMode === 'polyline' ? 'Show Heatmap' : 'Show Polylines';
        viewToggleButton.style.cssText = 'padding: 6px 12px; font-size: 13px; border: none; background-color: #28a745; color: white; border-radius: 4px; cursor: pointer; margin-top: 5px; width: 100%;';
        viewToggleButton.onmouseover = function() { this.style.backgroundColor = '#218838'; };
        viewToggleButton.onmouseout = function() { this.style.backgroundColor = '#28a745'; };
        viewToggleButton.onclick = toggleViewMode;
        div.appendChild(viewToggleButton);
        return div;
    };
    viewToggle.addTo(map);

    // Add timestamp control
    const timestampControl = L.control({ position: 'bottomleft' });
    timestampControl.onAdd = function () {
        timestampDiv = L.DomUtil.create('div', 'info legend');
        timestampDiv.id = 'map-timestamp';
        const now = new Date();
        timestampDiv.innerHTML = `Last updated: ${now.toLocaleString('en-SG', { hour12: false })}`;
        return timestampDiv;
    };
    timestampControl.addTo(map);

    // Make toggleLegend function globally available
    window.toggleLegend = function() {
        const legendDiv = document.getElementById('legend-box');
        if (legendDiv) {
            const container = legendDiv.parentElement;
            if (container) {
                if (container.style.display === 'none') {
                    container.style.display = '';
                } else {
                    container.style.display = 'none';
                }
            }
        }
    };
    
    function toggleViewMode() {
        currentViewMode = currentViewMode === 'polyline' ? 'heatmap' : 'polyline';
        console.log('Toggling to:', currentViewMode);
        
        updateViewMode();
        
        if (viewToggleButton) {
            viewToggleButton.innerHTML = currentViewMode === 'polyline' ? 'Show Heatmap' : 'Show Polylines';
        }
    }
    
    function updateViewMode() {
        if (currentViewMode === 'polyline') {
            if (map.hasLayer(heatmapLayerGroup)) {
                map.removeLayer(heatmapLayerGroup);
            }
            if (!map.hasLayer(polylineLayerGroup)) {
                polylineLayerGroup.addTo(map);
            }
        } else {
            if (map.hasLayer(polylineLayerGroup)) {
                map.removeLayer(polylineLayerGroup);
            }
            if (!map.hasLayer(heatmapLayerGroup)) {
                heatmapLayerGroup.addTo(map);
            }
        }
    }

    // Initial load
    setTimeout(loadTrafficData, 100);
});
