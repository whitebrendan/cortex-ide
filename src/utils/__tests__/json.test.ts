import { describe, it, expect } from "vitest";
import {
  safeJsonParse,
  safeJsonParseValidated,
  isArray,
  isObject,
  safeJsonStringify,
  isString,
  isNumber,
  isBoolean,
  hasProperty,
  isNonNullish,
} from "../json";

describe("json", () => {
  describe("safeJsonParse", () => {
    it("parses valid JSON", () => {
      expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
    });
    it("returns fallback for invalid JSON", () => {
      expect(safeJsonParse("not json", { fallback: true })).toEqual({ fallback: true });
    });
    it("parses arrays", () => {
      expect(safeJsonParse("[1,2,3]", [])).toEqual([1, 2, 3]);
    });
    it("parses primitives", () => {
      expect(safeJsonParse("42", 0)).toBe(42);
      expect(safeJsonParse('"hello"', "")).toBe("hello");
    });
  });

  describe("safeJsonParseValidated", () => {
    const isNumberArray = (v: unknown): v is number[] =>
      Array.isArray(v) && v.every((x) => typeof x === "number");

    it("returns parsed value when valid", () => {
      expect(safeJsonParseValidated("[1,2,3]", isNumberArray, [])).toEqual([1, 2, 3]);
    });
    it("returns fallback when validation fails", () => {
      expect(safeJsonParseValidated('["a","b"]', isNumberArray, [0])).toEqual([0]);
    });
    it("returns fallback for invalid JSON", () => {
      expect(safeJsonParseValidated("bad", isNumberArray, [99])).toEqual([99]);
    });
  });

  describe("isArray", () => {
    it("returns true for arrays", () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2])).toBe(true);
    });
    it("returns false for non-arrays", () => {
      expect(isArray({})).toBe(false);
      expect(isArray("hello")).toBe(false);
      expect(isArray(null)).toBe(false);
    });
  });

  describe("isObject", () => {
    it("returns true for objects", () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
    });
    it("returns false for null", () => {
      expect(isObject(null)).toBe(false);
    });
    it("returns false for arrays", () => {
      expect(isObject([])).toBe(false);
    });
    it("returns false for primitives", () => {
      expect(isObject("str")).toBe(false);
      expect(isObject(42)).toBe(false);
    });
  });

  describe("safeJsonStringify", () => {
    it("stringifies objects", () => {
      expect(safeJsonStringify({ a: 1 })).toBe('{"a":1}');
    });
    it("returns fallback for circular references", () => {
      const obj: Record<string, unknown> = {};
      obj.self = obj;
      expect(safeJsonStringify(obj)).toBe("{}");
      expect(safeJsonStringify(obj, "fallback")).toBe("fallback");
    });
    it("stringifies primitives", () => {
      expect(safeJsonStringify(42)).toBe("42");
      expect(safeJsonStringify("hello")).toBe('"hello"');
    });
  });

  describe("isString", () => {
    it("returns true for strings", () => {
      expect(isString("")).toBe(true);
      expect(isString("hello")).toBe(true);
    });
    it("returns false for non-strings", () => {
      expect(isString(42)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString({})).toBe(false);
    });
  });

  describe("isNumber", () => {
    it("returns true for finite numbers", () => {
      expect(isNumber(0)).toBe(true);
      expect(isNumber(42)).toBe(true);
      expect(isNumber(-1.5)).toBe(true);
    });
    it("returns false for NaN and Infinity", () => {
      expect(isNumber(NaN)).toBe(false);
      expect(isNumber(Infinity)).toBe(false);
      expect(isNumber(-Infinity)).toBe(false);
    });
    it("returns false for non-numbers", () => {
      expect(isNumber("42")).toBe(false);
      expect(isNumber(null)).toBe(false);
    });
  });

  describe("isBoolean", () => {
    it("returns true for booleans", () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });
    it("returns false for non-booleans", () => {
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean("true")).toBe(false);
      expect(isBoolean(null)).toBe(false);
    });
  });

  describe("hasProperty", () => {
    it("returns true when object has the property", () => {
      expect(hasProperty({ name: "test" }, "name")).toBe(true);
    });
    it("returns false when object lacks the property", () => {
      expect(hasProperty({ name: "test" }, "age")).toBe(false);
    });
    it("returns false for non-objects", () => {
      expect(hasProperty(null, "x")).toBe(false);
      expect(hasProperty("str", "length")).toBe(false);
      expect(hasProperty(42, "x")).toBe(false);
    });
  });

  describe("isNonNullish", () => {
    it("returns true for non-null/undefined values", () => {
      expect(isNonNullish(0)).toBe(true);
      expect(isNonNullish("")).toBe(true);
      expect(isNonNullish(false)).toBe(true);
      expect(isNonNullish({})).toBe(true);
    });
    it("returns false for null and undefined", () => {
      expect(isNonNullish(null)).toBe(false);
      expect(isNonNullish(undefined)).toBe(false);
    });
  });
});
