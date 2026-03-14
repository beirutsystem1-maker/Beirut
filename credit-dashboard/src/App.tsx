import { useState } from 'react';
import { ThemeProvider } from './logic/ThemeProvider';
import { Layout } from './components/Layout';
import { ClientList } from './views/ClientList';
import { ExcelImportView } from './views/ExcelImportView';
import { SettingsView } from './views/SettingsView';
import { HistorialMesView } from './views/HistorialMesView';
import { LockScreen } from './components/LockScreen';
import { ClientProvider } from './logic/ClientContext';
import { ToastProvider } from './logic/ToastContext';
import { SettingsProvider } from './logic/SettingsContext';

export type ViewState = 'clients' | 'excel' | 'settings' | 'historial';

function App() {
  const [currentView, setCurrentView] = useState<ViewState>('clients');
  const [searchTerm, setSearchTerm] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(() => {
    return localStorage.getItem('beirut_unlocked') === 'true';
  });

  const handleUnlock = () => {
    localStorage.setItem('beirut_unlocked', 'true');
    setIsUnlocked(true);
  };

  return (
    <ThemeProvider defaultTheme="light" storageKey="beirut-ui-theme">
      <SettingsProvider>
        <ToastProvider>
          {!isUnlocked ? (
            <LockScreen onUnlock={handleUnlock} />
          ) : (
            <ClientProvider>
              <Layout currentView={currentView} onViewChange={setCurrentView} searchTerm={searchTerm} setSearchTerm={setSearchTerm}>
                {currentView === 'clients' && <ClientList onViewChange={setCurrentView} searchTerm={searchTerm} />}
                {currentView === 'excel' && <ExcelImportView />}
                {currentView === 'settings' && <SettingsView />}
                {currentView === 'historial' && <HistorialMesView />}
              </Layout>
            </ClientProvider>
          )}
        </ToastProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

export default App;
