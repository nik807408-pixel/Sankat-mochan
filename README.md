# FinClient Pro — Setup Guide / सेटअप गाइड

## 📱 Features / सुविधाएं
- ✅ Client photo upload / ग्राहक फोटो
- ✅ Aadhaar & PAN number / आधार और पैन
- ✅ Father & Mother name / पिता-माता का नाम  
- ✅ Payment history / भुगतान इतिहास
- ✅ Invoice management / चालान प्रबंधन
- ✅ Charts & reports / चार्ट और रिपोर्ट
- ✅ Admin sees all / Admin सब देखे
- ✅ Employee sees own clients / Employee अपने ग्राहक देखे
- ✅ Hindi + English UI
- ✅ Installable on phone / फोन पर इंस्टॉल

---

## STEP 1 — Supabase Setup (5 minutes)

1. **supabase.com** पर जाएं → Free account बनाएं
2. **New Project** बनाएं → नाम दें "finclient-pro"
3. **SQL Editor** में जाएं
4. `supabase-setup.sql` फ़ाइल खोलें → सारा कोड कॉपी करें → **Run** करें
5. **Project Settings → API** में जाएं
6. **Project URL** और **anon public key** कॉपी करें

---

## STEP 2 — Add Keys to app.js

`app.js` फ़ाइल खोलें, ऊपर यह बदलें:

```js
const SUPABASE_URL = 'https://xxxxx.supabase.co';  // आपका URL
const SUPABASE_KEY = 'eyJxxxxx...';                 // आपकी Key
```

---

## STEP 3 — Deploy on Netlify (2 minutes)

1. **netlify.com** पर जाएं → Free account बनाएं
2. **"Add new site" → "Deploy manually"** क्लिक करें
3. **finclient-pro फ़ोल्डर** को drag & drop करें
4. 30 सेकंड में लाइव लिंक मिलेगा जैसे:
   `https://finclient-pro-abc.netlify.app`

---

## STEP 4 — Share with Team / टीम के साथ शेयर करें

- अपनी Netlify link सभी employees को भेजें
- वे **Sign up** करें → **Employee** role चुनें
- आप **Admin** role से login करें

---

## STEP 5 — Install on Phone / फोन पर इंस्टॉल करें

### iPhone (Safari):
1. Safari में link खोलें
2. नीचे **Share button** (□↑) दबाएं
3. **"Add to Home Screen"** चुनें
4. **"Add"** दबाएं ✅

### Android (Chrome):
1. Chrome में link खोलें
2. ऊपर **3 dots (⋮)** दबाएं
3. **"Add to Home Screen"** या **"Install App"** चुनें
4. **"Install"** दबाएं ✅

---

## First Login / पहला Login

1. App खोलें → **Sign up** करें
2. अपना नाम, email, password डालें
3. Role: **Admin** चुनें (आप पहले हैं)
4. Employees को link भेजें → वे Employee role से join करें

---

## ✅ Complete! / तैयार!
आपका FinClient Pro app तैयार है!
