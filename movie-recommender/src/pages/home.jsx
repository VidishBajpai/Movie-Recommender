import MovieCard from "../components/MovieCard";
import { useState } from "react";
import "../style/Home.css";


function Home() {
  const movies = [
    { id: 1, title: "Interstellar", release: "2016" },
    { id: 2, title: "Memento", release: "2002" },
    { id: 3, title: "Tenet", release: "2017" },
  ];

  const [searchQuery, setSearchQuery] = useState("");

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
        {movies.map(
          (movie) =>
              <MovieCard movie={movie} key={movie.id} />
        )}
      </div>
    </div>
  );
}

export default Home;
