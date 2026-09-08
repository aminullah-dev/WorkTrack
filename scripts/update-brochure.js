/*
 * Updates the WorkTrack brochure on linumic.com — all three languages.
 *
 * Run it from a browser tab that is signed in to linumic.com/wp-admin: it needs
 * the authenticated REST API to read the RAW block content. The rendered HTML
 * that an anonymous request returns is not the same thing; posting that back
 * would flatten the page's Gutenberg blocks and leave it uneditable.
 *
 * Dry run by default: it reports what it would change and writes nothing.
 * Pass true to actually save.
 *
 *   await updateBrochure(false)   // show the diff
 *   await updateBrochure(true)    // save
 *
 * The licence sentence here is the wording actually published: an earlier draft
 * opened with "Freeing a seat is yours to do", which duplicated the sentence
 * before it and was dropped.
 *
 * Every replacement asserts the old text appears EXACTLY once. A page whose
 * wording has drifted is skipped and reported rather than half-edited — the
 * failure mode to avoid is a page that is neither the old version nor the new.
 */

const EDITS = {
  2054: {
    lang: "English",
    replacements: [
      [
        "Monthly runs over Solar Hijri periods. Basic pay, allowances, deductions and unpaid absence, with income tax withheld on the statutory monthly brackets &mdash; and payslips staff open on their phones.",
        "Monthly runs over Solar Hijri periods. Basic pay, allowances and deductions &mdash; set for the whole company, or a different figure for one person &mdash; unpaid absence, and income tax withheld on the statutory monthly brackets. Payslips staff open on their phones.",
      ],
      [
        "Nobody has to call us to change a number.",
        "How many seats you have is part of your licence, which we issue &mdash; tell us and we change it.",
      ],
      [
        '<a class="lnm-btn lnm-btn-primary" href="https://linumic.com/what-we-do/worktrack/demo/">Try the demo</a>',
        '<a class="lnm-btn lnm-btn-primary" href="https://linumic.com/what-we-do/worktrack/demo/">Try the demo</a><a class="lnm-btn lnm-btn-ghost" href="https://worktrack-prod.web.app/app/">Download the app</a>',
      ],
    ],
  },
  2055: {
    lang: "Dari",
    replacements: [
      [
        "اجرای ماهانه روی دوره‌های هجری شمسی. معاش اساسی، مزایا، کسورات و غیرحاضری بدون معاش، با مالیهٔ معاش روی جدول قانونی ماهانه &mdash; و فیش‌هایی که کارمند روی گوشی خودش باز می‌کند.",
        "اجرای ماهانه روی دوره‌های هجری شمسی. معاش اساسی، مزایا و کسورات &mdash; برای همهٔ شرکت، یا مبلغی جداگانه برای یک نفر &mdash; غیرحاضری بدون معاش، و مالیهٔ معاش روی جدول قانونی ماهانه. فیش‌هایی که کارمند روی گوشی خودش باز می‌کند.",
      ],
      [
        "کسی لازم نیست برای عوض کردن یک عدد به ما زنگ بزند.",
        "تعداد صندلی‌ها بخشی از لایسنس شماست که ما صادر می‌کنیم &mdash; به ما بگویید تا تغییرش دهیم.",
      ],
      [
        '<a class="lnm-btn lnm-btn-primary" href="https://linumic.com/fa/mahsoolat-fa/worktrack-fa/demo-fa/">دمو را امتحان کنید</a>',
        '<a class="lnm-btn lnm-btn-primary" href="https://linumic.com/fa/mahsoolat-fa/worktrack-fa/demo-fa/">دمو را امتحان کنید</a><a class="lnm-btn lnm-btn-ghost" href="https://worktrack-prod.web.app/app/">دانلود اپلیکیشن</a>',
      ],
    ],
  },
  2056: {
    lang: "Pashto",
    replacements: [
      [
        "میاشتنۍ اجرا د لمریز هجري دورو پر بنسټ. اساسي معاش، امتیازات، کسرونه او بې‌معاشه غیرحاضري، د معاش مالیه د قانوني میاشتني جدول له مخې &mdash; او هغه فیشونه چې کارکوونکی یې پر خپل موبایل پرانیزي.",
        "میاشتنۍ اجرا د لمریز هجري دورو پر بنسټ. اساسي معاش، امتیازات او کسرونه &mdash; د ټول شرکت لپاره، یا د یو تن لپاره بېل مبلغ &mdash; بې‌معاشه غیرحاضري، او د معاش مالیه د قانوني میاشتني جدول له مخې. هغه فیشونه چې کارکوونکی یې پر خپل موبایل پرانیزي.",
      ],
      [
        "هیچا ته اړتیا نشته چې د یو عدد بدلولو لپاره موږ ته زنګ ووهي.",
        "د ځایونو شمېر ستاسو د جواز برخه ده چې موږ یې ورکوو &mdash; موږ ته ووایاست، بدلوو یې.",
      ],
      [
        '<a class="lnm-btn lnm-btn-primary" href="https://linumic.com/ps/mahsoolat-ps/worktrack-ps/demo-ps/">ډیمو وازمایئ</a>',
        '<a class="lnm-btn lnm-btn-primary" href="https://linumic.com/ps/mahsoolat-ps/worktrack-ps/demo-ps/">ډیمو وازمایئ</a><a class="lnm-btn lnm-btn-ghost" href="https://worktrack-prod.web.app/app/">اپلیکیشن ډاونلوډ کړئ</a>',
      ],
    ],
  },
};

/** Landmarks that must survive every edit, or the page has been damaged. */
const MUST_SURVIVE = ["lnm-section", "lnm-tier", "lnm-feat", "lnm-sechead-h"];

async function updateBrochure(apply = false) {
  const nonce = window.wpApiSettings?.nonce ?? null;
  const report = [];

  for (const [id, spec] of Object.entries(EDITS)) {
    const res = await fetch(`/wp-json/wp/v2/pages/${id}?context=edit&_fields=content,title`, {
      credentials: "include",
      headers: nonce ? { "X-WP-Nonce": nonce } : {},
    });
    if (!res.ok) {
      report.push({ id, lang: spec.lang, status: `cannot read (${res.status}) — sign in to wp-admin` });
      continue;
    }

    const page = await res.json();
    const before = page.content.raw;
    let after = before;
    const applied = [];
    const missing = [];

    for (const [oldText, newText] of spec.replacements) {
      const count = after.split(oldText).length - 1;
      if (count !== 1) {
        missing.push({ count, snippet: oldText.slice(0, 60) });
        continue;
      }
      after = after.replace(oldText, newText);
      applied.push(oldText.slice(0, 48));
    }

    if (missing.length) {
      // Half-editing a live page is worse than not editing it.
      report.push({ id, lang: spec.lang, status: "SKIPPED — wording drifted", missing });
      continue;
    }

    const lost = MUST_SURVIVE.filter((k) => after.split(k).length < before.split(k).length);
    if (lost.length) {
      report.push({ id, lang: spec.lang, status: "SKIPPED — edit would remove structure", lost });
      continue;
    }

    const delta = after.length - before.length;
    if (delta < 0 || delta > 2000) {
      report.push({ id, lang: spec.lang, status: `SKIPPED — implausible size change (${delta})` });
      continue;
    }

    if (!apply) {
      report.push({ id, lang: spec.lang, status: `would change (${applied.length} edits, +${delta} bytes)` });
      continue;
    }

    const save = await fetch(`/wp-json/wp/v2/pages/${id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(nonce ? { "X-WP-Nonce": nonce } : {}) },
      body: JSON.stringify({ content: after }),
    });
    report.push({
      id,
      lang: spec.lang,
      status: save.ok ? `SAVED (+${delta} bytes)` : `save failed (${save.status})`,
    });
  }

  return report;
}
