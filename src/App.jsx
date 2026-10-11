import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, Bookmark, Check, Clapperboard, Compass, Heart, Search, Sparkles, X } from 'lucide-react';

const fallbackGenres = ['All films', 'Adventure', 'Animation', 'Comedy', 'Drama', 'Mystery', 'Romance', 'Sci-Fi'];
const readSaved = () => {
  try { return JSON.parse(localStorage.getItem('moviescope-watchlist') || '[]'); }
  catch { return []; }
};
const posterTone = (movie) => {
  const genres = movie.genres || [];
  if (genres.includes('Animation')) return 'blue';
  if (genres.includes('Sci-Fi')) return 'violet';
  if (genres.includes('Romance')) return 'pink';
  if (genres.includes('Mystery') || genres.includes('Crime')) return 'amber';
  if (genres.includes('Drama')) return 'rose';
  if (genres.includes('Fantasy')) return 'orange';
  if (genres.includes('Action')) return 'teal';
  return 'green';
};

function App() {
  const [movies, setMovies] = useState([]);
  const [seed, setSeed] = useState(null);
  const [activeGenre, setActiveGenre] = useState('All films');
  const [genres, setGenres] = useState(fallbackGenres);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [saved, setSaved] = useState(readSaved);
  const [showSaved, setShowSaved] = useState(false);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [apiOnline, setApiOnline] = useState(false);

  const loadRecommendations = async (movieId) => {
    setLoading(true);
    setError('');
    setSuggestions([]);
    setSearch('');
    setShowSaved(false);
    try {
      const response = await fetch(`/api/recommendations?movie_id=${encodeURIComponent(movieId)}&limit=32`);
      if (!response.ok) throw new Error(`Recommendation request failed (${response.status})`);
      const data = await response.json();
      setSeed(data.seed);
      setMovies(data.recommendations || []);
      setApiOnline(true);
    } catch {
      setApiOnline(false);
      setError('Could not reach the MovieLens catalog API. Restart the Vite app from the Movie Recommender folder.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecommendations(1);
    fetch('/api/genres').then((response) => response.ok ? response.json() : null).then((data) => {
      if (data?.genres?.length) setGenres(['All films', ...data.genres]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) { setSuggestions([]); return undefined; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/movies?q=${encodeURIComponent(query)}&limit=8`, { signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        setSuggestions(data.movies || []);
      } catch (err) {
        if (err.name !== 'AbortError') setSuggestions([]);
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search]);

  useEffect(() => {
    localStorage.setItem('moviescope-watchlist', JSON.stringify(saved));
  }, [saved]);

  const filtered = useMemo(() => (showSaved ? saved : movies).filter((movie) => {
    const genreMatch = activeGenre === 'All films' || movie.genres.includes(activeGenre);
    return genreMatch;
  }), [activeGenre, movies, saved, showSaved]);

  const toggleSaved = (movie) => setSaved((items) => items.some((item) => item.movieId === movie.movieId)
    ? items.filter((item) => item.movieId !== movie.movieId)
    : [...items, movie]);
  const chooseMovie = (movie) => {
    setActiveGenre('All films');
    loadRecommendations(movie.movieId);
    document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' });
  };

  return <main>
    <header className="topbar">
      <a className="brand" href="#top" aria-label="MovieScope home"><span className="brand-icon"><Clapperboard size={19} strokeWidth={2.2} /></span><span>movie<span className="brand-accent">scope</span></span></a>
      <nav className="main-nav" aria-label="Main navigation"><a className={!showSaved ? 'nav-link active' : 'nav-link'} href="#discover" onClick={() => setShowSaved(false)}><Compass size={16} /> Discover</a><button className={showSaved ? 'nav-link active' : 'nav-link'} onClick={() => { setShowSaved(true); setActiveGenre('All films'); document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' }); }}><Bookmark size={16} /> My watchlist <span className="nav-count">{saved.length}</span></button></nav>
      <div className="top-actions"><span className="taste-label"><span className={`status-dot ${apiOnline ? '' : 'offline'}`} /> {apiOnline ? 'MovieLens connected' : 'API offline'}</span><div className="avatar">K</div></div>
    </header>

    <section className="hero" id="top">
      <div className="hero-copy"><div className="eyebrow"><Sparkles size={14} /> MOVIELENS CONTENT MATCHING</div><h1>Find your<br />next <em>favorite.</em></h1><p className="hero-description">Start with a film you love. We’ll find close matches from 86,500+ MovieLens titles.</p>
        <a className="hero-cta" href="#discover">Find similar films <ArrowDown size={16} /></a>
        <div className="hero-proof"><div className="proof-avatars"><span>G</span><span>T</span><span>C</span><span>+</span></div><span><b>Genre signals</b> from the MovieLens catalog</span><span className="proof-separator">·</span><span>your next watch, discovered</span></div>
      </div>
      <div className="hero-art" aria-label="Your selected starting movie"><div className="hero-glow" /><div className={`hero-poster-frame hero-${posterTone(seed || { genres: [] })}`}><div className="hero-art-ornament"><Clapperboard size={38} strokeWidth={1.2} /><span>THE MOVIELENS<br />DISCOVERY ENGINE</span></div><div className="poster-shade" /><div className="hero-poster-caption"><span className="mini-label">YOUR STARTING POINT</span><strong>{seed?.title || 'Pick a film to explore.'}</strong><span className="feature-match"><Sparkles size={13} /> {seed ? (seed.genres || []).slice(0, 3).join(' · ') : '86,537 films in the catalog'}</span></div></div><div className="floating-note"><span className="note-icon"><Heart size={15} fill="currentColor" /></span><span><b>One film you love</b><small>Thousands of paths to explore</small></span></div><div className="hero-index">01 <span>/</span> 32</div></div>
      <div className="hero-bottom"><span>86,537 MOVIES</span><div className="hero-bottom-line" /><span>GENRE COSINE SIMILARITY</span></div>
    </section>

    <section className="discovery-section" id="discover">
      <div className="section-heading"><div><div className="section-kicker">FROM THE MOVIELENS CATALOG</div><h2>{showSaved ? 'Saved for later' : seed ? `Because you picked ${seed.title}` : 'Find a film to begin'}<span className="heading-period">.</span></h2><p>{showSaved ? 'Your hand-picked lineup, saved on this device.' : 'Recommendations are calculated from shared genre signals in the project dataset.'}</p></div><div className="results-label"><span className="results-dot" /> {loading && !showSaved ? 'UPDATING PICKS' : `${filtered.length} ${showSaved ? 'SAVED FILMS' : 'SIMILAR FILMS'}`}</div></div>
      <div className="toolbar"><div className="genre-list" role="tablist" aria-label="Filter by genre">{genres.map((genre) => <button key={genre} role="tab" aria-selected={activeGenre === genre} className={`genre-chip ${activeGenre === genre ? 'selected' : ''}`} onClick={() => { setActiveGenre(genre); setShowSaved(false); }}>{genre}</button>)}</div><div className="search-wrap"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} onFocus={() => setShowSaved(false)} placeholder="Search 86,537 MovieLens films..." aria-label="Search MovieLens films" /><button onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button><kbd>⌘ K</kbd></div>{suggestions.length > 0 && <div className="search-suggestions">{suggestions.map((movie) => <button key={movie.movieId} onClick={() => chooseMovie(movie)}><span className="suggestion-icon"><Clapperboard size={15} /></span><span className="suggestion-title">{movie.title}<small>{movie.year || 'Year unknown'} · {(movie.genres || []).slice(0, 3).join(' · ') || 'Uncategorized'}</small></span><ArrowRight size={14} /></button>)}</div>}</div></div>
      {!showSaved && error && <div className="api-error"><span>{error}</span><button onClick={() => loadRecommendations(seed?.movieId || 1)}>Retry <ArrowRight size={14} /></button><small>Run <code>npm run dev</code> in the project folder with <code>datasets/movies.csv</code> present.</small></div>}
      {loading && !showSaved && <div className="loading-state"><span className="loader" /><span>Finding films with a similar genre profile…</span></div>}
      {(!loading || showSaved) && (!error || showSaved) && <div className="movie-grid">{filtered.map((movie, index) => <article className="movie-card" key={movie.movieId} style={{ '--card-index': index }}>
        <button className={`poster poster-${posterTone(movie)}`} onClick={() => setSelected(movie)} aria-label={`View ${movie.title}`}><span className="poster-grain" />{!showSaved && <span className="match-pill"><Sparkles size={12} /> {Math.round(movie.similarity * 100)}% similar</span>}<span className="poster-title">{movie.title}</span><span className="poster-year">{movie.year || 'MOVIELENS PICK'}</span><span className="quick-view">Quick look <ArrowRight size={13} /></span></button>
        <div className="movie-info"><div className="movie-title-row"><button className="movie-title" onClick={() => setSelected(movie)}>{movie.title}</button><button onClick={() => toggleSaved(movie)} className={`save-button ${saved.some((item) => item.movieId === movie.movieId) ? 'is-saved' : ''}`} aria-label={saved.some((item) => item.movieId === movie.movieId) ? 'Remove from watchlist' : 'Add to watchlist'}>{saved.some((item) => item.movieId === movie.movieId) ? <Heart size={17} fill="currentColor" /> : <Heart size={17} />}</button></div><div className="movie-meta">{!showSaved && <><span><Sparkles size={13} /> {Math.round(movie.similarity * 100)}% match</span><i /></>}{(movie.genres || []).slice(0, 3).join(' · ') || 'No genre listed'}</div><p className="match-reason">{movie.reason || `Similar genre profile to ${seed?.title || 'your pick'}`}</p>{!showSaved && <button className="more-like-this" onClick={() => chooseMovie(movie)}>Find similar <ArrowRight size={12} /></button>}</div>
      </article>)}</div>}
      {!loading && (!error || showSaved) && filtered.length === 0 && <div className="empty-state"><span className="empty-icon"><Search size={22} /></span><h3>{showSaved ? 'Nothing saved here yet.' : 'No films match this filter.'}</h3><p>{showSaved ? 'Tap the heart on a film to keep it close.' : 'Try a different genre or search for a title above.'}</p><button onClick={() => { setActiveGenre('All films'); setShowSaved(false); }}>Show recommendations <ArrowRight size={14} /></button></div>}
      {!showSaved && !loading && !error && <div className="more-banner"><div className="more-icon"><Sparkles size={20} /></div><div><span className="section-kicker">BASED ON THE PROJECT'S CONTENT FILTERING WORK</span><p>Genre features are compared with cosine similarity.</p></div><a href="./notebooks/title_genre_based_filtering.ipynb" target="_blank" rel="noreferrer">Explore the notebook <ArrowRight size={16} /></a></div>}
    </section>

    <section className="how-section"><div className="how-intro"><div className="section-kicker">THE RECOMMENDER, UNDER THE HOOD</div><h2>MovieLens data.<br /><em>Shared signals.</em></h2><p>This page connects to the project catalog and applies the title/genre content-filtering approach explored in the notebooks.</p></div><div className="method-cards"><div className="method-card"><div className="method-number">01</div><span className="method-icon icon-lilac"><Compass size={18} /></span><h3>Choose a starting film</h3><p>Search the full MovieLens catalog and pick any movie as your reference point.</p><div className="tag-cloud"><span>86,537 titles</span><span>MovieLens data</span></div></div><div className="method-card"><div className="method-number">02</div><span className="method-icon icon-gold"><Clapperboard size={18} /></span><h3>Compare genre signals</h3><p>Each movie is represented as a binary vector of its listed genres.</p><div className="signal-bars"><i /><i /><i /><i /><i /><i /><i /></div></div><div className="method-card"><div className="method-number">03</div><span className="method-icon icon-pink"><Sparkles size={18} /></span><h3>Rank close matches</h3><p>Cosine similarity ranks films by how closely their genre profiles align.</p><div className="match-meter"><span /><span /><span /><span /><span /><b>cosine score</b></div></div></div></section>

    <footer className="footer"><a className="brand footer-brand" href="#top"><span className="brand-icon"><Clapperboard size={17} /></span><span>movie<span className="brand-accent">scope</span></span></a><span>A student project powered by MovieLens data.</span><a href="https://grouplens.org/datasets/movielens/" target="_blank" rel="noreferrer">About the dataset <ArrowRight size={13} /></a><span className="footer-copy">© 2026 MOVIESCOPE</span></footer>

    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><section className="detail-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close details"><X size={18} /></button><div className={`modal-poster poster-${posterTone(selected)}`}><span className="poster-grain" /><span className="modal-poster-title">{selected.title}</span></div><div className="modal-content"><div className="section-kicker">A MOVIELENS CONTENT MATCH</div>{!showSaved && <span className="match-pill modal-match"><Sparkles size={12} /> {Math.round(selected.similarity * 100)}% similar</span>}<h2>{selected.title}</h2><div className="movie-meta">{selected.year || 'Release year unavailable'}<i />{(selected.genres || []).join(' · ') || 'No genres listed'}</div><p>{selected.reason || 'This film shares a similar genre profile with your starting movie.'} Similarity is computed from the project catalog's genre vectors.</p><div className="tag-cloud">{(selected.sharedGenres || selected.genres || []).map((tag) => <span key={tag}>{tag}</span>)}</div><button className="modal-save" onClick={() => { setSelected(null); chooseMovie(selected); }}><Compass size={16} /> Find films like this</button><button className="modal-save secondary-save" onClick={() => toggleSaved(selected)}>{saved.some((item) => item.movieId === selected.movieId) ? <Check size={16} /> : <Bookmark size={16} />}{saved.some((item) => item.movieId === selected.movieId) ? 'Saved to your watchlist' : 'Save to watchlist'}</button></div></section></div>}
  </main>;
}

export default App;
