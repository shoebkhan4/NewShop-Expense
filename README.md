# 🏗️ Shop Khata — Expense Tracker

A beautiful Progressive Web App to track all construction expenses for your new shop until its grand opening.

## ✨ Features

- **Modern UI** — Clean, app-like interface with smooth animations
- **Dashboard** — Total spent, monthly summary, category breakdown, recent expenses
- **Add Expenses** — Quick entry with category chips, amount, description, date & who paid
- **History** — Filter by category & month, grouped by date
- **Multi-User Sync** — Anyone with the link can view & add expenses via GitHub
- **Installable** — Add to home screen on Android & iOS (PWA)
- **Offline Support** — Works without internet, syncs when back online
- **Currency** — Indian Rupees (₹) with smart formatting (K, L, Cr)

## 🚀 Setup

### 1. Create GitHub Repository
Create a new repo on GitHub (e.g., `NewShop-Expense`)

### 2. Push Files
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/NewShop-Expense.git
git push -u origin main
```

### 3. Enable GitHub Pages
- Go to **Settings → Pages**
- Source: **Deploy from a branch** → `main` → `/ (root)`
- Your app: `https://YOUR_USERNAME.github.io/NewShop-Expense/`

### 4. Share
Share the URL with anyone who needs to track or view expenses.

## 📱 How to Install

### Android (Chrome)
1. Open the app URL
2. Tap "Add to Home Screen" in the menu
3. Done!

### iOS (Safari)
1. Open the app URL
2. Tap the Share button
3. Tap "Add to Home Screen"

## 📁 Files

| File | Purpose |
|------|---------|
| `index.html` | App structure |
| `styles.css` | Modern responsive design |
| `app.js` | Core logic & GitHub sync |
| `manifest.json` | PWA config |
| `service-worker.js` | Offline caching |
| `icon-*.png` | App icons |
| `expenses.json` | Data file (auto-managed) |

---

Made for shop owners tracking construction costs 🏗️