import { MainLayout } from "@/components/layout/MainLayout";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

function App() {
  // Create QueryClient instance (use useState to ensure it's only created once)
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        retry: 1,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <MainLayout />
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );
}

export default App;
