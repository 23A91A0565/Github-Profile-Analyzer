# GitHub Profile Analyzer

A React dashboard that analyzes a full GitHub profile, not just one repository.

## Features

- Profile overview: avatar, name, bio, followers, following, public repos, location, account creation date.
- Repository statistics: total repositories, most starred repo, most forked repo, total stars.
- Language usage analysis: language distribution across repositories.
- Contribution activity: commits, pull requests, issues, and timeline.
- Repository activity: recent repositories with stars, forks, and open issues.
- Followers analysis: top followers and location distribution (falls back gracefully when detail API calls are limited).
- GitHub score: weighted score out of 100.
- Recommendation engine: practical suggestion for profile/repo improvement.
- Compare mode: user vs user metrics and language radar chart.

## Tech Stack

- React + Vite
- Axios
- Recharts
- Tailwind CSS

## Setup

1. Install dependencies:

```bash
npm install
```

2. Optional but recommended: configure a GitHub token to increase API limits.

```bash
cp .env.example .env
```

Then set:

```env
VITE_GITHUB_TOKEN=your_token_here

You can also paste a token directly in the app header using `Save Token` (stored in localStorage) and remove it with `Clear Token`.
```

3. Run development server:

```bash
npm run dev
```

4. Build for production:

```bash
npm run build
```

## API Endpoints Used

- `GET /users/{username}`
- `GET /users/{username}/repos`
- `GET /users/{username}/events`
- `GET /users/{username}/followers`

## Notes

- Repos/followers/events are fetched with pagination to improve completeness.
- For faster UI response, events and followers analysis uses recent/sample windows by default, and follower detail lookups are kept lightweight in public mode.
- localStorage caching is enabled for 15 minutes per query to speed repeated analyses and reduce API usage.
- In UI, data source status indicates whether results came from live API or cache.
- On GitHub rate limit (`403/429`), the app automatically waits briefly and retries before showing an error.
