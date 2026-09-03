import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { basePath } from './api.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { OverviewPage } from './pages/OverviewPage.js';
import { FinancePage } from './pages/FinancePage.js';
import { ScriptsPage } from './pages/ScriptsPage.js';
import { CalendarPage } from './pages/CalendarPage.js';
import { ProjectsPage } from './pages/ProjectsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

function AppRoutes() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/scripts" element={<ScriptsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}

export function App({ initialEntries }: { initialEntries?: string[] } = {}) {
  const content = (
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>
  );

  return initialEntries ? (
    <MemoryRouter initialEntries={initialEntries}>{content}</MemoryRouter>
  ) : (
    <BrowserRouter basename={basePath}>{content}</BrowserRouter>
  );
}
