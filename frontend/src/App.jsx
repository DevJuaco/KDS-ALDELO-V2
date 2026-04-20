import './App.css'
import { useState, useEffect } from 'react'
import HomePage from './pages/HomePage'
import SettingsPage from './pages/SettingsPage'

function App() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (hash === '#settings') return <SettingsPage />;
  return <HomePage />;
}

export default App
