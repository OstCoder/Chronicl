import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

/**
 * BrowserRouter reads the URL and makes it available to every component
 * (Header's <Link>, App's <Routes>, and later the story page's route
 * parameter). It must wrap EVERYTHING that uses routing.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
