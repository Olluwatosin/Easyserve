/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Explicit allow-list — never optimise images from arbitrary hosts.
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.easyserve.ng" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
