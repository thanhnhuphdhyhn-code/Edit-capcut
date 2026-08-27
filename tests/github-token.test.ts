import { describe, expect, it } from "vitest";

describe("GitHub token", () => {
  it("can authenticate with the GitHub user endpoint", async () => {
    const token = process.env.GH_TOKEN;
    expect(token, "GH_TOKEN phải được cung cấp qua cài đặt bảo mật").toBeTruthy();

    const response = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    expect(response.status, "Token GitHub không xác thực được").toBe(200);
    const profile = (await response.json()) as { login?: string };
    expect(profile.login).toBeTruthy();
  });
});
