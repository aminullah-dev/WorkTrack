import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /*
     * Test files run one at a time.
     *
     * Not a preference — a correctness requirement. The integration suites all
     * talk to ONE Firestore emulator database, and several of them ask
     * questions about global state rather than about their own tenant: the
     * vendor console lists every company there is, the device guard counts
     * seats, support checks that a company has only one CRM account. Run two
     * of those at once and each sees the other's fixtures.
     *
     * It failed the way concurrency does. Three consecutive runs of the full
     * suite against a freshly wiped emulator gave 2 failures, then 6, then
     * none, in three different files, with messages pointing nowhere near the
     * cause. Half an hour went into chasing three suites that were innocent.
     * The same three runs with file parallelism off: 349, 349, 349.
     *
     * The alternative — a separate emulator project per file — is the better
     * engineering answer and costs more than it is worth at this size. The
     * suite takes seconds either way, and a test run nobody believes is worth
     * less than a slow one.
     */
    fileParallelism: false,
  },
});
