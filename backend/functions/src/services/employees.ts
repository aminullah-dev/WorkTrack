/**
 * Employee numbering.
 *
 * The product already has a convention: signup gives the founding administrator
 * E-001, and the demo tenant runs E-001 to E-008. Until now every subsequent
 * code was typed by hand, which is work that belongs to the machine and gets
 * done badly by people — the same number twice, a skipped digit, or "5" and
 * "E-005" in the same company.
 */

/** Codes this generator owns. Anything else in a tenant is left alone. */
const GENERATED = /^E-(\d+)$/;

/**
 * The next free code for a company, given every code it already uses.
 *
 * It reads the existing codes instead of keeping a counter. A counter is
 * cheaper and wrong here: a company that imports staff from its old payroll
 * system, or an administrator who types a code by hand, would put a number in
 * the collection the counter has never heard of, and the next generated code
 * would collide with it — silently, because nothing enforces uniqueness on a
 * display code.
 *
 * Codes that are not `E-<digits>` are ignored rather than rejected. A tenant is
 * free to number its people however it likes, and this only has to find the
 * next free code in the scheme it owns.
 *
 * Padded to three digits because the numbers are read side by side in a list,
 * where E-9 next to E-10 reads as a mistake. Past 999 the padding stops
 * growing rather than renumbering anyone: E-1000 follows E-999, still unique,
 * still parsed by this function on the next call. Alignment is worth less than
 * never changing a code somebody has already written on a file.
 */
export function nextEmployeeCode(existing: Iterable<string | null | undefined>): string {
  let highest = 0;
  for (const code of existing) {
    const match = GENERATED.exec((code ?? "").trim());
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isSafeInteger(value) && value > highest) highest = value;
  }
  return `E-${String(highest + 1).padStart(3, "0")}`;
}
