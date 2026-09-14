import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { ArrowLeftIcon, CalendarDaysIcon, ClockIcon, DocumentTextIcon, FireIcon, PaperAirplaneIcon, SparklesIcon, StarIcon, TrophyIcon, XCircleIcon } from '@heroicons/react/24/outline'
import logo from '../logo/logo.webp'

const CRITERIA = [
  { id: 'taste', label: 'Goût' },
  { id: 'texture', label: 'Texture' },
  { id: 'appearance', label: 'Esthétique' },
  { id: 'baking', label: 'Cuisson' },
  { id: 'indulgence', label: 'Gourmandise' }
]

export default function LeagueView({ leagueId, onBack }) {
  const { user } = useAuth()
  const [league, setLeague] = useState(null)
  const [ratings, setRatings] = useState([])
  
  const currentWeek = getWeekNumber(new Date())
  const currentYear = new Date().getFullYear()
  
  const [selectedWeekToRate, setSelectedWeekToRate] = useState(currentWeek)
  const [selectedWeekFilter, setSelectedWeekFilter] = useState('all')
  const [bakeMaster, setBakeMaster] = useState(null)
  const [fullSchedule, setFullSchedule] = useState([])
  const [leagueMembers, setLeagueMembers] = useState([])

  const [scores, setScores] = useState({
    taste: 0,
    texture: 0,
    appearance: 0,
    baking: 0,
    indulgence: 0
  })
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [copied, setCopied] = useState(false)

  function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dayNum = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    return Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  }

  const fetchData = async () => {
    if (!leagueId) return

    setLoading(true)

    // Single read: 8 sequential queries collapsed into 1 embed.
const { data: leagueData, error: leagueError } = await supabase
  .from('leagues')
  .select(`...`)
  .eq('id', leagueId)
  .maybeSingle()

setLoading(false)

if (leagueError) {
  console.error('Chargement ligue :', leagueError)
  setMessage({ type: 'error', text: `${leagueError.code} — ${leagueError.message}` })
  return
}
if (!leagueData) return

    setLeague(leagueData)

    const enrichedMembers = (leagueData.league_members || []).map(m => ({
      user_id: m.user_id,
      profiles: m.profiles || { username: 'Collègue mystère' }
    }))
    setLeagueMembers(enrichedMembers)

    const enrichedSchedule = (leagueData.league_schedule || [])
      .filter(s => s.year === currentYear)
      .map(s => ({ ...s, profiles: s.profiles || { username: 'Collègue' } }))
      .sort((a, b) => a.week_number - b.week_number)
    setFullSchedule(enrichedSchedule)
    setBakeMaster(enrichedSchedule.find(s => s.week_number === currentWeek) || null)

    const enrichedRatings = (leagueData.ratings || []).map(r => ({
      ...r,
      profiles: r.profiles || { username: 'Collègue' }
    }))
    setRatings(enrichedRatings)

    const existing = enrichedRatings.find(
      r => (r.user_id === user?.id || r.voter_id === user?.id) && 
           (r.week_number === selectedWeekToRate || (!r.week_number && selectedWeekToRate === currentWeek))
    )
    if (existing) {
      setScores({
        taste: existing.taste || 0,
        texture: existing.texture || 0,
        appearance: existing.appearance || 0,
        baking: existing.baking || 0,
        indulgence: existing.indulgence || 0
      })
      setComment(existing.comment || '')
    } else {
      setScores({ taste: 0, texture: 0, appearance: 0, baking: 0, indulgence: 0 })
      setComment('')
    }
  }

  const assignUnassignedMembers = async () => {
    if (!leagueId) return

    const { data: league } = await supabase
      .from('leagues')
      .select('status')
      .eq('id', leagueId)
      .maybeSingle()

    if (!league || league.status !== 'active') return

    const { data: members } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId)

    const { data: sched } = await supabase
      .from('league_schedule')
      .select('week_number, turn_order, assigned_user_id')
      .eq('league_id', leagueId)
      .eq('year', currentYear)

    const schedule = sched || []
    const assigned = new Set(schedule.map(s => s.assigned_user_id))
    const toAssign = (members || []).filter(m => !assigned.has(m.user_id))

    if (toAssign.length === 0) return

    const lastWeek = schedule.length > 0
      ? Math.max(...schedule.map(s => s.week_number))
      : currentWeek - 1

    await supabase
      .from('league_schedule')
      .insert(toAssign.map((member, idx) => ({
        league_id: leagueId,
        week_number: lastWeek + 1 + idx,
        year: currentYear,
        assigned_user_id: member.user_id,
        turn_order: schedule.length + idx + 1
      })))
  }

  useEffect(() => {
    fetchData()
    assignUnassignedMembers()

    const channel = supabase
      .channel(`room-${leagueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leagues', filter: `id=eq.${leagueId}` }, () => fetchData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'league_members', filter: `league_id=eq.${leagueId}` }, () => { assignUnassignedMembers(); fetchData() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_schedule', filter: `league_id=eq.${leagueId}` }, () => fetchData())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [leagueId, currentWeek, user?.id, selectedWeekToRate])

  const handleStartLeague = async () => {
    setMessage(null)
    setSubmitting(true)

    try {
      if (leagueMembers.length > 0) {
        const scheduleInserts = leagueMembers.map((member, index) => ({
          league_id: leagueId,
          week_number: currentWeek + index,
          year: currentYear,
          assigned_user_id: member.user_id,
          turn_order: index + 1
        }))

        const { error: schedError } = await supabase
          .from('league_schedule')
          .insert(scheduleInserts)

        if (schedError) throw schedError
      }

      const { error: updateError } = await supabase
        .from('leagues')
        .update({ status: 'active' })
        .eq('id', leagueId)

      if (updateError) throw updateError

      await fetchData()
      setMessage({ type: 'success', text: `C'est parti ! La ligue est lancée pour ${leagueMembers.length} semaines de régals.` })

    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: `Oups, impossible de lancer la machine : ${err.message}` })
    } finally {
      setSubmitting(false)
    }
  }

  const calculateAverage = (s) => {
    const sum = Number(s.taste) + Number(s.texture) + Number(s.appearance) + Number(s.baking) + Number(s.indulgence)
    return (sum / 5).toFixed(1)
  }

  const isSelfRating = () => {
    const targetSchedule = fullSchedule.find(s => s.week_number === selectedWeekToRate)
    if (!targetSchedule) return false
    return targetSchedule.assigned_user_id === user?.id
  }

  const handleSubmitRating = async (e) => {
    e.preventDefault()
    if (!user?.id || !leagueId) return

    if (selectedWeekToRate > currentWeek) {
      setMessage({ type: 'error', text: "On se calme ! Tu ne peux pas noter une semaine du futur." })
      return
    }

    if (isSelfRating()) {
      setMessage({ type: 'error', text: "Auto-évaluation interdite. Laisse tes collègues juger !" })
      return
    }

    setSubmitting(true)
    setMessage(null)

    const globalScore = Number(calculateAverage(scores))

    const payload = {
      league_id: leagueId,
      user_id: user.id,
      voter_id: user.id,
      score: globalScore,
      taste: Number(scores.taste),
      texture: Number(scores.texture),
      appearance: Number(scores.appearance),
      baking: Number(scores.baking),
      indulgence: Number(scores.indulgence),
      comment: comment.trim() || null,
      week_number: Number(selectedWeekToRate)
    }

    // Atomic: one vote per (voter, league, week). Unique index ratings_one_vote_week in DB.
    const { error } = await supabase
      .from('ratings')
      .upsert([payload], { onConflict: 'voter_id,league_id,week_number' })

    if (error) {
      setMessage({ type: 'error', text: `Erreur : ${error.message}` })
      setSubmitting(false)
    } else {
      if (onBack) onBack()
    }
  }

  const handleCopyCode = () => {
    if (!league?.code) return
    navigator.clipboard.writeText(league.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const filteredRatings = ratings.filter((r) => {
    const rWeek = r.week_number || currentWeek
    if (rWeek === currentWeek) return false
    if (selectedWeekFilter !== 'all' && rWeek !== Number(selectedWeekFilter)) return false
    return true
  })

  // Cumul par membre : chaque semaine = moyenne des votes de la semaine. Le total
  // cumule ces moyennes (pas le nombre de jurés, sinon la semaine la plus jugée gagnerait).
  const rankingMap = {}
  const CRIT_KEYS = CRITERIA.map(c => c.id)
  filteredRatings.forEach(r => {
    const weekNum = r.week_number || currentWeek
    const scheduleItem = fullSchedule.find(s => s.week_number === weekNum)
    const bakerId = scheduleItem?.assigned_user_id || r.user_id
    const bakerName = scheduleItem?.profiles?.username || r.profiles?.username || 'Collègue'

    if (!rankingMap[bakerId]) {
      rankingMap[bakerId] = { bakerId, username: bakerName, weeks: {} }
      CRIT_KEYS.forEach(c => { rankingMap[bakerId][c] = 0 })
    }
    const entry = rankingMap[bakerId]
    CRIT_KEYS.forEach(c => { entry[c] += Number(r[c] || 0) })
    if (!entry.weeks[weekNum]) entry.weeks[weekNum] = []
    entry.weeks[weekNum].push(Number(r.score || 0))
  })

  // Meilleur cookie de chaque semaine : le boulanger à la meilleure moyenne.
  const weekBestBaker = {}
  Object.entries(rankingMap).forEach(([bakerId, entry]) => {
    Object.entries(entry.weeks).forEach(([weekNum, scores]) => {
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length
      const prev = weekBestBaker[weekNum]
      if (!prev || mean > prev.mean) {
        weekBestBaker[weekNum] = { bakerId, mean }
      }
    })
  })
  const winsByBaker = {}
  Object.values(weekBestBaker).forEach(w => { winsByBaker[w.bakerId] = (winsByBaker[w.bakerId] || 0) + 1 })

  const leaderboard = Object.values(rankingMap).map(entry => {
    const weekMeans = Object.values(entry.weeks).map(w => w.reduce((a, b) => a + b, 0) / w.length)
    const nWeeks = weekMeans.length
    const nVotes = Object.values(entry.weeks).reduce((a, w) => a + w.length, 0)
    const total = nWeeks ? weekMeans.reduce((a, b) => a + b, 0) : 0
    const critAvg = c => (nVotes ? (entry[c] / nVotes).toFixed(1) : '0.0')
    return {
      bakerId: entry.bakerId,
      username: entry.username,
      weeks: nWeeks,
      wins: winsByBaker[entry.bakerId] || 0,
      total,
      avgGlobal: nWeeks ? (total / nWeeks).toFixed(1) : '0.0',
      taste: critAvg('taste'),
      texture: critAvg('texture'),
      appearance: critAvg('appearance'),
      baking: critAvg('baking'),
      indulgence: critAvg('indulgence'),
    }
  }).sort((a, b) => b.avgGlobal - a.avgGlobal)

  const leagueGlobalAverage = filteredRatings.length > 0
    ? (filteredRatings.reduce((acc, r) => acc + Number(r.score || 0), 0) / filteredRatings.length).toFixed(1)
    : null

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
        <div className="text-[var(--primary)] font-medium animate-pulse">On sort les pépites de chocolat du placard...</div>
      </div>
    )
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-6 flex flex-col items-center justify-center text-center">
        <p className="text-[var(--primary)] mb-4">Oups, impossible de mettre la main sur cette ligue.</p>
        <button onClick={onBack} className="px-4 py-2 bg-[var(--primary)] text-[var(--on-primary)] text-sm rounded-xl hover:bg-[var(--primary-deep)] transition shadow-sm font-medium">
          Retour au QG
        </button>
      </div>
    )
  }

  if (league.status === 'recruiting') {
    const isCreator = user && league.created_by === user.id
    return (
      <div className="min-h-screen bg-[radial-gradient(var(--dot)_1px,transparent_1px)] [background-size:16px_16px] p-4 sm:p-6 flex items-center justify-center text-[var(--text)]">
        <div className="max-w-md w-full bg-[var(--card)] backdrop-blur p-6 rounded-3xl border border-[var(--border)] shadow-xl space-y-6">
          <div className="flex items-center gap-3">
            <img 
              src={logo} 
              alt="Logo" 
              className="w-12 h-12 object-contain rounded-2xl shadow-xs border border-[var(--border)] bg-[var(--plate-2)]" 
            />
            <div>
              <button onClick={onBack} className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] hover:text-[var(--text)] transition mb-1 inline-block">
                <ArrowLeftIcon className="w-3.5 h-3.5 inline-block mr-1" /> Retour
              </button>
              <h1 className="text-xl font-black text-[var(--ink)] tracking-tight">{league.name}</h1>
            </div>
          </div>

          <div className="bg-[var(--plate)] p-4 rounded-2xl border border-[var(--border)] text-center space-y-2">
            <span className="text-[11px] uppercase font-bold tracking-wider text-[var(--muted)]">Code secret de l'openspace</span>
            <div className="text-xl font-mono font-black text-[var(--text)] bg-[var(--card)] py-2.5 rounded-xl border border-[var(--border)] shadow-inner tracking-widest">
              {league.code}
            </div>
            <button onClick={handleCopyCode} className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] underline">
              {copied ? <span className="inline-flex items-center gap-1"><SparklesIcon className="w-3.5 h-3.5" /> Code copié, balance-le aux collègues !</span> : 'Copier le code'}
            </button>
          </div>

          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              Les gourmands inscrits ({leagueMembers.length})
            </h2>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {leagueMembers.map((member) => (
                <div key={member.user_id} className="bg-[var(--bg)] px-3.5 py-2.5 rounded-xl text-xs text-[var(--text)] flex items-center justify-between border border-[var(--border-soft)] font-medium">
                  <span>{member.profiles?.username || 'Collègue'}</span>
                  {member.user_id === league.created_by && (
                    <span className="text-[10px] font-bold bg-[var(--accent-bright)] text-[var(--ink)] px-2.5 py-0.5 rounded-full shadow-2xs border border-[var(--accent)]">Chef de Bande</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {message && (
            <div className={`p-3.5 rounded-xl text-xs font-medium ${message.type === 'error' ? 'bg-rose-50 text-rose-900 border border-rose-200' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'}`}>
              {message.text}
            </div>
          )}

          {isCreator ? (
            <button
              onClick={handleStartLeague}
              disabled={submitting}
              className="w-full bg-[var(--primary)] hover:bg-[var(--primary-deep)] text-[var(--on-primary)] text-xs font-bold uppercase tracking-wider py-3.5 rounded-2xl transition shadow-md disabled:opacity-50"
            >
              {submitting ? 'Lancement...' : `Lancer la ligue (${leagueMembers.length} participants) 🍪`}
            </button>
          ) : (
            <div className="text-center p-3.5 bg-[var(--plate)] text-xs font-medium text-[var(--soft)] rounded-2xl border border-[var(--border)]">
              En attente que le créateur lance les hostilités de la première fournée.
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(var(--dot)_1px,transparent_1px)] [background-size:18px_18px] p-4 sm:p-6 text-[var(--text)] font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <header className="bg-[var(--card)] backdrop-blur p-6 rounded-3xl border border-[var(--border)] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img 
              src={logo} 
              alt="Logo" 
              className="w-12 h-12 object-contain rounded-2xl shadow-xs border border-[var(--border)] shrink-0 bg-[var(--plate-2)]" 
            />
            <div>
              <button onClick={onBack} className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] hover:text-[var(--text)] transition mb-1 inline-flex items-center gap-1">
                <ArrowLeftIcon className="w-3.5 h-3.5" /> Retour au tableau de bord
              </button>
              <h1 className="text-2xl sm:text-3xl font-black text-[var(--ink)] tracking-tight">
                {league.name}
              </h1>
            </div>
          </div>

          {leagueGlobalAverage && (
            <div className="bg-[var(--primary)] text-[var(--on-primary)] p-4 rounded-2xl text-center min-w-[130px] shadow-sm border border-[var(--primary-deep)]">
              <div className="text-2xl font-black">{leagueGlobalAverage} <span className="text-sm font-normal text-[var(--border)]">/ 5</span></div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--on-primary)]">Note globale du bureau</div>
            </div>
          )}
        </header>

        {/* Cuisinier de la semaine */}
        <div className="bg-gradient-to-r from-[var(--plate-2)] via-[var(--plate)] to-[var(--plate-3)] border border-[var(--border)] text-[var(--text)] p-4 sm:p-5 rounded-3xl shadow-xs flex items-center gap-3 sm:gap-4">
          <div className="text-2xl sm:text-3xl bg-[var(--card)] p-2.5 sm:p-3 rounded-2xl shadow-2xs backdrop-blur-sm border border-[var(--border)] shrink-0">🍪</div>
          <div className="space-y-0.5 min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Cible de la semaine (ou Chef prodige)</div>
            <div className="text-sm sm:text-lg font-bold text-[var(--ink)] leading-snug">
              Semaine #{currentWeek} — C'est au tour de{' '}
              <span className="text-[var(--primary)] underline decoration-[var(--accent)] decoration-2 underline-offset-4">
                {bakeMaster?.profiles?.username || 'un collègue'}
              </span> de nous régaler ! (Pas de pression)
            </div>
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-2xl text-xs font-medium shadow-sm ${message.type === 'error' ? 'bg-rose-50 text-rose-900 border border-rose-200' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'}`}>
            {message.text}
          </div>
        )}

        <div className="grid md:grid-cols-12 gap-6">
          
          <div className="md:col-span-5 space-y-6">
            <div className="bg-[var(--card)] backdrop-blur p-6 rounded-3xl border border-[var(--border)] shadow-sm space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-[var(--ink)] flex items-center gap-1.5">
                  <StarIcon className="w-4 h-4 text-[var(--accent)]" /> Noter la fournée
                </h2>
                <select
                  value={selectedWeekToRate}
                  onChange={(e) => setSelectedWeekToRate(Number(e.target.value))}
                  className="bg-[var(--plate)] border border-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl px-3 py-2 outline-none shadow-inner cursor-pointer max-w-full"
                >
                  {fullSchedule
                    .filter(s => s.week_number <= currentWeek)
                    .map(s => (
                      <option key={s.week_number} value={s.week_number}>
                        Semaine #{s.week_number} {s.week_number === currentWeek ? '(Actuelle)' : ''}
                      </option>
                    ))
                  }
                </select>
              </div>

              {selectedWeekToRate > currentWeek ? (
                <div className="p-4 bg-[var(--plate)] border border-[var(--border)] rounded-2xl text-center space-y-1">
                  <p className="text-xs font-bold text-[var(--text)] flex items-center justify-center gap-1.5">
                    <ClockIcon className="w-4 h-4 text-[var(--accent)]" /> Un peu de patience !
                  </p>
                  <p className="text-xs text-[var(--soft)]">
                    Tu ne peux pas noter une semaine qui n'a pas encore commencé.
                  </p>
                </div>
              ) : isSelfRating() ? (
                <div className="p-4 bg-[var(--plate)] border border-[var(--border)] rounded-2xl text-center space-y-1">
                  <p className="text-xs font-bold text-[var(--text)] flex items-center justify-center gap-1.5">
                    <XCircleIcon className="w-4 h-4 text-[var(--accent)]" /> Auto-jugement interdit
                  </p>
                  <p className="text-xs text-[var(--soft)]">
                    C'était ton tour en Semaine #{selectedWeekToRate}. Laisse tes collègues juger ton chef-d'œuvre.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitRating} className="space-y-4">
                  {CRITERIA.map((criterion) => (
                    <div key={criterion.id} className="space-y-1.5 bg-[var(--plate)]/60 p-3.5 rounded-2xl border border-[var(--border)]/60 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-bold text-[var(--text)]">
                        <span>{criterion.label}</span>
                        <span className="font-mono text-[var(--primary)] bg-[var(--card)] px-2.5 py-0.5 rounded-lg text-[11px] border border-[var(--border)]">{scores[criterion.id]} / 5</span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setScores({ ...scores, [criterion.id]: star })}
                            className={`text-xl transition-transform hover:scale-125 ${star <= scores[criterion.id] ? 'opacity-100 drop-shadow-xs' : 'opacity-25 grayscale'}`}
                          >
                            🍪
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="bg-[var(--primary)] text-[var(--on-primary)] p-4 rounded-2xl text-center flex items-center justify-between px-4 shadow-sm border border-[var(--primary-deep)]">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--on-primary)]">Note du jury (Toi)</span>
                    <span className="text-xl font-black">{calculateAverage(scores)} <span className="text-xs text-[#D9BFA8] font-normal">/ 5</span></span>
                  </div>

                  <textarea
                    rows={3}
                    placeholder="Un petit mot doux pour décrire ton expérience..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--plate)]/40 border border-[var(--border)] rounded-2xl text-[var(--text)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--muted)] placeholder:text-[var(--faint)] shadow-inner"
                  />

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-[var(--primary)] hover:bg-[var(--primary-deep)] text-[var(--on-primary)] text-xs font-bold uppercase tracking-wider py-3.5 rounded-2xl transition shadow-md"
                  >
                    {submitting ? 'Enregistrement...' : <span className="inline-flex items-center gap-1.5"><PaperAirplaneIcon className="w-4 h-4" /> Envoyer les notes</span>}
                  </button>
                </form>
              )}
            </div>

            {/* Calendrier */}
            <div className="bg-[var(--card)] backdrop-blur p-6 rounded-3xl border border-[var(--border)] shadow-sm space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--ink)] flex items-center gap-1.5">
                <CalendarDaysIcon className="w-4 h-4 text-[var(--accent)]" /> Les prochains cuistots ({fullSchedule.length} sem.)
              </h3>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {fullSchedule.length === 0 ? (
                  <p className="text-xs text-[var(--faint)] italic text-center py-2">Le planning est vide pour l'instant.</p>
                ) : (
                  fullSchedule.map((sched) => {
                    const isCurrent = sched.week_number === currentWeek
                    return (
                      <div key={sched.id} className={`px-4 py-2.5 rounded-2xl border text-xs flex items-center justify-between transition ${isCurrent ? 'bg-[var(--plate-3)] border-[var(--border-strong)] font-bold text-[var(--ink)] shadow-2xs' : 'bg-[var(--plate)]/30 border-[var(--border)]/60 text-[var(--soft)]'}`}>
                        <span className="flex items-center gap-1.5">Semaine #{sched.week_number} {isCurrent && <><FireIcon className="w-3.5 h-3.5 text-[var(--accent)]" /> C'est le moment !</>}</span>
                        <span className="font-semibold">{sched.profiles?.username || 'Collègue'}</span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          <div className="md:col-span-7 space-y-6">
            
            {/* Classement */}
            <div className="bg-[var(--card)] backdrop-blur p-6 rounded-3xl border border-[var(--border)] shadow-sm space-y-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-[var(--ink)] flex items-center gap-1.5">
                <TrophyIcon className="w-4 h-4 text-[var(--accent)]" /> Classement de l'openspace
              </h2>
              {leaderboard.length === 0 ? (
                <p className="text-xs text-[var(--faint)] italic py-6 text-center">Aucune note validée pour l'instant. Personne n'a encore pris de risque en cuisine !</p>
              ) : (
                <div className="space-y-3.5">
                  {leaderboard.map((entry, idx) => {
                    const podium = idx < 3
                    return (
                      <div key={entry.username} className={`p-4 border rounded-2xl space-y-3 shadow-2xs ${podium ? 'bg-gradient-to-b from-[var(--plate-3)] to-[var(--plate-2)]' : 'bg-[var(--plate)]/40'} ${idx === 0 ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/40' : 'border-[var(--border)]'}`}>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2.5 text-[var(--text)] text-xs font-bold">
                            <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono text-xs shadow-2xs ${idx === 0 ? 'bg-gradient-to-br from-[var(--accent)] to-[var(--primary)] text-[var(--on-primary)] font-black' : idx === 1 ? 'bg-[var(--accent)] text-[var(--ink)] font-bold' : idx === 2 ? 'bg-[var(--accent-bright)] text-[var(--ink)] font-bold' : 'bg-[var(--plate-3)] text-[var(--primary)]'}`}>
                              {idx === 0 ? <TrophyIcon className="w-4 h-4" /> : idx + 1}
                            </span>
                            <div>
                              <div className="text-sm font-black text-[var(--ink)] flex items-center gap-2 flex-wrap">
                                {entry.username}
                                {entry.wins > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-black bg-gradient-to-br from-[var(--accent)] to-[var(--primary)] text-[var(--on-primary)] px-2 py-0.5 rounded-full shadow-xs">
                                    <TrophyIcon className="w-3 h-3" /> {entry.wins > 1 ? `${entry.wins} cookie d'or` : 'Cookie d\'or'}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-bold">
                                {idx === 0 ? 'Maître pâtissier' : idx === 1 ? 'Premier dauphin' : idx === 2 ? 'Troisième cuistot' : 'Compétiteur'} · {entry.weeks} sem.
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="bg-[var(--primary)] text-[var(--on-primary)] px-3 py-1 rounded-xl text-xs font-black shadow-2xs border border-[var(--primary-deep)]">
                              {entry.avgGlobal} / 5
                            </div>
                            <div className="text-[10px] font-black text-[var(--muted)] mt-1.5">{entry.total} pts cumulés</div>
                          </div>
                        </div>

                        {/* Détail par critères */}
                        <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-[var(--border)]/60 text-center">
                          {CRITERIA.map(crit => (
                            <div key={crit.id} className="bg-[var(--card)] p-2 rounded-xl border border-[var(--border)] shadow-2xs">
                              <div className="text-[10px] font-bold text-[var(--muted)] uppercase">{crit.label}</div>
                              <div className="text-[11px] font-mono font-black text-[var(--primary)] mt-0.5">
                                {entry[crit.id]}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Historique */}
            <div className="bg-[var(--card)] backdrop-blur p-6 rounded-3xl border border-[var(--border)] shadow-sm space-y-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-[var(--ink)] flex items-center gap-1.5">
                <DocumentTextIcon className="w-4 h-4 text-[var(--accent)]" /> Les archives de la machine à café (Historique)
              </h2>
              {filteredRatings.length === 0 ? (
                <p className="text-xs text-[var(--faint)] italic py-6 text-center">Rien à signaler pour les semaines passées.</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {filteredRatings.map((item) => (
                    <div key={item.id} className="p-4 border border-[var(--border)] rounded-2xl bg-[var(--plate)]/30 space-y-2 shadow-2xs">
                      <div className="flex justify-between items-center text-xs text-[var(--text)]">
                        <span className="font-bold">
                          {item.profiles?.username} <span className="font-normal text-[var(--muted)]">(Semaine #{item.week_number || currentWeek})</span>
                        </span>
                        <span className="bg-[var(--plate-3)] text-[var(--primary)] px-2.5 py-1 rounded-xl border border-[var(--border)] font-black shadow-2xs">
                          {item.score} / 5
                        </span>
                      </div>
                      {item.comment && <p className="text-xs text-[var(--soft)] italic bg-[var(--card)] p-3 rounded-xl border border-[var(--border)] shadow-inner">"{item.comment}"</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      </div>
    </div>
  )
}