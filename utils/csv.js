"use strict";

/**
 * Parse CSV text into an array of rows (arrays of strings).
 * Handles quoted fields, "" escapes, commas/newlines inside quotes,
 * CRLF line endings, a UTF-8 BOM (Excel), and ; as the delimiter
 * when the header line has no commas (Excel in some locales).
 */
export const parseCsv = (text) => {
    const input = String(text || "").replace(/^﻿/, "");
    const firstLine = input.split(/\r?\n/, 1)[0] || "";
    const delimiter = !firstLine.includes(",") && firstLine.includes(";") ? ";" : ",";

    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < input.length; i += 1) {
        const char = input[i];

        if (inQuotes) {
            if (char === '"' && input[i + 1] === '"') {
                field += '"';
                i += 1;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                field += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === delimiter) {
            row.push(field);
            field = "";
        } else if (char === "\n" || char === "\r") {
            if (char === "\r" && input[i + 1] === "\n") {
                i += 1;
            }

            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += char;
        }
    }

    if (field !== "" || row.length) {
        row.push(field);
        rows.push(row);
    }

    // Drop blank lines (e.g. trailing newlines, empty Excel rows).
    return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
};

/** CSV rows -> objects keyed by the (lower-cased, trimmed) header. */
export const csvToObjects = (text) => {
    const [header = [], ...rows] = parseCsv(text);
    const keys = header.map((key) => key.trim().toLowerCase().replace(/\s+/g, "_"));

    return {
        columns: keys,
        rows: rows.map((cells) => Object.fromEntries(keys.map((key, index) => [key, (cells[index] ?? "").trim()]))),
    };
};
