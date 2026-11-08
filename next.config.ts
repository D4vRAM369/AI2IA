import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(process.env.NEXT_PUBLIC_APP_MODE === "public"
    ? {
        output: "export",
        trailingSlash: true,
        ...(process.env.NEXT_PUBLIC_BASE_PATH
          ? {
              basePath: process.env.NEXT_PUBLIC_BASE_PATH,
              assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH,
            }
          : {}),
      }
    : {}),
};

export default nextConfig;
