import { describe, it, expect } from "vitest";
import { signFaceToken, verifyFaceToken, FACE_TOKEN_TTL_MS } from "./face-token";
import { signKioskToken } from "../services/kiosk";

const SECRET = "test-secret";
const EMPLOYEE = "01HZY8QK7M3N4P5R6S7T8V9W0X";

describe("face tokens", () => {
  it("verifies a freshly issued token for the same employee", () => {
    const token = signFaceToken(SECRET, EMPLOYEE);
    expect(verifyFaceToken(SECRET, EMPLOYEE, token)).toBe(true);
  });

  it("rejects a token issued for a different employee", () => {
    const token = signFaceToken(SECRET, "01HZY8QK7M3N4P5R6S7T8V9W0Y");
    expect(verifyFaceToken(SECRET, EMPLOYEE, token)).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signFaceToken("other-secret", EMPLOYEE);
    expect(verifyFaceToken(SECRET, EMPLOYEE, token)).toBe(false);
  });

  it("rejects a token whose payload was tampered with", () => {
    const now = Date.now();
    const token = signFaceToken(SECRET, EMPLOYEE, now);
    const [, , sig] = token.split(".");
    // Re-point a valid signature at a newer timestamp.
    expect(verifyFaceToken(SECRET, EMPLOYEE, `${EMPLOYEE}.${now + 1}.${sig}`)).toBe(false);
  });

  it("expires after the TTL", () => {
    const issuedAt = Date.now() - FACE_TOKEN_TTL_MS - 1;
    const token = signFaceToken(SECRET, EMPLOYEE, issuedAt);
    expect(verifyFaceToken(SECRET, EMPLOYEE, token)).toBe(false);
  });

  it("is still valid just inside the TTL", () => {
    const issuedAt = Date.now() - (FACE_TOKEN_TTL_MS - 5_000);
    const token = signFaceToken(SECRET, EMPLOYEE, issuedAt);
    expect(verifyFaceToken(SECRET, EMPLOYEE, token)).toBe(true);
  });

  it("rejects a token issued implausibly far in the future", () => {
    const token = signFaceToken(SECRET, EMPLOYEE, Date.now() + 10 * 60 * 1000);
    expect(verifyFaceToken(SECRET, EMPLOYEE, token)).toBe(false);
  });

  it("rejects malformed tokens", () => {
    for (const bad of ["", "x", `${EMPLOYEE}.123`, `${EMPLOYEE}.abc.def`, "a.b.c.d"]) {
      expect(verifyFaceToken(SECRET, EMPLOYEE, bad)).toBe(false);
    }
  });

  it("does not accept a kiosk token (domain separation)", () => {
    const kiosk = signKioskToken(SECRET, EMPLOYEE);
    expect(verifyFaceToken(SECRET, EMPLOYEE, kiosk)).toBe(false);
  });
});
