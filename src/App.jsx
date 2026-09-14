import { useState } from 'react'
import { useAuth } from './context/AuthContext'
import { supabase } from './lib/supabaseClient'
import { Cog6ToothIcon, ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline'
import Auth from './pages/Auth'
import Hub from './pages/Hub'
import LeagueView from './pages/LeagueView'
import ProfileView from './pages/ProfileView'


export default function App() {
  const { user } = useAuth()
  const [currentView, setCurrentView] = useState('hub') // 'hub' | 'league' | 'profile'
  const [selectedLeagueId, setSelectedLeagueId] = useState(null)

  // 1. Redirection si l'utilisateur n'est pas connecté
  if (!user) {
    return <Auth />
  }

  // Navigation vers une ligue
  const handleSelectLeague = (id) => {
    setSelectedLeagueId(id)
    setCurrentView('league')
  }

  // Retour au Hub
  const handleBackToHub = () => {
    setSelectedLeagueId(null)
    setCurrentView('hub')
  }

  // Déconnexion
  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-[var(--plate)] text-[var(--ink)]">
      {/* Barre de navigation fixe */}
      <header className="bg-[var(--card)] border-b border-[var(--border)] shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={handleBackToHub}
            className="flex items-center gap-2 font-black text-[var(--ink)] text-base sm:text-lg hover:opacity-80 transition cursor-pointer min-w-0"
          >
            <span className="shrink-0">🍪</span> <span className="truncate">Cookie Challenge</span>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <button
              onClick={() => setCurrentView('profile')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                currentView === 'profile'
                  ? 'bg-[var(--primary)] text-[var(--on-primary)] '
                  : 'bg-[var(--plate-3)] text-[var(--text)] hover:bg-[var(--plate-2)]'
              }`}
              title="Profil"
            >
              <Cog6ToothIcon className="w-4 h-4" /> <span className="hidden sm:inline">Mon Profil</span>
            </button>

            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl font-bold text-xs transition cursor-pointer"
              title="Se déconnecter"
            >
              <ArrowRightStartOnRectangleIcon className="w-4 h-4 sm:hidden" /><span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenu dynamique */}
      <main>
        {currentView === 'profile' && (
          <ProfileView onBack={handleBackToHub} />
        )}

        {currentView === 'league' && selectedLeagueId && (
          <LeagueView
            leagueId={selectedLeagueId}
            onBack={handleBackToHub}
          />
        )}

        {currentView === 'hub' && (
          <Hub
            onSelectLeague={handleSelectLeague}
            onOpenLeague={handleSelectLeague}
          />
        )}
      </main>
    </div>
  )
}