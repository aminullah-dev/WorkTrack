# بردن اپ اندروید به Google Play

تا امروز اندروید را **سایدلود** می‌فروشیم: مشتری APK را از صفحهٔ دانلود
پورتال می‌گیرد. این سند برای رفتن روی Play است، و طوری نوشته شده که فردا
فقط فرم پر کنید نه اینکه متن بنویسید.

> **وضعیت ۱۴۰۵/۰۶/۲۵:** مانع فنی برداشته شد (targetSdk 36). آنچه مانده به
> حساب Play Console شما گره خورده و بدون شما پیش نمی‌رود.

---

## ۱. آنچه انجام شد

| | |
| --- | --- |
| targetSdk / compileSdk | ۳۵ → **۳۶** (اجبار Play از ۳۱ اگست ۲۰۲۶) |
| AGP / Gradle | 8.5.2 → **8.13.0** / 8.9 → **8.13** |
| بیلد، لینت، ۵۰ تست | سبز |
| edge-to-edge اندروید ۱۶ | از قبل درست بود، تغییری لازم نشد |

## ۲. آنچه فقط از دست شما برمی‌آید

1. **حساب Google Play Developer** — ۲۵ دالر، یک‌بار. حساب فردی مثل اپل،
   نام فروشنده «Aminullah Hashemi» می‌شود مگر حساب سازمانی بگیرید.
2. **امضای release** — کلید شماست. من نمی‌سازم و منتشر نمی‌کنم.
3. **Play App Signing** — Google کلید اصلی را نگه می‌دارد. اگر قبولش کنید،
   دیگر `worktrack-release.jks` کلیدِ نهایی نیست بلکه upload key می‌شود.
   **این تصمیم برگشت‌ناپذیر است.**

> ⚠️ **هشدار مهم دربارهٔ نصب‌های موجود:** APK امضاشده با کلید فعلی و
> نسخهٔ Play دو امضای متفاوت دارند. کسی که امروز سایدلود کرده، نسخهٔ Play
> را **روی آن آپدیت نمی‌تواند** — باید حذف و از نو نصب کند، و دادهٔ محلیِ
> نفرستاده از بین می‌رود. قبل از کوچ، مشتری‌های فعلی را خبر کنید.

## ۳. Data Safety — همان چیزی که به اپل گفتیم

Play این را جدا می‌پرسد ولی جواب‌ها باید با برچسب‌های App Store یکی باشد،
وگرنه دو روایت متناقض از یک محصول بیرون می‌دهید.

| داده | جمع می‌شود؟ | چرا | به کاربر وصل است؟ | برای ردیابی؟ |
| --- | --- | --- | --- | --- |
| نام | بله | عملکرد اپ | بله | **نه** |
| ایمیل | بله | عملکرد اپ | بله | **نه** |
| شمارهٔ تلفن | بله | عملکرد اپ | بله | **نه** |
| موقعیت **دقیق** | بله | عملکرد اپ (ژئوفنس حاضری) | بله | **نه** |
| اطلاعات مالی (معاش) | بله | عملکرد اپ | بله | **نه** |
| **داده بیومتریک (چهره)** | بله | عملکرد اپ | بله | **نه** |
| شناسهٔ کاربر | بله | عملکرد اپ | بله | **نه** |

سه جواب دیگر که Play می‌خواهد:

- **رمزگذاری در انتقال:** بله (HTTPS، بدون استثنا).
- **حذف داده:** بله — بستن حساب در پورتال. آدرسش را همان
  `https://worktrack-prod.web.app/support/` بدهید.
- **سیاست حریم خصوصی:** `https://worktrack-prod.web.app/privacy/`

**نکتهٔ چهره:** Play «داده بیومتریک» را جدی می‌گیرد. در توضیح بنویسید که
عکس ذخیره نمی‌شود و فقط یک بردار عددی روی دستگاه ساخته می‌شود — همان چیزی
که در متن اجازهٔ دوربین هم نوشته‌ایم. این را سرسری نگیرید؛ ناهم‌خوانی اینجا
دلیل رایج رد شدن است.

## ۴. رده‌بندی محتوا

پرسشنامهٔ Play (IARC) با اپل فرق دارد ولی جواب‌ها همان است: اپ ابزار کاری
است، همه‌چیز «هیچ/نه». دستهٔ درست **Business** است، نه Productivity.
انتظار رده‌بندی: همه‌سنین / PEGI 3.

جایی که Play سخت‌گیرتر از اپل است: **«آیا کاربران با هم ارتباط می‌گیرند؟»**
جواب **نه** — دلیل رخصتی و درخواست اصلاح فرم است که مدیرِ همان شرکت
می‌خواند، نه چت. همان استدلالی که به اپل دادیم.

## ۵. متن صفحهٔ فروشگاه (انگلیسی)

**App name (۳۰):**
`Linumic WorkTrack`

**Short description (۸۰):**
`Attendance, leave and payslips for your team — built for Afghan workplaces.`

**Full description (زیر ۴۰۰۰):**

```
WorkTrack is the employee app for companies that run their workforce on
WorkTrack. Your employer creates your account and gives you the sign-in
details — there is no self-registration.

WHAT YOU CAN DO
• Check in and out of work, and see your hours as they add up
• Check in at the work site, with GPS confirming you are there
• Request leave and follow what happened to it
• Ask for a correction when a check-in did not go through
• Read your payslip in full — earnings, deductions, tax
• See company announcements and the work assigned to you

BUILT FOR WHERE IT IS USED
• Dari, Pashto and English, right-to-left throughout
• The Afghan calendar, not a converted Gregorian one
• Amounts in AFN
• Works without signal: check-ins are saved on the phone and sent when
  the network returns. The time recorded is the time you pressed the
  button, so a weak connection never costs you part of a day.

FACE CHECK-IN (only if your employer turns it on)
Your photo is never saved or uploaded. The phone turns it into a numeric
code and compares that. It is off unless your company asks for it.

WorkTrack is sold to employers. If you do not have an account, ask your
manager.
```

**Graphics هنوز لازم است:**
- آیکون ۵۱۲×۵۱۲ (داریم — از `res/mipmap`)
- Feature graphic ۱۰۲۴×۵۰۰ — **نداریم، باید ساخته شود**
- حداقل ۲ اسکرین‌شات تلفن — از اسکرین‌شات‌های App Store بردارید

## ۶. ترتیبی که بروید

1. حساب Play Console بگیرید و ۲۵ دالر را بدهید
2. تصمیم Play App Signing (بخش ۲ را بخوانید، برگشت ندارد)
3. AAB امضاشده بسازید
4. **روی یک گوشی واقعی با اندروید ۱۶ تستش کنید** — targetSdk عوض شده
5. Data Safety و رده‌بندی را از بخش‌های ۳ و ۴ پر کنید
6. متن و گرافیک از بخش ۵
7. اول **internal testing**، بعد production
