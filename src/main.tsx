import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/inter'
import './styles/app.css'
import { ApiError } from './api/client'
import { AuthProvider } from './auth/AuthContext'
import { ToastProvider } from './ui/Toasts'
import { App } from './App'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // a 4xx will not fix itself; only retry network blips and server errors, once
      retry: (count, e) => !(e instanceof ApiError && e.status > 0 && e.status < 500) && count < 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
