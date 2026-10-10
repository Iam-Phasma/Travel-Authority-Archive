// Shared batching and request lifecycle; each page supplies its own queries and rows.
export const renderRecordBatch = ({
  body, sentinel, rows, batchSize, from = 0, append = false,
  buildRow, applyColumnVisibility, bindRowEvents,
}) => {
  const to = Math.min(from + batchSize, rows.length);
  if (!append && !rows.length) {
    body.innerHTML = '<tr><td colspan="8">No records match the current filters.</td></tr>';
    applyColumnVisibility();
  } else {
    const html = rows.slice(from, to)
      .map((row, index) => buildRow(row, from + index, index)).join("");
    let newRows;
    if (append) {
      const temporaryBody = body.ownerDocument.createElement("tbody");
      temporaryBody.innerHTML = html;
      newRows = Array.from(temporaryBody.querySelectorAll("tr"));
      newRows.forEach((row) => body.appendChild(row));
    } else {
      body.innerHTML = html;
      newRows = Array.from(body.querySelectorAll("tr"));
    }
    applyColumnVisibility();
    bindRowEvents(newRows);
  }
  if (sentinel) sentinel.style.display = to < rows.length ? "flex" : "none";
  return to;
};

export const createRecordsLoader = ({ onStart, fetchRecords, onLoaded, onError }) => {
  let loading = false;
  return {
    get loading() { return loading; },
    async load(reset = false) {
      if (loading) return;
      loading = true;
      try {
        onStart(reset);
        const { data, error } = await fetchRecords();
        if (error) throw error;
        await onLoaded(data || []);
      } catch (error) {
        onError(error);
      } finally {
        loading = false;
      }
    },
  };
};
