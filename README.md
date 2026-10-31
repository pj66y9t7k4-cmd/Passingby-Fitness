# Fitbod Clone - React + Supabase + Telegram

A workout tracking app that mimics Fitbod, built with React, Supabase, and Wger exercise data. Includes a Telegram bot for workout generation with owner controls.

## Features

- React + Vite + Tailwind CSS frontend
- Supabase backend (PostgreSQL)
- Wger API exercise data (500+ exercises)
- Muscle fatigue algorithm (50% daily recovery)
- Smart weight progression
- Telegram bot with owner permissions
- GitHub Pages deployment

## Setup

### 1. Supabase Setup

Run `supabase-schema.sql` in Supabase SQL Editor.

### 2. Configure Environment

Create `.env`:
```env
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
TELEGRAM_TOKEN=8931842688:AAGVJ1hgs-IaFjrHYbY6N5RegeoY1RGdv4M
OWNER_ID=your_telegram_numeric_id
```

### 3. Install & Run

```bash
npm install
npm run dev
```

### 4. Run Telegram Bot

```bash
node telegram-bot.js
```

### 5. Deploy to GitHub Pages

1. Update `homepage` in `package.json` to your GitHub Pages URL
2. Push to GitHub
3. Enable GitHub Pages (source: gh-pages branch)
4. Run `npm run deploy`

## Telegram Bot Commands

User:
- /start - Register
- /generate - Generate workout
- /history - View history
- /progress - See PRs
- /settings - Change defaults
- /cancel - Cancel pending

Owner:
- /sync - Sync Wger exercises
- /broadcast - Message all users
- /stats - Bot statistics
- /permissions - View owner commands

## Algorithm

- Fatigue: 100 * 0.5^days_since
- Weight: +10% if easy, +5% if completed, -5% if hard, -10% if very hard
