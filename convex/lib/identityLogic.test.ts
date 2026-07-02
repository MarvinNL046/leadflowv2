import { describe, expect, it } from "vitest";
import { isConvexAuthSubject, pickLinkableUser } from "./identityLogic";

describe("isConvexAuthSubject", () => {
  it("herkent Convex Auth's composiet subject", () => {
    expect(isConvexAuthSubject("qs7aw3sdwn3787xz8fk5jea295870y8v|js71abc")).toBe(
      true,
    );
  });

  it("herkent Clerk-subjects als niet-Convex-Auth", () => {
    expect(isConvexAuthSubject("user_2yGabcDEF123")).toBe(false);
  });
});

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
