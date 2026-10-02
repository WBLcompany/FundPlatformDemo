import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  transpilePackages: ["@wbl/ui", "@wbl/tokens", "@wbl/domain", "@wbl/rules", "@wbl/kernel", "@wbl/adapters"],
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
};
export default config;
