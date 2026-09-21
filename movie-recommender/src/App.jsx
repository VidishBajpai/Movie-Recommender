// import MovieCard from "./components/MovieCard";
import Home from "./pages/home";
import Favourites from "./pages/favourites";
import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import "./style/App.css";


function App() {
  return (
    <div>
        <NavBar/>
      <h3>Movie Recommender</h3>
      <br />
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/favourites" element={<Favourites />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
