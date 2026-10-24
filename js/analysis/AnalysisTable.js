/**
 * AnalysisTable.js - builds one accessible, sortable section from a runner
 * section descriptor. All presentation is via CSS classes / data attributes.
 */
const BADGES = { observation: 'Direct observation', statistic: 'Statistical measurement', interpretation: 'Interpretation (not proof)' };

export default class AnalysisTable {
  static format(v) {
    if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) return '–';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
    return String(v);
  }

  /** Pure comparator-based sort; nulls always last. */
  static sortRows(rows, key, direction = 'asc', numeric = false) {
    const sign = direction === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const x = a[key], y = b[key];
      if ((x ?? null) === null) return (y ?? null) === null ? 0 : 1;
      if ((y ?? null) === null) return -1;
      return sign * (numeric ? x - y : String(x).localeCompare(String(y)));
    });
  }

  static build(doc, section) {
    const wrap = doc.createElement('section');
    wrap.className = 'analysis-block'; wrap.dataset.kind = section.kind; wrap.dataset.analysis = section.analysis;
    const head = doc.createElement('h3'); head.textContent = section.title;
    const badge = doc.createElement('span'); badge.className = 'analysis-badge'; badge.textContent = BADGES[section.kind] ?? section.kind;
    head.append(' ', badge); wrap.appendChild(head);
    const notes = [...section.notes, ...(section.truncated ? ['Results were truncated; raise the result limit or the minimum frequency to see more.'] : [])];
    if (notes.length) { const ul = doc.createElement('ul'); ul.className = 'analysis-notes'; for (const n of notes) { const li = doc.createElement('li'); li.textContent = n; ul.appendChild(li); } wrap.appendChild(ul); }
    if (!section.rows.length) {
      const p = doc.createElement('p'); p.className = 'analysis-empty'; p.textContent = section.emptyText ?? 'No results for the current filters.'; wrap.appendChild(p);
      return wrap;
    }
    const hasDetails = section.rows.some((r) => r.details?.length);
    const table = doc.createElement('table'); table.className = 'analysis-table';
    const thead = doc.createElement('thead'), hr = doc.createElement('tr'), tbody = doc.createElement('tbody');
    let state = { key: null, direction: 'asc' };
    const render = () => {
      tbody.replaceChildren();
      const rows = state.key ? AnalysisTable.sortRows(section.rows, state.key, state.direction, section.columns.find((c) => c.key === state.key).numeric) : section.rows;
      for (const row of rows) {
        const tr = doc.createElement('tr');
        for (const c of section.columns) { const td = doc.createElement('td'); td.textContent = AnalysisTable.format(row[c.key]); if (c.numeric) td.className = 'is-numeric'; tr.appendChild(td); }
        if (hasDetails) {
          const td = doc.createElement('td');
          if (row.details?.length) {
            const d = doc.createElement('details'), s = doc.createElement('summary'), ul = doc.createElement('ul');
            s.textContent = `${row.details.length} source${row.details.length === 1 ? '' : 's'}`;
            for (const t of row.details) { const li = doc.createElement('li'); li.textContent = t; ul.appendChild(li); }
            d.append(s, ul); td.appendChild(d);
          }
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    };
    for (const c of section.columns) {
      const th = doc.createElement('th'), b = doc.createElement('button');
      th.scope = 'col'; b.type = 'button'; b.className = 'sort-button'; b.textContent = c.label;
      b.addEventListener('click', () => {
        state = { key: c.key, direction: state.key === c.key && state.direction === 'asc' ? 'desc' : 'asc' };
        for (const other of hr.children) other.removeAttribute('aria-sort');
        th.setAttribute('aria-sort', state.direction === 'asc' ? 'ascending' : 'descending'); render();
      });
      th.appendChild(b); hr.appendChild(th);
    }
    if (hasDetails) { const th = doc.createElement('th'); th.scope = 'col'; th.textContent = 'Source locations'; hr.appendChild(th); }
    thead.appendChild(hr); table.append(thead, tbody); render();
    const scroll = doc.createElement('div'); scroll.className = 'analysis-scroll'; scroll.appendChild(table); wrap.appendChild(scroll);
    return wrap;
  }
}
