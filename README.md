# Bloomberg Terminal

A Bloomberg Terminal-inspired desktop application for macOS providing real-time financial market data, news aggregation, cryptocurrency prices, and more — all in a classic terminal interface.

## Features

- **Real-Time News** — Aggregates top stories from Reuters, BBC, AP, Bloomberg, and FT via RSS
- **Market Data** — Live equity indices (S&P 500, NASDAQ, DOW, Russell 2K, VIX), individual stocks
- **Forex** — Real-time currency pairs (EUR/USD, GBP/USD, USD/JPY, and more)
- **Commodities** — Gold, Oil (WTI), Natural Gas, Silver, Copper
- **Cryptocurrency** — Top 10 cryptocurrencies with 24h price changes via CoinGecko
- **Live Ticker Tape** — Scrolling market data at the top
- **Auto-Refresh** — Data refreshes every 60 seconds

## Getting Started

### Prerequisites
- Node.js 18+
- Rust (for desktop build)
- Tauri CLI

### Web Development
```bash
npm install
npm run dev
```

### Desktop Development
```bash
npm install
npm run desktop:dev
```

### Build Desktop App
```bash
npm run desktop:build
```

## Architecture

```
src/
  main.ts              Entry point
  terminal.ts          Main terminal orchestrator
  styles.css           Bloomberg terminal CSS
  components/
    Header.ts          Top header with clock
    Ticker.ts          Scrolling market ticker tape
    NewsPanel.ts       News feed from RSS sources
    MarketsPanel.ts    Equities, forex, commodities
    CryptoPanel.ts     Cryptocurrency prices
    StatusBar.ts       Bottom function key bar
  services/
    NewsService.ts     RSS feed aggregation
    MarketService.ts   Yahoo Finance market data
    CryptoService.ts   CoinGecko crypto data
  types/
    index.ts           TypeScript type definitions
  utils/
    format.ts          Number and time formatting
    fetch.ts           Tauri-aware fetch utility
```

## Data Sources

| Data | Source | API Key Required |
|------|--------|-----------------|
| News | RSS Feeds (Reuters, BBC, AP, Bloomberg, FT) | No |
| Equities | Yahoo Finance | No |
| Forex | Yahoo Finance | No |
| Commodities | Yahoo Finance | No |
| Crypto | CoinGecko | No (free tier) |

## Roadmap

- [ ] Economic calendar integration
- [ ] Portfolio tracker
- [ ] Custom watchlists
- [ ] Alerts & notifications
- [ ] Charts and sparklines
- [ ] Search (F7)
- [ ] API key settings panel
- [ ] Additional news sources
- [ ] Options flow
- [ ] Earnings calendar

## License

AGPL-3.0
