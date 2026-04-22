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
const settingsOrphanToolsSection = document.getElementById('settings-orphan-tools-section');
const settingsScanOrphansBtn = document.getElementById('settings-scan-orphans');
const settingsDeleteOrphansBtn = document.getElementById('settings-delete-orphans');
const settingsOrphanStatus = document.getElementById('settings-orphan-status');
const settingsModal = document.getElementById('settings-modal');

const applySuperOnlySettingsVisibilityByRole = (role) => {
    const isSuper = role === 'super';
    if (settingsOrphanToolsSection) {
        settingsOrphanToolsSection.style.display = isSuper ? '' : 'none';
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

if (settingsScanOrphansBtn && settingsDeleteOrphansBtn && settingsOrphanStatus) {
    const setDeleteBtnVisible = (visible) => {
        settingsDeleteOrphansBtn.style.display = visible ? '' : 'none';
        if (!visible) settingsDeleteOrphansBtn.disabled = true;
    };

    const setOrphanBusy = (busy) => {
        settingsScanOrphansBtn.disabled = busy;
        if (busy) settingsDeleteOrphansBtn.disabled = true;
    };

    setDeleteBtnVisible(false);

    settingsScanOrphansBtn.addEventListener('click', async () => {
        if (!window.adminOrphanFiles?.scan) {
            settingsOrphanStatus.textContent = 'Cleanup tools not ready yet. Please try again in a moment.';
            return;
        }

        setOrphanBusy(true);
        settingsOrphanStatus.textContent = 'Scanning storage for orphan files...';

        try {
            const result = await window.adminOrphanFiles.scan();
            const orphanCount = result.orphanPaths.length;
            if (orphanCount === 0) {
                setDeleteBtnVisible(false);
                settingsOrphanStatus.textContent = `No orphan files found. Stored: ${result.counts.stored}, Referenced: ${result.counts.referenced}.`;
                if (window.showToast) window.showToast('No orphan files found.', 'success');
            } else {
                setDeleteBtnVisible(true);
                settingsDeleteOrphansBtn.disabled = false;
                settingsOrphanStatus.textContent = `Found ${orphanCount} orphan file(s). Stored: ${result.counts.stored}, Referenced: ${result.counts.referenced}. Click Delete Orphans to remove.`;
                console.table(result.orphanPaths.map((path, i) => ({ '#': i + 1, path })));
                if (window.showToast) window.showToast(`Found ${orphanCount} orphan file(s).`, 'warning', 4000);
            }
        } catch (error) {
            setDeleteBtnVisible(false);
            settingsOrphanStatus.textContent = `Scan failed: ${error.message || 'Unknown error'}`;
            if (window.showToast) window.showToast('Failed to scan orphan files.', 'error');
        } finally {
            setOrphanBusy(false);
        }
    });

    settingsDeleteOrphansBtn.addEventListener('click', async () => {
        if (!window.adminOrphanFiles?.deleteScanned) {
            settingsOrphanStatus.textContent = 'Cleanup tools not ready yet. Please try again in a moment.';
            return;
        }

        const orphanList = window.adminOrphanFiles.getLastScan ? window.adminOrphanFiles.getLastScan() : [];
        if (!orphanList.length) {
            setDeleteBtnVisible(false);
            settingsOrphanStatus.textContent = 'No scanned orphan list available. Run scan first.';
            return;
        }

        const confirmationFn = window.adminShowConfirmation;
        let confirmed = true;
        if (typeof confirmationFn === 'function') {
            confirmed = await confirmationFn(
                'Delete Orphan Files',
                `Delete ${orphanList.length} orphan file(s) from storage? This action cannot be undone.`
            );
        }

        if (!confirmed) return;

        setOrphanBusy(true);
        settingsOrphanStatus.textContent = `Deleting ${orphanList.length} orphan file(s)...`;

        try {
            const result = await window.adminOrphanFiles.deleteScanned();
            setDeleteBtnVisible(false);
            settingsOrphanStatus.textContent = `Deleted ${result.deleted} orphan file(s).`;
            if (window.showToast) window.showToast(`Deleted ${result.deleted} orphan file(s).`, 'success');
        } catch (error) {
            settingsOrphanStatus.textContent = `Delete failed: ${error.message || 'Unknown error'}`;
            if (window.showToast) window.showToast('Failed to delete orphan files.', 'error');
        } finally {
            setOrphanBusy(false);
        }
    });
}

document.getElementById('close-settings').addEventListener('click', () => {
    settingsModal?.classList.remove('show');
});

settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.remove('show');
    }
});

