// The allowlist is the only thing standing between a copied snippet and
// somebody else's credits, so its edge cases are tested rather than reasoned
// about. Each case here is a way a real installation goes wrong.

import { describe, expect, it } from "vitest";
import { hashAddress, originAllowed, originHost } from "./perimeter.js";

describe("originHost", () => {
  it("accepts what an owner actually types", () => {
    expect(originHost("acme.com")).toBe("acme.com");
    expect(originHost("https://acme.com")).toBe("acme.com");
    expect(originHost("https://www.acme.com")).toBe("acme.com");
    expect(originHost("HTTPS://WWW.Acme.COM/pricing")).toBe("acme.com");
  });

  it("keeps the port, because two dev servers are two origins", () => {
    expect(originHost("http://localhost:5173")).toBe("localhost:5173");
  });

  it("is null for nothing and for nonsense", () => {
    expect(originHost(null)).toBeNull();
    expect(originHost("")).toBeNull();
    expect(originHost("   ")).toBeNull();
  });
});

describe("originAllowed", () => {
  it("refuses everything when the list is empty", () => {
    expect(originAllowed([], "https://acme.com")).toBe(false);
  });

  it("matches with or without www on either side", () => {
    expect(originAllowed(["acme.com"], "https://www.acme.com")).toBe(true);
    expect(originAllowed(["https://www.acme.com"], "https://acme.com")).toBe(true);
  });

  it("does not match a subdomain or a lookalike", () => {
    expect(originAllowed(["acme.com"], "https://shop.acme.com")).toBe(false);
    expect(originAllowed(["acme.com"], "https://acme.com.evil.test")).toBe(false);
    expect(originAllowed(["acme.com"], "https://notacme.com")).toBe(false);
  });

  it("refuses a request with no Origin at all", () => {
    expect(originAllowed(["acme.com"], null)).toBe(false);
    expect(originAllowed(["acme.com"], undefined)).toBe(false);
  });

  it("always allows loopback, so a fresh clone is not dead on arrival", () => {
    expect(originAllowed([], "http://localhost:5173")).toBe(true);
    expect(originAllowed([], "http://127.0.0.1:8794")).toBe(true);
  });
});

describe("hashAddress", () => {
  it("is stable for the same visitor on the same mascot", async () => {
    expect(await hashAddress("1.2.3.4", "key-a")).toBe(await hashAddress("1.2.3.4", "key-a"));
  });

  it("cannot be used to follow one visitor across two mascots", async () => {
    expect(await hashAddress("1.2.3.4", "key-a")).not.toBe(await hashAddress("1.2.3.4", "key-b"));
  });

  it("does not contain the address", async () => {
    expect(await hashAddress("1.2.3.4", "key-a")).not.toContain("1.2.3.4");
  });
});
