/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  transpilePackages: ['@whatsapp-porter/shared'],
};

module.exports = nextConfig;
