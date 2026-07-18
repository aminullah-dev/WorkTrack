# رفتن به Production (نصب واقعی)

این راهنما نشان می‌دهد چطور WorkTrack را از حالت محلی به یک **پروژهٔ واقعی Firebase**
ببرید تا شرکت‌های واقعی بتوانند استفاده کنند. ساده و مرحله‌به‌مرحله.

> English: step-by-step guide to deploy WorkTrack to a real Firebase project.

---

## دو محصول (نسخهٔ شرکت / نسخهٔ کارمند)

WorkTrack دو نسخه دارد که هر دو از یک بک‌اند استفاده می‌کنند:

| محصول | برای چه کسی | چیست |
|---|---|---|
| **پورتال شرکت** (`web/`) | مدیر، منابع بشری، معاش | وب‌سایت مدیریت — داشبورد، کارمندان، حاضری، رخصتی، معاش |
| **اپ کارمند** (`app/`) | کارمندان | اپ اندروید — حاضری، رخصتی، فیش معاش |

هر شرکت **خودش در پورتال ثبت‌نام می‌کند** و فضای کاری جدا و امن خودش را می‌گیرد
(multi-tenant). داده هیچ شرکتی برای شرکت دیگر دیده نمی‌شود.

---

## پیش‌نیازها

- یک حساب Google
- **Firebase CLI**: `npm install -g firebase-tools` سپس `firebase login`
- برای Cloud Functions، پروژه باید روی پلن **Blaze** باشد (پرداخت به‌اندازهٔ مصرف؛
  استفادهٔ کم معمولاً رایگان است)

---

## قدم ۱ — ساخت پروژهٔ Firebase

1. به <https://console.firebase.google.com> بروید و **Add project** را بزنید
   (مثلاً نام: `worktrack-prod`).
2. در **Build → Authentication → Sign-in method**، گزینهٔ **Email/Password** را
   **Enable** کنید.
3. در **Build → Firestore Database**، یک دیتابیس بسازید (production mode).
4. پروژه را به پلن **Blaze** ارتقا دهید (منوی پایین چپ، Upgrade).

پروژه را به مخزن وصل کنید:

```zsh
cd ~/StudioProjects/WorkTrack/backend
cp .firebaserc.example .firebaserc
```
بعد داخل `.firebaserc`، به‌جای `worktrack-prod` شناسهٔ واقعی پروژهٔ خود را بگذارید.

---

## قدم ۲ — استقرار بک‌اند (API + قوانین + ایندکس)

```zsh
cd ~/StudioProjects/WorkTrack/backend/functions
npm install
npm run build

# راز kiosk را در Secret Manager بگذارید (یک بار):
firebase functions:secrets:set KIOSK_HMAC_SECRET

cd ~/StudioProjects/WorkTrack/backend
firebase deploy --only functions,firestore:rules,firestore:indexes --project <PROJECT_ID>
```

بعد از استقرار، آدرس تابع `api` را یادداشت کنید — چیزی مثل:
`https://us-central1-<PROJECT_ID>.cloudfunctions.net/api`

---

## قدم ۳ — استقرار پورتال شرکت (وب)

1. در Firebase console → **Project settings → General → Your apps** یک اپ **Web**
   بسازید و مقادیر config آن را بردارید.
2. یک فایل `web/.env.production` بسازید:

```
VITE_API_BASE_URL=/v1
VITE_FIREBASE_API_KEY=<from console>
VITE_FIREBASE_AUTH_DOMAIN=<PROJECT_ID>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<PROJECT_ID>
VITE_FIREBASE_APP_ID=<from console>
```

> `VITE_API_BASE_URL=/v1` کار می‌کند چون Hosting درخواست‌های `/v1/**` را به تابع
> `api` هدایت می‌کند (در `backend/firebase.json` تنظیم شده) — بدون مشکل CORS.

3. build و deploy:

```zsh
cd ~/StudioProjects/WorkTrack/web
npm install
npm run build
cd ~/StudioProjects/WorkTrack/backend
firebase deploy --only hosting --project <PROJECT_ID>
```

پورتال حالا روی `https://<PROJECT_ID>.web.app` در دسترس است.

---

## قدم ۴ — اولین شرکت را ثبت‌نام کنید

نیازی به اسکریپت seed نیست! به پورتال بروید، روی **«شرکت جدید؟ ثبت‌نام کنید»**
کلیک کنید و فرم را پر کنید (نام شرکت، نام مدیر، ایمیل، رمز). فضای کاری شرکت،
شعبهٔ «دفتر مرکزی»، انواع رخصتی پیش‌فرض و حساب مدیر به‌صورت خودکار ساخته می‌شود.
بعد وارد شوید و کارمندان را اضافه کنید.

---

## قدم ۵ — اپ کارمند (اندروید)

1. در Firebase console → **Add app → Android**:
   - Package name برای نسخهٔ عرضه: **`app.worktrack`**
   - (برای تست، `app.worktrack.debug` را هم اضافه کنید)
2. فایل **`google-services.json`** را دانلود و در پوشهٔ **`app/`** بگذارید.
3. آدرس API نسخهٔ عرضه از قبل روی `https://api.worktrack.app/v1/` است؛ اگر دامنهٔ
   دلخواه ندارید، در `app/build.gradle.kts` (بخش `defaultConfig`) آن را به آدرس
   تابع خود تغییر دهید:
   `https://us-central1-<PROJECT_ID>.cloudfunctions.net/api/v1/`
4. در Android Studio: **Build → Generate Signed Bundle / APK** → یک keystore
   بسازید → **release** → فایل `.aab` را بسازید.
5. `.aab` را در **Google Play Console** آپلود کنید.

> نسخهٔ **release** به Firebase واقعی وصل می‌شود (نه emulator). نسخهٔ **debug**
> برای تست به emulator محلی وصل می‌ماند.

---

## قدم ۶ — کارهای امنیتی پیش از عرضهٔ عمومی

این‌ها را قبل از باز کردن ثبت‌نام عمومی انجام دهید (در `docs/07` مفصل آمده):

- **تأیید ایمیل** برای ثبت‌نام شرکت (جلوگیری از حساب‌های جعلی)
- **محدودسازی نرخ** (rate limiting) روی `POST /v1/public/signup` و ورود
- **App Check** برای اپ اندروید و پورتال وب
- مرور **قوانین Firestore** و **کاتالوگ دسترسی‌ها** (RBAC)
- **بکاپ** خودکار Firestore و سیاست نگه‌داری داده

---

## خلاصهٔ دستورها

```zsh
# بک‌اند
cd backend/functions && npm run build
cd backend && firebase deploy --only functions,firestore --project <PROJECT_ID>

# پورتال وب
cd web && npm run build
cd backend && firebase deploy --only hosting --project <PROJECT_ID>

# اپ کارمند: Android Studio → Signed Bundle → Play Console
```
