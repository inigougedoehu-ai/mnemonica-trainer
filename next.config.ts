import type { NextConfig } from "next";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] || "";
const isProjectPage = Boolean(repository && !repository.endsWith(".github.io"));
const basePath = process.env.GITHUB_ACTIONS === "true" && isProjectPage ? `/${repository}` : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
