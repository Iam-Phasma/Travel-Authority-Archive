/**
 * Draft TA Panel — shared initializer for both dashboard and admin.
 * Call window.initDraftTaPanel(supabase) after the panel HTML is in the DOM.
 */
window.initDraftTaPanel = (supabase) => {
    const purposeInput       = document.getElementById('panel-draft-ta-purpose');
    const destinationInput   = document.getElementById('panel-draft-ta-destination');
    const travelTypeSelect   = document.getElementById('panel-draft-ta-travel-type');
    const fundingOptionSelect= document.getElementById('panel-draft-ta-funding-option');
    const dateRequestInput   = document.getElementById('panel-draft-ta-date-request');
    const travelDateInput    = document.getElementById('panel-draft-ta-travel-date');
    const travelEndInput     = document.getElementById('panel-draft-ta-travel-end');
    const officialsDisplay   = document.getElementById('panel-draft-ta-officials-display');
    const officialsDropdown  = document.getElementById('panel-draft-ta-officials-dropdown');
    const officialsSearch    = document.getElementById('panel-draft-ta-officials-search');
    const officialsOptions   = document.getElementById('panel-draft-ta-officials-options');
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

    const escapeHtml = (str) => {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str ?? '')));
        return div.innerHTML;
    };

    // ── Officials multiselect ──────────────────────────────────────────────
    const createMultiSelect = () => {
        if (!officialsDisplay || !officialsDropdown || !officialsSearch || !officialsOptions) return null;

        const closeDropdown = () => {
            officialsSearch.value = '';
            officialsDropdown.classList.remove('show');
        };

        const updateDisplay = () => {
            if (selectedEmployees.length === 0) {
                officialsDisplay.innerHTML = '<span class="multiselect-placeholder">Select officials...</span>';
                return;
            }
            officialsDisplay.innerHTML = selectedEmployees.map(name =>
                `<span class="multiselect-tag">${escapeHtml(name)}<button type="button" class="multiselect-remove" data-name="${escapeHtml(name)}">&times;</button></span>`
            ).join('');
            officialsDisplay.querySelectorAll('.multiselect-remove').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const idx = selectedEmployees.indexOf(btn.getAttribute('data-name'));
                    if (idx > -1) { selectedEmployees.splice(idx, 1); updateDisplay(); renderOptions(); }
                });
            });
        };

        const renderOptions = () => {
            const term = officialsSearch.value.toLowerCase();
            const filtered = employeesList.filter(emp =>
                emp.name.toLowerCase().includes(term) && !selectedEmployees.includes(emp.name)
            );

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
                            updateDisplay(); renderOptions();
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
                return `<div class="multiselect-option${inactiveClass}" data-name="${escapeHtml(emp.name)}">${escapeHtml(emp.name)}${inactiveLabel}</div>`;
            }).join('');

            officialsOptions.querySelectorAll('.multiselect-option').forEach(opt => {
                opt.addEventListener('click', e => {
                    e.stopPropagation();
                    const name = opt.getAttribute('data-name');
                    if (!selectedEmployees.includes(name)) { selectedEmployees.push(name); officialsSearch.value = ''; updateDisplay(); renderOptions(); }
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

        document.addEventListener('click', e => {
            if (!officialsDropdown.contains(e.target) && e.target !== officialsDisplay) closeDropdown();
        });

        return { updateDisplay, renderOptions, closeDropdown };
    };

    // ── Load employees ─────────────────────────────────────────────────────
    const loadEmployees = async () => {
        try {
            const { data, error } = await supabase
                .from('employee_list')
                .select('name, position, is_active')
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
        if (travelDateInput?.value && travelEndInput?.value && travelEndInput.value < travelDateInput.value) {
            travelEndInput.setCustomValidity('Travel end date cannot be before travel date');
        } else {
            travelEndInput?.setCustomValidity('');
        }
    };

    travelDateInput?.addEventListener('change', validateDates);
    travelEndInput?.addEventListener('change', validateDates);

    // ── Clear ──────────────────────────────────────────────────────────────
    const clearForm = () => {
        if (purposeInput)       purposeInput.value = '';
        if (destinationInput)   destinationInput.value = '';
        if (travelTypeSelect)   travelTypeSelect.value = 'official_business';
        if (fundingOptionSelect) fundingOptionSelect.value = 'reimbursement';
        if (isoControlInput)    isoControlInput.value = 'AD-HRS-F010-00';
        if (dateRequestInput?._flatpickr) dateRequestInput._flatpickr.setDate(new Date(), true);
        else if (dateRequestInput) dateRequestInput.value = getTodayLocalISO();
        if (travelDateInput?._flatpickr)  travelDateInput._flatpickr.clear();
        if (travelEndInput?._flatpickr)   { travelEndInput._flatpickr.clear(); travelEndInput.setCustomValidity(''); }
        selectedEmployees.length = 0;
        multiSelect?.updateDisplay();
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
                    <h3>Pick Destination</h3>
                </div>
                <p class="map-picker-hint">Click anywhere on the map to pin your destination.</p>
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

        const reverseGeocode = async (lat, lng) => {
            try {
                const r = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
                    { headers: { 'Accept-Language': 'en' } }
                );
                const d = await r.json();
                const a = d.address || {};
                const parts = [
                    a.city || a.town || a.municipality || a.village || a.county,
                    a.state || a.region || a.province,
                    a.country
                ].filter(Boolean);
                return parts.length ? parts.join(', ') : (d.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            } catch {
                return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }
        };

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
        if (!purposeInput?.value.trim())     { alert('Please enter the purpose of travel.'); purposeInput?.focus(); return; }
        if (!destinationInput?.value.trim()) { alert('Please enter the destination.'); destinationInput?.focus(); return; }
        if (!travelDateInput?.value)         { alert('Please select the travel date.'); travelDateInput?.focus(); return; }
        if (selectedEmployees.length === 0)  { alert('Please select at least one official.'); return; }

        const travelDate   = travelDateInput.value;
        const travelEnd    = travelEndInput?.value || '';
        const dateRequest  = dateRequestInput?.value || getTodayLocalISO();
        const travelType   = travelTypeSelect?.value || 'official_business';
        const fundingOption= fundingOptionSelect?.value || 'reimbursement';
        const isoControlNo = isoControlInput?.value.trim() || 'AD-HRS-F010-00';

        if (travelDate && travelEnd && travelEnd < travelDate) {
            alert('Travel end date cannot be before travel date.');
            travelEndInput?.focus();
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

    // ── Init ───────────────────────────────────────────────────────────────
    const init = async () => {
        if (panelInitialized) return;
        panelInitialized = true;
        // Init Flatpickr date pickers (matching Upload panel options)
        if (window.flatpickr) {
            if (travelDateInput)  window.flatpickr(travelDateInput, { ...flatpickrOpts, onChange: validateDates });
            if (travelEndInput)   window.flatpickr(travelEndInput,  { ...flatpickrOpts, onChange: validateDates });
            if (dateRequestInput) window.flatpickr(dateRequestInput, flatpickrOpts);
        }
        setDateDefault();
        await loadEmployees();
        multiSelect = createMultiSelect();
        multiSelect?.updateDisplay();
        multiSelect?.renderOptions();
    };

    // Expose so callers can re-trigger if needed
    window.draftTaPanelInit = init;
    void init();
};
