# AI Allergen Detector — How to use

A self-contained app that screens food labels and restaurant menus for allergens and
their allergenic **biomolecules (proteins)**, using a validated database built from the
**WHO/IUIS Allergen Nomenclature** and **AllergenOnline (FARRP)**.

No installation, no accounts, no internet required for the core features. 100% free.

---

## ▶ Running it (easiest)

1. Open the **`AllergenDetector`** folder.
2. Double-click **`index.html`**.
3. It opens in your web browser. That's it.

> Tip: Chrome or Edge work best. Everything except photo-OCR works fully offline.

### What works offline vs online
| Feature | Needs internet? |
|---|---|
| Type / paste text → allergen analysis | ❌ No (always works) |
| Allergen + biomolecule database | ❌ No (built into the app) |
| Scan history, CSV export, PDF report | ❌ No |
| **Photo OCR** (reading text from a label) | ✅ Yes, the *first* time only (downloads the OCR engine, then caches it) |
| **AI food identification** (recognise a dish from a photo) | ✅ Yes, the *first* time only (downloads the AI model, then caches it) |

### Scanning a photo — two options
On the **Scan photo** tab, after taking/choosing a picture you get two buttons:
- **🍽️ Identify food & allergens (AI)** — point at a *dish* (no label needed). An on-device
  AI model recognises the food and infers its likely allergens. It reliably recognises common
  foods (pizza, burger, bread, pasta, ice cream, fruit, **crab/lobster and other seafood**).
  After it guesses, you can **confirm or correct the dish** by choosing/typing the real dish
  from the built-in list — including a large set of **Vietnamese dishes** (Phở, Bún chả, Bún bò
  Huế, Gỏi cuốn, Bánh xèo, Bún riêu, Mực, Ốc, Hàu, and many more) with a seafood & high-allergen
  focus. This makes the AI accurate even for dishes it can't recognise by sight.
- **🔤 Read label text (OCR)** — for packaged-food ingredient labels; reads the printed text.

The allergen engine also understands Vietnamese seafood ingredients directly — e.g. **nước mắm
(fish sauce) → Fish**, **mắm tôm (shrimp paste) → Crustacean shellfish**, **mực → Mollusc**.

---

## 🔬 What it does

1. **Profile (optional):** tick the allergens you react to — broad groups *or* expand to a
   specific source/species (e.g. just *Cashew = Anacardium occidentale*). Your matches are
   escalated to higher alerts.
2. **Input:** choose *Packaged label* or *Restaurant menu / dish*, then **type/paste** text
   or **scan a photo**.
3. **Analyse:** you get
   - a 🟢/🟡/🔴 traffic-light verdict,
   - a card per detected allergen showing the **specific species**, every known
     **allergenic protein** (e.g. *Ara h 1 — Cupin/7S globulin*), molecular weight,
     **IgE evidence level**, and a link to the source database entry,
   - a confidence %, severity, and a plain-English reason.
4. **History:** every scan is logged locally. Export to **CSV** or a **PDF report** for
   your research records.

---

## 📱 Turning it into an Android app (free, later)

The app is a **PWA (Progressive Web App)**, so once it's online you can install it:

1. Put the `AllergenDetector` folder on any free static host
   (GitHub Pages, Netlify, or Cloudflare Pages — all free).
2. Open that link in **Chrome on Android** → menu → **Install app / Add to Home screen**.
3. It now behaves like a native app, works offline, and has its own icon.

(A packaged `.apk` can be made later for free with tools like PWABuilder or Capacitor.)

---

## 🛠 Rebuilding the database (only if your CSVs change)

The app's data lives in `database.js`, generated from your source CSVs by a one-time script:

```
<python> build/build_database.py
```

You never need Python to *run* the app — only to regenerate `database.js` after editing
the allergen database.

---

## ⚠️ Important

This is a **research / educational** screening tool, **not a medical device**. It can miss
or over-flag allergens. Always confirm with the manufacturer or restaurant. If you have a
diagnosed allergy, treat any uncertainty as unsafe.
