import { describe, expect, it } from "vitest";
import { pickLinkableUser } from "./identityLogic";

describe("pickLinkableUser", () => {
  const A = "userA_met_profile";
  const B = "userB_kale_duplicaat";

  it("kiest de rij mét userProfile boven het kale duplicaat", () => {
    const picked = pickLinkableUser(
      [{ _id: B }, { _id: A }],
      new Set([A]),
    );
    expect(picked).toBe(A);
  });

  it("linkt nooit naar een rij die al aan een andere Clerk-user hangt", () => {
    const picked = pickLinkableUser(
      [{ _id: A, clerkUserId: "user_iemand_anders" }],
      new Set([A]),
    );
    expect(picked).toBeNull();
  });

  it("linkt niet naar profiel-loze rijen (liever een verse user)", () => {
    const picked = pickLinkableUser([{ _id: B }], new Set());
    expect(picked).toBeNull();
  });

  it("geeft null bij nul kandidaten", () => {
    expect(pickLinkableUser([], new Set())).toBeNull();
  });
});
