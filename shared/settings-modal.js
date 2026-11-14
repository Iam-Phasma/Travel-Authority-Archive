export const collapseSettingsSections = (modal) => {
  modal?.querySelectorAll("details[open]").forEach((section) => {
    section.open = false;
  });
};
