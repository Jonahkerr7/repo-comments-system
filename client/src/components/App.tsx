import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommentOverlay } from './CommentOverlay';
import type { RepoCommentsSDK } from '../RepoComments';
import '../styles/figma-theme.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

interface AppProps {
  sdk: typeof RepoCommentsSDK;
}

function App({ sdk }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <CommentOverlay sdk={sdk} />
    </QueryClientProvider>
  );
}

export function renderApp(container: HTMLElement, sdk: any) {
  const root = createRoot(container);
  root.render(<App sdk={sdk} />);
}
