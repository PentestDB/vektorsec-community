"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "react-query";
import { App } from "antd";
import NavigationProgress from "@/components/common/NavigationProgress";

const QueryClientContext = ({ children }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchIntervalInBackground: false,
            refetchOnWindowFocus: false,
            cacheTime: 0,
            retry: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <App component={false}>
        <NavigationProgress />
        {children}
      </App>
    </QueryClientProvider>
  );
};

export default QueryClientContext;
