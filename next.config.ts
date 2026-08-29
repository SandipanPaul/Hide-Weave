import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Mailings carry attachments, which arrive in the same form submission.
      // The default is 1 MB — far below the 15 MB of files a mailing allows
      // (see src/lib/mail/attachments.ts), and the overflow is rejected by the
      // framework before any of this app's own validation can explain why.
      // The headroom above 15 MB covers multipart encoding and the message.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
