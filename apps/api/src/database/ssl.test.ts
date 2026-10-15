import { describe, expect, it } from "vitest";
import { sslOptions } from "./ssl.js";

const CA = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

describe("sslOptions", () => {
  it("turns TLS off for a local database", () => {
    expect(sslOptions({ DATABASE_SSL: "disable", DATABASE_SSL_CA: undefined })).toBe(false);
  });

  it("encrypts without verifying the server in require mode", () => {
    expect(sslOptions({ DATABASE_SSL: "require", DATABASE_SSL_CA: undefined })).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("verifies the server against the given CA in verify mode", () => {
    expect(sslOptions({ DATABASE_SSL: "verify", DATABASE_SSL_CA: CA })).toEqual({
      rejectUnauthorized: true,
      ca: CA,
    });
  });

  it("verifies against the system CAs when no CA is given", () => {
    expect(sslOptions({ DATABASE_SSL: "verify", DATABASE_SSL_CA: undefined })).toEqual({
      rejectUnauthorized: true,
    });
  });
});
