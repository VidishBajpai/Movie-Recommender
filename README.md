# MovieScope

A web interface for the MovieLens recommendation experiments in `notebooks/`. It reads the local MovieLens dataset, searches the full catalog and stores the watchlist in the browser.

## Run locally

The dataset is intentionally excluded from Git. Download the MovieLens dataset used by the notebooks and place its CSV files in `datasets/`. `movies.csv` is required; `tags.csv`, `genome-scores.csv`, `genome-tags.csv` and `ratings.csv` enable additional models. The dataset's usage terms and citation details are in `datasets/README.txt`.

Run the app from this folder:

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal. A Vite middleware serves local `/api/*` endpoints and reads the catalog on startup. Restart the Vite process after adding data files or changing the API configuration. MovieLens data is not copied into the browser bundle.

## Recommendation models

The model selector exposes:

- **All signals:** genre vectors, TF-IDF vectors from deduplicated community tags, and normalized Tag Genome relevance vectors combined with equal feature-group weights and ranked by cosine similarity.
- **Genres:** cosine similarity over MovieLens genre vectors.
- **Community tags:** cosine similarity over per-movie TF-IDF community-tag vectors.
- **Tag Genome:** cosine similarity over normalized genome relevance-score vectors.
- **Top rated:** Bayesian weighted ratings, using the notebook's 75th-percentile vote-count threshold and global mean prior.

Tag and genome indexes are built on first use and held in memory for the running dev server. The ratings summary is also built lazily; its result is cached under `.cache/` and reused while `ratings.csv` remains unchanged. First use can take a while because the MovieLens CSV files are large.

The MovieLens data is provided by GroupLens. See `datasets/README.txt` for the dataset terms and citation requirements.
