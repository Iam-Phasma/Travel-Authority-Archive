(function () {
    const PHILIPPINES_CENTER = [12.8797, 121.774];
    const DEFAULT_ZOOM = 6;
    const PICKED_ZOOM = 15;
    const SEARCH_RESULTS_LIMIT = 5;
    const LEAFLET_CSS_ID = 'header-draft-location-leaflet-css';
    const LEAFLET_SCRIPT_ID = 'header-draft-location-leaflet-script';
    const LEAFLET_CSS_HREF = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    const LEAFLET_SCRIPT_SRC = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

    let leafletPromise = null;
    let initialized = false;
    let domObserver = null;

    const uniqueParts = (parts) => {
        const seen = new Set();
        return parts.filter((part) => {
            const normalized = String(part || '').trim();
            if (!normalized) return false;
            const key = normalized.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };

    const buildDestinationFromAddress = (address) => {
        const barangay = address.barangay || address.suburb || address.village || address.neighbourhood || address.hamlet || address.quarter || '';
        const city = address.city || address.town || address.municipality || address.county || address.province || '';
        const region = address.region || address.state || address.state_district || address.province || '';
        const destinationParts = uniqueParts([barangay, city, region]);

        return {
            barangay,
            city,
            region,
            destinationText: destinationParts.join(', ')
        };
    };

    const ensureLeafletLoaded = () => {
        if (window.L) {
            return Promise.resolve(window.L);
        }

        if (leafletPromise) {
            return leafletPromise;
        }

        leafletPromise = new Promise((resolve, reject) => {
            if (!document.getElementById(LEAFLET_CSS_ID)) {
                const link = document.createElement('link');
                link.id = LEAFLET_CSS_ID;
                link.rel = 'stylesheet';
                link.href = LEAFLET_CSS_HREF;
                document.head.appendChild(link);
            }

            const existingScript = document.getElementById(LEAFLET_SCRIPT_ID);
            if (existingScript) {
                existingScript.addEventListener('load', () => resolve(window.L));
                existingScript.addEventListener('error', () => reject(new Error('Failed to load the map library.')));
                return;
            }

            const script = document.createElement('script');
            script.id = LEAFLET_SCRIPT_ID;
            script.src = LEAFLET_SCRIPT_SRC;
            script.async = true;
            script.onload = () => resolve(window.L);
            script.onerror = () => reject(new Error('Failed to load the map library.'));
            document.head.appendChild(script);
        });

        return leafletPromise;
    };

    const tryInitialize = () => {
        if (initialized) {
            return true;
        }

        const openButton = document.getElementById('header-draft-ta-open-map');
        const destinationInput = document.getElementById('header-draft-ta-destination');
        const draftModal = document.getElementById('header-draft-ta-modal');
        const mapModal = document.getElementById('header-draft-location-modal');
        const mapContainer = document.getElementById('header-draft-location-map');
        const statusElement = document.getElementById('header-draft-location-status');
        const previewElement = document.getElementById('header-draft-location-preview');
        const applyButton = document.getElementById('header-draft-location-apply');
        const cancelButton = document.getElementById('header-draft-location-cancel');
        const searchInput = document.getElementById('header-draft-location-search-input');
        const searchButton = document.getElementById('header-draft-location-search-button');
        const searchResults = document.getElementById('header-draft-location-search-results');
        const draftClearButton = document.getElementById('header-draft-ta-clear');
        const draftCloseButton = document.getElementById('header-draft-ta-close');

        if (!openButton || !destinationInput || !draftModal || !mapModal || !mapContainer || !statusElement || !previewElement || !applyButton || !cancelButton || !searchInput || !searchButton || !searchResults) {
            return false;
        }

        initialized = true;
        if (domObserver) {
            domObserver.disconnect();
            domObserver = null;
        }

        const state = {
            map: null,
            marker: null,
            selectedLocation: null,
            lookupId: 0,
            searchId: 0
        };

        const setStatus = (message, type) => {
            statusElement.textContent = message;
            if (type) {
                statusElement.dataset.state = type;
                return;
            }
            delete statusElement.dataset.state;
        };

        const updatePreview = (location) => {
            if (!location) {
                previewElement.textContent = 'No location selected yet.';
                applyButton.disabled = true;
                return;
            }

            previewElement.textContent = location.destinationText;
            applyButton.disabled = false;
        };

        const setSearchResultsHidden = (hidden) => {
            searchResults.hidden = hidden;
        };

        const clearSearchResults = () => {
            searchResults.innerHTML = '';
            setSearchResultsHidden(true);
        };

        const renderSearchResults = (results) => {
            if (!results.length) {
                searchResults.innerHTML = '<div class="header-draft-location-search-empty">No matching places found in the Philippines.</div>';
                setSearchResultsHidden(false);
                return;
            }

            searchResults.innerHTML = results.map((result, index) => {
                const address = result.address || {};
                const location = buildDestinationFromAddress(address);
                const title = location.destinationText || result.display_name || 'Unnamed location';
                const subtitle = result.display_name || title;
                return `
                    <button type="button" class="header-draft-location-search-result" data-index="${index}">
                        <span class="header-draft-location-search-result-title">${title}</span>
                        <span class="header-draft-location-search-result-subtitle">${subtitle}</span>
                    </button>
                `;
            }).join('');

            setSearchResultsHidden(false);

            searchResults.querySelectorAll('.header-draft-location-search-result').forEach((button) => {
                button.addEventListener('click', () => {
                    const index = Number(button.getAttribute('data-index'));
                    const result = results[index];
                    if (!result) {
                        return;
                    }

                    searchInput.value = result.display_name || searchInput.value;
                    clearSearchResults();
                    void setMapLocation({
                        lat: Number(result.lat),
                        lng: Number(result.lon)
                    }, PICKED_ZOOM);
                });
            });
        };

        const clearSelection = (options) => {
            const shouldClearInput = Boolean(options && options.clearInput);

            state.selectedLocation = null;
            state.lookupId += 1;
            if (state.marker && state.map) {
                state.map.removeLayer(state.marker);
                state.marker = null;
            }

            updatePreview(null);
            setStatus('Choose a point on the map or search for a place.');

            if (shouldClearInput) {
                destinationInput.value = '';
            }

            clearSearchResults();
        };

        const closeMapModal = () => {
            mapModal.classList.remove('show');
        };

        const placeMarker = (latlng) => {
            if (!state.map) return;

            if (!state.marker) {
                state.marker = window.L.marker(latlng, { draggable: false }).addTo(state.map);
                return;
            }

            state.marker.setLatLng(latlng);
        };

        const reverseGeocode = async (latlng) => {
            const lookupId = ++state.lookupId;
            setStatus('Looking up barangay, city, and region...', 'info');
            applyButton.disabled = true;

            const reverseUrl = new URL('https://nominatim.openstreetmap.org/reverse');
            reverseUrl.searchParams.set('format', 'jsonv2');
            reverseUrl.searchParams.set('lat', String(latlng.lat));
            reverseUrl.searchParams.set('lon', String(latlng.lng));
            reverseUrl.searchParams.set('addressdetails', '1');
            reverseUrl.searchParams.set('zoom', '18');

            try {
                const response = await fetch(reverseUrl.toString(), {
                    headers: {
                        Accept: 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error('The location lookup service is unavailable right now.');
                }

                const result = await response.json();
                if (lookupId !== state.lookupId) {
                    return;
                }

                const location = buildDestinationFromAddress(result.address || {});
                if (!location.destinationText) {
                    throw new Error('That pin did not return a barangay, city, and region. Try another point.');
                }

                state.selectedLocation = location;
                updatePreview(location);
                setStatus('Destination ready. Use This Destination to fill the field.', 'success');
            } catch (error) {
                if (lookupId !== state.lookupId) {
                    return;
                }

                state.selectedLocation = null;
                updatePreview(null);
                setStatus(error.message || 'Location lookup failed. Try another point.', 'error');
            }
        };

        const searchLocations = async () => {
            const query = searchInput.value.trim();
            if (!query) {
                clearSearchResults();
                setStatus('Enter a place name to search, or choose a point on the map.', 'info');
                return;
            }

            const searchId = ++state.searchId;
            setStatus('Searching places in the Philippines...', 'info');
            searchButton.disabled = true;

            const searchUrl = new URL('https://nominatim.openstreetmap.org/search');
            searchUrl.searchParams.set('format', 'jsonv2');
            searchUrl.searchParams.set('q', query);
            searchUrl.searchParams.set('addressdetails', '1');
            searchUrl.searchParams.set('countrycodes', 'ph');
            searchUrl.searchParams.set('limit', String(SEARCH_RESULTS_LIMIT));

            try {
                const response = await fetch(searchUrl.toString(), {
                    headers: {
                        Accept: 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error('The search service is unavailable right now.');
                }

                const results = await response.json();
                if (searchId !== state.searchId) {
                    return;
                }

                renderSearchResults(Array.isArray(results) ? results : []);
                setStatus('Search complete. Choose a result or drop a pin on the map.', 'success');
            } catch (error) {
                if (searchId !== state.searchId) {
                    return;
                }

                searchResults.innerHTML = `<div class="header-draft-location-search-empty">${error.message || 'Search failed. Try another keyword.'}</div>`;
                setSearchResultsHidden(false);
                setStatus(error.message || 'Search failed. Try another keyword.', 'error');
            } finally {
                if (searchId === state.searchId) {
                    searchButton.disabled = false;
                }
            }
        };

        const setMapLocation = async (latlng, zoom) => {
            if (!state.map) return;

            placeMarker(latlng);
            state.map.setView(latlng, zoom || Math.max(state.map.getZoom(), PICKED_ZOOM));
            await reverseGeocode(latlng);
        };

        const ensureMap = async () => {
            setStatus('Loading map...', 'info');
            await ensureLeafletLoaded();

            if (!state.map) {
                state.map = window.L.map(mapContainer, {
                    zoomControl: true,
                    attributionControl: true
                }).setView(PHILIPPINES_CENTER, DEFAULT_ZOOM);

                window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '&copy; OpenStreetMap contributors'
                }).addTo(state.map);

                state.map.on('click', (event) => {
                    void setMapLocation(event.latlng);
                });
            }

            window.requestAnimationFrame(() => {
                state.map.invalidateSize();
            });

            setStatus('Choose a point on the map or search for a place.');
        };

        const openMapModal = async () => {
            mapModal.classList.add('show');
            document.body.classList.add('header-modal-open');
            updatePreview(state.selectedLocation);
            setStatus('Loading map...', 'info');

            try {
                await ensureMap();
                window.requestAnimationFrame(() => {
                    searchInput.focus();
                });
            } catch (error) {
                setStatus(error.message || 'Failed to load the map.', 'error');
            }
        };

        openButton.addEventListener('click', () => {
            void openMapModal();
        });

        cancelButton.addEventListener('click', closeMapModal);

        mapModal.addEventListener('click', (event) => {
            if (event.target === mapModal) {
                closeMapModal();
            }
        });

        applyButton.addEventListener('click', () => {
            if (!state.selectedLocation) {
                return;
            }

            destinationInput.value = state.selectedLocation.destinationText;
            destinationInput.dispatchEvent(new Event('input', { bubbles: true }));
            destinationInput.dispatchEvent(new Event('change', { bubbles: true }));
            closeMapModal();
        });

        searchButton.addEventListener('click', () => {
            void searchLocations();
        });

        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void searchLocations();
            }
        });

        searchInput.addEventListener('input', () => {
            if (!searchInput.value.trim()) {
                clearSearchResults();
            }
        });

        if (draftClearButton) {
            draftClearButton.addEventListener('click', () => {
                closeMapModal();
                clearSelection({ clearInput: true });
            });
        }

        if (draftCloseButton) {
            draftCloseButton.addEventListener('click', () => {
                closeMapModal();
                clearSelection({ clearInput: true });
            });
        }

        draftModal.addEventListener('click', (event) => {
            if (event.target === draftModal) {
                closeMapModal();
                clearSelection({ clearInput: true });
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') {
                return;
            }

            if (mapModal.classList.contains('show')) {
                event.preventDefault();
                event.stopPropagation();
                closeMapModal();
            }
        }, true);

        updatePreview(null);
        setStatus('Choose a point on the map or search for a place.');

        return true;
    };

    const watchForHeader = () => {
        if (tryInitialize()) {
            return;
        }

        if (domObserver) {
            return;
        }

        domObserver = new MutationObserver(() => {
            tryInitialize();
        });

        const observerTarget = document.body || document.documentElement;
        if (observerTarget) {
            domObserver.observe(observerTarget, { childList: true, subtree: true });
        }
    };

    window.initDraftLocationPicker = tryInitialize;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchForHeader, { once: true });
    } else {
        watchForHeader();
    }
})();