# MovieScope

A small web interface for the MovieLens recommendation experiments in `notebooks/`. The page reads the real movie catalog from `datasets/movies.csv`, searches titles from that catalog, and calculates nearest movies from binary genre vectors using cosine similarity. The watchlist is stored in the browser.

## Run locally

The dataset is intentionally excluded from Git. Download the MovieLens dataset used by the notebooks and make sure `datasets/movies.csv` is present. The dataset's usage terms and citation details are in `datasets/README.txt`.

Run the app from this folder:

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal. A Vite middleware serves the local `/api/*` endpoints and reads the catalog on startup. No MovieLens data is copied into the browser bundle.

## Recommendation approach

The current page uses title and genre content filtering: each movie is represented by its listed MovieLens genres, and results are ranked by cosine similarity. This makes the notebook project usable interactively without loading the much larger ratings, tags, and genome-score files at page load. The notebook’s TF-IDF user-tag and Genome feature experiments remain in the notebooks and are not yet part of the live API model.

The MovieLens data is provided by GroupLens. See `datasets/README.txt` for the dataset terms and citation requirements.
