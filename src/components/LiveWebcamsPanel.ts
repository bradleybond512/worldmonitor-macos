import { Panel } from './Panel';
import { isDesktopRuntime, getApiBaseUrl } from '@/services/runtime';
import { t } from '../services/i18n';
import { trackWebcamSelected, trackWebcamRegionFiltered } from '@/services/analytics';
import { getStreamQuality, subscribeStreamQualityChange } from '@/services/ai-flow-settings';
import {
  getWebcamFeeds,
  addCustomWebcam,
  clearWebcamCache,
  type WebcamFeed,
  type WebcamRegion,
  type WebcamSource,
} from '@/services/webcam-sources';

const MAX_GRID_CELLS = 4;

type ViewMode = 'grid' | 'single';
type RegionFilter = 'all' | WebcamRegion;

export class LiveWebcamsPanel extends Panel {
  private viewMode: ViewMode = 'grid';
  private regionFilter: RegionFilter = 'iran';
  private activeFeed: WebcamFeed | null = null;
  private toolbar: HTMLElement | null = null;
  private iframes: HTMLIFrameElement[] = [];
  private imageIntervals: ReturnType<typeof setInterval>[] = [];
  private observer: IntersectionObserver | null = null;
  private isVisible = false;
  private idleTimeout: ReturnType<typeof setTimeout> | null = null;
  private boundIdleResetHandler!: () => void;
  private boundVisibilityHandler!: () => void;
  private readonly IDLE_PAUSE_MS = 5 * 60 * 1000;
  private isIdle = false;
  private _boundYtMsg!: (e: MessageEvent) => void;
  private cachedFeeds: WebcamFeed[] = [];
  private isLoading = false;
  private loadGeneration = 0;
  private staggeredTimeouts: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    super({ id: 'live-webcams', title: t('panels.liveWebcams'), className: 'panel-wide' });
    this.createToolbar();
    this.setupIntersectionObserver();
    this.setupIdleDetection();
    this._setupYtMessageListener();
    subscribeStreamQualityChange(() => this.render());
    // eslint-disable-next-line sonarjs/no-async-constructor
    void this.initFeeds();
  }

  private async initFeeds(): Promise<void> {
    await this.loadFeeds();
    this.render();
  }

  private get filteredFeeds(): WebcamFeed[] {
    return this.cachedFeeds;
  }

  private get gridFeeds(): WebcamFeed[] {
    return this.cachedFeeds.slice(0, MAX_GRID_CELLS);
  }

  private async loadFeeds(): Promise<void> {
    const gen = ++this.loadGeneration;
    this.isLoading = true;
    const region = this.regionFilter === 'all' ? undefined : this.regionFilter as WebcamRegion;
    const feeds = await getWebcamFeeds(region, 24);
    if (gen !== this.loadGeneration) return;
    this.cachedFeeds = feeds;
    this.isLoading = false;
  }

  private createToolbar(): void {
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'webcam-toolbar';

    const regionGroup = document.createElement('div');
    regionGroup.className = 'webcam-toolbar-group';

    const regions: { key: RegionFilter; label: string }[] = [
      { key: 'iran', label: t('components.webcams.regions.iran') },
      { key: 'all', label: t('components.webcams.regions.all') },
      { key: 'middle-east', label: t('components.webcams.regions.mideast') },
      { key: 'europe', label: t('components.webcams.regions.europe') },
      { key: 'americas', label: t('components.webcams.regions.americas') },
      { key: 'asia', label: t('components.webcams.regions.asia') },
    ];

    regions.forEach(({ key, label }) => {
      const btn = document.createElement('button');
      btn.className = `webcam-region-btn${key === this.regionFilter ? ' active' : ''}`;
      btn.dataset.region = key;
      btn.textContent = label;
      btn.addEventListener('click', () => { void this.setRegionFilter(key); });
      regionGroup.append(btn);
    });

    const viewGroup = document.createElement('div');
    viewGroup.className = 'webcam-toolbar-group';

    const gridBtn = document.createElement('button');
    gridBtn.className = `webcam-view-btn${this.viewMode === 'grid' ? ' active' : ''}`;
    gridBtn.dataset.mode = 'grid';
    gridBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>';
    gridBtn.title = 'Grid view';
    gridBtn.addEventListener('click', () => this.setViewMode('grid'));

    const singleBtn = document.createElement('button');
    singleBtn.className = `webcam-view-btn${this.viewMode === 'single' ? ' active' : ''}`;
    singleBtn.dataset.mode = 'single';
    singleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="3" width="18" height="14" rx="2"/><rect x="3" y="19" width="18" height="2" rx="1"/></svg>';
    singleBtn.title = 'Single view';
    singleBtn.addEventListener('click', () => this.setViewMode('single'));

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'webcam-view-btn';
    refreshBtn.title = 'Refresh feeds';
    refreshBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
    refreshBtn.addEventListener('click', () => {
      clearWebcamCache();
      void this.initFeeds();
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'webcam-view-btn';
    addBtn.title = 'Add custom webcam';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => this.openAddWebcamDialog());

    viewGroup.append(gridBtn);
    viewGroup.append(singleBtn);
    viewGroup.append(refreshBtn);
    viewGroup.append(addBtn);

    this.toolbar.append(regionGroup);
    this.toolbar.append(viewGroup);
    this.element.insertBefore(this.toolbar, this.content);
  }

  private async setRegionFilter(filter: RegionFilter): Promise<void> {
    if (filter === this.regionFilter) return;
    trackWebcamRegionFiltered(filter);
    this.regionFilter = filter;
    this.toolbar?.querySelectorAll('.webcam-region-btn').forEach(btn => {
      (btn as HTMLElement).classList.toggle('active', (btn as HTMLElement).dataset.region === filter);
    });
    await this.loadFeeds();
    if (this.cachedFeeds.length > 0 && (!this.activeFeed || !this.cachedFeeds.some(f => f.id === this.activeFeed!.id))) {
      this.activeFeed = this.cachedFeeds[0] ?? null;
    }
    this.render();
  }

  private setViewMode(mode: ViewMode): void {
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    this.toolbar?.querySelectorAll('.webcam-view-btn').forEach(btn => {
      (btn as HTMLElement).classList.toggle('active', (btn as HTMLElement).dataset.mode === mode);
    });
    this.render();
  }

  private buildEmbedUrl(videoId: string): string {
    const quality = getStreamQuality();
    if (isDesktopRuntime()) {
      // Use local sidecar embed — YouTube rejects tauri:// parent origin with error 153.
      // Must use getApiBaseUrl() (http://127.0.0.1:PORT) — the Tauri CSP frame-src only
      // allows http://127.0.0.1:* and WKWebView treats localhost as a distinct origin.
      const params = new URLSearchParams({ videoId, autoplay: '1', mute: '1' });
      if (quality !== 'auto') params.set('vq', quality);
      return `${getApiBaseUrl()}/api/youtube-embed?${params.toString()}`;
    }
    const vq = quality === 'auto' ? '' : `&vq=${quality}`;
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&playsinline=1&rel=0${vq}`;
  }

  private getEmbedUrl(feed: WebcamFeed): string {
    if (feed.source === 'youtube') {
      return this.buildEmbedUrl(feed.sourceId);
    }
    return feed.embedUrl;
  }

  private getSourceBadge(source: WebcamSource): string {
    switch (source) {
      case 'windy': { return 'W'; }
      case 'youtube': { return 'YT'; }
      case 'dot': { return 'DOT'; }
      case 'custom': { return '*'; }
    }
  }

  private createIframe(feed: WebcamFeed): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    iframe.className = 'webcam-iframe';
    iframe.src = this.getEmbedUrl(feed);
    iframe.title = `${feed.city} live webcam`;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    if (!isDesktopRuntime()) {
      iframe.allowFullscreen = true;
      iframe.setAttribute('loading', 'lazy');
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    }
    return iframe;
  }

  private createImageEmbed(feed: WebcamFeed): HTMLImageElement {
    const img = document.createElement('img');
    img.className = 'webcam-iframe';
    img.src = feed.embedUrl;
    img.alt = `${feed.city} live camera`;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    const interval = setInterval(() => {
      img.src = `${feed.embedUrl}?t=${Date.now()}`;
    }, feed.refreshIntervalMs ?? 30_000);
    this.imageIntervals.push(interval);
    return img;
  }

  private render(): void {
    this.destroyIframes();

    if (!this.isVisible || this.isIdle) {
      this.content.innerHTML = '<div class="webcam-placeholder">Webcams paused</div>';
      return;
    }

    if (this.isLoading) {
      this.content.innerHTML = '<div class="webcam-placeholder">Loading feeds\u2026</div>';
      return;
    }

    if (this.viewMode === 'grid') {
      this.renderGrid();
    } else {
      this.renderSingle();
    }
  }

  private renderGrid(): void {
    this.content.innerHTML = '';
    this.content.className = 'panel-content webcam-content';

    const grid = document.createElement('div');
    grid.className = 'webcam-grid';

    const feeds = this.gridFeeds;
    const desktop = isDesktopRuntime();

    feeds.forEach((feed, i) => {
      const cell = document.createElement('div');
      cell.className = 'webcam-cell';

      const label = document.createElement('div');
      label.className = 'webcam-cell-label';

      const liveDot = document.createElement('span');
      liveDot.className = 'webcam-live-dot';

      const citySpan = document.createElement('span');
      citySpan.className = 'webcam-city';
      citySpan.textContent = feed.city.toUpperCase();

      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'webcam-source-badge';
      badgeSpan.textContent = this.getSourceBadge(feed.source);

      label.append(liveDot, citySpan, badgeSpan);

      if (desktop) {
        const expandBtn = document.createElement('button');
        expandBtn.className = 'webcam-expand-btn';
        expandBtn.title = t('webcams.expand') || 'Expand';
        expandBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          trackWebcamSelected(feed.id, feed.city, 'grid');
          this.activeFeed = feed;
          this.setViewMode('single');
        });
        label.append(expandBtn);
      } else {
        cell.addEventListener('click', () => {
          trackWebcamSelected(feed.id, feed.city, 'grid');
          this.activeFeed = feed;
          this.setViewMode('single');
        });
      }

      cell.append(label);
      grid.append(cell);

      const appendEmbed = () => {
        if (!this.isVisible || this.isIdle) return;
        if (feed.embedType === 'image') {
          const img = this.createImageEmbed(feed);
          label.before(img);
        } else {
          const iframe = this.createIframe(feed);
          label.before(iframe);
          this.iframes.push(iframe);
        }
      };

      if (desktop && i > 0) {
        this.staggeredTimeouts.push(setTimeout(appendEmbed, i * 800));
      } else {
        appendEmbed();
      }
    });

    this.content.append(grid);
  }

  private renderSingle(): void {
    this.content.innerHTML = '';
    this.content.className = 'panel-content webcam-content';

    const wrapper = document.createElement('div');
    wrapper.className = 'webcam-single';

    if (this.activeFeed) {
      if (this.activeFeed.embedType === 'image') {
        const img = this.createImageEmbed(this.activeFeed);
        wrapper.append(img);
      } else {
        const iframe = this.createIframe(this.activeFeed);
        wrapper.append(iframe);
        this.iframes.push(iframe);
      }
    }

    const switcher = document.createElement('div');
    switcher.className = 'webcam-switcher';

    const backBtn = document.createElement('button');
    backBtn.className = 'webcam-feed-btn webcam-back-btn';
    backBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg> Grid';
    backBtn.addEventListener('click', () => this.setViewMode('grid'));
    switcher.append(backBtn);

    this.filteredFeeds.forEach(feed => {
      const btn = document.createElement('button');
      btn.className = `webcam-feed-btn${this.activeFeed?.id === feed.id ? ' active' : ''}`;
      btn.textContent = feed.city;
      btn.addEventListener('click', () => {
        trackWebcamSelected(feed.id, feed.city, 'single');
        this.activeFeed = feed;
        this.render();
      });
      switcher.append(btn);
    });

    this.content.append(wrapper);
    this.content.append(switcher);
  }

  private openAddWebcamDialog(): void {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText =
      'background:var(--panel-bg,#1a1a2e);border:1px solid var(--border-color,#333);border-radius:8px;padding:20px;width:320px;display:flex;flex-direction:column;gap:12px;';

    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:14px;font-weight:600;color:var(--text-primary,#fff);';
    heading.textContent = 'Add Custom Webcam';

    const inputStyle = 'width:100%;padding:6px 8px;border-radius:4px;border:1px solid #444;background:#111;color:#fff;font-size:12px;box-sizing:border-box;';

    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.placeholder = 'Embed URL (https://...)';
    urlInput.style.cssText = inputStyle;

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.placeholder = 'Title';
    titleInput.style.cssText = inputStyle;

    const cityInput = document.createElement('input');
    cityInput.type = 'text';
    cityInput.placeholder = 'City';
    cityInput.style.cssText = inputStyle;

    const countryInput = document.createElement('input');
    countryInput.type = 'text';
    countryInput.placeholder = 'Country';
    countryInput.style.cssText = inputStyle;

    const regionSelect = document.createElement('select');
    regionSelect.style.cssText = inputStyle;
    const regionOptions: { value: WebcamRegion; label: string }[] = [
      { value: 'iran', label: 'Iran' },
      { value: 'middle-east', label: 'Middle East' },
      { value: 'europe', label: 'Europe' },
      { value: 'americas', label: 'Americas' },
      { value: 'asia', label: 'Asia-Pacific' },
    ];
    regionOptions.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      regionSelect.append(opt);
    });

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:6px 12px;border-radius:4px;border:1px solid #555;background:transparent;color:#aaa;cursor:pointer;font-size:12px;';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Add';
    submitBtn.style.cssText = 'padding:6px 12px;border-radius:4px;border:none;background:var(--accent,#4a9eff);color:#fff;cursor:pointer;font-size:12px;';
    submitBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      const title = titleInput.value.trim();
      const city = cityInput.value.trim() || 'Custom';
      const country = countryInput.value.trim() || 'Custom';
      const region = regionSelect.value as WebcamRegion;
      if (!url) return;
      let parsed: URL;
      try { parsed = new URL(url); } catch { return; }
      if (!['https:', 'http:'].includes(parsed.protocol)) return;
      addCustomWebcam(url, title || city, city, country, region);
      overlay.remove();
      clearWebcamCache();
      void this.initFeeds();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    btnRow.append(cancelBtn, submitBtn);
    dialog.append(heading, urlInput, titleInput, cityInput, countryInput, regionSelect, btnRow);
    overlay.append(dialog);
    document.body.append(overlay);
    urlInput.focus();
  }

  private destroyIframes(): void {
    this.staggeredTimeouts.forEach(id => clearTimeout(id));
    this.staggeredTimeouts = [];
    this.iframes.forEach(iframe => {
      iframe.src = 'about:blank';
      iframe.remove();
    });
    this.iframes = [];
    this.imageIntervals.forEach(id => clearInterval(id));
    this.imageIntervals = [];
  }

  /** Listen for postMessage events from the sidecar YouTube embed and display errors. */
  private _setupYtMessageListener(): void {
    this._boundYtMsg = (e: MessageEvent) => {
      const data = e.data as { type?: string; code?: number } | null;
      if (!data?.type?.startsWith('yt-')) return;

      const iframe = this.iframes.find(f => f.contentWindow === e.source);
      if (!iframe) return;
      const cell = iframe.closest<HTMLElement>('.webcam-cell, .webcam-single');
      if (!cell) return;

      if (data.type === 'yt-error') {
        const c = data.code;
        let msg = `YT error ${c}`;
        if (c === 2)         msg = 'Bad video ID (2)';
        else if (c === 5)    msg = 'HTML5 error (5)';
        else if (c === 100)  msg = 'Video unavailable (100)';
        else if (c === 101 || c === 150) msg = 'Embed blocked (150)';
        this._showCellError(cell, msg);
      } else if (data.type === 'yt-autoplay-failed') {
        this._showCellError(cell, 'Autoplay blocked \u2014 click to play');
      }
    };
    window.addEventListener('message', this._boundYtMsg);
  }

  private _showCellError(cell: HTMLElement, msg: string): void {
    let overlay = cell.querySelector<HTMLElement>('.webcam-err-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'webcam-err-overlay';
      overlay.style.cssText =
        'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(0,0,0,0.72);color:#ff6b6b;font-size:11px;font-family:monospace;' +
        'pointer-events:none;z-index:6;padding:8px;text-align:center;';
      cell.style.position = 'relative';
      cell.append(overlay);
    }
    overlay.textContent = msg;
  }

  private setupIntersectionObserver(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        const wasVisible = this.isVisible;
        this.isVisible = entries.some(e => e.isIntersecting);
        if (this.isVisible && !wasVisible && !this.isIdle) {
          this.render();
        } else if (!this.isVisible && wasVisible) {
          this.destroyIframes();
        }
      },
      { threshold: 0.1 }
    );
    this.observer.observe(this.element);
  }

  private setupIdleDetection(): void {
    this.boundVisibilityHandler = () => {
      if (document.hidden) {
        if (this.idleTimeout) clearTimeout(this.idleTimeout);
      } else {
        if (this.isIdle) {
          this.isIdle = false;
          if (this.isVisible) this.render();
        }
        this.boundIdleResetHandler();
      }
    };
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);

    this.boundIdleResetHandler = () => {
      if (this.idleTimeout) clearTimeout(this.idleTimeout);
      if (this.isIdle) {
        this.isIdle = false;
        if (this.isVisible) this.render();
      }
      this.idleTimeout = setTimeout(() => {
        this.isIdle = true;
        this.destroyIframes();
        this.content.innerHTML = '<div class="webcam-placeholder">Webcams paused \u2014 move mouse to resume</div>';
      }, this.IDLE_PAUSE_MS);
    };

    ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(event => {
      document.addEventListener(event, this.boundIdleResetHandler, { passive: true });
    });

    this.boundIdleResetHandler();
  }

  public refresh(): void {
    if (this.isVisible && !this.isIdle) {
      this.render();
    }
  }

  public destroy(): void {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(event => {
      document.removeEventListener(event, this.boundIdleResetHandler);
    });
    this.observer?.disconnect();
    this.destroyIframes();
    window.removeEventListener('message', this._boundYtMsg);
    super.destroy();
  }
}
