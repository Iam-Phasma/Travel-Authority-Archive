import FlexiDatepicker from 'flexidatepicker';
import 'flexidatepicker/dist/flexidatepicker.min.css';
import './draft-travel-datepicker.css';
import { getCalendarPosition } from './calendar-position.js';

let activePicker;

// Shared calendar adapter for Draft TA and Admin Upload TA forms.
window.createDraftTravelDatepicker = (input) => {
    if (!input || input._draftDatepicker) return input?._draftDatepicker;

    input.readOnly = true;
    input.classList.add('travel-datepicker-input');

    const picker = new FlexiDatepicker(`#${CSS.escape(input.id)}`, {
        mode: 'single',
        locale: 'en-US',
        dateFormat: 'yyyy-MM-dd',
        dualCalendar: false,
        onSelectionChange() {
            input.dispatchEvent(new Event('change', { bubbles: true }));
        },
    });
    const calendar = picker.datepickerElement;
    calendar.classList.add('draft-travel-datepicker');
    const dialog = document.createElement('dialog');
    dialog.className = 'draft-travel-date-dialog';
    dialog.setAttribute('aria-label', input.id.includes('date-request')
        ? 'Select date requested'
        : (input.id.includes('travel-end') || input.id.endsWith('travel-until')) ? 'Select travel end date' : 'Select travel date');
    document.body.append(dialog);

    const clearButton = calendar.querySelector('.mrdp-btn-clear');
    if (clearButton) {
        clearButton.textContent = 'Clear date';
        const todayButton = document.createElement('button');
        todayButton.type = 'button';
        todayButton.className = 'draft-date-today';
        todayButton.textContent = 'Today';
        todayButton.addEventListener('click', () => {
            const today = new Date();
            const value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            input._draftDatepicker.selectDate(value);
            picker.hide();
        });
        clearButton.before(todayButton);
    }
    calendar.querySelectorAll('button').forEach((button) => { button.type = 'button'; });

    let placementFrame;
    const positionPopover = () => {
        if (dialog.open || !calendar.classList.contains('mrdp-visible')) return;
        const visualViewport = window.visualViewport;
        const viewport = {
            top: visualViewport?.offsetTop || 0,
            left: visualViewport?.offsetLeft || 0,
            width: visualViewport?.width || window.innerWidth,
            height: visualViewport?.height || window.innerHeight,
        };
        calendar.style.maxHeight = `${Math.max(0, viewport.height - 24)}px`;
        calendar.style.maxWidth = `${Math.max(0, viewport.width - 24)}px`;
        const position = getCalendarPosition(input.getBoundingClientRect(), {
            width: calendar.offsetWidth,
            height: calendar.offsetHeight,
        }, viewport);
        calendar.style.top = `${position.top}px`;
        calendar.style.left = `${position.left}px`;
    };
    const schedulePlacement = () => {
        if (placementFrame) return;
        placementFrame = requestAnimationFrame(() => {
            placementFrame = undefined;
            positionPopover();
        });
    };
    const sizeObserver = new ResizeObserver(schedulePlacement);
    const trackPlacement = (enabled) => {
        const method = enabled ? 'addEventListener' : 'removeEventListener';
        window[method]('scroll', schedulePlacement, true);
        window[method]('resize', schedulePlacement);
        window.visualViewport?.[method]('resize', schedulePlacement);
        window.visualViewport?.[method]('scroll', schedulePlacement);
        if (enabled) sizeObserver.observe(calendar);
        else {
            sizeObserver.disconnect();
            cancelAnimationFrame(placementFrame);
            placementFrame = undefined;
        }
    };

    const renderCalendar = picker.renderCalendar.bind(picker);
    picker.renderCalendar = () => {
        renderCalendar();
        calendar.querySelectorAll('.mrdp-day-cell:not(.empty):not(.disabled)').forEach((cell) => {
            cell.tabIndex = 0;
            cell.setAttribute('role', 'button');
            cell.setAttribute('aria-label', cell.dataset.date);
            cell.setAttribute('aria-pressed', String(picker.selectedDates.includes(cell.dataset.date)));
        });
    };
    calendar.addEventListener('keydown', (event) => {
        if (event.target.matches('.mrdp-day-cell') && ['Enter', ' '].includes(event.key)) {
            event.preventDefault();
            event.target.click();
        }
    });
    const show = picker.show;
    const hide = picker.hide.bind(picker);
    input.removeEventListener('click', show);
    picker.show = () => {
        if (calendar.classList.contains('mrdp-visible')) return;
        activePicker?.hide();
        activePicker = picker;
        const mobile = navigator.maxTouchPoints > 0 || window.matchMedia('(any-pointer: coarse), (max-width: 600px)').matches;
        show();
        if (mobile) {
            calendar.style.top = '';
            calendar.style.left = '';
            dialog.append(calendar);
            dialog.showModal();
            calendar.querySelector('.mrdp-month-year-btn')?.focus();
        } else {
            calendar.classList.add('draft-date-popover');
            positionPopover();
            trackPlacement(true);
        }
    };
    picker.hide = () => {
        trackPlacement(false);
        hide();
        calendar.classList.remove('draft-date-popover');
        calendar.style.maxHeight = '';
        calendar.style.maxWidth = '';
        if (activePicker === picker) activePicker = null;
        if (dialog.open) {
            dialog.close();
            document.body.append(calendar);
        }
    };
    dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        picker.hide();
    });
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) picker.hide();
    });
    input.addEventListener('click', picker.show);
    input.addEventListener('keydown', (event) => {
        if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            picker.show();
        }
    });
    calendar.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') picker.hide();
    });

    const adapter = {
        selectDate(value, { silent = false } = {}) {
            picker.selectedDates = value ? [value] : [];
            if (value) picker.currentDate = new Date(`${value}T00:00:00`);
            input.value = value || '';
            picker.renderCalendar();
            if (!silent) picker.updateSelectedDisplay();
        },
        clear() { picker.handleClearAll(); },
    };
    input._draftDatepicker = adapter;
    adapter.selectDate(input.value, { silent: true });
    return adapter;
};
