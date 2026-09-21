import MovieCard from "../components/MovieCard";
import { useState, useEffect } from "react";
import "../style/Home.css";
import { getPopularMovies, searchMovies } from "../services/api";

function Home() {

  const [searchQuery, setSearchQuery] = useState("");
  const [movies, setMovies] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadPopularMovies = async () => {
        try{
            const PopularMovies = await getPopularMovies()
            setMovies(PopularMovies)
        } catch (err) {
            setError("Failed to load movie")
            console.log(err)
        } finally {setLoading(false)}
    }
    loadPopularMovies()
  }, [])

  const SearchMovie = (e) => {
    e.preventDefault();
    alert(searchQuery);
    setSearchQuery("");
  };

  return (
    <div className="home-page">
      <form className="search-form" onSubmit={SearchMovie}>
        <input
          type="text"
          placeholder="search for movies"
          className="search-movie"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button type="submit" className="search-button">
          Search
        </button>
      </form>

      <div className="movie-grid">
        {movies.map((movie) => (
          <MovieCard movie={movie} key={movie.id} />
        ))}
      </div>
    </div>
  );
}

export default Home;
