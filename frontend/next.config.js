/** @type {import('next').NextConfig} */
const nextConfig = {
  // image urls
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.producthunt.com",
      },
    ],
  },
  sassOptions: {
    silenceDeprecations: ["import", "global-builtin"],
  },
};

module.exports = nextConfig;
