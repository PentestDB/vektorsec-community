"use client";

// antd v5 + React 19 compatibility bridge.
//
// Must execute in the BROWSER before any antd component renders, so this is a
// tiny client component mounted at the very top of the root layout (a bare
// side-effect import in a Server Component would only run on the server and
// would NOT suppress the client-side "[antd: compatible]" warning).
import "@ant-design/v5-patch-for-react-19";

export default function AntdCompat() {
  return null;
}
