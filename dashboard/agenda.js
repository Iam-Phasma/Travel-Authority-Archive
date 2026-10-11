import { escapeHtml } from "../shared/record-utils.js";

// Agenda calendar and lists read the latest Records data through a getter.
export const createAgendaTracker = ({
  getRecords, openViewModalForRecord, queueInsightsLayoutSync,
}) => {
  let agendaCalendarHeightObserver = null;
  let agendaBreakpointQuery = null;
  let agendaTrackerInitialized = false;
  let fcCalendar = null;
  let agendaCalendarSyncFrame = null;
  let agendaCalendarResizeTimeout = null;
  let agendaCalendarViewportSettleTimeout = null;

  const buildAgendaInfoBtn = (row) => `
    <button type="button" class="agenda-info-btn" data-ta-key="${escapeHtml(row.ta_number || "")}" aria-label="View details for ${escapeHtml(row.ta_number || "TA")}">
      <svg class="agenda-info-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 14v4.833A1.166 1.166 0 0 1 16.833 20H5.167A1.167 1.167 0 0 1 4 18.833V7.167A1.166 1.166 0 0 1 5.167 6h4.618m4.447-2H20v5.768m-7.889 2.121 7.778-7.778"/>
      </svg>
    </button>`;

  const attachAgendaInfoBtnListeners = (container) => {
    container.querySelectorAll(".agenda-info-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const taKey = btn.getAttribute("data-ta-key");
        const row = getRecords().find((r) => r.ta_number === taKey);
        if (!row) return;
        await openViewModalForRecord(row);
      });
    });
  };

  const toIsoDateLocal = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const parseIsoDateLocal = (isoDate) => {
    if (!isoDate || typeof isoDate !== "string") return null;
    const parts = isoDate.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  };

  const getMonthStartDate = (date) =>
    new Date(date.getFullYear(), date.getMonth(), 1);

  const formatAgendaDateLabel = (isoDate) => {
    const parsed = parseIsoDateLocal(isoDate);
    if (!parsed) return "No date selected";
    return parsed.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTaDateRange = (row) => {
    if (!row || !row.travel_date) return "No travel date";
    const start = formatAgendaDateLabel(row.travel_date);
    if (!row.travel_until || row.travel_until === row.travel_date) return start;
    const end = formatAgendaDateLabel(row.travel_until);
    return `${start} – ${end}`;
  };

  const todayLocalDate = new Date();
  const agendaState = {
    selectedDateIso: toIsoDateLocal(todayLocalDate),
    activeTab: "today",
  };

  const recordOccursOnIsoDate = (record, isoDate) => {
    if (!record || !record.travel_date || !isoDate) return false;
    const startDate = record.travel_date;
    const endDate = record.travel_until || record.travel_date;
    return startDate <= isoDate && endDate >= isoDate;
  };

  const getAgendaRowsForDate = (isoDate) => {
    return getRecords()
      .filter((row) => recordOccursOnIsoDate(row, isoDate))
      .sort((a, b) => (a.travel_date || "").localeCompare(b.travel_date || ""));
  };

  const buildUpcomingAgendaBuckets = () => {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const MAX_RANGE_DAYS = 370;
    const todayIso = toIsoDateLocal(new Date());
    const tomorrowDate = parseIsoDateLocal(todayIso);
    if (!tomorrowDate) return [];
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowIso = toIsoDateLocal(tomorrowDate);

    const dateToRowsMap = new Map();

    getRecords().forEach((row) => {
      if (!row || !row.travel_date) return;

      const startDate = parseIsoDateLocal(row.travel_date);
      const endDate = parseIsoDateLocal(row.travel_until || row.travel_date);
      if (!startDate || !endDate) return;

      const normalizedStart = startDate <= endDate ? startDate : endDate;
      const normalizedEnd = startDate <= endDate ? endDate : startDate;

      const effectiveStart =
        normalizedStart < tomorrowDate ? tomorrowDate : normalizedStart;
      if (effectiveStart > normalizedEnd) return;

      const maxEndBySafety = new Date(
        effectiveStart.getTime() + MAX_RANGE_DAYS * MS_PER_DAY,
      );
      const effectiveEnd =
        normalizedEnd > maxEndBySafety ? maxEndBySafety : normalizedEnd;

      const cursor = new Date(effectiveStart.getTime());
      while (cursor <= effectiveEnd) {
        const isoDate = toIsoDateLocal(cursor);
        if (!dateToRowsMap.has(isoDate)) {
          dateToRowsMap.set(isoDate, []);
        }
        dateToRowsMap.get(isoDate).push(row);
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    return Array.from(dateToRowsMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([isoDate, rows]) => ({
        isoDate,
        rows: rows.sort((a, b) =>
          (a.travel_date || "").localeCompare(b.travel_date || ""),
        ),
      }));
  };

  const scrollToUpcomingDateGroup = (isoDate) => {
    if (!isoDate) return;
    const target = document.querySelector(
      `[data-upcoming-date-group="${isoDate}"]`,
    );
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const syncSegmentedControl = (container) => {
    if (!container) return;

    const activeButton = container.querySelector("button.active");
    const pill = container.querySelector(".segmented-switcher-pill");
    if (!activeButton || !pill) {
      container.classList.remove("is-ready");
      return;
    }

    const activeRect = activeButton.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const offsetX = activeRect.left - containerRect.left - 3.5;

    container.style.setProperty("--seg-pill-x", `${Math.max(0, offsetX)}px`);
    container.style.setProperty("--seg-pill-w", `${activeRect.width}px`);
    container.style.setProperty("--seg-pill-h", `${activeRect.height}px`);
    container.classList.add("is-ready");
  };

  const syncAllSegmentedControls = () => {
    document
      .querySelectorAll("[data-segmented-control]")
      .forEach((container) => syncSegmentedControl(container));
  };

  const renderAgendaTabs = () => {
    document.querySelectorAll(".agenda-tab-btn").forEach((btn) => {
      const isActive =
        btn.getAttribute("data-agenda-tab") === agendaState.activeTab;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    syncSegmentedControl(
      document.querySelector(".agenda-tabs[data-segmented-control]"),
    );
  };

  const updateFcBadgesAndSummary = () => {
    const calEl = document.getElementById("agenda-fc-calendar");
    if (!calEl) return;

    calEl.querySelectorAll(".fc-daygrid-day").forEach((dayEl) => {
      const isoDate = dayEl.getAttribute("data-date");
      if (!isoDate) return;

      // Remove old badge and class
      dayEl.querySelectorAll(".fc-ta-badge").forEach((b) => b.remove());
      dayEl.classList.remove("has-ta-events");

      const count = getAgendaRowsForDate(isoDate).length;
      if (count > 0) {
        dayEl.classList.add("has-ta-events");
        const frame = dayEl.querySelector(".fc-daygrid-day-frame");
        if (frame) {
          const badge = document.createElement("span");
          badge.className = "fc-ta-badge";
          badge.textContent = count;
          badge.setAttribute("aria-hidden", "true");
          frame.appendChild(badge);
        }
      }
    });
  };

  const buildAgendaEmptyState = (message) => `
    <div class="agenda-empty">
      <svg class="agenda-empty-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11c.889-.086 1.416-.543 2.156-1.057a22.323 22.323 0 0 0 3.958-5.084 1.6 1.6 0 0 1 .582-.628 1.549 1.549 0 0 1 1.466-.087c.205.095.388.233.537.406a1.64 1.64 0 0 1 .384 1.279l-1.388 4.114M7 11H4v6.5A1.5 1.5 0 0 0 5.5 19v0A1.5 1.5 0 0 0 7 17.5V11Zm6.5-1h4.915c.286 0 .372.014.626.15.254.135.472.332.637.572a1.874 1.874 0 0 1 .215 1.673l-2.098 6.4C17.538 19.52 17.368 20 16.12 20c-2.303 0-4.79-.943-6.67-1.475"/>
      </svg>
      <span>${escapeHtml(message)}</span>
    </div>
  `;

  const renderAgendaList = () => {
    const agendaList = document.getElementById("agenda-ta-list");
    const agendaTargetDate = document.getElementById("agenda-target-date");
    if (!agendaList || !agendaTargetDate) return;

    if (agendaState.activeTab === "today") {
      const viewIso = agendaState.selectedDateIso || toIsoDateLocal(new Date());
      const rows = getAgendaRowsForDate(viewIso);
      const isActualToday = viewIso === toIsoDateLocal(new Date());

      agendaTargetDate.textContent = isActualToday
        ? `Today: ${formatAgendaDateLabel(viewIso)}`
        : formatAgendaDateLabel(viewIso);

      if (!rows.length) {
        agendaList.innerHTML = buildAgendaEmptyState(
          "No travel authorities scheduled for this date.",
        );
        // Clear the custom timeline height when the list is empty.
        agendaList.style.removeProperty("--agenda-line-h");
        return;
      }

      agendaList.innerHTML = rows
        .map((row) => {
          const dateLabel = formatTaDateRange(row);

          return `
                  <div class="agenda-item">
                      ${buildAgendaInfoBtn(row)}
                      <span class="agenda-item-ta">${escapeHtml(row.ta_number || "-")}</span>
                      <span class="agenda-item-date">${escapeHtml(dateLabel)}</span>
                  </div>
              `;
        })
        .join("");
      attachAgendaInfoBtnListeners(agendaList);
      // Make the timeline line match the full scroll height of the list content
      try {
        const cs = window.getComputedStyle(agendaList);
        const padTop = parseFloat(cs.paddingTop) || 0;
        const padBottom = parseFloat(cs.paddingBottom) || 0;
        const lineH = Math.max(0, agendaList.scrollHeight - padTop - padBottom - 0);
        agendaList.style.setProperty("--agenda-line-h", `${Math.ceil(lineH)}px`);
      } catch (e) {}
      return;
    }

    const upcomingBuckets = buildUpcomingAgendaBuckets();
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowIso = toIsoDateLocal(tomorrowDate);

    agendaTargetDate.textContent = `Upcoming from: ${formatAgendaDateLabel(tomorrowIso)}`;

    if (!upcomingBuckets.length) {
      agendaList.innerHTML = buildAgendaEmptyState(
        "No upcoming travel authorities found.",
      );
      agendaList.style.removeProperty("--agenda-line-h");
      return;
    }

    agendaList.innerHTML = upcomingBuckets
      .map((bucket) => {
        const headerLabel = formatAgendaDateLabel(bucket.isoDate);
        const items = bucket.rows
          .map(
            (row) => `
              <div class="agenda-item agenda-item--upcoming">
                  ${buildAgendaInfoBtn(row)}
                  <span class="agenda-item-ta">${escapeHtml(row.ta_number || "-")}</span>
                  <span class="agenda-item-date">${escapeHtml(row.travel_date ? formatTaDateRange(row) : "No travel date")}</span>
              </div>
          `,
          )
          .join("");

        return `
              <section class="agenda-date-group" data-upcoming-date-group="${bucket.isoDate}">
                  <header class="agenda-date-group-header">
                      <span>${escapeHtml(headerLabel)}</span>
                  </header>
                  ${items}
              </section>
          `;
      })
      .join("");

    if (
      agendaState.selectedDateIso &&
      agendaState.selectedDateIso > toIsoDateLocal(new Date())
    ) {
      scrollToUpcomingDateGroup(agendaState.selectedDateIso);
    }
    attachAgendaInfoBtnListeners(agendaList);
    // After rendering, set timeline height to cover all content
    try {
      const cs2 = window.getComputedStyle(agendaList);
      const padTop2 = parseFloat(cs2.paddingTop) || 0;
      const padBottom2 = parseFloat(cs2.paddingBottom) || 0;
      const lineH2 = Math.max(0, agendaList.scrollHeight - padTop2 - padBottom2 - 0);
      agendaList.style.setProperty("--agenda-line-h", `${Math.ceil(lineH2)}px`);
    } catch (e) {}
  };

  const renderAgendaTracker = () => {
    if (!agendaTrackerInitialized) return;
    renderAgendaTabs();
    updateFcBadgesAndSummary();
    renderAgendaList();
    queueAgendaCalendarLayoutSync();
    queueInsightsLayoutSync();
  };

  const syncAgendaCalendarLayout = () => {
    if (!fcCalendar) return;

    const insightsPane = document.getElementById("tab-insights");
    const fcContainer = document.getElementById("agenda-fc-calendar");
    const calendarPanel = document.querySelector(".agenda-calendar-panel");
    const agendaListPanel = document.querySelector(".agenda-list-panel");
    if (
      !insightsPane ||
      !insightsPane.classList.contains("active") ||
      !fcContainer ||
      !calendarPanel ||
      !agendaListPanel
    ) {
      return;
    }
    // Ask FullCalendar to update, then wait for layout to settle before measuring.
    fcCalendar.updateSize();

    // Use a double requestAnimationFrame to allow FullCalendar to finish layout.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const { width } = fcContainer.getBoundingClientRect();
        const { height } = calendarPanel.getBoundingClientRect();
        if (width <= 0 || height <= 0) {
          // If measurement failed, clear any forced heights to avoid locking layout.
          if (!window.matchMedia("(min-width: 950px)").matches) {
            agendaListPanel.style.height = "";
            agendaListPanel.style.maxHeight = "";
            calendarPanel.style.height = "";
            calendarPanel.style.maxHeight = "";
          }
          return;
        }

        if (window.matchMedia("(min-width: 950px)").matches) {
          // Set both panels to the same outer height so the list can scroll internally.
          const h = Math.ceil(height);
          calendarPanel.style.height = `${h}px`;
          calendarPanel.style.maxHeight = `${h}px`;
          agendaListPanel.style.height = `${h}px`;
          agendaListPanel.style.maxHeight = `${h}px`;
          // Match the timeline height to the list’s scrollable content.
          try {
            const agendaTaList = document.getElementById("agenda-ta-list");
            if (agendaTaList) {
              const cs = window.getComputedStyle(agendaTaList);
              const padTop = parseFloat(cs.paddingTop) || 0;
              const padBottom = parseFloat(cs.paddingBottom) || 0;
              const lineH = Math.max(0, agendaTaList.scrollHeight - padTop - padBottom - 0);
              agendaTaList.style.setProperty("--agenda-line-h", `${Math.ceil(lineH)}px`);
            }
          } catch (e) {}
        } else {
          // On small screens, remove any forced heights so panels flow naturally.
          agendaListPanel.style.height = "";
          agendaListPanel.style.maxHeight = "";
          calendarPanel.style.height = "";
          calendarPanel.style.maxHeight = "";
          const agendaTaList = document.getElementById("agenda-ta-list");
          if (agendaTaList) agendaTaList.style.removeProperty("--agenda-line-h");
        }
      });
    });
  };

  const queueAgendaCalendarLayoutSync = () => {
    if (agendaCalendarSyncFrame !== null) return;
    agendaCalendarSyncFrame = window.requestAnimationFrame(() => {
      agendaCalendarSyncFrame = null;
      syncAgendaCalendarLayout();
      syncAllSegmentedControls();
    });
  };

  const scheduleAgendaCalendarLayoutSync = () => {
    queueAgendaCalendarLayoutSync();

    if (agendaCalendarResizeTimeout !== null) {
      window.clearTimeout(agendaCalendarResizeTimeout);
    }
    if (agendaCalendarViewportSettleTimeout !== null) {
      window.clearTimeout(agendaCalendarViewportSettleTimeout);
    }

    agendaCalendarResizeTimeout = window.setTimeout(() => {
      agendaCalendarResizeTimeout = null;
      queueAgendaCalendarLayoutSync();
    }, 180);

    agendaCalendarViewportSettleTimeout = window.setTimeout(() => {
      agendaCalendarViewportSettleTimeout = null;
      queueAgendaCalendarLayoutSync();
    }, 420);
  };

  const initAgendaTracker = () => {
    if (agendaTrackerInitialized) {
      renderAgendaTracker();
      return;
    }

    const fcContainer = document.getElementById("agenda-fc-calendar");
    if (!fcContainer) return;

    agendaTrackerInitialized = true;

    fcCalendar = new FullCalendar.Calendar(fcContainer, {
      initialView: "dayGridMonth",
      headerToolbar: {
        left: "title",
        center: "",
        right: "prev,next",
      },
      height: "auto",
      fixedWeekCount: true,
      showNonCurrentDates: true,
      events: [],
      datesSet: () => {
        updateFcBadgesAndSummary();
      },
      dateClick: (info) => {
        document
          .querySelectorAll("#agenda-fc-calendar .fc-day-selected")
          .forEach((el) => el.classList.remove("fc-day-selected"));
        info.dayEl.classList.add("fc-day-selected");
        agendaState.selectedDateIso = info.dateStr;
        agendaState.activeTab = "today";
        renderAgendaTabs();
        renderAgendaList();
        queueInsightsLayoutSync();
      },
    });

    fcCalendar.render();
    scheduleAgendaCalendarLayoutSync();

    // Observe calendar panel size changes to keep the agenda list height in sync
    try {
      const calendarPanel = document.querySelector(".agenda-calendar-panel");
      if (calendarPanel && typeof ResizeObserver !== "undefined") {
        if (agendaCalendarHeightObserver) agendaCalendarHeightObserver.disconnect();
        agendaCalendarHeightObserver = new ResizeObserver(() => {
          queueAgendaCalendarLayoutSync();
        });
        agendaCalendarHeightObserver.observe(calendarPanel);
      }

      // Re-sync when breakpoint crosses (desktop <-> mobile)
      if (typeof window !== "undefined") {
        if (agendaBreakpointQuery) {
          try { agendaBreakpointQuery.removeEventListener('change', scheduleAgendaCalendarLayoutSync); } catch (e) {}
        }
        agendaBreakpointQuery = window.matchMedia("(min-width: 950px)");
        if (agendaBreakpointQuery.addEventListener) {
          agendaBreakpointQuery.addEventListener("change", scheduleAgendaCalendarLayoutSync);
        } else if (agendaBreakpointQuery.addListener) {
          agendaBreakpointQuery.addListener(scheduleAgendaCalendarLayoutSync);
        }
      }
    } catch (err) {
      // Leave the default layout in place if size observation is unavailable.
    }

    // Mark today as selected on init
    const todayEl = fcContainer.querySelector(".fc-day-today");
    if (todayEl) todayEl.classList.add("fc-day-selected");

    document.querySelectorAll(".agenda-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabName = btn.getAttribute("data-agenda-tab");
        if (!tabName) return;
        agendaState.activeTab = tabName;
        if (tabName === "today") {
          agendaState.selectedDateIso = toIsoDateLocal(new Date());
          fcCalendar.today();
          // Highlight today
          document
            .querySelectorAll("#agenda-fc-calendar .fc-day-selected")
            .forEach((el) => el.classList.remove("fc-day-selected"));
          const todayDayEl = fcContainer.querySelector(".fc-day-today");
          if (todayDayEl) todayDayEl.classList.add("fc-day-selected");
        }
        renderAgendaTabs();
        renderAgendaList();
      });
    });

    renderAgendaList();
  };

  return {
    initAgendaTracker, renderAgendaTracker, queueAgendaCalendarLayoutSync,
    scheduleAgendaCalendarLayoutSync,
    syncSegmentedControl, syncAllSegmentedControls,
  };
};
