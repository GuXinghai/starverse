# Local runtime workdirs and Vite watcher boundaries

This policy applies to local directories used for external runtime workdirs, managed engine packages, plugin or runtime extraction, downloaded tools, model or runtime binaries, diagnostic profiles, CPU profiles, netlogs, and large local artifacts.

## Core Rules

1. Prefer placing large runtime, plugin, model, extracted package, or diagnostic work directories outside the repository.
2. If a large or frequently written workdir must live under the repo root, add it to all relevant boundaries at the same time:
   - `.gitignore`
   - `vite.config.ts` `server.watch.ignored`
   - test, diagnostic, packaging, or scan excludes when needed
3. `.gitignore` does not mean Vite ignores the path. Vite/chokidar can still scan ignored files unless `server.watch.ignored` also excludes them.
4. Vite watcher should not watch `.external-runtime-work/`, large artifacts, runtime caches, profile clones, external engine extraction directories, or diagnostic profile output.
5. Do not keep LibreOffice, Tika, Pandoc, ffmpeg, model runtimes, plugin packages, or other long-lived external runtimes in the source tree as ordinary source directories.

## Recommended Locations

- Repo-external runtime roots: `D:/Starverse-runtime/` or `D:/Starverse-engines/`
- User-level managed engines: `%LOCALAPPDATA%/Starverse/engines/`
- Repo-local temporary workdir: `.external-runtime-work/`, only for temporary development/runtime preparation and only when Git-ignored and Vite-ignored
- Repo-local development cache: `.starverse-engines/`, if used, must also be Git-ignored and Vite-ignored

## 2026-06 Dev White-Screen Incident

The 2026-06 dev white-screen incident was caused by `.external-runtime-work/` being placed under the repo root for external runtime preparation. Git ignored the directory, but Vite did not. CPU profiling pointed to Vite watcher/chokidar/`node:fs.watch` work, and renderer module requests stalled before Vue could mount. Adding `**/.external-runtime-work/**` to `server.watch.ignored` removed the white-screen signature.

## New Runtime Checklist

Before adding a local runtime, engine, plugin package, model package, extracted binary, or diagnostic workdir, check:

- Is it under the repo root?
- Does it contain many files or large files?
- Will it be written frequently while `npm run dev` is running?
- Is it Git-ignored?
- Is it Vite-watch-ignored?
- Could tests, packaging, documentation scans, privacy scans, or CI traverse it?
- Could ordinary logs expose absolute paths or sensitive local runtime paths?

If any answer is uncertain, prefer a repo-external location.
