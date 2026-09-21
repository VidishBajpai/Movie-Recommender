import "../style/MovieCard.css"

function MovieCard({ movie }) {
  function Like() {
    alert("Added to Favourites");
    console.log(movie);
  }

  return (
    <>
      <div className="card">
        <div className="poster">
          <img src={movie.url} alt={movie.title} />
          <div className="movie-overlay">
            <button className="like" onClick={Like}>
              {" "}
              🤍{" "}
            </button>
          </div>
          <div className="info">
            <h3 className="title">
              {movie.title}
              <p className="release-date"> {movie.release} </p>
            </h3>
          </div>
        </div>
      </div>
    </>
  );
}

export default MovieCard;


