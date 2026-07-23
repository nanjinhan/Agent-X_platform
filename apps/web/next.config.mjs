/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@signals/domain'],
  async rewrites() {
    // 웹(4000)에서 /v1/* 호출을 core-api(3000)로 프록시
    return [{ source: '/v1/:path*', destination: 'http://localhost:3000/v1/:path*' }];
  },
};

export default nextConfig;
