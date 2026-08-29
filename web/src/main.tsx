import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './lib/supabase'
import './lib/cache-adapter'
import { queryClient, EiyuProvider } from './store/eiyu-store'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <EiyuProvider>
        <App />
      </EiyuProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
