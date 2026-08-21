import { describe, expect, it } from "vitest";
import { isPrivateAddress, isPrivateHostname } from "./net";

describe("isPrivateAddress", () => {
  it("blocks loopback and private IPv4 ranges", () => {
    for (const address of [
      "127.0.0.1",
      "127.1.2.3",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "0.0.0.0",
      "100.64.0.1",
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("blocks the cloud metadata address", () => {
    // The single most valuable target of a server-side request forgery.
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
  });

  it("blocks IPv4 addresses smuggled through IPv6 notation", () => {
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("[::ffff:169.254.169.254]")).toBe(true);
  });

  it("blocks IPv6 loopback, unique-local and link-local", () => {
    for (const address of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "13.107.42.14", "2606:4700::1111"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it("allows a public IPv4 that merely starts with a private-looking octet", () => {
    // 172.15 and 172.32 are outside 172.16/12; 192.169 is outside 192.168/16.
    expect(isPrivateAddress("172.15.0.1")).toBe(false);
    expect(isPrivateAddress("172.32.0.1")).toBe(false);
    expect(isPrivateAddress("192.169.0.1")).toBe(false);
    expect(isPrivateAddress("100.63.0.1")).toBe(false);
  });
});

describe("isPrivateHostname", () => {
  it("blocks names that only resolve inside a network", () => {
    for (const host of ["localhost", "app.localhost", "printer.local", "db.internal", "router"]) {
      expect(isPrivateHostname(host), host).toBe(true);
    }
  });

  it("allows real websites", () => {
    for (const host of ["asianleather.com", "www.triogroup.in", "nsleather.com"]) {
      expect(isPrivateHostname(host), host).toBe(false);
    }
  });
});
