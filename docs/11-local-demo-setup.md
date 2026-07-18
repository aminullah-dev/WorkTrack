# راه‌اندازی محلی با داده نمونه (Local Demo Setup)

این راهنما نشان می‌دهد چطور **بدون پروژهٔ واقعی Firebase و بدون هیچ هزینه‌ای**، کل
پلتفرم را روی کمپیوتر خودتان با داده نمونهٔ افغانی اجرا کنید — هم پورتال وب مدیر و
هم اپ اندروید.

همه‌چیز با **Firebase Emulator Suite** (محلی) کار می‌کند.

> English speakers: this is a step-by-step guide to run the whole platform locally
> against the Firebase Emulator Suite with a seeded Afghan demo tenant — no real
> Firebase project or billing required. Commands are the same regardless of language.

---

## پیش‌نیازها

- **Node.js 20+** و **npm**
- **Firebase CLI**: `npm install -g firebase-tools`
- **Java** (برای emulator فایرستور لازم است — معمولاً روی مک نصب است؛ در غیر این صورت `brew install openjdk`)

---

## قدم ۱ — بک‌اند را بسازید و emulator را روشن کنید

```zsh
cd ~/StudioProjects/WorkTrack/backend/functions
npm install
```

یک فایل کوچک برای راز kiosk بسازید (تا emulator شکایت نکند):

```zsh
echo 'KIOSK_HMAC_SECRET=demo-secret' > .secret.local
```

حالا emulator را روشن کنید. **از `npm run serve` استفاده کنید** — این دستور اول
کد TypeScript را build می‌کند و بعد emulator را با پروژهٔ `demo-worktrack` و
فایل تنظیمات درست اجرا می‌کند (build کردن الزامی است، وگرنه تابع `api` بارگذاری
نمی‌شود):

```zsh
cd ~/StudioProjects/WorkTrack/backend/functions
npm run serve
```

این ترمینال را **باز بگذارید**. باید یک جدول با آدرس تابع `api` ببینید و در آخر
خط **`All emulators ready!`** (Functions روی `5001`، Firestore روی `8080`،
Auth روی `9099`).

> اگر Firebase CLI از شما login خواست، `firebase login` را اجرا کنید. برای emulator
> نیازی به پروژهٔ واقعی نیست — پیشوند `demo-` یعنی هیچ منبع واقعی ساخته نمی‌شود.

---

## قدم ۲ — داده نمونه را وارد کنید (Seed)

یک ترمینال **جدید** باز کنید (emulator باید در حال اجرا بماند):

```zsh
cd ~/StudioProjects/WorkTrack/backend/functions
npm run seed
```

باید پیام موفقیت و لیست حساب‌ها را ببینید. این اسکریپت می‌سازد:

- شرکت **«شرکت ساختمانی کابل»** با دفتر مرکزی در کابل (با geofence)
- **۷ کارمند** (شامل مدیر)
- **حاضری ۷ روز** (حاضر، ناوقت، غیرحاضر، نیم‌روز، جمعه تعطیل)
- **۳ درخواست رخصتی در انتظار** برای تست تاییدی
- انواع رخصتی، بیلانس، اعلانات، اجزای معاش (به افغانی)

### حساب‌های ورود (رمز همه: `Passw0rd!`)

| ایمیل | نقش | برای |
|---|---|---|
| `admin@worktrack.af` | COMPANY_ADMIN | پورتال وب |
| `hr@worktrack.af` | HR_ADMIN | پورتال وب |
| `ahmad@worktrack.af` | EMPLOYEE | اپ اندروید |

---

## قدم ۳ — پورتال وب را اجرا کنید

یک ترمینال جدید:

```zsh
cd ~/StudioProjects/WorkTrack/web
npm install
cp .env.emulator .env.local
npm run dev
```

مرورگر را روی آدرسی که نشان می‌دهد باز کنید (مثلاً `http://localhost:5173/`).

حالا با **`admin@worktrack.af`** و رمز **`Passw0rd!`** وارد شوید. باید ببینید:

- **داشبورد**: آمار امروز (حاضر، غیرحاضر، ناوقت…) و نمودار روند ۷ روزهٔ شمسی
- **کارمندان**: لیست ۷ کارمند، جستجو، فرم افزودن
- **حاضری**: تختهٔ زندهٔ روزانه با وضعیت هر کارمند
- **رخصتی‌ها**: ۳ درخواست در انتظار — تایید یا رد کنید

کلید بالای صفحه زبان را بین **دری / پښتو / English** عوض می‌کند.

---

## قدم ۴ (اختیاری) — اپ اندروید را به emulator وصل کنید

اپ اندروید فعلاً به Firebase تولیدی وصل می‌شود. برای وصل کردن آن به emulator محلی،
باید `google-services.json` (از قدم Firebase در README) اضافه شود و کد به Auth
emulator وصل شود. این یک قدم اضافی است — اگر می‌خواهید انجامش دهیم، بگویید تا
راهنمای آن را بنویسم. برای دیدن داده، **پورتال وب کافی است.**

---

## توقف و ری‌ست

- برای توقف: در هر ترمینال **Ctrl+C** بزنید.
- داده emulator در حافظه است و با توقف پاک می‌شود. برای داده تازه، دوباره
  `npm run seed` را (وقتی emulator روشن است) اجرا کنید.

---

## مشکلات رایج

| مشکل | راه حل |
|---|---|
| پورتال «تنظیمات Firebase کامل نیست» نشان می‌دهد | `.env.local` را از `.env.emulator` کپی کرده‌اید؟ سرور dev را دوباره اجرا کنید. |
| ورود کار نمی‌کند / خطای شبکه | emulator روشن است؟ آیا `npm run seed` را اجرا کردید؟ |
| داشبورد خالی است | seed را دوباره اجرا کنید؛ مطمئن شوید project id در هر دو `demo-worktrack` است. |
| `firebase: command not found` | `npm install -g firebase-tools` |
| خطای Java در Firestore emulator | `brew install openjdk` (مک) |
