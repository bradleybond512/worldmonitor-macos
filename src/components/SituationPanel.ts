/**
 * Situation Awareness Panel
 *
 * Displays active Situations — correlated clusters of weak signals that
 * describe unfolding real-world events. Each situation shows:
 *  - Phase badge (emerging/developing/active/de-escalating)
 *  - Domain icon and title
 *  - Contributing signal count + confidence bar
 *  - Projected scenarios with probability bars
 *  - Personalized action cards with urgency indicators
 */

import { Panel } from './Panel';
import { situationEngine } from '@/services/situation-engine';
import type {
  Situation,
  SituationPhase,
  Scenario,
  ActionCard,
  ActionUrgency,
  SituationDomain,
  ScenarioSeverity,
} from '@/services/situation-types';

// ── Constants ────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<SituationPhase, string> = {
  emerging: 'EMERGING',
  developing: 'DEVELOPING',
  active: 'ACTIVE',
  'de-escalating': 'DE-ESC',
  resolved: 'RESOLVED',
};

const PHASE_COLORS: Record<SituationPhase, string> = {
  emerging: '#888',
  developing: '#f0ad4e',
  active: '#d9534f',
  'de-escalating': '#5bc0de',
  resolved: '#5cb85c',
};

const DOMAIN_ICONS: Record<SituationDomain, string> = {
  military: '\u2694',      // ⚔
  economic: '\u{1F4C8}',   // 📈
  natural_hazard: '\u26A0', // ⚠
  cyber: '\u{1F6E1}',      // 🛡
  infrastructure: '\u26A1', // ⚡
  health: '\u{1F3E5}',     // 🏥
  civil_unrest: '\u{1F4E2}', // 📢
  compound: '\u{1F310}',   // 🌐
};

const URGENCY_COLORS: Record<ActionUrgency, string> = {
  immediate: '#d9534f',
  soon: '#f0ad4e',
  monitor: '#5bc0de',
  fyi: '#888',
};

const SEVERITY_COLORS: Record<ScenarioSeverity, string> = {
  catastrophic: '#a00',
  severe: '#d9534f',
  moderate: '#f0ad4e',
  minor: '#5bc0de',
  positive: '#5cb85c',
};

// ── Panel ────────────────────────────────────────────────────────────────────

export class SituationPanel extends Panel {
  private readonly _unsub: () => void;
  private _expandedSitId: string | null = null;

  constructor() {
    super({
      id: 'situation-awareness',
      title: 'Situation Awareness',
      showCount: true,
      className: 'sit-panel',
    });

    this._unsub = situationEngine.subscribe(() => this.render());
    situationEngine.start();
    this.render();
  }

  override destroy(): void {
    this._unsub();
    situationEngine.stop();
    super.destroy();
  }

  private render(): void {
    const el = this.getContentElement();
    if (!el) return;

    const situations = situationEngine.getSituations();
    if (this.countEl) this.countEl.textContent = String(situationEngine.getActiveCount());

    if (situations.length === 0) {
      el.innerHTML = '<div class="sit-empty">No active situations. Signals are being monitored.</div>';
      return;
    }

    const frag = document.createDocumentFragment();

    for (const sit of situations) {
      const card = this.renderSituation(sit);
      frag.appendChild(card);
    }

    el.innerHTML = '';
    el.appendChild(frag);
  }

  private renderSituation(sit: Situation): HTMLElement {
    const card = document.createElement('div');
    card.className = `sit-card sit-phase-${sit.phase}`;
    card.dataset.sitId = sit.id;

    const isExpanded = this._expandedSitId === sit.id;

    // Header row
    const header = document.createElement('div');
    header.className = 'sit-header';
    header.innerHTML = `
      <span class="sit-domain-icon">${DOMAIN_ICONS[sit.domain]}</span>
      <span class="sit-title">${this.esc(sit.title)}</span>
      <span class="sit-phase-badge" style="background:${PHASE_COLORS[sit.phase]}">${PHASE_LABELS[sit.phase]}</span>
    `;
    header.addEventListener('click', () => {
      this._expandedSitId = isExpanded ? null : sit.id;
      this.render();
    });
    card.appendChild(header);

    // Confidence bar
    const confBar = document.createElement('div');
    confBar.className = 'sit-conf-bar';
    confBar.innerHTML = `
      <div class="sit-conf-fill" style="width:${Math.round(sit.confidence * 100)}%;background:${PHASE_COLORS[sit.phase]}"></div>
      <span class="sit-conf-label">${Math.round(sit.confidence * 100)}% · ${sit.signals.length} signals · ${sit.domainDiversity} domain${sit.domainDiversity === 1 ? '' : 's'}</span>
    `;
    card.appendChild(confBar);

    // Summary
    const summary = document.createElement('div');
    summary.className = 'sit-summary';
    summary.textContent = sit.summary;
    card.appendChild(summary);

    if (isExpanded) {
      // Geo
      if (sit.geo.label) {
        const geo = document.createElement('div');
        geo.className = 'sit-geo';
        geo.textContent = `📍 ${sit.geo.label}${sit.geo.countries.length > 0 ? ` (${sit.geo.countries.join(', ')})` : ''}`;
        card.appendChild(geo);
      }

      // Scenarios
      if (sit.scenarios.length > 0) {
        const scenSection = document.createElement('div');
        scenSection.className = 'sit-scenarios';
        scenSection.innerHTML = '<div class="sit-section-title">Projected Scenarios</div>';
        for (const sc of sit.scenarios) {
          scenSection.appendChild(this.renderScenario(sc));
        }
        card.appendChild(scenSection);
      }

      // Action cards
      if (sit.actions.length > 0) {
        const actSection = document.createElement('div');
        actSection.className = 'sit-actions';
        actSection.innerHTML = '<div class="sit-section-title">Recommended Actions</div>';
        for (const ac of sit.actions.filter(a => !a.dismissed)) {
          actSection.appendChild(this.renderAction(ac));
        }
        card.appendChild(actSection);
      }

      // Contributing signals
      if (sit.signals.length > 0) {
        const sigSection = document.createElement('div');
        sigSection.className = 'sit-signals-list';
        sigSection.innerHTML = '<div class="sit-section-title">Contributing Signals</div>';
        for (const sig of sit.signals.slice(0, 8)) {
          const sigEl = document.createElement('div');
          sigEl.className = 'sit-signal-item';
          sigEl.innerHTML = `
            <span class="sit-sig-type">${this.esc(sig.type)}</span>
            <span class="sit-sig-conf">${Math.round(sig.confidence * 100)}%</span>
            <span class="sit-sig-time">${this.relTime(sig.timestamp)}</span>
          `;
          sigSection.appendChild(sigEl);
        }
        card.appendChild(sigSection);
      }

      // Evidence verdict
      if (sit.evidence) {
        const evid = document.createElement('div');
        evid.className = `sit-evidence sit-ev-${sit.evidence.verdict}`;
        evid.innerHTML = `
          <span class="sit-ev-verdict">${sit.evidence.verdict.toUpperCase()}</span>
          <span class="sit-ev-reason">${this.esc(sit.evidence.confidenceReason)}</span>
          <span class="sit-ev-action">Action: ${sit.evidence.actionThreshold}</span>
        `;
        card.appendChild(evid);
      }
    }

    return card;
  }

  private renderScenario(sc: Scenario): HTMLElement {
    const el = document.createElement('div');
    el.className = 'sit-scenario';
    el.innerHTML = `
      <div class="sit-sc-header">
        <span class="sit-sc-label">${this.esc(sc.label)}</span>
        <span class="sit-sc-prob" style="color:${SEVERITY_COLORS[sc.severity]}">${Math.round(sc.probability * 100)}%</span>
      </div>
      <div class="sit-sc-bar">
        <div class="sit-sc-fill" style="width:${Math.round(sc.probability * 100)}%;background:${SEVERITY_COLORS[sc.severity]}"></div>
      </div>
      <div class="sit-sc-desc">${this.esc(sc.description)}</div>
      <div class="sit-sc-horizon">${sc.horizonHours}h horizon · ${sc.severity}</div>
    `;
    return el;
  }

  private renderAction(ac: ActionCard): HTMLElement {
    const el = document.createElement('div');
    el.className = `sit-action sit-act-${ac.urgency}`;
    el.innerHTML = `
      <div class="sit-act-header">
        <span class="sit-act-urgency" style="background:${URGENCY_COLORS[ac.urgency]}">${ac.urgency.toUpperCase()}</span>
        <span class="sit-act-headline">${this.esc(ac.headline)}</span>
      </div>
      <div class="sit-act-rationale">${this.esc(ac.rationale)}</div>
      <ul class="sit-act-steps">${ac.steps.map(s => `<li>${this.esc(s)}</li>`).join('')}</ul>
    `;

    // Dismiss button
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'sit-act-dismiss';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ac.dismissed = true;
      this.render();
    });
    el.appendChild(dismissBtn);

    return el;
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  private esc(s: string): string {
    const el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  }

  private relTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
    return `${Math.round(diff / 86400000)}d ago`;
  }
}
