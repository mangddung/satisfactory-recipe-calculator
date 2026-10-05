import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider, Spin, theme } from 'antd'
import koKR from 'antd/locale/ko_KR'
import enUS from 'antd/locale/en_US'
import AdminPage from './pages/admin/AdminPage'
import CalculatorPage from './pages/calculator/CalculatorPage'
import SetupPage from './pages/setup/SetupPage'
import LangProvider from './i18n/LangProvider'
import { useLang } from './i18n'
import { useSetupStatus } from './api/setup'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 60 } },
})

// until the first setup is done, every page except /setup redirects there
function SetupGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { data, isPending } = useSetupStatus()
  if (pathname === '/setup') return children
  if (isPending) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a12' }}>
        <Spin />
      </div>
    )
  }
  // status error -> let the page render and show its own errors
  if (data && !data.configured) return <Navigate to="/setup" replace />
  return children
}

function LocalizedApp() {
  const { lang } = useLang()
  return (
    <ConfigProvider
      locale={lang === 'ko' ? koKR : enUS}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: '#e8b84b', borderRadius: 6 },
      }}
    >
      <BrowserRouter>
        <SetupGate>
          <Routes>
            <Route path="/" element={<CalculatorPage />} />
            <Route path="/admin/*" element={<AdminPage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SetupGate>
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        <LocalizedApp />
      </LangProvider>
    </QueryClientProvider>
  )
}
