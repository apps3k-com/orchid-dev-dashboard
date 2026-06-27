import { describe, expect, it } from "vitest";
import { formatProducts, parseProducts } from "./variables";

describe("parseProducts", () => {
  it("splits, trims, drops blanks and dedupes", () => {
    expect(parseProducts(" checkout, billing ,, checkout,fulfilment ")).toEqual([
      "checkout",
      "billing",
      "fulfilment",
    ]);
  });

  it("returns an empty list for an empty value", () => {
    expect(parseProducts("")).toEqual([]);
  });
});

describe("formatProducts", () => {
  it("trims, dedupes and joins with commas", () => {
    expect(formatProducts([" a ", "b", "a", "", "c"])).toBe("a,b,c");
  });

  it("round-trips with parseProducts", () => {
    const value = "checkout,billing,fulfilment";
    expect(formatProducts(parseProducts(value))).toBe(value);
  });
});
