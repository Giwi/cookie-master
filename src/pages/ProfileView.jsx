import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { ArrowLeftIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'

export default function ProfileView({ onBack }) {
  const { user } = useAuth()

  // États pour le nom / pseudonyme
  const [username, setUsername] = useState('')
  const [updatingProfile, setUpdatingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)

  // États pour le mot de passe
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState(null)

  useEffect(() => {
    async function fetchUserProfile() {
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('username, theme')
        .eq('id', user.id)
        .maybeSingle()

      if (data?.username) {
        setUsername(data.username)
      } else if (user.user_metadata?.username) {
        setUsername(user.user_metadata.username)
      }

      if (data?.theme) {
        setTheme(data.theme)
        document.documentElement.dataset.theme = data.theme
        localStorage.setItem('cc-theme', data.theme)
      }
    }
    fetchUserProfile()
  }, [user])

  // Thème
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'choco')
  const [themeOpen, setThemeOpen] = useState(false)

  const THEMES = [
    { id: 'choco', label: 'Chocolat', swatch: 'bg-[#5C3A21]' },
    { id: 'dark', label: 'Noisette', swatch: 'bg-[#21140D]' },
    { id: 'mint', label: 'Menthe', swatch: 'bg-[#4B7A3C]' },
    { id: 'light', label: 'Clair', swatch: 'bg-[#F5F7FA] border border-[var(--border)]' },
    { id: 'lollipop', label: 'Lollipop', swatch: 'bg-[#DB2777]' },
    { id: 'lollipop-dark', label: 'Lollipop sombre', swatch: 'bg-[#8b5cf6]' },
    { id: 'glass', label: 'Verre', swatch: 'bg-[#0a0e17] border border-[var(--border)]' },
  ]

  const selectTheme = async (id) => {
    setTheme(id)
    setThemeOpen(false)
    document.documentElement.dataset.theme = id
    localStorage.setItem('cc-theme', id)
    if (user) {
      await supabase.from('profiles').upsert({ id: user.id, theme: id })
    }
  }

  // Mettre à jour le pseudonyme
  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    if (!username.trim()) {
      setProfileMsg({ type: 'error', text: 'Le pseudo ne peut pas être vide.' })
      return
    }

    setUpdatingProfile(true)
    setProfileMsg(null)

    // 1. Mise à jour dans la table public.profiles
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: user.id, username: username.trim() })

    // 2. Mise à jour des métadonnées Supabase Auth
    const { error: authError } = await supabase.auth.updateUser({
      data: { username: username.trim() }
    })

    setUpdatingProfile(false)

    if (profileError || authError) {
      setProfileMsg({
        type: 'error',
        text: profileError?.message || authError?.message || 'Erreur lors de la mise à jour.'
      })
    } else {
      setProfileMsg({ type: 'success', text: 'Profil mis à jour avec succès !' })
    }
  }

  // Mettre à jour le mot de passe
  const handleUpdatePassword = async (e) => {
    e.preventDefault()
    setPasswordMsg(null)

    if (newPassword.length < 6) {
      setPasswordMsg({
        type: 'error',
        text: 'Le mot de passe doit contenir au moins 6 caractères.'
      })
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Les mots de passe ne correspondent pas.' })
      return
    }

    setUpdatingPassword(true)

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })

    setUpdatingPassword(false)

    if (error) {
      setPasswordMsg({ type: 'error', text: error.message })
    } else {
      setPasswordMsg({
        type: 'success',
        text: 'Mot de passe modifié avec succès !'
      })
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--plate)] p-4 sm:p-6">
      <div className="max-w-xl mx-auto space-y-6">
        
        {/* En-tête */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="text-xs font-bold text-[var(--primary)] hover:text-[var(--ink)] transition flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" /> Retour
          </button>
          <h1 className="text-xl font-extrabold text-[var(--ink)] flex items-center gap-1.5"><Cog6ToothIcon className="w-5 h-5 text-[var(--muted)]" /> Mon Profil</h1>
        </div>

        {/* Sélecteur de thème */}
        <div className="relative z-50 bg-[var(--card)] p-6 rounded-2xl shadow-sm border border-[var(--border)] space-y-4">
          <div>
            <h2 className="text-base font-bold text-[var(--ink)]">Apparence</h2>
            <p className="text-xs text-[var(--muted)]">
              Choisissez le thème de l'application.
            </p>
          </div>

          <div className="relative z-40">
            <button
              type="button"
              onClick={() => setThemeOpen(!themeOpen)}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[var(--plate)] border border-[var(--border)] text-sm font-semibold text-[var(--ink)] transition cursor-pointer hover:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              aria-haspopup="listbox"
              aria-expanded={themeOpen}
            >
              <span className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full border border-[var(--border-strong)] ${THEMES.find((t) => t.id === theme).swatch}`} />
                {THEMES.find((t) => t.id === theme).label}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-[var(--muted)] transition-transform ${themeOpen ? 'rotate-180' : ''}`}>
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>

            {themeOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setThemeOpen(false)} />
                <ul
                  className="theme-menu absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-lg backdrop-blur-xl"
                  role="listbox"
                >
                  {THEMES.map((t) => (
                    <li key={t.id} role="option" aria-selected={theme === t.id}>
                      <button
                        type="button"
                        onClick={() => selectTheme(t.id)}
                        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm transition cursor-pointer ${
                          theme === t.id
                            ? 'bg-[var(--plate)] text-[var(--ink)] font-semibold'
                            : 'text-[var(--text)] hover:bg-[var(--plate)]'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`w-4 h-4 rounded-full border border-[var(--border-strong)] ${t.swatch}`} />
                          {t.label}
                        </span>
                        {theme === t.id && (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[var(--accent)]">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Formulaire 1 : Nom / Pseudonyme */}
        <div className="bg-[var(--card)] p-6 rounded-2xl shadow-sm border border-[var(--border)] space-y-4">
          <div>
            <h2 className="text-base font-bold text-[var(--ink)]">Informations personnelles</h2>
            <p className="text-xs text-[var(--primary)]/70">
              C'est le nom qui apparaîtra sous vos évaluations de cookies.
            </p>
          </div>

          {profileMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold ${
                profileMsg.type === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {profileMsg.text}
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-[var(--text)]/80 mb-1">
                Adresse e-mail (non modifiable)
              </label>
              <input
                type="text"
                disabled
                value={user?.email || ''}
                className="w-full px-3 py-2 bg-[var(--plate)] border border-[var(--border)] rounded-xl text-[var(--primary)]/60 text-sm cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-[var(--text)]/80 mb-1">
                Pseudonyme
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: PâtissierDuDimanche"
                className="w-full px-3 py-2 bg-[var(--plate)] border border-[var(--border)] rounded-xl text-[var(--ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            <button
              type="submit"
              disabled={updatingProfile}
              className="w-full bg-[var(--primary)] hover:bg-[var(--primary-deep)] text-[var(--on-primary)] font-bold py-2.5 rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer text-xs uppercase tracking-wider"
            >
              {updatingProfile ? 'Enregistrement...' : 'Enregistrer le pseudonyme'}
            </button>
          </form>
        </div>

        {/* Formulaire 2 : Changement de mot de passe */}
        <div className="bg-[var(--card)] p-6 rounded-2xl shadow-sm border border-[var(--border)] space-y-4">
          <div>
            <h2 className="text-base font-bold text-[var(--ink)]">Sécurité</h2>
            <p className="text-xs text-[var(--primary)]/70">
              Modifier votre mot de passe de connexion.
            </p>
          </div>

          {passwordMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold ${
                passwordMsg.type === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {passwordMsg.text}
            </div>
          )}

          <form onSubmit={handleUpdatePassword} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-[var(--text)]/80 mb-1">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6 caractères minimum"
                className="w-full px-3 py-2 bg-[var(--plate)] border border-[var(--border)] rounded-xl text-[var(--ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-[var(--text)]/80 mb-1">
                Confirmer le nouveau mot de passe
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Répétez le mot de passe"
                className="w-full px-3 py-2 bg-[var(--plate)] border border-[var(--border)] rounded-xl text-[var(--ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            <button
              type="submit"
              disabled={updatingPassword}
              className="w-full bg-[var(--primary)] hover:bg-[var(--primary-deep)] text-[var(--on-primary)] font-bold py-2.5 rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer text-xs uppercase tracking-wider"
            >
              {updatingPassword ? 'Modification...' : 'Changer le mot de passe'}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}