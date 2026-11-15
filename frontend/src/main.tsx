import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
// Outline, fill and focus for every text box and dropdown in every workspace — see the file.
import './shared/styles/fields.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import GlobalErrorToast from './components/GlobalErrorToast.tsx'
import NewVersionBar from './components/NewVersionBar.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
        <GlobalErrorToast />
        <NewVersionBar />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
