// Minimal RFC 4180 CSV reader/writer (quoted fields, escaped quotes, CRLF/LF).
// Pure module, no dependencies.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// Turns parsed rows (first row = header) into objects keyed by header name.
export function rowsToRecords(rows) {
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  const keys = header.map((name) => name.trim());
  return body.map((cells) =>
    Object.fromEntries(keys.map((key, index) => [key, (cells[index] ?? '').trim()])),
  );
}

export function stringifyCsv(rows) {
  return rows
    .map((cells) =>
      cells
        .map((cell) => {
          const text = cell == null ? '' : String(cell);
          return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(','),
    )
    .join('\r\n');
}
