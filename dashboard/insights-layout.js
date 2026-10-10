// Coordinate Insights card heights with Agenda and segmented controls.
export const createInsightsLayout = ({
  queueAgendaCalendarLayoutSync, syncAllSegmentedControls,
}) => {
  let insightsHeightObserver = null;
  let insightsHeightFrame = null;
  let insightsResizeTimeout = null;
  let insightsViewportSettleTimeout = null;
  let insightsBreakpointQuery = null;

  const syncInsightsLayout = () => {
    const leftColumn = document.querySelector(".insights-left-col");
    const officialsCard = document.querySelector(".insight-card-os");
    const officialsListWrap = officialsCard?.querySelector(".os-list-wrap");
    const officialsHeading = officialsCard?.querySelector(
      ".insight-card-heading",
    );
    const insightsPane = document.getElementById("tab-insights");
    if (!leftColumn || !officialsCard) return;

    if (window.matchMedia("(max-width: 950px)").matches) {
      officialsCard.style.height = "";
      if (officialsListWrap) {
        officialsListWrap.style.height = "";
        officialsListWrap.style.maxHeight = "";
      }
      return;
    }

    if (!insightsPane || !insightsPane.classList.contains("active")) {
      return;
    }

    const leftCards = leftColumn.querySelectorAll(".insight-card");
    const leftStyles = window.getComputedStyle(leftColumn);
    const leftGap = parseFloat(leftStyles.rowGap || leftStyles.gap) || 0;
    const naturalLeftHeight = leftCards.length
      ? Array.from(leftCards).reduce(
          (total, card) => total + Math.ceil(card.getBoundingClientRect().height),
          0,
        ) +
        Math.max(0, leftCards.length - 1) * leftGap
      : Math.ceil(leftColumn.getBoundingClientRect().height);

    if (naturalLeftHeight > 0) {
      const cardHeight = naturalLeftHeight;
      officialsCard.style.height = `${cardHeight}px`;

      if (officialsListWrap) {
        const cardStyles = window.getComputedStyle(officialsCard);
        const paddingTop = parseFloat(cardStyles.paddingTop) || 0;
        const paddingBottom = parseFloat(cardStyles.paddingBottom) || 0;
        const headingHeight = officialsHeading
          ? Math.ceil(officialsHeading.getBoundingClientRect().height)
          : 0;
        const reservedSpace = Math.ceil(
          paddingTop + paddingBottom + headingHeight + 12,
        );
        const desktopListHeight = Math.max(140, cardHeight - reservedSpace);
        officialsListWrap.style.height = `${desktopListHeight}px`;
        officialsListWrap.style.maxHeight = `${desktopListHeight}px`;
      }
    }
  };

  const queueInsightsLayoutSync = () => {
    if (insightsHeightFrame !== null) return;
    insightsHeightFrame = window.requestAnimationFrame(() => {
      insightsHeightFrame = null;
      syncInsightsLayout();
    });
  };

  const scheduleInsightsLayoutSync = () => {
    queueInsightsLayoutSync();
    queueAgendaCalendarLayoutSync();
    syncAllSegmentedControls();

    if (insightsResizeTimeout !== null) {
      window.clearTimeout(insightsResizeTimeout);
    }
    if (insightsViewportSettleTimeout !== null) {
      window.clearTimeout(insightsViewportSettleTimeout);
    }

    insightsResizeTimeout = window.setTimeout(() => {
      insightsResizeTimeout = null;
      queueInsightsLayoutSync();
      queueAgendaCalendarLayoutSync();
      syncAllSegmentedControls();
    }, 180);

    insightsViewportSettleTimeout = window.setTimeout(() => {
      insightsViewportSettleTimeout = null;
      queueInsightsLayoutSync();
      queueAgendaCalendarLayoutSync();
      syncAllSegmentedControls();
    }, 420);
  };

  const initInsightsLayoutSync = () => {
    const leftColumn = document.querySelector(".insights-left-col");
    if (!leftColumn) return;

    if (insightsHeightObserver) {
      insightsHeightObserver.disconnect();
    }

    if ("ResizeObserver" in window) {
      insightsHeightObserver = new ResizeObserver(() => {
        queueInsightsLayoutSync();
      });
      insightsHeightObserver.observe(leftColumn);
    }

    insightsBreakpointQuery = window.matchMedia("(max-width: 950px)");
    if (typeof insightsBreakpointQuery.addEventListener === "function") {
      insightsBreakpointQuery.addEventListener(
        "change",
        scheduleInsightsLayoutSync,
      );
    } else if (typeof insightsBreakpointQuery.addListener === "function") {
      insightsBreakpointQuery.addListener(scheduleInsightsLayoutSync);
    }

    window.addEventListener("resize", scheduleInsightsLayoutSync);
    window.addEventListener("load", queueInsightsLayoutSync);
    queueInsightsLayoutSync();
  };

  return { queueInsightsLayoutSync, scheduleInsightsLayoutSync, initInsightsLayoutSync };
};
