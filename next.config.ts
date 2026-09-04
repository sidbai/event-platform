import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // King Juan Cup team crests (kingjuan-assets repo)
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      // Google account avatars (Auth.js)
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
