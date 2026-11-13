export const chunkOfficialsByLines = (officials, maxLinesPerPage) => {
    const chunks = [];
    let chunk = [];
    let usedLines = 0;

    officials.forEach((official) => {
        const lineCount = Math.max(1, Number(official.lineCount) || 1);
        if (chunk.length && usedLines + lineCount > maxLinesPerPage) {
            chunks.push(chunk);
            chunk = [];
            usedLines = 0;
        }
        chunk.push(official);
        usedLines += lineCount;
    });

    if (chunk.length) chunks.push(chunk);
    return chunks;
};
