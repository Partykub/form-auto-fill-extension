import assert from "node:assert/strict";
import test from "node:test";
import { normalizeText } from "../src/text-normalizer.js";

test("returns empty string for null input", () => {
  assert.equal(normalizeText(null), "");
  assert.equal(normalizeText(undefined), "");
  assert.equal(normalizeText(""), "");
});

test("returns empty string for non-string input", () => {
  assert.equal(normalizeText(123), "");
  assert.equal(normalizeText({}), "");
});

test("collapses multiple whitespace and trims", () => {
  assert.equal(normalizeText("  ชื่อ   จริง  "), "ชื่อ จริง");
  assert.equal(normalizeText("  Hello    World  "), "hello world");
});

test("removes ordinal prefixes", () => {
  assert.equal(normalizeText("1. ชื่อ-นามสกุล"), "ชื่อนามสกุล");
  assert.equal(normalizeText("2) เบอร์โทรศัพท์"), "เบอร์โทรศัพท์");
  assert.equal(normalizeText("3- อีเมล"), "อีเมล");
  assert.equal(normalizeText("ก. จังหวัด"), "จังหวัด");
});

test("removes Thai filler words", () => {
  assert.equal(normalizeText("กรุณาระบุชื่อ-นามสกุล"), "ชื่อนามสกุล");
  assert.equal(normalizeText("โปรดกรอกเบอร์ติดต่อ"), "เบอร์ติดต่อ");
  assert.equal(normalizeText("กรุณาตอบ"), "");
  assert.equal(normalizeText("โปรด"), "");
});

test("removes English filler words", () => {
  assert.equal(normalizeText("please enter your email"), "your email");
  assert.equal(normalizeText("Please provide your name"), "your name");
  assert.equal(normalizeText("please enter"), "");
});

test("removes required suffixes", () => {
  assert.equal(normalizeText("ชื่อนามสกุล (required)"), "ชื่อนามสกุล");
  assert.equal(normalizeText("ชื่อนามสกุล *"), "ชื่อนามสกุล");
});

test("removes punctuation", () => {
  assert.equal(normalizeText("ชื่อนามสกุล"), "ชื่อนามสกุล");
  assert.equal(normalizeText("เบอร์(โทรศัพท์)"), "เบอร์โทรศัพท์");
});

test("converts to lowercase", () => {
  assert.equal(normalizeText("Email"), "email");
  assert.equal(normalizeText("PHONE"), "phone");
  assert.equal(normalizeText("Thai English"), "thai english");
});

test("handles mixed Thai and English", () => {
  assert.equal(
    normalizeText("กรุณาระบุที่อยู่อีเมลของคุณ"),
    "ที่อยู่อีเมลของคุณ",
  );
});
