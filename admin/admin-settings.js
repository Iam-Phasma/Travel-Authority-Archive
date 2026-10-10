import { draftTaClient } from '../pdf-generator/draft-ta-config.js';

const draftSection = document.getElementById('settings-draft-ta-section');
const draftForm = document.getElementById('settings-draft-ta-form');
const draftStatus = document.getElementById('settings-draft-ta-status');
const draftSave = document.getElementById('settings-draft-ta-save');
const draftIso = document.getElementById('settings-draft-ta-iso');
const draftFields = ['recommending', 'funds', 'approved'];
let draftConfigId = null;
let draftLoading = false;

async function loadDraftSettings() {
    if (window.adminCurrentRole !== 'super' || draftLoading) return;
    draftLoading = true;
    draftSave.disabled = true;
    draftStatus.textContent = 'Loading draft TA settings...';
    try {
        const [config, employees] = await Promise.all([
            draftTaClient.from('draft_ta').select('id, recommending, funds, approved, iso_no').order('id', { ascending: false }).limit(1).maybeSingle(),
            draftTaClient.from('employee_list').select('name, position, is_active, office').order('name'),
        ]);
        if (config.error) throw config.error;
        if (employees.error) throw employees.error;
        draftConfigId = config.data?.id ?? null;
        for (const key of draftFields) {
            const select = document.getElementById(`settings-draft-ta-${key}`);
            select.replaceChildren(new Option('Select a signatory', ''));
            for (const employee of employees.data || []) {
                if (String(employee.office || '').trim().toLowerCase() !== 'ched') continue;
                // Preserve an existing selection even if the employee is inactive.
                if (employee.is_active === false && employee.name !== config.data?.[key]) continue;
                select.add(new Option(`${employee.name}${employee.position ? ` — ${employee.position}` : ''}`, employee.name));
            }
            select.value = config.data?.[key] || '';
        }
        draftIso.value = config.data?.iso_no || 'AD-HRS-F010-01';
        draftSave.disabled = false;
        draftStatus.textContent = config.data ? '' : 'Choose the signatories and save to enable draft TA PDFs.';
    } catch (error) {
        draftStatus.textContent = `Could not load draft TA settings: ${error.message}`;
    } finally {
        draftLoading = false;
    }
}

draftForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (window.adminCurrentRole !== 'super' || draftSave.disabled) return;
    const values = { iso_no: draftIso.value.trim() };
    for (const key of draftFields) values[key] = document.getElementById(`settings-draft-ta-${key}`).value;
    if (!values.iso_no || draftFields.some((key) => !values[key])) {
        draftStatus.textContent = 'Select all three signatories and enter the ISO number.';
        return;
    }
    draftSave.disabled = true;
    draftStatus.textContent = 'Saving...';
    try {
        const query = draftConfigId === null
            ? draftTaClient.from('draft_ta').insert(values)
            : draftTaClient.from('draft_ta').update(values).eq('id', draftConfigId);
        const { data, error } = await query.select('id').single();
        if (error) throw error;
        draftConfigId = data.id;
        draftStatus.textContent = 'Saved. New draft TA PDFs will use these settings.';
    } catch (error) {
        draftStatus.textContent = error.code === '42501'
            ? 'Save denied by database permissions. Ask the database administrator to apply the draft TA settings migration and verify your super-user access.'
            : `Could not save draft TA settings: ${error.message}`;
    } finally {
        draftSave.disabled = window.adminCurrentRole !== 'super';
    }
});

// Refresh on each opening so edits made elsewhere are reflected.
document.getElementById('header-settings-option')?.addEventListener('click', loadDraftSettings);

// Demo checkbox visibility setting
const DEMO_CHECKBOX_SETTING_KEY = 'adminShowDemoCheckbox';

const getDemoCheckboxVisible = () => {
    const saved = localStorage.getItem(DEMO_CHECKBOX_SETTING_KEY);
    return saved === null ? true : saved === 'true';
};
window.getDemoCheckboxVisible = getDemoCheckboxVisible;

// Allow upload without file setting
const ALLOW_EMPTY_UPLOAD_KEY = 'adminAllowEmptyUpload';
const getAllowEmptyUpload = () => localStorage.getItem(ALLOW_EMPTY_UPLOAD_KEY) === 'true';
window.getAllowEmptyUpload = getAllowEmptyUpload;

// Hide match-all filter option in files filter panel
const HIDE_MATCH_ALL_FILTER_KEY = 'adminHideMatchAllFilter';
const getHideMatchAllFilter = () => {
    const saved = localStorage.getItem(HIDE_MATCH_ALL_FILTER_KEY);
    return saved === null ? true : saved === 'true';
};
window.getHideMatchAllFilter = getHideMatchAllFilter;

window.applyAdminMatchAllFilterVisibility = (hide) => {
    const filterMode = document.getElementById('admin-filter-mode');
    if (filterMode) {
        filterMode.style.display = hide ? 'none' : '';
        filterMode.toggleAttribute('hidden', hide);
    }
};

window.applyDemoCheckboxVisibility = (visible) => {
    // Upload panel demo checkbox wrapper
    const uploadDemoWrapper = document.getElementById('is-demo-checkbox')?.closest('.demo-field-wrapper');
    if (uploadDemoWrapper) {
        uploadDemoWrapper.style.display = visible ? '' : 'none';
    }
    // Edit modal demo checkbox wrapper
    const editDemoWrapper = document.getElementById('update-is-demo-checkbox')?.closest('.demo-field-wrapper');
    if (editDemoWrapper) {
        editDemoWrapper.style.display = visible ? '' : 'none';
    }
};

const settingsShowDemoCheckbox = document.getElementById('settings-show-demo-checkbox');
const settingsModal = document.getElementById('settings-modal');

const applySuperOnlySettingsVisibilityByRole = (role) => {
    const isSuper = role === 'super';
    if (draftSection) {
        draftSection.style.display = isSuper ? '' : 'none';
        if (isSuper) void loadDraftSettings();
        else draftSave.disabled = true;
    }
};

applySuperOnlySettingsVisibilityByRole(window.adminCurrentRole || '');
window.addEventListener('admin-role-ready', (event) => {
    applySuperOnlySettingsVisibilityByRole(event?.detail?.role || '');
});

// Load saved setting (default: true = visible)
settingsShowDemoCheckbox.checked = getDemoCheckboxVisible();

settingsShowDemoCheckbox.addEventListener('change', () => {
    const visible = settingsShowDemoCheckbox.checked;
    localStorage.setItem(DEMO_CHECKBOX_SETTING_KEY, visible);
    window.applyDemoCheckboxVisibility(visible);
});

// Allow empty upload toggle
const settingsAllowEmptyUpload = document.getElementById('settings-allow-empty-upload');
if (settingsAllowEmptyUpload) {
    settingsAllowEmptyUpload.checked = getAllowEmptyUpload();
    settingsAllowEmptyUpload.addEventListener('change', () => {
        localStorage.setItem(ALLOW_EMPTY_UPLOAD_KEY, settingsAllowEmptyUpload.checked);
    });
}

const settingsHideMatchAllFilter = document.getElementById('settings-hide-match-all-filter');
if (settingsHideMatchAllFilter) {
    settingsHideMatchAllFilter.checked = getHideMatchAllFilter();
    settingsHideMatchAllFilter.addEventListener('change', () => {
        const hide = settingsHideMatchAllFilter.checked;
        localStorage.setItem(HIDE_MATCH_ALL_FILTER_KEY, hide);
        window.applyAdminMatchAllFilterVisibility(hide);
    });
}

window.applyAdminMatchAllFilterVisibility(getHideMatchAllFilter());
window.addEventListener('admin-view-panel-ready', () => {
    window.applyAdminMatchAllFilterVisibility(getHideMatchAllFilter());
});

document.getElementById('close-settings').addEventListener('click', () => {
    settingsModal?.classList.remove('show');
});

settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.remove('show');
    }
});

