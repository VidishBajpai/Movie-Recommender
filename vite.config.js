import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync, createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
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

async function forEachCsvRow(filePath, callback) {
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let first = true;
  for await (const line of lines) {
    if (first) { first = false; continue; }
    if (line) await callback(parseCsvRow(line));
  }
}

function movieLensApi() {
  const root = process.cwd();
  const dataDir = resolve(root, 'datasets');
  const moviesPath = resolve(dataDir, 'movies.csv');
  if (!existsSync(moviesPath)) {
    throw new Error(`MovieLens catalog missing at ${moviesPath}. Put the project's movies.csv in datasets/ before starting Vite.`);
  }

  const source = readFileSync(moviesPath, 'utf8');
  const [headerLine, ...lines] = source.split(/\r?\n/);
  const headers = parseCsvRow(headerLine);
  const catalog = lines.filter(Boolean).map((line) => {
    const row = parseCsvRow(line);
    const rawTitle = row[headers.indexOf('title')] || '';
    const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
    return {
      movieId: Number(row[headers.indexOf('movieId')]),
      title: rawTitle.replace(/\s*\(\d{4}\)\s*$/, ''),
      year: yearMatch ? Number(yearMatch[1]) : null,
      genres: (row[headers.indexOf('genres')] || '').split('|').filter((genre) => genre && genre !== '(no genres listed)'),
    };
  });
  const movieIndex = new Map(catalog.map((movie, index) => [movie.movieId, index]));
  const byId = new Map(catalog.map((movie) => [movie.movieId, movie]));
  const genres = [...new Set(catalog.flatMap((movie) => movie.genres))].sort();
  const genrePostings = new Map(genres.map((genre) => [genre, []]));
  const genreVectors = catalog.map((movie, index) => {
    const norm = Math.sqrt(movie.genres.length) || 1;
    for (const genre of movie.genres) genrePostings.get(genre).push(index, 1 / norm);
    return movie.genres;
  });

  let contentIndexPromise;
  let ratingsPromise;
  let tagIndex = null;
  let genomeIndex = null;
  const ratingsCachePath = resolve(root, '.cache/movielens-rating-summary.json');

  async function buildTagIndex() {
    const tagsPath = resolve(dataDir, 'tags.csv');
    if (!existsSync(tagsPath)) return null;
    const docs = Array.from({ length: catalog.length }, () => new Set());
    const documentFrequency = new Map();
    await forEachCsvRow(tagsPath, (row) => {
      const index = movieIndex.get(Number(row[1]));
      const term = (row[2] || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim().replace(/ /g, '_');
      if (index === undefined || !term || docs[index].has(term)) return;
      docs[index].add(term);
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    });

    const featureNames = [...documentFrequency.keys()];
    const featureId = new Map(featureNames.map((term, index) => [term, index]));
    const postings = Array.from({ length: featureNames.length }, () => []);
    const vectors = Array.from({ length: catalog.length }, () => null);
    const documentCount = catalog.length;
    for (let index = 0; index < docs.length; index += 1) {
      if (!docs[index].size) continue;
      const terms = [...docs[index]];
      const idfs = terms.map((term) => Math.log((1 + documentCount) / (1 + documentFrequency.get(term))) + 1);
      const norm = Math.sqrt(idfs.reduce((sum, value) => sum + value * value, 0));
      const ids = new Uint32Array(terms.length);
      const values = new Float32Array(terms.length);
      for (let item = 0; item < terms.length; item += 1) {
        const id = featureId.get(terms[item]);
        const weight = idfs[item] / norm;
        ids[item] = id;
        values[item] = weight;
        postings[id].push(index, weight);
      }
      vectors[index] = { ids, values };
    }
    return { featureNames, postings, vectors };
  }

  async function buildGenomeIndex() {
    const scoresPath = resolve(dataDir, 'genome-scores.csv');
    const namesPath = resolve(dataDir, 'genome-tags.csv');
    if (!existsSync(scoresPath) || !existsSync(namesPath)) return null;
    const tagNames = new Map();
    await forEachCsvRow(namesPath, (row) => tagNames.set(Number(row[0]), row[1] || `Genome tag ${row[0]}`));
    const tagIds = [...tagNames.keys()].sort((a, b) => a - b);
    const tagIndexById = new Map(tagIds.map((id, index) => [id, index]));
    const postings = Array.from({ length: tagIds.length }, () => []);
    const vectors = Array.from({ length: catalog.length }, () => null);
    let currentMovieId = null;
    let currentValues = null;
    let previousMovieId = -1;

    const flushMovie = () => {
      if (currentMovieId === null || !currentValues) return;
      const index = movieIndex.get(currentMovieId);
      if (index === undefined) return;
      let squareSum = 0;
      for (const value of currentValues) squareSum += value * value;
      const norm = Math.sqrt(squareSum);
      if (!norm) return;
      const normalized = new Float32Array(currentValues.length);
      for (let feature = 0; feature < currentValues.length; feature += 1) {
        const value = currentValues[feature] / norm;
        normalized[feature] = value;
        if (value !== 0) postings[feature].push(index, value);
      }
      vectors[index] = normalized;
    };

    await forEachCsvRow(scoresPath, (row) => {
      const id = Number(row[0]);
      const feature = tagIndexById.get(Number(row[1]));
      const value = Number(row[2]);
      if (!Number.isFinite(id) || feature === undefined || !Number.isFinite(value)) return;
      if (currentMovieId !== id) {
        if (id < previousMovieId) throw new Error('genome-scores.csv must be ordered by movieId, as expected by the project notebook.');
        flushMovie();
        previousMovieId = id;
        currentMovieId = id;
        currentValues = new Float32Array(tagIds.length);
      }
      currentValues[feature] = value;
    });
    flushMovie();
    return { tagIds, tagNames, tagIndexById, postings, vectors };
  }

  async function ensureContentIndex() {
    if (!contentIndexPromise) {
      contentIndexPromise = Promise.all([buildTagIndex(), buildGenomeIndex()]).then(([tags, genome]) => {
        tagIndex = tags;
        genomeIndex = genome;
        return { tags, genome };
      }).catch((error) => {
        contentIndexPromise = null;
        throw error;
      });
    }
    return contentIndexPromise;
  }

  function addDotProducts(scores, postings, featureId, queryWeight) {
    const list = postings[featureId];
    if (!list) return;
    for (let offset = 0; offset < list.length; offset += 2) {
      const candidate = list[offset];
      scores[candidate] += queryWeight * list[offset + 1];
    }
  }

  function topFeatureNames(queryVector, candidateVector, names, limit = 4) {
    if (!queryVector || !candidateVector) return [];
    const candidateById = new Map();
    for (let i = 0; i < candidateVector.ids.length; i += 1) candidateById.set(candidateVector.ids[i], candidateVector.values[i]);
    const shared = [];
    for (let i = 0; i < queryVector.ids.length; i += 1) {
      const candidateWeight = candidateById.get(queryVector.ids[i]);
      if (candidateWeight) shared.push([queryVector.ids[i], queryVector.values[i] * candidateWeight]);
    }
    shared.sort((a, b) => b[1] - a[1]);
    return shared.slice(0, limit).map(([id]) => names[id]);
  }

  function topGenomeFeatureNames(queryVector, candidateVector, genome, limit = 3) {
    if (!queryVector || !candidateVector || !genome) return [];
    const shared = [];
    for (let feature = 0; feature < queryVector.length; feature += 1) {
      const score = queryVector[feature] * candidateVector[feature];
      if (score > 0) shared.push([feature, score]);
    }
    shared.sort((a, b) => b[1] - a[1]);
    return shared.slice(0, limit).map(([feature]) => genome.tagNames.get(genome.tagIds[feature])).filter(Boolean);
  }

  function similarMovies(movieId, mode, limit, indexes) {
    const seedIndex = movieIndex.get(movieId);
    if (seedIndex === undefined) return null;
    const seedGenres = genreVectors[seedIndex];
    const seedTags = indexes.tags?.vectors[seedIndex] || null;
    const seedGenome = indexes.genome?.vectors[seedIndex] || null;
    const groups = mode === 'genres' ? ['genres'] : mode === 'user_tags' ? ['user_tags'] : mode === 'genome' ? ['genome'] : ['genres', 'user_tags', 'genome'];
    const seedAvailableWeight = groups.reduce((sum, group) => {
      const present = group === 'genres' ? seedGenres.length > 0 : group === 'user_tags' ? Boolean(seedTags) : Boolean(seedGenome);
      return sum + (present ? 1 / 3 : 0);
    }, 0);
    if (!seedAvailableWeight) return [];

    const scoreGenres = new Float64Array(catalog.length);
    const scoreTags = new Float64Array(catalog.length);
    const scoreGenome = new Float64Array(catalog.length);
    if (groups.includes('genres')) {
      const norm = Math.sqrt(seedGenres.length) || 1;
      for (const genre of seedGenres) {
        for (let offset = 0; offset < genrePostings.get(genre).length; offset += 2) {
          const candidate = genrePostings.get(genre)[offset];
          scoreGenres[candidate] += (1 / norm) * genrePostings.get(genre)[offset + 1];
        }
      }
    }
    if (groups.includes('user_tags') && seedTags && indexes.tags) {
      for (let feature = 0; feature < seedTags.ids.length; feature += 1) {
        addDotProducts(scoreTags, indexes.tags.postings, seedTags.ids[feature], seedTags.values[feature]);
      }
    }
    if (groups.includes('genome') && seedGenome && indexes.genome) {
      for (let feature = 0; feature < seedGenome.length; feature += 1) {
        if (seedGenome[feature]) addDotProducts(scoreGenome, indexes.genome.postings, feature, seedGenome[feature]);
      }
    }

    const seedHasGenre = seedGenres.length > 0;
    const seedHasTags = Boolean(seedTags);
    const seedHasGenome = Boolean(seedGenome);
    const output = [];
    for (let index = 0; index < catalog.length; index += 1) {
      if (index === seedIndex) continue;
      const movie = catalog[index];
      const hasGenre = movie.genres.length > 0;
      const hasTags = Boolean(indexes.tags?.vectors[index]);
      const hasGenome = Boolean(indexes.genome?.vectors[index]);
      let candidateWeight = 0;
      if (groups.includes('genres') && hasGenre && seedHasGenre) candidateWeight += 1 / 3;
      if (groups.includes('user_tags') && hasTags && seedHasTags) candidateWeight += 1 / 3;
      if (groups.includes('genome') && hasGenome && seedHasGenome) candidateWeight += 1 / 3;
      if (!candidateWeight) continue;
      let numerator = 0;
      if (groups.includes('genres')) numerator += scoreGenres[index] / 3;
      if (groups.includes('user_tags')) numerator += scoreTags[index] / 3;
      if (groups.includes('genome')) numerator += scoreGenome[index] / 3;
      const similarity = numerator / Math.sqrt(seedAvailableWeight * candidateWeight);
      if (similarity <= 0) continue;
      output.push({
        ...movie,
        similarity: Number(similarity.toFixed(4)),
      });
    }
    output.sort((a, b) => b.similarity - a.similarity || a.title.localeCompare(b.title));
    return output.slice(0, limit).map((movie) => {
      const index = movieIndex.get(movie.movieId);
      const sharedGenres = movie.genres.filter((genre) => seedGenres.includes(genre)).sort();
      const sharedTags = topFeatureNames(seedTags, indexes.tags?.vectors[index], indexes.tags?.featureNames, 3);
      const sharedGenomeTags = topGenomeFeatureNames(seedGenome, indexes.genome?.vectors[index], indexes.genome, 3);
      const evidence = [...sharedGenres, ...sharedTags, ...sharedGenomeTags].slice(0, 3);
      return { ...movie, sharedGenres, sharedTags, sharedGenomeTags, reason: evidence.length ? `Shares ${evidence.join(', ')} with your pick` : 'A close match from the MovieLens feature profile' };
    });
  }

  async function loadRatingSummary() {
    const ratingsPath = resolve(dataDir, 'ratings.csv');
    if (!existsSync(ratingsPath)) return [];
    const fileStat = statSync(ratingsPath);
    if (existsSync(ratingsCachePath)) {
      try {
        const cache = JSON.parse(readFileSync(ratingsCachePath, 'utf8'));
        if (cache.size === fileStat.size && cache.mtimeMs === fileStat.mtimeMs) return cache.items;
      } catch { /* rebuild stale or invalid cache */ }
    }
    const sums = new Float64Array(catalog.length);
    const counts = new Uint32Array(catalog.length);
    await forEachCsvRow(ratingsPath, (row) => {
      const index = movieIndex.get(Number(row[1]));
      const rating = Number(row[2]);
      if (index === undefined || !Number.isFinite(rating)) return;
      sums[index] += rating;
      counts[index] += 1;
    });
    const averages = [];
    const countValues = [];
    for (let index = 0; index < catalog.length; index += 1) {
      if (counts[index]) {
        averages.push(sums[index] / counts[index]);
        countValues.push(counts[index]);
      }
    }
    const sortedCounts = [...countValues].sort((a, b) => a - b);
    const percentilePosition = (sortedCounts.length - 1) * 0.75;
    const lower = Math.floor(percentilePosition);
    const m = sortedCounts[lower] + (sortedCounts[Math.ceil(percentilePosition)] - sortedCounts[lower]) * (percentilePosition - lower);
    const c = averages.reduce((sum, value) => sum + value, 0) / averages.length;
    const items = [];
    for (let index = 0; index < catalog.length; index += 1) {
      const v = counts[index];
      if (!v || v < m) continue;
      const rating = sums[index] / v;
      const weightedRating = (v / (v + m)) * rating + (m / (v + m)) * c;
      items.push({ ...catalog[index], rating: Number(rating.toFixed(2)), ratingCount: v, weightedRating: Number(weightedRating.toFixed(4)), similarity: Number((weightedRating / 5).toFixed(4)), reason: `${rating.toFixed(1)} average from ${v.toLocaleString()} MovieLens ratings` });
    }
    items.sort((a, b) => b.weightedRating - a.weightedRating || b.ratingCount - a.ratingCount);
    mkdirSync(resolve(root, '.cache'), { recursive: true });
    writeFileSync(ratingsCachePath, JSON.stringify({ size: fileStat.size, mtimeMs: fileStat.mtimeMs, items }));
    return items;
  }

  return {
    name: 'movielens-catalog-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith('/api/')) return next();
        const url = new URL(request.url, 'http://localhost');
        const json = (status, payload) => {
          response.statusCode = status;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify(payload));
        };
        try {
          if (url.pathname === '/api/health') {
            json(200, { status: 'ok', movies: catalog.length, features: { genres: true, userTags: existsSync(resolve(dataDir, 'tags.csv')), genome: existsSync(resolve(dataDir, 'genome-scores.csv')) && existsSync(resolve(dataDir, 'genome-tags.csv')), ratings: existsSync(resolve(dataDir, 'ratings.csv')) } });
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
            const mode = url.searchParams.get('model') || 'combined';
            const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 12, 40));
            const seed = byId.get(movieId);
            if (!seed) { json(404, { error: 'Movie not found in the MovieLens catalog' }); return; }
            if (!['combined', 'genres', 'user_tags', 'genome'].includes(mode)) { json(400, { error: 'Unknown recommendation model' }); return; }
            const indexes = await ensureContentIndex();
            const recommendations = similarMovies(movieId, mode, limit, indexes);
            json(200, { seed, method: mode, featureGroups: mode === 'combined' ? ['genres', 'user_tags', 'genome'] : [mode], recommendations });
            return;
          }
          if (url.pathname === '/api/popular') {
            const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 32, 40));
            json(200, { method: 'Bayesian weighted rating', recommendations: (await loadRatingSummary()).slice(0, limit) });
            return;
          }
          json(404, { error: 'Not found' });
        } catch (error) {
          json(500, { error: error instanceof Error ? error.message : 'MovieLens request failed' });
        }
      });
    },
  };
}

export default defineConfig({ plugins: [react(), movieLensApi()] });
