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
 * Every replacement asserts the old text appears EXACTLY once. A page whose
 * wording has drifted is skipped and reported rather than half-edited — the
 * failure mode to avoid is a page that is neither the old version nor the new.
 *
 * ---------------------------------------------------------------------------
 * CURRENT EDIT SET (2026-09-08): work assignment.
 *
 * The claims here are deliberately PORTAL-ONLY. The employee half of this
 * feature is built and the server is live, but it reaches a worker's phone only
 * in a signed APK, and none has been released yet. Saying "staff open the app
 * and see what they are on" today would be false on the day it was published.
 *
 * WHEN THE SIGNED APK SHIPS, a second small edit makes the page whole:
 *
 *   1. add to each app list, after the payslips line —
 *      EN  <li><span>Today&rsquo;s work, and the next working day</span></li>
 *      FA  <li><span>کار امروز، و روز کاری بعد</span></li>
 *      PS  <li><span>د نن کار، او راتلونکې کاري ورځ</span></li>
 *
 *   2. in the feature card body, replace "The portal shows" with wording that
 *      puts it on the phone too. Until then it says what is true.
 *
 * A previous set (per-person allowances, the licence sentence, the download
 * button) was applied on 2026-09-07 and has been removed from this file; its
 * assertions would now report as drifted, which is correct but noisy.
 * ---------------------------------------------------------------------------
 */

/** The markup of one feature card, so a new one matches its neighbours exactly. */
const CARD = (title, body) =>
  `<div class="lnm-feat"><strong>${title}</strong><br>` +
  `<span style="font-weight:400;color:var(--ink-2);font-size:.94em">${body}</span></div>`;

// Anchors. Each new card is inserted BEFORE the leave card, so work assignment
// lands between "when people work" and "when they are off" — where a reader
// looking for it would go.
//
// The anchor is the leave card's OPENING tag, not the whole shifts card that
// precedes it, and that is deliberate: WordPress texturises on render, so the
// "night&rsquo;s work" visible in the published HTML may be a plain apostrophe
// in the stored block. Anchoring on a fragment with no punctuation at all means
// the match does not depend on guessing which form is in the database.
const LEAVE_EN = '<div class="lnm-feat"><strong>Leave with a real approval chain</strong>';
const LEAVE_FA = '<div class="lnm-feat"><strong>رخصتی با زنجیرهٔ تأیید واقعی</strong>';
const LEAVE_PS = '<div class="lnm-feat"><strong>رخصتي د تصویب ریښتینې لړۍ سره</strong>';

const CARD_EN = CARD(
  "Who is on which part of the job",
  "Assign a day&rsquo;s work to one person or a whole crew, against the project it belongs to. The portal shows who is on what for any day, and each person&rsquo;s next working day &mdash; which after a Thursday is Saturday, not an empty Friday.",
);

const CARD_FA = CARD(
  "چه کسی روی کدام بخش کار است",
  "کار یک روز را به یک نفر یا به یک تیم بدهید، زیر پروژه‌ای که به آن تعلق دارد. پورتال نشان می‌دهد در هر روز چه کسی روی چه کاری است، و روز کاری بعدِ هر نفر &mdash; که بعد از پنجشنبه شنبه است، نه جمعهٔ خالی.",
);

const CARD_PS = CARD(
  "څوک د کار په کومه برخه دی",
  "د یوې ورځې کار یو تن یا یو بشپړ ټیم ته وسپارئ، د هغې پروژې لاندې چې ورپورې اړه لري. پورټال ښیي چې په هره ورځ څوک په کوم کار دی، او د هر چا راتلونکې کاري ورځ &mdash; چې د پنجشنبې وروسته شنبه ده، نه تشه جمعه.",
);

const EDITS = {
  2054: {
    lang: "English",
    replacements: [
      [LEAVE_EN, CARD_EN + LEAVE_EN],
      [
        "<li><span>Payroll runs and payslips</span></li>",
        "<li><span>Payroll runs and payslips</span></li><li><span>Projects, crews, and who is on what today</span></li>",
      ],
    ],
  },
  2055: {
    lang: "Dari",
    replacements: [
      [LEAVE_FA, CARD_FA + LEAVE_FA],
      [
        "<li><span>اجرای معاش و فیش‌ها</span></li>",
        "<li><span>اجرای معاش و فیش‌ها</span></li><li><span>پروژه‌ها، تیم‌ها، و اینکه امروز چه کسی روی چه کاری است</span></li>",
      ],
    ],
  },
  2056: {
    lang: "Pashto",
    replacements: [
      [LEAVE_PS, CARD_PS + LEAVE_PS],
      [
        "<li><span>د معاش اجرا او فیشونه</span></li>",
        "<li><span>د معاش اجرا او فیشونه</span></li><li><span>پروژې، ټیمونه، او دا چې نن څوک په کوم کار دی</span></li>",
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
