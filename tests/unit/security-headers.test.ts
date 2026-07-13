import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("security response headers", () => {
  it("configures anti-framing, content, referrer, and API cache headers", async () => {
    const configurations = await nextConfig.headers?.();

    expect(configurations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "/:path*",
          headers: expect.arrayContaining([
            {
              key: "Content-Security-Policy",
              value: "frame-ancestors 'none'",
            },
            { key: "X-Frame-Options", value: "DENY" },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "no-referrer" },
          ]),
        }),
        expect.objectContaining({
          source: "/api/:path*",
          headers: expect.arrayContaining([
            {
              key: "Cache-Control",
              value: "private, no-store, max-age=0",
            },
          ]),
        }),
      ]),
    );
  });
});
