import { describe, expect, it } from "vitest";
import { parseTicketSearchExpression } from "./ticketSearchExpression";

describe("parseTicketSearchExpression", () => {
  it("treats adjacent words as an AND search", () => {
    expect(parseTicketSearchExpression("driver engagement")).toEqual({
      type: "and",
      children: [
        { type: "term", value: "driver" },
        { type: "term", value: "engagement" },
      ],
    });
  });

  it("keeps quoted text as an exact phrase term", () => {
    expect(parseTicketSearchExpression('"driver engagement" campaigns')).toEqual({
      type: "and",
      children: [
        { type: "term", value: "driver engagement" },
        { type: "term", value: "campaigns" },
      ],
    });
  });

  it("uses AND precedence before OR", () => {
    expect(parseTicketSearchExpression("recruiting OR driver AND engagement")).toEqual({
      type: "or",
      children: [
        { type: "term", value: "recruiting" },
        {
          type: "and",
          children: [
            { type: "term", value: "driver" },
            { type: "term", value: "engagement" },
          ],
        },
      ],
    });
  });

  it("supports parentheses for grouped searches", () => {
    expect(parseTicketSearchExpression('(recruiting OR "driver engagement") AND campaigns')).toEqual({
      type: "and",
      children: [
        {
          type: "or",
          children: [
            { type: "term", value: "recruiting" },
            { type: "term", value: "driver engagement" },
          ],
        },
        { type: "term", value: "campaigns" },
      ],
    });
  });
});