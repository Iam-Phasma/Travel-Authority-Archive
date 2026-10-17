// Coordinates are relative to the layout viewport, including visual viewport offsets.
export function getCalendarPosition(anchor, calendar, viewport) {
    const margin = 12;
    const gap = 5;
    const minTop = viewport.top + margin;
    const maxBottom = viewport.top + viewport.height - margin;
    const height = Math.min(calendar.height, Math.max(0, viewport.height - margin * 2));
    const below = maxBottom - anchor.bottom - gap;
    const above = anchor.top - gap - minTop;
    const openAbove = below < height && above > below;
    const preferredTop = openAbove ? anchor.top - gap - height : anchor.bottom + gap;
    return {
        top: Math.max(minTop, Math.min(preferredTop, maxBottom - height)),
        left: Math.max(viewport.left + margin, Math.min(anchor.left,
            viewport.left + viewport.width - margin - calendar.width)),
    };
}
