import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  EyeOff,
  Heart,
  Lightbulb,
  MessageCircleMore,
  MessageSquareText,
  Send,
  Shield,
  Trash2,
} from 'lucide-react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type Suggestion = {
  id: string
  text: string
  likes: number
  created_at: string
  is_anonymous?: boolean
  author_name?: string | null
  hidden?: boolean
}

type SuggestionReply = {
  id: string
  suggestion_id: string
  text: string
  author_name?: string | null
  created_at: string
}

const LOGO_URL = '/logo.png'
const DEMO_STORAGE_KEY = 'office-suggestion-box-demo-data'
const REPLIES_STORAGE_KEY = 'office-suggestion-box-demo-replies'
const LIKED_STORAGE_KEY = 'office-suggestion-box-liked-ids'
const ADMIN_PIN = 'officeadmin'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const isDemoMode = !SUPABASE_URL || !SUPABASE_ANON_KEY

const seededDemoSuggestions: Suggestion[] = [
  {
    id: 'demo-1',
    text: 'Add a quiet focus area for deep work and calls.',
    likes: 7,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    is_anonymous: true,
    hidden: false,
  },
  {
    id: 'demo-2',
    text: 'Stock the kitchen with more protein snacks and sparkling water.',
    likes: 12,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    is_anonymous: false,
    author_name: 'Alex',
    hidden: false,
  },
  {
    id: 'demo-3',
    text: 'Create one shared board for office fixes, requests, and ideas.',
    likes: 4,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    is_anonymous: true,
    hidden: false,
  },
]

const seededDemoReplies: SuggestionReply[] = [
  {
    id: 'reply-1',
    suggestion_id: 'demo-2',
    text: 'Agree. More protein snacks would be great.',
    author_name: 'Mia',
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: 'reply-2',
    suggestion_id: 'demo-1',
    text: 'A quiet zone would help a lot during meetings and writing.',
    author_name: 'Anonymous',
    created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
  },
]

function readDemoData(): Suggestion[] {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(seededDemoSuggestions))
      return seededDemoSuggestions
    }
    return JSON.parse(raw) as Suggestion[]
  } catch {
    return seededDemoSuggestions
  }
}

function writeDemoData(data: Suggestion[]) {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data))
}

function readDemoReplies(): SuggestionReply[] {
  try {
    const raw = localStorage.getItem(REPLIES_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(REPLIES_STORAGE_KEY, JSON.stringify(seededDemoReplies))
      return seededDemoReplies
    }
    return JSON.parse(raw) as SuggestionReply[]
  } catch {
    return seededDemoReplies
  }
}

function writeDemoReplies(data: SuggestionReply[]) {
  localStorage.setItem(REPLIES_STORAGE_KEY, JSON.stringify(data))
}

function readLikedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LIKED_STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function writeLikedIds(ids: string[]) {
  localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify(ids))
}

function timeAgo(dateString: string) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  const intervals = [
    [31536000, 'year'],
    [2592000, 'month'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ] as const

  for (const [secs, label] of intervals) {
    const value = Math.floor(seconds / secs)
    if (value >= 1) return `${value} ${label}${value > 1 ? 's' : ''} ago`
  }
  return 'just now'
}

const supabase: SupabaseClient | null = isDemoMode ? null : createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export default function App() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [replies, setReplies] = useState<SuggestionReply[]>([])
  const [draft, setDraft] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [search, setSearch] = useState('')
  const [likedIds, setLikedIds] = useState<string[]>([])
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replyNames, setReplyNames] = useState<Record<string, string>>({})
  const [expandedReplyBoxes, setExpandedReplyBoxes] = useState<Record<string, boolean>>({})
  const [sortMode, setSortMode] = useState<'top' | 'newest'>('top')
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminPinInput, setAdminPinInput] = useState('')
  const [adminEnabled, setAdminEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)

  const filteredSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase()
    const visible = suggestions.filter((item) => !item.hidden)
    const sorted = [...visible].sort((a, b) => {
      if (sortMode === 'top') {
        if (b.likes !== a.likes) return b.likes - a.likes
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    if (!q) return sorted
    return sorted.filter((item) => {
      const author = item.author_name?.toLowerCase() || ''
      return item.text.toLowerCase().includes(q) || author.includes(q)
    })
  }, [search, suggestions, sortMode])

  const replyCountBySuggestion = useMemo(() => {
    const map: Record<string, number> = {}
    for (const reply of replies) map[reply.suggestion_id] = (map[reply.suggestion_id] || 0) + 1
    return map
  }, [replies])

  function getRepliesForSuggestion(suggestionId: string) {
    return replies
      .filter((reply) => reply.suggestion_id === suggestionId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  async function loadSuggestions(showSpinner = true) {
    if (showSpinner) setLoading(true)
    setError(null)

    try {
      if (isDemoMode) {
        setSuggestions(readDemoData())
        setReplies(readDemoReplies())
      } else if (supabase) {
        const [{ data: suggestionData, error: suggestionError }, { data: replyData, error: replyError }] = await Promise.all([
          supabase.from('suggestions').select('id, text, likes, created_at, is_anonymous, author_name, hidden').order('created_at', { ascending: false }),
          supabase.from('replies').select('id, suggestion_id, text, author_name, created_at').order('created_at', { ascending: true }),
        ])

        if (suggestionError) throw suggestionError
        if (replyError) throw replyError

        setSuggestions((suggestionData || []) as Suggestion[])
        setReplies((replyData || []) as SuggestionReply[])
      }
      setLastUpdatedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load suggestions.')
    } finally {
      if (showSpinner) setLoading(false)
    }
  }

  useEffect(() => {
    setLikedIds(readLikedIds())
    void loadSuggestions()
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => void loadSuggestions(false), 5000)
    const onFocus = () => void loadSuggestions(false)
    const onStorage = (event: StorageEvent) => {
      if ([DEMO_STORAGE_KEY, REPLIES_STORAGE_KEY].includes(event.key || '')) void loadSuggestions(false)
    }

    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  async function handleSubmit() {
    const text = draft.trim()
    if (text.length < 3) {
      setError('Please enter at least 3 characters.')
      return
    }

    setSubmitting(true)
    setError(null)

    const newSuggestion: Suggestion = {
      id: crypto.randomUUID(),
      text,
      likes: 0,
      created_at: new Date().toISOString(),
      is_anonymous: isAnonymous,
      author_name: isAnonymous ? '' : authorName.trim(),
      hidden: false,
    }

    try {
      if (isDemoMode) {
        const updated = [newSuggestion, ...readDemoData()]
        writeDemoData(updated)
        setSuggestions(updated)
      } else if (supabase) {
        const { data, error: insertError } = await supabase
          .from('suggestions')
          .insert({
            text,
            likes: 0,
            is_anonymous: isAnonymous,
            author_name: isAnonymous ? null : authorName.trim() || null,
            hidden: false,
          })
          .select('id, text, likes, created_at, is_anonymous, author_name, hidden')
          .single()

        if (insertError) throw insertError
        setSuggestions((prev) => [data as Suggestion, ...prev])
      }

      setDraft('')
      setAuthorName('')
      setIsAnonymous(true)
      setLastUpdatedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit suggestion.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLike(item: Suggestion) {
    const alreadyLiked = likedIds.includes(item.id)
    const nextLikedIds = alreadyLiked ? likedIds.filter((id) => id !== item.id) : [...likedIds, item.id]
    const delta = alreadyLiked ? -1 : 1

    setLikedIds(nextLikedIds)
    writeLikedIds(nextLikedIds)
    setSuggestions((prev) => prev.map((s) => (s.id === item.id ? { ...s, likes: Math.max(0, s.likes + delta) } : s)))

    try {
      if (isDemoMode) {
        const updated = readDemoData().map((s) => (s.id === item.id ? { ...s, likes: Math.max(0, s.likes + delta) } : s))
        writeDemoData(updated)
      } else if (supabase) {
        const current = suggestions.find((s) => s.id === item.id)
        const nextLikes = Math.max(0, (current?.likes ?? item.likes) + delta)
        const { error: updateError } = await supabase.from('suggestions').update({ likes: nextLikes }).eq('id', item.id)
        if (updateError) throw updateError
      }
    } catch (e) {
      setLikedIds(likedIds)
      writeLikedIds(likedIds)
      setSuggestions((prev) => prev.map((s) => (s.id === item.id ? { ...s, likes: Math.max(0, s.likes - delta) } : s)))
      setError(e instanceof Error ? e.message : 'Failed to update like.')
    }
  }

  async function handleReplySubmit(suggestionId: string) {
    const text = (replyDrafts[suggestionId] || '').trim()
    const replyAuthor = (replyNames[suggestionId] || '').trim() || 'Anonymous'
    if (text.length < 2) {
      setError('Please enter a reply with at least 2 characters.')
      return
    }

    const newReply: SuggestionReply = {
      id: crypto.randomUUID(),
      suggestion_id: suggestionId,
      text,
      author_name: replyAuthor,
      created_at: new Date().toISOString(),
    }

    try {
      if (isDemoMode) {
        const updated = [...readDemoReplies(), newReply]
        writeDemoReplies(updated)
        setReplies(updated)
      } else if (supabase) {
        const { data, error: insertError } = await supabase
          .from('replies')
          .insert({ suggestion_id: suggestionId, text, author_name: replyAuthor })
          .select('id, suggestion_id, text, author_name, created_at')
          .single()

        if (insertError) throw insertError
        setReplies((prev) => [...prev, data as SuggestionReply])
      }

      setReplyDrafts((prev) => ({ ...prev, [suggestionId]: '' }))
      setReplyNames((prev) => ({ ...prev, [suggestionId]: '' }))
      setExpandedReplyBoxes((prev) => ({ ...prev, [suggestionId]: true }))
      setLastUpdatedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post reply.')
    }
  }

  async function handleHideSuggestion(item: Suggestion) {
    try {
      if (isDemoMode) {
        const updated = readDemoData().map((s) => (s.id === item.id ? { ...s, hidden: true } : s))
        writeDemoData(updated)
        setSuggestions(updated)
      } else if (supabase) {
        const { error: updateError } = await supabase.from('suggestions').update({ hidden: true }).eq('id', item.id)
        if (updateError) throw updateError
        setSuggestions((prev) => prev.map((s) => (s.id === item.id ? { ...s, hidden: true } : s)))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to hide suggestion.')
    }
  }

  async function handleDeleteSuggestion(item: Suggestion) {
    try {
      if (isDemoMode) {
        const nextSuggestions = readDemoData().filter((s) => s.id !== item.id)
        const nextReplies = readDemoReplies().filter((r) => r.suggestion_id !== item.id)
        writeDemoData(nextSuggestions)
        writeDemoReplies(nextReplies)
        setSuggestions(nextSuggestions)
        setReplies(nextReplies)
      } else if (supabase) {
        await supabase.from('replies').delete().eq('suggestion_id', item.id)
        const { error: deleteError } = await supabase.from('suggestions').delete().eq('id', item.id)
        if (deleteError) throw deleteError
        setSuggestions((prev) => prev.filter((s) => s.id !== item.id))
        setReplies((prev) => prev.filter((r) => r.suggestion_id !== item.id))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete suggestion.')
    }
  }

  function unlockAdmin() {
    if (adminPinInput.trim() === ADMIN_PIN) {
      setAdminEnabled(true)
      setAdminOpen(false)
      setAdminPinInput('')
      return
    }
    setError('Wrong admin PIN.')
  }

  return (
    <div className="page-shell">
      <div className="page-inner">
        <div className="hero-card">
          <div className="hero-left">
            <div className="logo-wrap">
              <img src={LOGO_URL} alt="Office Suggestion Box logo" className="logo-image" />
            </div>
            <div>
              <div className="badge-row">
                <span className="pill">Anonymous or named</span>
                <span className="pill pill-secondary">Community visible</span>
                <span className={`pill ${isDemoMode ? 'pill-warn' : 'pill-live'}`}>{isDemoMode ? 'Demo mode' : 'Live shared mode'}</span>
                <span className="pill pill-outline">Auto refresh every 5s</span>
              </div>
              <h1>Office Suggestion Box</h1>
              <p>Share ideas anonymously or with your name, reply to suggestions, and support the best ones with likes.</p>
            </div>
          </div>
          <button className={`button ${adminEnabled ? 'button-primary' : 'button-secondary'}`} onClick={() => setAdminOpen((prev) => !prev)}>
            <Shield size={16} />
            {adminEnabled ? 'Admin enabled' : 'Admin mode'}
          </button>
        </div>

        {adminOpen && !adminEnabled && (
          <div className="panel">
            <div className="panel-title"><Shield size={16} /> Enter admin PIN to moderate</div>
            <div className="row responsive-row">
              <input type="password" placeholder="Enter admin PIN" value={adminPinInput} onChange={(e) => setAdminPinInput(e.target.value)} className="input" />
              <button className="button button-primary" onClick={unlockAdmin}>Unlock</button>
            </div>
            <div className="hint">Default demo PIN: officeadmin</div>
          </div>
        )}

        {isDemoMode && (
          <div className="warning-box">
            <AlertCircle size={18} />
            <div>This preview is running in browser-only demo mode. To make everything shared for all visitors, connect Supabase and deploy it.</div>
          </div>
        )}

        <div className="main-grid">
          <div className="card">
            <div className="card-header"><Lightbulb size={18} /> Add a new suggestion</div>
            <div className="field-group">
              <label>Your suggestion</label>
              <textarea className="textarea" placeholder="Write your idea here..." value={draft} onChange={(e) => setDraft(e.target.value)} />
            </div>

            <div className="sub-card">
              <div className="row between">
                <div>
                  <div className="sub-title">Post anonymously</div>
                  <div className="hint">Turn this off if you want your name shown with the suggestion.</div>
                </div>
                <button className={`toggle ${isAnonymous ? 'toggle-on' : ''}`} onClick={() => setIsAnonymous((prev) => !prev)}>
                  <span className="toggle-knob" />
                </button>
              </div>

              {!isAnonymous && (
                <div className="field-group compact-gap">
                  <label>Your name</label>
                  <input className="input" placeholder="Enter your name" value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
                </div>
              )}

              <div className="row between hint">
                <span>{isAnonymous ? 'Anonymous submission' : 'Named submission'}</span>
                <span>{draft.trim().length} characters</span>
              </div>
            </div>

            <button className="button button-primary full-width" onClick={() => void handleSubmit()} disabled={submitting || draft.trim().length < 3 || (!isAnonymous && authorName.trim().length < 2)}>
              <Send size={16} />
              {submitting ? 'Submitting...' : 'Submit suggestion'}
            </button>

            <div className="divider" />
            <div className="sub-card muted-text">Suggestions can be posted anonymously or with a name. Everyone can see the existing ideas, reply to them, and like the ones they support.</div>
          </div>

          <div className="card">
            <div className="row responsive-stack between gap16">
              <div className="card-header no-margin"><MessageSquareText size={18} /> Suggestions so far</div>
              <div className="meta-text">{filteredSuggestions.length} visible</div>
            </div>

            <div className="toolbar-grid">
              <input className="input" placeholder="Search suggestions..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <button className={`button ${sortMode === 'top' ? 'button-primary' : 'button-secondary'}`} onClick={() => setSortMode('top')}>Top liked</button>
              <button className={`button ${sortMode === 'newest' ? 'button-primary' : 'button-secondary'}`} onClick={() => setSortMode('newest')}>Newest</button>
            </div>

            <div className="hint">{lastUpdatedAt ? `Last synced ${timeAgo(lastUpdatedAt.toISOString())}` : 'Syncing...'}</div>

            {error && <div className="error-box">{error}</div>}

            {loading ? (
              <div className="loading-list">
                {[1, 2, 3].map((n) => <div key={n} className="skeleton-card" />)}
              </div>
            ) : filteredSuggestions.length === 0 ? (
              <div className="empty-box">No suggestions yet. Be the first one to add one.</div>
            ) : (
              <div className="suggestion-list">
                {filteredSuggestions.map((item) => {
                  const liked = likedIds.includes(item.id)
                  const itemReplies = getRepliesForSuggestion(item.id)
                  const replyBoxOpen = expandedReplyBoxes[item.id] || false

                  return (
                    <div key={item.id} className="suggestion-card">
                      <div className="row between align-start gap16 wrap-on-mobile">
                        <div className="grow">
                          <p className="suggestion-text">{item.text}</p>
                          <div className="meta-row">
                            <span className="pill pill-outline">{item.is_anonymous === false && item.author_name?.trim() ? item.author_name.trim() : 'Anonymous'}</span>
                            <span>•</span>
                            <span>{timeAgo(item.created_at)}</span>
                            <span>•</span>
                            <span>{replyCountBySuggestion[item.id] || 0} replies</span>
                          </div>
                        </div>

                        <div className="row wrap-row gap8">
                          {adminEnabled && (
                            <>
                              <button className="button button-secondary" onClick={() => void handleHideSuggestion(item)}><EyeOff size={16} /> Hide</button>
                              <button className="button button-secondary" onClick={() => void handleDeleteSuggestion(item)}><Trash2 size={16} /> Delete</button>
                            </>
                          )}
                          <button className={`button ${liked ? 'button-primary' : 'button-secondary'}`} onClick={() => void handleLike(item)}>
                            <Heart size={16} className={liked ? 'filled-heart' : ''} /> {item.likes}
                          </button>
                        </div>
                      </div>

                      <div className="reply-area">
                        <div className="row between gap16">
                          <div className="row gap8 section-title"><MessageCircleMore size={16} /> Replies</div>
                          <button className="button button-secondary" onClick={() => setExpandedReplyBoxes((prev) => ({ ...prev, [item.id]: !replyBoxOpen }))}>
                            {replyBoxOpen ? 'Hide reply form' : 'Reply'}
                          </button>
                        </div>

                        {itemReplies.length === 0 ? <div className="hint">No replies yet.</div> : (
                          <div className="reply-list">
                            {itemReplies.map((reply) => (
                              <div key={reply.id} className="reply-card">
                                <div>{reply.text}</div>
                                <div className="hint small-gap-top">{reply.author_name || 'Anonymous'} • {timeAgo(reply.created_at)}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {replyBoxOpen && (
                          <div className="reply-form">
                            <input className="input" placeholder="Your name for this reply (optional)" value={replyNames[item.id] || ''} onChange={(e) => setReplyNames((prev) => ({ ...prev, [item.id]: e.target.value }))} />
                            <textarea className="textarea small-textarea" placeholder="Write a reply..." value={replyDrafts[item.id] || ''} onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))} />
                            <div className="row end"><button className="button button-primary" onClick={() => void handleReplySubmit(item.id)}><Send size={16} /> Post reply</button></div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
