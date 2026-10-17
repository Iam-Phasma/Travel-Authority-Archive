// Reuse the original controls so filtering, sorting, and refresh behavior stay intact.
export const setupRecordToolbar = (panel) => {
  setupRecordPopovers(panel);
  const controls = panel.querySelector(".panel-head-actions-buttons");
  const menu = document.createElement("div");
  menu.className = "record-tools-menu";
  menu.id = `${panel.id}-tools-menu`;
  menu.append(...controls.children);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "filter-icon-btn record-tools-toggle";
  toggle.setAttribute("aria-label", "Record actions");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", menu.id);
  toggle.innerHTML = '<svg class="icon-line" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="white"/><circle cx="15" cy="17" r="3" fill="white"/></svg>';
  controls.append(toggle, menu);
  const close = () => {
    controls.classList.remove("tools-open");
    toggle.setAttribute("aria-expanded", "false");
  };
  toggle.addEventListener("click", () => {
    const open = controls.classList.toggle("tools-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  menu.addEventListener("click", (event) => {
    if (event.target.closest("button")) close();
  });
  document.addEventListener("click", (event) => {
    if (!controls.contains(event.target)) close();
  });
  controls.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
      toggle.focus();
    }
  });
  window.matchMedia("(max-width: 768px)").addEventListener("change", close);
};

// Position within the visible viewport, including when the phone keyboard opens.
const setupRecordPopovers = (panel) => {
  const popovers = [...panel.querySelectorAll(":scope > .filter-panel")];
  const phone = window.matchMedia("(max-width: 768px)");
  const position = () => {
    for (const popover of popovers) {
      if (!phone.matches) {
        for (const property of ["left", "top", "right", "max-height"]) {
          popover.style.removeProperty(property);
        }
        continue;
      }
      if (!popover.classList.contains("show")) continue;
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft || 0) + 12;
      const topEdge = (viewport?.offsetTop || 0) + 12;
      const width = viewport?.width || document.documentElement.clientWidth;
      const height = viewport?.height || window.innerHeight;
      const bottomEdge = topEdge + height - 24;
      popover.style.maxHeight = `${Math.max(0, height - 24)}px`;
      popover.style.right = "auto";
      popover.style.left = "0px";
      popover.style.top = "0px";
      const origin = popover.getBoundingClientRect();
      const anchor = panel.querySelector(".panel-head-actions").getBoundingClientRect();
      const left = Math.max(leftEdge, Math.min(anchor.right - origin.width, leftEdge + width - 24 - origin.width));
      const top = Math.max(topEdge, Math.min(anchor.bottom + 8, bottomEdge - origin.height));
      popover.style.left = `${left - origin.left}px`;
      popover.style.top = `${top - origin.top}px`;
    }
  };
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; position(); });
  };
  const observer = new MutationObserver(position);
  for (const popover of popovers) {
    observer.observe(popover, { attributes: true, attributeFilter: ["class"] });
    new ResizeObserver(schedule).observe(popover);
    popover.addEventListener("keydown", (event) => {
      if (event.key === "Escape") popover.classList.remove("show");
    });
  }
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", (event) => {
    if (!popovers.some((popover) => popover.contains(event.target))) schedule();
  }, true);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
  phone.addEventListener("change", position);
};
