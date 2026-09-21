const API_KEY = "kFFxvmY5pxHETxg676AKIrSpzNYglVedswkET6LE";
const BASE_URL = "https://api.watchmode.com/v1/";

export const getPopularMovies = async () => {
  const response = await fetch(
    `${BASE_URL}list-titles/?apiKey=${API_KEY}&types=movie&sort_by=popularity_desc&limit=20`,
  );

  const data = await response.json();

  return data.titles || [];
};

// Movies returned when the user searches
export const searchMovies = async (query) => {
  const response = await fetch(
    `${BASE_URL}search/?apiKey=${API_KEY}&search_field=name&search_value=${encodeURIComponent(query)}`,
  );

  const data = await response.json();

  return data.title_results || [];
};


