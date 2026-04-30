import { Panel } from './Panel';
import type { DiseaseIntelData } from '@/services/disease-intel';
import { getGlobalVariants, resolveOutbreakCoords } from '@/services/disease-intel';
import { escapeHtml } from '@/utils/sanitize';

type Tab = 'variants' | 'countries' | 'alerts';

export class DiseaseIntelPanel extends Panel {
  private data: DiseaseIntelData | null = null;
  private activeTab: Tab = 'variants';

  constructor() {
    super({
      id: 'disease-intel',
      title: 'Disease Intelligence',
      showCount: true,
      trackActivity: true,
      infoTooltip: 'COVID variant frequencies (Nextstrain genomic surveillance), active case counts by country (disease.sh), epidemic declarations (UN OCHA), and WHO Disease Outbreak News. No API key required.',
    });
    this.showLoading('Fetching disease intelligence...');
  }

  public update(data: DiseaseIntelData | null): void {
    this.data = data;
    if (!data) {
      this.showError('Disease intelligence data unavailable — all sources failed.');
      return;
    }
    const alertCount = data.epidemicEvents.length + data.whoDon.length;
    this.setCount(alertCount);
    this.render();
  }

  private render(): void {
    const data = this.data;
    if (!data) return;

    const el = this.getContentElement();
    // All dynamic values are passed through escapeHtml — innerHTML is safe here
    el.innerHTML = `
      <div class="di-panel">
        <div class="di-tabs">
          <button class="di-tab${this.activeTab === 'variants' ? ' di-tab--active' : ''}" data-tab="variants">Variants</button>
          <button class="di-tab${this.activeTab === 'countries' ? ' di-tab--active' : ''}" data-tab="countries">Countries</button>
          <button class="di-tab${this.activeTab === 'alerts' ? ' di-tab--active' : ''}" data-tab="alerts">Alerts</button>
        </div>
        <div class="di-body">
          ${this.activeTab === 'variants' ? this.renderVariants(data) : ''}
          ${this.activeTab === 'countries' ? this.renderCountries(data) : ''}
          ${this.activeTab === 'alerts' ? this.renderAlerts(data) : ''}
        </div>
      </div>
    `;

    el.querySelectorAll<HTMLButtonElement>('.di-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab as Tab;
        this.render();
      });
    });

    el.addEventListener('click', (e) => {
      const target = (e.target as Element).closest('[data-url]') as HTMLElement | null;
      if (!target) return;
      const url = target.dataset.url;
      if (url?.startsWith('https://')) window.open(url, '_blank', 'noopener');
    });
  }

  private renderVariants(data: DiseaseIntelData): string {
    const clades = getGlobalVariants(data).slice(0, 15);
    if (clades.length === 0) {
      return '<div class="panel-empty">Variant data unavailable.</div>';
    }

    const rows = clades.map(c => {
      const freq = (c.freq.value * 100).toFixed(1);
      const gaVal = c.ga.value;
      const gaStr = gaVal >= 0 ? `+${gaVal.toFixed(2)}` : gaVal.toFixed(2);
      let gaColor = 'opacity:0.7';
      if (gaVal > 0.05) gaColor = 'color:#ff6b6b';
      else if (gaVal < -0.05) gaColor = 'color:#6bff9e';
      const topCountry = getTopCountryForClade(data, c.clade);
      return `<tr>
        <td><strong>${escapeHtml(c.clade)}</strong></td>
        <td>${freq}%</td>
        <td style="${gaColor}">${gaStr}</td>
        <td style="opacity:0.75">${escapeHtml(topCountry)}</td>
      </tr>`;
    }).join('');

    return `
      <table class="eq-table">
        <thead><tr><th>Clade</th><th>Freq</th><th>Growth Adv</th><th>Leading In</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="fires-footer">
        <span class="fires-source">Nextstrain open GenBank pipeline · sorted by growth advantage</span>
        <span class="fires-updated">${timeAgo(data.fetchedAt)}</span>
      </div>
    `;
  }

  private renderCountries(data: DiseaseIntelData): string {
    const countries = data.covidCountries.slice(0, 50);
    if (countries.length === 0) {
      return '<div class="panel-empty">Country case data unavailable.</div>';
    }

    const rows = countries.map(c => {
      const perM = c.casesPerOneMillion;
      let rowClass = 'eq-row';
      if (perM > 5000) rowClass = 'eq-row eq-major';
      else if (perM > 1000) rowClass = 'eq-row eq-strong';
      const today = c.todayCases > 0 ? `+${c.todayCases.toLocaleString()}` : '—';
      return `<tr class="${rowClass}">
        <td>${escapeHtml(c.country)}</td>
        <td>${c.active.toLocaleString()}</td>
        <td style="opacity:0.8">${today}</td>
        <td style="opacity:0.7">${perM > 0 ? perM.toLocaleString() : '—'}</td>
      </tr>`;
    }).join('');

    return `
      <table class="eq-table">
        <thead><tr><th>Country</th><th>Active</th><th>Today</th><th>/ 1M</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="fires-footer">
        <span class="fires-source">disease.sh · ${countries.length} countries</span>
        <span class="fires-updated">${timeAgo(data.fetchedAt)}</span>
      </div>
    `;
  }

  private renderAlerts(data: DiseaseIntelData): string {
    interface AlertRow {
      badge: string;
      rowClass: string;
      disease: string;
      country: string;
      iso3?: string;
      date: Date;
      url: string;
    }
    const rows: AlertRow[] = [];

    for (const e of data.epidemicEvents) {
      rows.push({
        badge: e.status === 'alert' ? 'ALERT' : 'ONGOING',
        rowClass: e.status === 'alert' ? 'eq-row eq-major' : 'eq-row eq-strong',
        disease: extractDiseaseName(e.name),
        country: e.country,
        iso3: e.iso3,
        date: e.date,
        url: e.url,
      });
    }
    for (const w of data.whoDon) {
      rows.push({
        badge: 'DON',
        rowClass: 'eq-row',
        disease: w.disease,
        country: w.country,
        date: w.date,
        url: w.url,
      });
    }

    rows.sort((a, b) => b.date.getTime() - a.date.getTime());

    if (rows.length === 0) {
      return '<div class="panel-empty">No active epidemic declarations or DON alerts.</div>';
    }

    const located: AlertRow[] = [];
    const unlocated: AlertRow[] = [];
    for (const r of rows) {
      const coords = resolveOutbreakCoords(r.country, data.covidCountries, r.iso3);
      if (coords) located.push(r);
      else unlocated.push(r);
    }

    const html = located.slice(0, 40).map(r => {
      const cursor = r.url ? 'cursor:pointer' : '';
      const urlAttr = r.url ? 'data-url="' + escapeHtml(r.url) + '"' : '';
      return `<tr class="${r.rowClass}" ${urlAttr} style="${cursor}">
        <td><span class="sev-badge">${r.badge}</span></td>
        <td>${escapeHtml(r.disease)}</td>
        <td>${escapeHtml(r.country)}</td>
        <td style="opacity:0.7">${timeAgo(r.date)}</td>
      </tr>`;
    }).join('');

    const unlocatedHtml = unlocated.length === 0 ? '' : `
      <div style="margin-top:12px;padding:8px 10px;border-top:1px solid var(--panel-border,rgba(255,255,255,0.08));">
        <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:11px;margin-bottom:6px;">
          <span style="color:#ffb84a;font-weight:600;">⚠ Unlocated alerts (${unlocated.length})</span>
          <span style="opacity:0.55;">not shown on map — country could not be matched</span>
        </div>
        <ul style="list-style:none;margin:0;padding:0;font-size:11px;line-height:1.55;">
          ${unlocated.slice(0, 20).map(r => {
            const cursor = r.url ? 'cursor:pointer;text-decoration:underline' : '';
            const urlAttr = r.url ? 'data-url="' + escapeHtml(r.url) + '"' : '';
            return `<li ${urlAttr} style="${cursor};display:grid;grid-template-columns:48px 1fr auto auto;gap:8px;padding:2px 0;">
              <span style="opacity:0.65;font-family:monospace;font-size:10px;">${r.badge}</span>
              <span>${escapeHtml(r.disease)}</span>
              <span style="opacity:0.7;">${escapeHtml(r.country || '(no country)')}</span>
              <span style="opacity:0.5;">${timeAgo(r.date)}</span>
            </li>`;
          }).join('')}
        </ul>
      </div>
    `;

    const locatedTable = located.length === 0
      ? '<div class="panel-empty">No locatable alerts.</div>'
      : `<table class="eq-table">
          <thead><tr><th>Type</th><th>Disease</th><th>Country</th><th>Age</th></tr></thead>
          <tbody>${html}</tbody>
        </table>`;

    return `
      ${locatedTable}
      ${unlocatedHtml}
      <div class="fires-footer">
        <span class="fires-source">UN OCHA ReliefWeb · WHO Disease Outbreak News</span>
        <span class="fires-updated">${timeAgo(data.fetchedAt)}</span>
      </div>
    `;
  }
}

function getTopCountryForClade(data: DiseaseIntelData, clade: string): string {
  let best: { location: string; freq: number } | null = null;
  for (const loc of data.variants) {
    if (loc.location.toLowerCase() === 'global') continue;
    const c = loc.clades.find(c => c.clade === clade);
    if (c && (!best || c.freq.value > best.freq)) {
      best = { location: loc.location, freq: c.freq.value };
    }
  }
  return best?.location ?? '—';
}

function extractDiseaseName(name: string): string {
  const dash = name.indexOf(' - ');
  return dash > 0 ? name.slice(0, dash).trim() : name.split(/[,()]/)[0]?.trim() ?? name;
}

function timeAgo(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
