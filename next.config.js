/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    env: {
        API_KEY: process.env.GEMINI_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    }
};

export default nextConfig;
