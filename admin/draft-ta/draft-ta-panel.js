/**
 * Draft TA Panel — shared initializer for both dashboard and admin.
 * Call window.initDraftTaPanel(supabase) after the panel HTML is in the DOM.
 */
window.initDraftTaPanel = (supabase) => {
    const purposeInput       = document.getElementById('panel-draft-ta-purpose');
    const destinationInput   = document.getElementById('panel-draft-ta-destination');
    const destinationQuality = document.getElementById('panel-draft-ta-destination-quality');
    const travelTypeSelect   = document.getElementById('panel-draft-ta-travel-type');
    const fundingOptionSelect= document.getElementById('panel-draft-ta-funding-option');
    const dateRequestInput   = document.getElementById('panel-draft-ta-date-request');
    const travelDateInput    = document.getElementById('panel-draft-ta-travel-date');
    const travelEndInput     = document.getElementById('panel-draft-ta-travel-end');
    const officialsDisplay   = document.getElementById('panel-draft-ta-officials-display');
    const officialsDropdown  = document.getElementById('panel-draft-ta-officials-dropdown');
    const officialsSearch    = document.getElementById('panel-draft-ta-officials-search');
    const officialsOptions   = document.getElementById('panel-draft-ta-officials-options');
    const officialsCountIndicator = document.getElementById('panel-draft-ta-officials-count');
    const officialsSelectAll = document.getElementById('panel-draft-ta-officials-select-all');
    const officialsClearAll   = document.getElementById('panel-draft-ta-officials-clear-all');
    const clearBtn           = document.getElementById('panel-draft-ta-clear');
    const createBtn          = document.getElementById('panel-draft-ta-create');
    const isoControlInput    = document.getElementById('panel-draft-ta-iso-control');
    const mapPickBtn         = document.getElementById('panel-draft-ta-map-pick');

    if (!purposeInput) return; // panel not in DOM yet

    let employeesList = [];
    let selectedEmployees = [];
    let multiSelect = null;
    let panelInitialized = false;

    const getTodayLocalISO = () => {
        const now = new Date();
        return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    };

    const updateDestinationQuality = () => {
        if (!destinationQuality) return;

        const destination = destinationInput?.value.trim() || '';
        if (!destination) {
            destinationQuality.hidden = true;
            return;
        }

        const hasAdministrativeTerm = /\b(province|city|municipality|barangay|region|district|ncr|barmm|metro manila)\b/i.test(destination);
        const hasKnownProvince = /\b(cavite|laguna|batangas|rizal|quezon)\b/i.test(destination);
        const hasAdministrativeDetail = hasAdministrativeTerm || hasKnownProvince;

        destinationQuality.textContent = hasAdministrativeDetail
            ? 'Administrative location detail detected.'
            : 'Consider adding a city or municipality and province or region.';
        destinationQuality.classList.toggle('is-complete', hasAdministrativeDetail);
        destinationQuality.hidden = false;
    };

    const uniqueDestinationParts = (parts) => {
        const seen = new Set();
        return parts.filter((part) => {
            const value = String(part || '').trim();
            if (!value || seen.has(value.toLowerCase())) return false;
            seen.add(value.toLowerCase());
            return true;
        });
    };

    const formatMapDestination = (address, displayName) => {
        const barangay = address.barangay || address.suburb || address.village || address.neighbourhood || address.hamlet || address.quarter || '';
        const city = address.city || address.municipality || address.town || '';
        const region = address.region || address.state || '';
        const province = address.province || address.county || address.state_district || deriveProvinceFromDisplayName(displayName, { barangay, city, region });

        return uniqueDestinationParts([barangay, city, province, region]).join(', ');
    };

    const deriveProvinceFromDisplayName = (displayName, context) => {
        const parts = String(displayName || '').split(',').map((part) => part.trim()).filter(Boolean);
        const contextParts = new Set(Object.values(context).map((part) => String(part || '').trim().toLowerCase()).filter(Boolean));
        const cityIndex = parts.findIndex((part) => part.toLowerCase() === String(context.city || '').trim().toLowerCase());

        if (cityIndex > -1) {
            for (let index = cityIndex + 1; index < parts.length; index += 1) {
                const candidate = parts[index];
                const normalized = candidate.toLowerCase();
                if (!contextParts.has(normalized) && normalized !== 'philippines' && normalized !== 'pilipinas' && !/^[0-9\-]+$/.test(normalized)) {
                    return candidate;
                }
            }
        }

        const regionIndex = parts.findIndex((part) => part.toLowerCase() === String(context.region || '').trim().toLowerCase());
        if (regionIndex > 0) {
            const candidate = parts[regionIndex - 1];
            if (!contextParts.has(candidate.toLowerCase())) return candidate;
        }

        return '';
    };

    const escapeHtml = (str) => {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str ?? '')));
        return div.innerHTML;
    };

    const draftTaStorageKey = `draftTaPanelState:${document.getElementById('dash-draft-ta-panel') ? 'dashboard' : 'admin'}`;

    const persistDraftTaState = () => {
        const state = {
            purpose: purposeInput?.value || '',
            destination: destinationInput?.value || '',
            travelType: travelTypeSelect?.value || '',
            fundingOption: fundingOptionSelect?.value || '',
            dateRequested: dateRequestInput?.value || '',
            travelDate: travelDateInput?.value || '',
            travelEnd: travelEndInput?.value || '',
            isoControlNo: isoControlInput?.value || '',
            officials: selectedEmployees.slice(),
        };

        try {
            sessionStorage.setItem(draftTaStorageKey, JSON.stringify(state));
        } catch (error) {
            console.warn('Draft TA panel: unable to persist form state', error);
        }
    };

    const restoreDraftTaState = () => {
        try {
            const raw = sessionStorage.getItem(draftTaStorageKey);
            if (!raw) return;

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;

            if (purposeInput && typeof parsed.purpose === 'string') purposeInput.value = parsed.purpose;
            if (destinationInput && typeof parsed.destination === 'string') destinationInput.value = parsed.destination;
            if (travelTypeSelect && typeof parsed.travelType === 'string') travelTypeSelect.value = parsed.travelType;
            if (fundingOptionSelect && typeof parsed.fundingOption === 'string') fundingOptionSelect.value = parsed.fundingOption;
            if (isoControlInput && typeof parsed.isoControlNo === 'string') isoControlInput.value = parsed.isoControlNo;

            if (dateRequestInput?.value === '' && typeof parsed.dateRequested === 'string' && parsed.dateRequested) {
                dateRequestInput.value = parsed.dateRequested;
            }

            if (travelDateInput?.value === '' && typeof parsed.travelDate === 'string' && parsed.travelDate) {
                travelDateInput.value = parsed.travelDate;
            }
            if (travelEndInput?.value === '' && typeof parsed.travelEnd === 'string' && parsed.travelEnd) {
                travelEndInput.value = parsed.travelEnd;
            }

            if (Array.isArray(parsed.officials)) {
                selectedEmployees = parsed.officials.slice();
            }

            if (dateRequestInput?._flatpickr && typeof parsed.dateRequested === 'string' && parsed.dateRequested) {
                dateRequestInput._flatpickr.setDate(parsed.dateRequested, true);
            }
            if (travelDateInput?._flatpickr && typeof parsed.travelDate === 'string' && parsed.travelDate) {
                travelDateInput._flatpickr.setDate(parsed.travelDate, true);
            }
            if (travelEndInput?._flatpickr && typeof parsed.travelEnd === 'string' && parsed.travelEnd) {
                travelEndInput._flatpickr.setDate(parsed.travelEnd, true);
            }

            validateDates();
            multiSelect?.updateDisplay();
            multiSelect?.renderOptions();
        } catch (error) {
            console.warn('Draft TA panel: unable to restore form state', error);
        }
    };

    const clearStoredDraftTaState = () => {
        try {
            sessionStorage.removeItem(draftTaStorageKey);
        } catch (error) {
            console.warn('Draft TA panel: unable to clear form state', error);
        }
    };

    const requiredFieldConfigs = [
        {
            label: 'Purpose',
            isMissing: () => !purposeInput?.value.trim(),
            focus: () => purposeInput?.focus(),
            errorTarget: purposeInput?.closest('.input-wrap') || purposeInput,
            input: purposeInput,
        },
        {
            label: 'Destination',
            isMissing: () => !destinationInput?.value.trim(),
            focus: () => destinationInput?.focus(),
            errorTarget: destinationInput?.closest('.input-wrap') || destinationInput,
            input: destinationInput,
        },
        {
            label: 'Travel Date',
            isMissing: () => !travelDateInput?.value,
            focus: () => travelDateInput?.focus(),
            errorTarget: travelDateInput?.closest('.input-wrap') || travelDateInput,
            input: travelDateInput,
        },
        {
            label: 'Officials',
            isMissing: () => selectedEmployees.length === 0,
            focus: () => officialsDisplay?.focus(),
            errorTarget: officialsDisplay,
            input: officialsDisplay,
        },
    ];

    const getMissingRequiredFields = (focusFirstMissing = false) => {
        const missingConfigs = requiredFieldConfigs.filter((config) => config.isMissing());

        if (focusFirstMissing) {
            missingConfigs[0]?.focus();
        }

        return missingConfigs;
    };

    const showRequiredFieldsWarning = (missingConfigs) => {
        const message = `Please complete the following required fields:\n\n${missingConfigs.map((config) => `- ${config.label}`).join('\n')}`;
        if (window.showAppAlert) {
            void window.showAppAlert('Complete Required Fields', message);
            return;
        }
        alert(message);
    };

    // ── Officials multiselect ──────────────────────────────────────────────
    const createMultiSelect = () => {
        if (!officialsDisplay || !officialsDropdown || !officialsSearch || !officialsOptions) return null;

        const selectAllAddIcon = `
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12h4m-2 2v-4M4 18v-1a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Zm8-10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
            </svg>`;

        // persisted CHED-only toggle
        let chedOnly = localStorage.getItem('draftTaChedOnly') === '1';
        const settingsBtn = document.getElementById('panel-draft-ta-officials-settings-btn');
        let settingsPanel = null;

        const closeDropdown = () => {
            officialsSearch.value = '';
            officialsDropdown.classList.remove('show');
            if (settingsPanel) settingsPanel.classList.remove('open');
        };

        const updateDisplay = () => {
            if (selectedEmployees.length === 0) {
                officialsDisplay.innerHTML = '<span class="multiselect-placeholder">Select officials...</span>';
                if (officialsCountIndicator) officialsCountIndicator.innerHTML = '<em>0 selected</em>';
                return;
            }
            if (officialsCountIndicator) {
                const count = selectedEmployees.length;
                officialsCountIndicator.innerHTML = `<em>${count} selected</em>`;
            }
            officialsDisplay.innerHTML = selectedEmployees.map(name =>
                `<span class="multiselect-tag">${escapeHtml(name)}<button type="button" class="multiselect-remove" data-name="${escapeHtml(name)}">&times;</button></span>`
            ).join('');
            officialsDisplay.querySelectorAll('.multiselect-remove').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const idx = selectedEmployees.indexOf(btn.getAttribute('data-name'));
                    if (idx > -1) { selectedEmployees.splice(idx, 1); updateDisplay(); renderOptions(); persistDraftTaState(); }
                });
            });
        };

        const getFilteredEmployees = () => {
            const term = officialsSearch.value.toLowerCase();
            return employeesList.filter(emp => {
                if (chedOnly) {
                    const office = String(emp.office || '').trim().toLowerCase();
                    if (office !== 'ched') return false;
                }
                return emp.name.toLowerCase().includes(term);
            });
        };

        const updateSelectAllButtonState = () => {
            if (!officialsSelectAll) return;
            const filtered = getFilteredEmployees();
            const hasFiltered = filtered.length > 0;
            const allFilteredSelected = hasFiltered && filtered.every((emp) => selectedEmployees.includes(emp.name));
            const shouldDisable = !hasFiltered || allFilteredSelected;
            officialsSelectAll.disabled = shouldDisable;
            officialsSelectAll.title = allFilteredSelected ? 'All listed officials already selected' : 'Add all listed';
            officialsSelectAll.setAttribute('aria-label', allFilteredSelected ? 'All listed officials already selected' : 'Add all listed officials');
            officialsSelectAll.innerHTML = selectAllAddIcon;
        };

        const renderOptions = () => {
            const term = officialsSearch.value.toLowerCase();
            const filtered = getFilteredEmployees();

            if (filtered.length === 0) {
                if (term.trim()) {
                    officialsOptions.innerHTML = `
                        <div class="multiselect-no-options">
                            No matching officials found<br>
                            <button type="button" class="multiselect-add-btn">Add "${escapeHtml(officialsSearch.value.trim())}"</button>
                        </div>`;
                    const addBtn = officialsOptions.querySelector('.multiselect-add-btn');
                    if (addBtn) {
                        addBtn.addEventListener('click', e => {
                            e.stopPropagation();
                            const nameToAdd = officialsSearch.value.trim();
                            if (!nameToAdd) return;
                            const namePattern = /^[a-zA-ZÀ-ÿ\s\-'.,]+$/;
                            if (!namePattern.test(nameToAdd)) { alert('Only letters, spaces, hyphens, apostrophes, periods, and commas are allowed.'); return; }
                            if (nameToAdd.length > 30) { alert('Official name cannot exceed 30 characters.'); return; }
                            const existing = employeesList.find(emp => emp.name.toLowerCase() === nameToAdd.toLowerCase());
                            const resolvedName = existing ? existing.name : nameToAdd;
                            if (!selectedEmployees.includes(resolvedName)) selectedEmployees.push(resolvedName);
                            officialsSearch.value = '';
                            updateDisplay(); renderOptions(); persistDraftTaState();
                        });
                    }
                } else {
                    officialsOptions.innerHTML = '<div class="multiselect-no-options">No officials available</div>';
                }
                return;
            }

            officialsOptions.innerHTML = filtered.map(emp => {
                const inactiveClass = emp.is_active === false ? ' inactive-employee' : '';
                const inactiveLabel = emp.is_active === false ? ' <span class="inactive-label">(Inactive)</span>' : '';
                const checked = selectedEmployees.includes(emp.name) ? ' checked' : '';
                return `
                    <div class="multiselect-option${inactiveClass}" data-name="${escapeHtml(emp.name)}">
                        <label class="multiselect-checkbox-label">
                            <input type="checkbox" class="multiselect-option-checkbox" data-name="${escapeHtml(emp.name)}"${checked}>
                            <span class="multiselect-option-name">${escapeHtml(emp.name)}${inactiveLabel}</span>
                        </label>
                    </div>`;
            }).join('');

            updateSelectAllButtonState();

            // checkbox handlers: update selection on change
            officialsOptions.querySelectorAll('.multiselect-option-checkbox').forEach(cb => {
                cb.addEventListener('change', () => {
                    const name = cb.getAttribute('data-name');
                    if (cb.checked) {
                        if (!selectedEmployees.includes(name)) selectedEmployees.push(name);
                    } else {
                        const idx = selectedEmployees.indexOf(name);
                        if (idx > -1) selectedEmployees.splice(idx, 1);
                    }
                    officialsSearch.value = '';
                    updateDisplay();
                    renderOptions();
                    persistDraftTaState();
                });
            });

            // clicking an option toggles its checkbox (so row/name clicks select too)
            officialsOptions.querySelectorAll('.multiselect-option').forEach(opt => {
                opt.addEventListener('click', e => {
                    e.stopPropagation();
                    const cb = opt.querySelector('.multiselect-option-checkbox');
                    if (cb) {
                        cb.checked = !cb.checked;
                        cb.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        const name = opt.getAttribute('data-name');
                        if (!selectedEmployees.includes(name)) selectedEmployees.push(name);
                        else {
                            const idx = selectedEmployees.indexOf(name);
                            if (idx > -1) selectedEmployees.splice(idx, 1);
                        }
                        officialsSearch.value = '';
                        updateDisplay();
                        renderOptions();
                        persistDraftTaState();
                    }
                });
            });
        };

        officialsDisplay.addEventListener('click', async e => {
            e.stopPropagation();
            if (officialsDropdown.classList.contains('show')) { closeDropdown(); return; }
            officialsDropdown.classList.add('show');
            renderOptions();
            officialsSearch.focus();
        });

        officialsSearch.addEventListener('input', renderOptions);
        officialsSearch.addEventListener('click', e => e.stopPropagation());

        officialsSelectAll?.addEventListener('click', (e) => {
            e.stopPropagation();
            const filtered = getFilteredEmployees();
            if (filtered.length === 0) return;

            let changed = false;

            filtered.forEach((emp) => {
                if (!selectedEmployees.includes(emp.name)) {
                    selectedEmployees.push(emp.name);
                    changed = true;
                }
            });

            if (changed) {
                updateDisplay();
                renderOptions();
                persistDraftTaState();
            }
            updateSelectAllButtonState();
            officialsSearch.focus();
        });

        // Clear All button: remove all selected employees
        officialsClearAll?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (selectedEmployees.length === 0) return;
            selectedEmployees.length = 0;
            updateDisplay();
            renderOptions();
            persistDraftTaState();
            officialsSearch.focus();
        });

        document.addEventListener('click', e => {
            if (!officialsDropdown.contains(e.target) && e.target !== officialsDisplay) closeDropdown();
        });

        // Settings panel (CHED-only) wiring
        const createSettingsPanel = () => {
            if (settingsPanel) return settingsPanel;
            settingsPanel = document.createElement('div');
            settingsPanel.className = 'multiselect-settings-panel';
            settingsPanel.innerHTML = `
                <div class="settings-list">
                    <div class="settings-toggle-item">
                        <label class="settings-toggle-label">
                            <input type="checkbox" id="panel-draft-ta-ched-only-toggle" ${chedOnly ? 'checked' : ''}>
                            <div class="settings-toggle-ui"></div>
                            <div class="settings-toggle-text">
                                <div>Filter CHED officials</div>
                                <div class="settings-sub">Only show CHED-affiliated officials</div>
                            </div>
                        </label>
                    </div>
                </div>`;
            officialsDropdown.appendChild(settingsPanel);

            const toggle = settingsPanel.querySelector('#panel-draft-ta-ched-only-toggle');
            toggle.addEventListener('change', () => {
                chedOnly = !!toggle.checked;
                localStorage.setItem('draftTaChedOnly', chedOnly ? '1' : '0');
                renderOptions();
            });
            return settingsPanel;
        };

        settingsBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!settingsPanel) createSettingsPanel();
            settingsPanel.classList.toggle('open');
        });

        return { updateDisplay, renderOptions, closeDropdown };
    };

    // ── Load employees ─────────────────────────────────────────────────────
    const loadEmployees = async () => {
        try {
            const { data, error } = await supabase
                .from('employee_list')
                .select('name, position, is_active, office')
                .order('is_active', { ascending: false })
                .order('name', { ascending: true });
            if (!error) employeesList = data || [];
        } catch (e) {
            console.error('Draft TA panel: failed to load officials', e);
        }
    };

    // ── Date helpers ───────────────────────────────────────────────────────
    const flatpickrOpts = {
        dateFormat: 'Y-m-d',
        allowInput: false,
        disableMobile: true,
        static: false,
        monthSelectorType: 'static',
        position: 'auto center'
    };

    const setDateDefault = () => {
        if (dateRequestInput?._flatpickr && !dateRequestInput.value) {
            dateRequestInput._flatpickr.setDate(new Date(), true);
        }
    };

    const validateDates = () => {
        const travelDate = travelDateInput?.value;
        const travelEnd = travelEndInput?.value;
        return !(travelDate && travelEnd && travelEnd < travelDate);
    };

    travelDateInput?.addEventListener('change', validateDates);
    travelEndInput?.addEventListener('change', validateDates);

    // ── Clear ──────────────────────────────────────────────────────────────
    const clearForm = () => {
        if (purposeInput)       purposeInput.value = '';
        if (destinationInput)   destinationInput.value = '';
        if (travelTypeSelect)   travelTypeSelect.value = 'official_business';
        if (fundingOptionSelect) fundingOptionSelect.value = 'reimbursement';
        if (isoControlInput)    isoControlInput.value = 'AD-HRS-F010-01';
        if (dateRequestInput?._flatpickr) dateRequestInput._flatpickr.setDate(new Date(), true);
        else if (dateRequestInput) dateRequestInput.value = getTodayLocalISO();
        if (travelDateInput?._flatpickr)  travelDateInput._flatpickr.clear();
        if (travelEndInput?._flatpickr)   { travelEndInput._flatpickr.clear(); }
        selectedEmployees.length = 0;
        multiSelect?.updateDisplay();
        clearStoredDraftTaState();
        updateDestinationQuality();
        purposeInput?.focus();
    };

    clearBtn?.addEventListener('click', clearForm);

    // ── Map picker ──────────────────────────────────────────────────────
    const openMapPicker = () => {
        const old = document.getElementById('draft-ta-map-modal');
        if (old) old.remove();

        const modal = document.createElement('div');
        modal.id = 'draft-ta-map-modal';
        modal.className = 'map-picker-modal';
        modal.innerHTML = `
            <div class="map-picker-backdrop"></div>
            <div class="map-picker-dialog">
                <div class="map-picker-header">
                    <div class="map-picker-heading">
                        <h3>Pick Destination</h3>
                        <p class="map-picker-hint">Click anywhere on the map to pin your destination.</p>
                    </div>
                    <div class="map-picker-search">
                        <div class="map-picker-search-input-wrap">
                            <input id="draft-ta-map-search" class="map-picker-search-input" type="search" placeholder="Search destination" aria-label="Search for a destination" autocomplete="off">
                            <button id="draft-ta-map-search-clear" class="map-picker-search-clear" type="button" aria-label="Clear destination search" title="Clear destination search" hidden>
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>
                            </button>
                        </div>
                        <div id="draft-ta-map-search-results" class="map-picker-search-results" hidden></div>
                    </div>
                </div>
                <div id="draft-ta-leaflet-map" class="map-picker-map"></div>
                <div class="map-picker-footer">
                    <span class="map-picker-selected" id="draft-ta-map-selected">No location selected</span>
                    <div class="map-picker-actions">
                        <button type="button" class="modal-btn cancel" id="draft-ta-map-cancel">Cancel</button>
                        <button type="button" class="modal-btn confirm" id="draft-ta-map-confirm" disabled style="background:#081430;">Use Location</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        let leafletMap = null;
        let marker = null;
        let selectedLocation = null;
        let searchTimer = null;
        let searchRequestId = 0;

        const searchInput = document.getElementById('draft-ta-map-search');
        const searchClearButton = document.getElementById('draft-ta-map-search-clear');
        const searchPanel = modal.querySelector('.map-picker-search');
        const searchResults = document.getElementById('draft-ta-map-search-results');

        const closeModal = () => {
            modal.remove();
            document.body.style.overflow = '';
            if (leafletMap) { leafletMap.remove(); leafletMap = null; }
        };

        document.getElementById('draft-ta-map-cancel').addEventListener('click', closeModal);
        modal.querySelector('.map-picker-backdrop').addEventListener('click', closeModal);

        if (!window.L) { closeModal(); alert('Map library not loaded. Please refresh the page.'); return; }

        leafletMap = window.L.map('draft-ta-leaflet-map').setView([12.8797, 121.7740], 6);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
        }).addTo(leafletMap);
        setTimeout(() => leafletMap && leafletMap.invalidateSize(), 120);

        const clearSearchResults = () => {
            searchResults.innerHTML = '';
            searchResults.hidden = true;
        };

        const updateSearchClearButton = () => {
            searchClearButton.hidden = !searchInput.value;
        };

        const reverseGeocode = async (lat, lng) => {
            try {
                const r = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
                    { headers: { 'Accept-Language': 'en' } }
                );
                const d = await r.json();
                const a = d.address || {};
                return formatMapDestination(a, d.display_name || '') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            } catch {
                return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }
        };

        const selectSearchResult = async (result) => {
            const lat = Number(result.lat);
            const lng = Number(result.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            clearSearchResults();
            searchInput.value = result.display_name || searchInput.value;
            updateSearchClearButton();
            leafletMap.setView([lat, lng], 15);
            if (marker) marker.remove();
            marker = window.L.marker([lat, lng]).addTo(leafletMap);

            const selectedEl = document.getElementById('draft-ta-map-selected');
            const confirmBtn = document.getElementById('draft-ta-map-confirm');
            selectedEl.textContent = 'Looking up location...';
            selectedEl.classList.remove('has-location');
            confirmBtn.disabled = true;
            selectedLocation = formatMapDestination(result.address || {}, result.display_name || '') || await reverseGeocode(lat, lng);
            if (!document.getElementById('draft-ta-map-modal')) return;
            selectedEl.textContent = selectedLocation;
            selectedEl.classList.add('has-location');
            confirmBtn.disabled = false;
        };

        const searchLocations = async () => {
            const query = searchInput.value.trim();
            if (!query) {
                clearSearchResults();
                return;
            }

            const requestId = ++searchRequestId;
            const searchUrl = new URL('https://nominatim.openstreetmap.org/search');
            searchUrl.searchParams.set('format', 'jsonv2');
            searchUrl.searchParams.set('q', query);
            searchUrl.searchParams.set('countrycodes', 'ph');
            searchUrl.searchParams.set('addressdetails', '1');
            searchUrl.searchParams.set('limit', '20');

            try {
                const response = await fetch(searchUrl.toString(), { headers: { Accept: 'application/json' } });
                if (!response.ok) throw new Error('Search is unavailable right now.');
                const results = await response.json();
                if (requestId !== searchRequestId) return;

                searchResults.innerHTML = '';
                if (!Array.isArray(results) || !results.length) {
                    searchResults.innerHTML = '<p class="map-picker-search-empty">No matching places found in the Philippines.</p>';
                } else {
                    const fragment = document.createDocumentFragment();
                    results.forEach((result) => {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = 'map-picker-search-result';
                        button.textContent = result.display_name || 'Unnamed location';
                        button.addEventListener('click', () => { void selectSearchResult(result); });
                        fragment.appendChild(button);
                    });
                    searchResults.appendChild(fragment);
                }
                searchResults.hidden = !searchPanel.contains(document.activeElement);
            } catch (error) {
                if (requestId !== searchRequestId) return;
                searchResults.innerHTML = `<p class="map-picker-search-empty">${error.message || 'Search failed. Try another keyword.'}</p>`;
                searchResults.hidden = !searchPanel.contains(document.activeElement);
            }
        };

        searchInput.addEventListener('input', () => {
            window.clearTimeout(searchTimer);
            updateSearchClearButton();
            if (!searchInput.value.trim()) {
                searchRequestId += 1;
                clearSearchResults();
                return;
            }
            searchTimer = window.setTimeout(() => { void searchLocations(); }, 300);
        });
        searchClearButton.addEventListener('click', () => {
            window.clearTimeout(searchTimer);
            searchRequestId += 1;
            searchInput.value = '';
            updateSearchClearButton();
            clearSearchResults();
            searchInput.focus();
        });
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                window.clearTimeout(searchTimer);
                void searchLocations();
            }
        });
        searchPanel.addEventListener('focusin', () => {
            if (searchResults.children.length) {
                searchResults.hidden = false;
            } else if (searchInput.value.trim()) {
                void searchLocations();
            }
        });
        searchPanel.addEventListener('focusout', () => {
            window.setTimeout(() => {
                if (!searchPanel.contains(document.activeElement)) {
                    searchResults.hidden = true;
                }
            }, 0);
        });
        updateSearchClearButton();

        leafletMap.on('click', async (e) => {
            const { lat, lng } = e.latlng;
            if (marker) marker.remove();
            marker = window.L.marker([lat, lng]).addTo(leafletMap);
            const selectedEl = document.getElementById('draft-ta-map-selected');
            const confirmBtn = document.getElementById('draft-ta-map-confirm');
            if (!selectedEl || !confirmBtn) return;
            selectedEl.textContent = 'Looking up location…';
            selectedEl.classList.remove('has-location');
            confirmBtn.disabled = true;
            selectedLocation = await reverseGeocode(lat, lng);
            if (!document.getElementById('draft-ta-map-modal')) return;
            selectedEl.textContent = selectedLocation;
            selectedEl.classList.add('has-location');
            confirmBtn.disabled = false;
        });

        document.getElementById('draft-ta-map-confirm').addEventListener('click', () => {
            if (selectedLocation && destinationInput) {
                destinationInput.value = selectedLocation;
                destinationInput.dispatchEvent(new Event('input'));
            }
            closeModal();
        });
    };

    mapPickBtn?.addEventListener('click', openMapPicker);

    // ── Create TA ────────────────────────────────────────────────────────────
    createBtn?.addEventListener('click', () => {
        const missingConfigs = getMissingRequiredFields(false);
        if (missingConfigs.length > 0) {
            showRequiredFieldsWarning(missingConfigs);
            return;
        }

        const travelDate   = travelDateInput.value;
        const selectedTravelEnd = travelEndInput?.value || '';
        const travelEnd = selectedTravelEnd && selectedTravelEnd !== travelDate ? selectedTravelEnd : '';
        const dateRequest  = dateRequestInput?.value || getTodayLocalISO();
        const travelType   = travelTypeSelect?.value || 'official_business';
        const fundingOption= fundingOptionSelect?.value || 'reimbursement';
        const isoControlNo = isoControlInput?.value.trim() || 'AD-HRS-F010-01';

        if (travelDate && selectedTravelEnd && selectedTravelEnd < travelDate) {
            if (window.showAppAlert) {
                void window.showAppAlert('Invalid Travel End', 'Travel end date cannot be before travel date.');
            } else {
                alert('Travel end date cannot be before travel date.');
            }
            return;
        }
        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        };

        const officialsData = selectedEmployees.map(name => {
            const cleanName = String(name || '').trim();
            const emp = employeesList.find(e => String(e.name || '').trim() === cleanName);
            return { name: cleanName, position: emp ? emp.position : '' };
        });

        const formData = {
            purpose:               purposeInput.value.trim(),
            destination:           destinationInput.value.trim(),
            travelType,
            fundingOption,
            dateRequested:         dateRequest,
            dateRequestedFormatted:formatDate(dateRequest),
            travelDateFormatted:   formatDate(travelDate),
            travelEndFormatted:    travelEnd ? formatDate(travelEnd) : '',
            travelEnd,
            isoControlNo,
            officials:             officialsData,
        };

        if (window.generateTAPDF) {
            window.generateTAPDF(formData);
        } else {
            alert('PDF generator not loaded. Please refresh the page.');
        }
    });

    const bindDraftTaAutosave = () => {
        purposeInput?.addEventListener('input', persistDraftTaState);
        destinationInput?.addEventListener('input', () => {
            persistDraftTaState();
            updateDestinationQuality();
        });
        travelTypeSelect?.addEventListener('change', persistDraftTaState);
        fundingOptionSelect?.addEventListener('change', persistDraftTaState);
        isoControlInput?.addEventListener('input', persistDraftTaState);
        dateRequestInput?.addEventListener('change', persistDraftTaState);
        travelDateInput?.addEventListener('change', () => {
            validateDates();
            persistDraftTaState();
        });
        travelEndInput?.addEventListener('change', () => {
            validateDates();
            persistDraftTaState();
        });
        window.addEventListener('beforeunload', persistDraftTaState);
    };

    // ── Init ───────────────────────────────────────────────────────────────
    const init = async () => {
        if (panelInitialized) return;
        panelInitialized = true;
        bindDraftTaAutosave();
        // Init Flatpickr date pickers (matching Upload panel options)
        if (window.flatpickr) {
            if (travelDateInput)  window.flatpickr(travelDateInput, { ...flatpickrOpts, onChange: validateDates });
            if (travelEndInput)   window.flatpickr(travelEndInput,  { ...flatpickrOpts, onChange: validateDates });
            if (dateRequestInput) window.flatpickr(dateRequestInput, flatpickrOpts);
        }
        await loadEmployees();
        multiSelect = createMultiSelect();
        restoreDraftTaState();
        updateDestinationQuality();
        setDateDefault();
        multiSelect?.updateDisplay();
        multiSelect?.renderOptions();
    };

    // Expose so callers can re-trigger if needed
    window.draftTaPanelInit = init;
    void init();
};
