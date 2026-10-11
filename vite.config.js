import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function parseCsvRow(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else field += char;
  }
  fields.push(field);
  return fields;
}

function movieLensApi() {
  const catalogPath = resolve(process.cwd(), 'datasets/movies.csv');
  const source = readFileSync(catalogPath, 'utf8');
  const [headerLine, ...lines] = source.split(/\r?\n/);
  const headers = parseCsvRow(headerLine);
  const movieIdIndex = headers.indexOf('movieId');
  const titleIndex = headers.indexOf('title');
  const genresIndex = headers.indexOf('genres');
  const catalog = lines.filter(Boolean).map((line) => {
    const row = parseCsvRow(line);
    const rawTitle = row[titleIndex] || '';
    const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
    return {
      movieId: Number(row[movieIdIndex]),
      title: rawTitle.replace(/\s*\(\d{4}\)\s*$/, ''),
      year: yearMatch ? Number(yearMatch[1]) : null,
      genres: !row[genresIndex] || row[genresIndex] === '(no genres listed)' ? [] : row[genresIndex].split('|'),
    };
  });
  const byId = new Map(catalog.map((movie) => [movie.movieId, movie]));
  const genres = [...new Set(catalog.flatMap((movie) => movie.genres))].sort();

  return {
    name: 'movielens-catalog-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/api/')) return next();
        const url = new URL(request.url, 'http://localhost');
        const json = (status, payload) => {
          response.statusCode = status;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify(payload));
        };

        if (url.pathname === '/api/health') {
          json(200, { status: 'ok', movies: catalog.length, method: 'genre cosine similarity' });
          return;
        }
        if (url.pathname === '/api/genres') {
          json(200, { genres });
          return;
        }
        if (url.pathname === '/api/movies') {
          const query = (url.searchParams.get('q') || '').trim().toLocaleLowerCase();
          const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 10, 30));
          const matches = catalog.filter((movie) => movie.title.toLocaleLowerCase().includes(query));
          matches.sort((a, b) => a.title.localeCompare(b.title) || a.movieId - b.movieId);
          json(200, { movies: matches.slice(0, limit), total: matches.length });
          return;
        }
        if (url.pathname === '/api/recommendations') {
          const movieId = Number(url.searchParams.get('movie_id') || 1);
          const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 12, 40));
          const seed = byId.get(movieId);
          if (!seed) {
            json(404, { error: 'Movie not found in the MovieLens catalog' });
            return;
          }
          const seedGenres = new Set(seed.genres);
          const results = [];
          if (seedGenres.size) {
            for (const movie of catalog) {
              if (movie.movieId === movieId || movie.genres.length === 0) continue;
              const sharedGenres = movie.genres.filter((genre) => seedGenres.has(genre)).sort();
              if (!sharedGenres.length) continue;
              const similarity = sharedGenres.length / Math.sqrt(seedGenres.size * movie.genres.length);
              results.push({
                ...movie,
                similarity: Number(similarity.toFixed(4)),
                sharedGenres,
                reason: `Shares ${sharedGenres.slice(0, 3).join(', ')} with your pick`,
              });
            }
          }
          results.sort((a, b) => b.similarity - a.similarity || a.title.localeCompare(b.title));
          json(200, {
            seed,
            method: 'cosine similarity over binary genre vectors',
            featureGroups: ['genres'],
            recommendations: results.slice(0, limit),
          });
          return;
        }
        json(404, { error: 'Not found' });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), movieLensApi()],
});
