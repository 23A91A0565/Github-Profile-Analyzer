import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, parseISO, subDays } from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'

const githubToken = import.meta.env.VITE_GITHUB_TOKEN?.trim()

const api = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Accept: 'application/vnd.github+json',
    ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
  },
})

const chartPalette = ['#2563eb', '#c026d3', '#0ea5e9', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1']
const CACHE_TTL_MS = 1000 * 60 * 15

function cleanUsername(value) {
  return value.trim().replace(/^@/, '')
}

function compact(value) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0)
}

function fullDate(value) {
  if (!value) return 'N/A'
  return format(parseISO(value), 'MMM d, yyyy')
}

function shortRepo(name) {
  if (!name) return 'n/a'
  return name.length > 18 ? `${name.slice(0, 15)}...` : name
}

function safePercentage(value, total) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

function getSingleCacheKey(username) {
  return `ghpa:single:${cleanUsername(username).toLowerCase()}`
}

function getCompareCacheKey(usernameA, usernameB) {
  return `ghpa:compare:${cleanUsername(usernameA).toLowerCase()}::${cleanUsername(usernameB).toLowerCase()}`
}

function readCache(cacheKey) {
  try {
    const raw = localStorage.getItem(cacheKey)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed?.savedAt || !parsed?.data) return null

    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey)
      return null
    }

    return parsed.data
  } catch {
    return null
  }
}

function writeCache(cacheKey, data) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data }))
  } catch {
    // Ignore cache quota issues.
  }
}

function toErrorMessage(error) {
  if (error.message === 'Please provide a GitHub username.') return error.message
  if (error.response?.status === 404) return 'User not found. Check the GitHub username and try again.'
  if (error.response?.status === 403) return 'GitHub API rate limit reached. Add token mode or wait and retry.'
  return 'Unable to fetch profile data right now.'
}

function hasNextPage(linkHeader) {
  if (!linkHeader) return false
  return linkHeader.includes('rel="next"')
}

async function fetchPaginated(path, { params = {}, perPage = 100, maxPages = 10 } = {}) {
  let page = 1
  let items = []

  while (page <= maxPages) {
    const response = await api.get(path, {
      params: {
        ...params,
        page,
        per_page: perPage,
      },
    })

    items = items.concat(response.data)

    if (response.data.length < perPage || !hasNextPage(response.headers?.link)) {
      break
    }

    page += 1
  }

  return items
}

function createTimelineMap(events) {
  const map = {}

  events.forEach((event) => {
    const day = format(parseISO(event.created_at), 'yyyy-MM-dd')
    map[day] = (map[day] || 0) + 1
  })

  return map
}

function timelineFromMap(dayMap, days = 21) {
  return Array.from({ length: days }, (_, index) => {
    const date = subDays(new Date(), days - index - 1)
    const key = format(date, 'yyyy-MM-dd')

    return {
      day: format(date, 'MMM d'),
      events: dayMap[key] || 0,
    }
  })
}

function detectSkills(repos, languageDistribution) {
  const textBlob = repos
    .map((repo) => `${repo.name} ${repo.description || ''}`.toLowerCase())
    .join(' ')

  const languageSet = new Set(languageDistribution.map((item) => item.name))

  const frontend = []
  const backend = []
  const dataScience = []

  if (languageSet.has('JavaScript')) frontend.push('JavaScript')
  if (languageSet.has('TypeScript')) frontend.push('TypeScript')
  if (languageSet.has('CSS')) frontend.push('CSS')
  if (/react|next/.test(textBlob)) frontend.push('React')

  if (languageSet.has('Java')) backend.push('Java')
  if (languageSet.has('C#')) backend.push('C#')
  if (languageSet.has('Go')) backend.push('Go')
  if (languageSet.has('Python')) backend.push('Python')
  if (/node|express|nestjs|spring|django|flask|fastapi|asp\.net/.test(textBlob)) {
    backend.push('Node.js / Server Frameworks')
  }

  if (languageSet.has('Python')) dataScience.push('Python')
  if (/pandas|numpy|tensorflow|pytorch|ml|machine learning|data/.test(textBlob)) {
    dataScience.push('Machine Learning / Data Analysis')
  }

  return {
    frontend: [...new Set(frontend)],
    backend: [...new Set(backend)],
    dataScience: [...new Set(dataScience)],
  }
}

function analyzeRepos(repos, events) {
  const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0)
  const mostStarred = repos.reduce((best, repo) => (!best || repo.stargazers_count > best.stargazers_count ? repo : best), null)
  const mostForked = repos.reduce((best, repo) => (!best || repo.forks_count > best.forks_count ? repo : best), null)
  const oldestRepo = repos.reduce((oldest, repo) => (!oldest || new Date(repo.created_at) < new Date(oldest.created_at) ? repo : oldest), null)
  const mostRecentRepo = repos.reduce((latest, repo) => (!latest || new Date(repo.updated_at) > new Date(latest.updated_at) ? repo : latest), null)

  const topByStars = [...repos]
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 8)
    .map((repo) => ({ name: shortRepo(repo.name), stars: repo.stargazers_count }))

  const recentlyUpdated = [...repos]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 10)
    .map((repo) => ({
      name: shortRepo(repo.name),
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      issues: repo.open_issues_count,
    }))

  const yearlyMap = repos.reduce((acc, repo) => {
    const year = format(parseISO(repo.created_at), 'yyyy')
    acc[year] = (acc[year] || 0) + 1
    return acc
  }, {})

  const repoTimeline = Object.entries(yearlyMap)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([year, count]) => ({ year, repos: count }))

  const languageMap = repos.reduce((acc, repo) => {
    const language = repo.language || 'Other'
    acc[language] = (acc[language] || 0) + 1
    return acc
  }, {})

  const totalLanguageRepos = Object.values(languageMap).reduce((a, b) => a + b, 0)

  const languageDistribution = Object.entries(languageMap)
    .map(([name, count]) => ({
      name,
      value: count,
      percent: safePercentage(count, totalLanguageRepos),
    }))
    .sort((a, b) => b.value - a.value)

  const eventRepoActivity = events.reduce((acc, event) => {
    const repoName = event.repo?.name?.split('/')?.[1]
    if (!repoName) return acc
    acc[repoName] = (acc[repoName] || 0) + 1
    return acc
  }, {})

  const topActivityRepo = Object.entries(eventRepoActivity)
    .sort((a, b) => b[1] - a[1])
    .map(([name, eventsCount]) => ({ name, eventsCount }))[0]

  return {
    totalRepos: repos.length,
    totalStars,
    mostStarred,
    mostForked,
    oldestRepo,
    mostRecentRepo,
    topByStars,
    recentlyUpdated,
    repoTimeline,
    languageDistribution,
    topActivityRepo,
  }
}

function analyzeActivity(events) {
  let commits = 0
  let pullRequests = 0
  let issues = 0

  events.forEach((event) => {
    if (event.type === 'PushEvent') commits += event.payload?.commits?.length || 0
    if (event.type === 'PullRequestEvent') pullRequests += 1
    if (event.type === 'IssuesEvent') issues += 1
  })

  return {
    commits,
    pullRequests,
    issues,
    totalEvents: events.length,
    timeline: timelineFromMap(createTimelineMap(events), 21),
  }
}

function analyzeFollowers(followerDetails) {
  const topFollowers = [...followerDetails]
    .sort((a, b) => b.followers - a.followers)
    .slice(0, 5)
    .map((user) => ({
      login: user.login,
      followers: user.followers,
      location: user.location || 'Unknown',
      html_url: user.html_url,
    }))

  const locationMap = followerDetails.reduce((acc, follower) => {
    const location = follower.location || 'Unknown'
    acc[location] = (acc[location] || 0) + 1
    return acc
  }, {})

  const locations = Object.entries(locationMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  return { topFollowers, locations }
}

function githubScore(profile, repoStats, activityStats) {
  const followersPart = Math.min(30, (profile.followers / 200) * 30)
  const reposPart = Math.min(20, (profile.public_repos / 80) * 20)
  const starsPart = Math.min(30, (repoStats.totalStars / 600) * 30)
  const activityPart = Math.min(20, (activityStats.totalEvents / 120) * 20)
  return Math.round(followersPart + reposPart + starsPart + activityPart)
}

function buildRepoRecommendations(repos, events) {
  const activityMap = events.reduce((acc, event) => {
    const repoName = event.repo?.name?.split('/')?.[1]
    if (!repoName) return acc
    acc[repoName] = (acc[repoName] || 0) + 1
    return acc
  }, {})

  const ranked = repos
    .map((repo) => {
      const stars = repo.stargazers_count || 0
      const forks = repo.forks_count || 0
      const ratio = forks > 0 ? stars / forks : stars
      const hasDescription = Boolean(repo.description?.trim())
      const recentActivity = activityMap[repo.name] || 0

      let score = 0
      const reasons = []

      if (forks >= 5 && ratio < 0.9) {
        score += 3
        reasons.push('many forks but low stars/forks ratio')
      }
      if (!hasDescription) {
        score += 2
        reasons.push('missing repository description')
      }
      if (recentActivity <= 1) {
        score += 2
        reasons.push('low recent commit/event activity')
      }

      return { repo, score, reasons }
    })
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)

  if (ranked.length === 0) {
    return [
      {
        title: 'Your profile is in good shape',
        action: 'Keep shipping consistently and enhance READMEs with architecture snapshots or quick-start demos.',
      },
    ]
  }

  return ranked.slice(0, 3).map((item) => ({
    title: `Improve ${item.repo.name}`,
    action: `${item.repo.name} shows ${item.reasons.join(', ')}. Improve docs, examples, and maintenance cadence to increase popularity.`,
  }))
}

function buildResumeSummary(profile, repoStats, skills, activityStats) {
  const primaryLanguages = repoStats.languageDistribution.slice(0, 3).map((item) => item.name).join(', ')
  const frontend = skills.frontend.length ? skills.frontend.join(', ') : 'N/A'
  const backend = skills.backend.length ? skills.backend.join(', ') : 'N/A'
  const dataScience = skills.dataScience.length ? skills.dataScience.join(', ') : 'N/A'

  return `${profile.name || profile.login} is a developer specializing in ${primaryLanguages}. They have built ${repoStats.totalRepos} repositories with ${repoStats.totalStars} total stars and ${profile.followers} followers. Skill profile: Frontend (${frontend}), Backend (${backend}), Data Science (${dataScience}). Recent contribution activity includes ${activityStats.commits} commits, ${activityStats.pullRequests} pull requests, and ${activityStats.issues} issue events.`
}

function downloadResumeSummary(insights) {
  const content = `GitHub Resume Summary\n\nName: ${insights.profile.name || insights.profile.login}\nUsername: @${insights.profile.login}\nLocation: ${insights.profile.location || 'Unknown'}\nProfile: ${insights.profile.html_url}\n\nSummary:\n${insights.resumeSummary}\n\nTop Repository Insights:\n- Most popular repo: ${insights.repoStats.mostStarred?.name || 'N/A'} (${insights.repoStats.mostStarred?.stargazers_count || 0} stars)\n- Most forked repo: ${insights.repoStats.mostForked?.name || 'N/A'} (${insights.repoStats.mostForked?.forks_count || 0} forks)\n- Most recently updated: ${insights.repoStats.mostRecentRepo?.name || 'N/A'}\n- Oldest repo: ${insights.repoStats.oldestRepo?.name || 'N/A'}\n`

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${insights.profile.login}-resume-summary.txt`
  link.click()
  URL.revokeObjectURL(url)
}

async function fetchProfileBundle(username, includeFollowerDetails = true) {
  const user = cleanUsername(username)

  if (!user) {
    throw new Error('Please provide a GitHub username.')
  }

  const [profileRes, repos, events, followers] = await Promise.all([
    api.get(`/users/${user}`),
    fetchPaginated(`/users/${user}/repos`, { params: { sort: 'updated' }, perPage: 100, maxPages: 10 }),
    fetchPaginated(`/users/${user}/events`, { perPage: 100, maxPages: 3 }),
    fetchPaginated(`/users/${user}/followers`, { perPage: 100, maxPages: 4 }),
  ])

  let followerDetails = []

  if (includeFollowerDetails) {
    const sampleFollowers = followers.slice(0, 12)
    const details = await Promise.all(
      sampleFollowers.map(async (follower) => {
        try {
          const response = await api.get(`/users/${follower.login}`)
          return response.data
        } catch {
          return null
        }
      }),
    )

    followerDetails = details.filter(Boolean)
  }

  return {
    profile: profileRes.data,
    repos,
    events,
    followers,
    followerDetails,
  }
}

function buildInsights(bundle) {
  const repoStats = analyzeRepos(bundle.repos, bundle.events)
  const activityStats = analyzeActivity(bundle.events)
  const followersStats = analyzeFollowers(bundle.followerDetails)
  const score = githubScore(bundle.profile, repoStats, activityStats)
  const recommendations = buildRepoRecommendations(bundle.repos, bundle.events)
  const skills = detectSkills(bundle.repos, repoStats.languageDistribution)
  const resumeSummary = buildResumeSummary(bundle.profile, repoStats, skills, activityStats)

  return {
    ...bundle,
    repoStats,
    activityStats,
    followersStats,
    recommendations,
    skills,
    score,
    resumeSummary,
  }
}

function Section({ title, subtitle, children, delay = 0 }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="section-card"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-display text-xl font-bold text-ink dark:text-indigo-50 md:text-2xl">{title}</h2>
        {subtitle ? <p className="text-sm text-slate-600 dark:text-indigo-200">{subtitle}</p> : null}
      </div>
      {children}
    </motion.section>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white/85 p-3 dark:border-indigo-800 dark:bg-indigo-950/60">
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-indigo-300">{label}</p>
      <p className="number-accent mt-1 text-lg font-semibold text-ink dark:text-indigo-50 md:text-xl">{value}</p>
    </div>
  )
}

function App() {
  const [mode, setMode] = useState('analyze')
  const [username, setUsername] = useState('torvalds')
  const [compareA, setCompareA] = useState('gaearon')
  const [compareB, setCompareB] = useState('octocat')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [insights, setInsights] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [dataSourceLabel, setDataSourceLabel] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('ghpa:theme') || 'light')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('ghpa:theme', theme)
  }, [theme])

  const compareMetrics = useMemo(() => {
    if (!comparison) return []

    return [
      {
        metric: 'Followers',
        [comparison.a.profile.login]: comparison.a.profile.followers,
        [comparison.b.profile.login]: comparison.b.profile.followers,
      },
      {
        metric: 'Public Repos',
        [comparison.a.profile.login]: comparison.a.profile.public_repos,
        [comparison.b.profile.login]: comparison.b.profile.public_repos,
      },
      {
        metric: 'Total Stars',
        [comparison.a.profile.login]: comparison.a.repoStats.totalStars,
        [comparison.b.profile.login]: comparison.b.repoStats.totalStars,
      },
      {
        metric: 'Events',
        [comparison.a.profile.login]: comparison.a.activityStats.totalEvents,
        [comparison.b.profile.login]: comparison.b.activityStats.totalEvents,
      },
      {
        metric: 'GitHub Score',
        [comparison.a.profile.login]: comparison.a.score,
        [comparison.b.profile.login]: comparison.b.score,
      },
    ]
  }, [comparison])

  const compareLanguageRadar = useMemo(() => {
    if (!comparison) return []

    const combined = new Set([
      ...comparison.a.repoStats.languageDistribution.map((item) => item.name),
      ...comparison.b.repoStats.languageDistribution.map((item) => item.name),
    ])

    return [...combined].slice(0, 6).map((language) => {
      const first = comparison.a.repoStats.languageDistribution.find((item) => item.name === language)
      const second = comparison.b.repoStats.languageDistribution.find((item) => item.name === language)

      return {
        language,
        [comparison.a.profile.login]: first?.percent || 0,
        [comparison.b.profile.login]: second?.percent || 0,
      }
    })
  }, [comparison])

  const scoreComparison = useMemo(() => {
    if (!comparison) return null

    const scoreA = comparison.a.score
    const scoreB = comparison.b.score

    if (scoreA === scoreB) {
      return {
        winner: null,
        diff: 0,
        message: `Both developers are tied at ${scoreA}/100.`,
      }
    }

    const winner = scoreA > scoreB ? comparison.a.profile.login : comparison.b.profile.login
    const diff = Math.abs(scoreA - scoreB)

    return {
      winner,
      diff,
      message: `${winner} leads by ${diff} points in GitHub Score.`,
    }
  }, [comparison])

  const analyzeSingleProfile = async () => {
    try {
      setLoading(true)
      setError('')
      setComparison(null)

      const cacheKey = getSingleCacheKey(username)
      const cached = readCache(cacheKey)

      if (cached) {
        setInsights(cached)
        setDataSourceLabel('Loaded from cache (under 15 minutes old).')
        return
      }

      const bundle = await fetchProfileBundle(username, true)
      const computedInsights = buildInsights(bundle)
      setInsights(computedInsights)
      writeCache(cacheKey, computedInsights)
      setDataSourceLabel('Loaded from live GitHub API.')
    } catch (err) {
      setInsights(null)
      setDataSourceLabel('')
      setError(toErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const compareProfiles = async () => {
    try {
      setLoading(true)
      setError('')
      setInsights(null)

      const cacheKey = getCompareCacheKey(compareA, compareB)
      const cached = readCache(cacheKey)

      if (cached) {
        setComparison(cached)
        setDataSourceLabel('Comparison loaded from cache (under 15 minutes old).')
        return
      }

      const [first, second] = await Promise.all([
        fetchProfileBundle(compareA, false),
        fetchProfileBundle(compareB, false),
      ])

      const computedComparison = {
        a: buildInsights({ ...first, followerDetails: [] }),
        b: buildInsights({ ...second, followerDetails: [] }),
      }

      setComparison(computedComparison)
      writeCache(cacheKey, computedComparison)
      setDataSourceLabel('Comparison loaded from live GitHub API.')
    } catch (err) {
      setComparison(null)
      setDataSourceLabel('')
      setError(toErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-8 text-slate-900 dark:text-indigo-50 md:px-6 md:py-10">
      <div className="flex-1">
      <header className="mb-8 rounded-3xl border border-slate-200/70 bg-gradient-to-r from-blue-100 via-white to-fuchsia-100 p-5 shadow-sm dark:border-indigo-800 dark:from-indigo-950 dark:via-slate-950 dark:to-purple-950 md:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="rounded-full border border-blue-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:border-indigo-700 dark:bg-indigo-900 dark:text-blue-300">
            GitHub Profile Analyzer
          </p>
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs text-slate-600 dark:text-indigo-200">
              GitHub API {githubToken ? '(token mode)' : '(public mode)'}
            </p>
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-indigo-700 dark:bg-indigo-900 dark:text-indigo-100 dark:hover:bg-indigo-800"
            >
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
        </div>
        <h1 className="font-display text-3xl font-bold leading-tight text-ink dark:text-indigo-50 md:text-5xl">
          Professional GitHub Intelligence Dashboard
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-700 dark:text-indigo-200 md:text-base">
          Analyze profiles, detect developer skills, generate resume summaries, and compare growth with animated visualizations.
        </p>
      </header>

      <section className="section-card mb-8">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('analyze')}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === 'analyze'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-indigo-900 dark:text-indigo-100 dark:hover:bg-indigo-800'
            }`}
          >
            Analyze One User
          </button>
          <button
            type="button"
            onClick={() => setMode('compare')}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === 'compare'
                ? 'bg-fuchsia-700 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-indigo-900 dark:text-indigo-100 dark:hover:bg-indigo-800'
            }`}
          >
            Compare Two Users
          </button>
        </div>

        {mode === 'analyze' ? (
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g., torvalds"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm focus:border-blue-600 focus:outline-none dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-50"
            />
            <button
              type="button"
              onClick={analyzeSingleProfile}
              disabled={loading}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Analyzing...' : 'Analyze Profile'}
            </button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input
              type="text"
              value={compareA}
              onChange={(e) => setCompareA(e.target.value)}
              placeholder="User A"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm focus:border-fuchsia-600 focus:outline-none dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-50"
            />
            <input
              type="text"
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
              placeholder="User B"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm focus:border-fuchsia-600 focus:outline-none dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-50"
            />
            <button
              type="button"
              onClick={compareProfiles}
              disabled={loading}
              className="rounded-xl bg-fuchsia-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Comparing...' : 'Compare'}
            </button>
          </div>
        )}

        {error ? <p className="mt-3 text-sm font-medium text-rose-500">{error}</p> : null}
        {dataSourceLabel ? <p className="mt-2 text-xs font-medium text-slate-500 dark:text-indigo-300">{dataSourceLabel}</p> : null}
      </section>

      <AnimatePresence mode="wait">
        {insights ? (
          <motion.div key="insights" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <Section title="Profile Overview" subtitle={`@${insights.profile.login}`} delay={0.02}>
              <div className="grid gap-5 md:grid-cols-[220px_1fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center dark:border-indigo-800 dark:bg-indigo-950/75">
                  <img
                    src={insights.profile.avatar_url}
                    alt={`${insights.profile.login} avatar`}
                    className="mx-auto h-28 w-28 rounded-full border-4 border-blue-100 object-cover dark:border-indigo-800"
                  />
                  <h3 className="mt-3 font-display text-xl font-semibold">{insights.profile.name || insights.profile.login}</h3>
                  <p className="text-sm text-slate-600 dark:text-indigo-200">{insights.profile.bio || 'No bio available.'}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Metric label="Followers" value={compact(insights.profile.followers)} />
                  <Metric label="Following" value={compact(insights.profile.following)} />
                  <Metric label="Public Repositories" value={compact(insights.profile.public_repos)} />
                  <Metric label="Location" value={insights.profile.location || 'Unknown'} />
                  <Metric label="Account Created" value={fullDate(insights.profile.created_at)} />
                  <Metric label="GitHub Score" value={`${insights.score}/100`} />
                </div>
              </div>
            </Section>

            <Section title="Repository Statistics" subtitle="Most starred, forks, and total stars" delay={0.04}>
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Total Repositories" value={compact(insights.repoStats.totalRepos)} />
                <Metric label="Total Stars" value={compact(insights.repoStats.totalStars)} />
                <Metric
                  label="Most Starred Repo"
                  value={insights.repoStats.mostStarred ? `${insights.repoStats.mostStarred.name} (${compact(insights.repoStats.mostStarred.stargazers_count)})` : 'N/A'}
                />
                <Metric
                  label="Most Forked Repo"
                  value={insights.repoStats.mostForked ? `${insights.repoStats.mostForked.name} (${compact(insights.repoStats.mostForked.forks_count)})` : 'N/A'}
                />
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <BarChart data={insights.repoStats.topByStars}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" strokeOpacity={0.25} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="stars" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="Language Usage + Skill Detection" subtitle="Tech stack breakdown and inferred strengths" delay={0.06}>
              <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
                <div className="h-72 w-full">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={insights.repoStats.languageDistribution}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={110}
                        label={(entry) => `${entry.name} ${entry.percent}%`}
                      >
                        {insights.repoStats.languageDistribution.map((entry, index) => (
                          <Cell key={entry.name} fill={chartPalette[index % chartPalette.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  <Metric label="Frontend Skills" value={insights.skills.frontend.join(', ') || 'N/A'} />
                  <Metric label="Backend Skills" value={insights.skills.backend.join(', ') || 'N/A'} />
                  <Metric label="Data Skills" value={insights.skills.dataScience.join(', ') || 'N/A'} />
                </div>
              </div>
            </Section>

            <Section title="Repository Recommendation System" subtitle="Data-driven improvement suggestions" delay={0.08}>
              <div className="space-y-3">
                {insights.recommendations.map((item) => (
                  <div key={item.title} className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/30">
                    <p className="font-semibold text-violet-900 dark:text-violet-200">{item.title}</p>
                    <p className="mt-1 text-sm text-violet-800 dark:text-violet-300">{item.action}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="GitHub Resume Generator" subtitle="Auto-generated profile summary with download" delay={0.1}>
              <div className="space-y-4">
                <textarea
                  value={insights.resumeSummary}
                  readOnly
                  rows={5}
                  className="w-full rounded-xl border border-slate-300 bg-white p-4 text-sm leading-relaxed shadow-sm dark:border-indigo-800 dark:bg-indigo-950/65"
                />
                <button
                  type="button"
                  onClick={() => downloadResumeSummary(insights)}
                  className="rounded-xl bg-fuchsia-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-800"
                >
                  Download Resume Summary
                </button>
              </div>
            </Section>

            <Section title="Repository Timeline" subtitle="Repositories created per year" delay={0.12}>
              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <LineChart data={insights.repoStats.repoTimeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" strokeOpacity={0.25} />
                    <XAxis dataKey="year" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="repos" stroke="#c026d3" strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="Top Repository Insights" subtitle="Popularity, forks, activity, and longevity" delay={0.14}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label="Top by Stars"
                  value={insights.repoStats.mostStarred ? `${insights.repoStats.mostStarred.name} (${compact(insights.repoStats.mostStarred.stargazers_count)} stars)` : 'N/A'}
                />
                <Metric
                  label="Top by Forks"
                  value={insights.repoStats.mostForked ? `${insights.repoStats.mostForked.name} (${compact(insights.repoStats.mostForked.forks_count)} forks)` : 'N/A'}
                />
                <Metric
                  label="Most Active Repo"
                  value={insights.repoStats.topActivityRepo ? `${insights.repoStats.topActivityRepo.name} (${insights.repoStats.topActivityRepo.eventsCount} events)` : 'N/A'}
                />
                <Metric
                  label="Oldest Repo"
                  value={insights.repoStats.oldestRepo ? `${insights.repoStats.oldestRepo.name} (${format(parseISO(insights.repoStats.oldestRepo.created_at), 'yyyy')})` : 'N/A'}
                />
              </div>
            </Section>

            <Section title="Contribution Activity" subtitle="Commits, PRs, issues, and timeline" delay={0.16}>
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Commits" value={compact(insights.activityStats.commits)} />
                <Metric label="Pull Requests" value={compact(insights.activityStats.pullRequests)} />
                <Metric label="Issues" value={compact(insights.activityStats.issues)} />
                <Metric label="Total Events" value={compact(insights.activityStats.totalEvents)} />
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <AreaChart data={insights.activityStats.timeline}>
                    <defs>
                      <linearGradient id="timelineGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#c026d3" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#c026d3" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" strokeOpacity={0.25} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="events" stroke="#c026d3" fillOpacity={1} fill="url(#timelineGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="Followers Analysis" subtitle="Top followers and location distribution" delay={0.18}>
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-indigo-300">Top Followers</h3>
                  <div className="space-y-2">
                    {insights.followersStats.topFollowers.length === 0 ? (
                      <p className="text-sm text-slate-600 dark:text-indigo-200">Follower details unavailable in this sample.</p>
                    ) : (
                      insights.followersStats.topFollowers.map((follower) => (
                        <a
                          key={follower.login}
                          href={follower.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition hover:border-blue-300 dark:border-indigo-800 dark:bg-indigo-950/60"
                        >
                          <span className="font-semibold">{follower.login}</span>
                          <span className="font-mono text-slate-600 dark:text-indigo-200">{compact(follower.followers)} followers</span>
                        </a>
                      ))
                    )}
                  </div>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={insights.followersStats.locations} dataKey="value" nameKey="name" outerRadius={104}>
                        {insights.followersStats.locations.map((entry, index) => (
                          <Cell key={entry.name} fill={chartPalette[index % chartPalette.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {comparison ? (
        <div className="space-y-6">
          <Section
            title={`Comparison: @${comparison.a.profile.login} vs @${comparison.b.profile.login}`}
            subtitle="Followers, repos, stars, activity, and score"
          >
            <div className="mb-5 grid gap-3 sm:grid-cols-2">
              <Metric label={`${comparison.a.profile.login} GitHub Score`} value={`${comparison.a.score}/100`} />
              <Metric label={`${comparison.b.profile.login} GitHub Score`} value={`${comparison.b.score}/100`} />
            </div>

            <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-indigo-700 dark:bg-indigo-950/45">
              <p className="text-sm font-semibold text-blue-900 dark:text-indigo-100">Score Comparison Result</p>
              <p className="mt-1 text-sm text-blue-800 dark:text-indigo-200">{scoreComparison?.message}</p>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer>
                <BarChart data={compareMetrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" strokeOpacity={0.25} />
                  <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey={comparison.a.profile.login} fill="#2563eb" />
                  <Bar dataKey={comparison.b.profile.login} fill="#c026d3" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="Language Radar" subtitle="Top language mix comparison">
            <div className="h-80 w-full">
              <ResponsiveContainer>
                <RadarChart data={compareLanguageRadar}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="language" />
                  <Radar
                    name={comparison.a.profile.login}
                    dataKey={comparison.a.profile.login}
                    stroke="#2563eb"
                    fill="#2563eb"
                    fillOpacity={0.35}
                  />
                  <Radar
                    name={comparison.b.profile.login}
                    dataKey={comparison.b.profile.login}
                    stroke="#c026d3"
                    fill="#c026d3"
                    fillOpacity={0.35}
                  />
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>
      ) : null}
      </div>

      <footer className="mt-12">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white/75 shadow-sm backdrop-blur-md dark:border-indigo-800/70 dark:bg-indigo-950/45">
          <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-fuchsia-500 to-cyan-400" />
          <div className="flex flex-col items-center gap-2 px-4 py-5 text-center">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-indigo-300">Crafted With Care</p>
            <p className="font-display text-lg font-semibold text-slate-700 dark:text-indigo-100">Developed by Phani Kumar</p>
          </div>
        </div>
      </footer>
    </main>
  )
}

export default App

