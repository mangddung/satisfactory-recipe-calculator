import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider, theme } from 'antd'
import koKR from 'antd/locale/ko_KR'
import AdminPage from './pages/admin/AdminPage'
import CalculatorPage from './pages/calculator/CalculatorPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 60 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={koKR}
        theme={{
          algorithm: theme.darkAlgorithm,
          token: { colorPrimary: '#e8b84b', borderRadius: 6 },
        }}
      >
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<CalculatorPage />} />
            <Route path="/admin/*" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  )
}
