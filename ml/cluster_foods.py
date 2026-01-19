import json
from pathlib import Path

import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
import matplotlib.pyplot as plt

DATA_PATH = Path("ml/data/nutrients.csv")
OUT_DIR = Path("ml/output")
OUT_DIR.mkdir(parents=True, exist_ok=True)

N_CLUSTERS = 5

def main():
    df = pd.read_csv(DATA_PATH)
    df.columns = [c.strip() for c in df.columns]

    feat_cols = ["Calories", "Protein", "Fat", "Carbs", "Fiber"]
    needed = ["Food"] + feat_cols
    missing = [c for c in needed if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}. Available: {list(df.columns)}")

    for c in feat_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["Food"] + feat_cols).copy()

    X = df[feat_cols].values
    Xs = StandardScaler().fit_transform(X)

    km = KMeans(n_clusters=N_CLUSTERS, random_state=42, n_init=10)
    labels = km.fit_predict(Xs)
    df["cluster"] = labels

    # PCA plot for report
    X2 = PCA(n_components=2, random_state=42).fit_transform(Xs)
    plt.figure()
    plt.scatter(X2[:, 0], X2[:, 1], c=labels, s=18)
    plt.title("PCA projection of foods (colored by cluster)")
    plt.xlabel("PC1")
    plt.ylabel("PC2")
    plt.tight_layout()
    plt.savefig(OUT_DIR / "pca_clusters.png", dpi=200)
    plt.close()

    # JSON for web app integration
    items = []
    for _, r in df.iterrows():
        items.append({
            "food": str(r["Food"]),
            "cluster": int(r["cluster"]),
            "calories": float(r["Calories"]),
            "protein": float(r["Protein"]),
            "fat": float(r["Fat"]),
            "carbs": float(r["Carbs"]),
            "fiber": float(r["Fiber"]),
        })

    payload = {"n_clusters": N_CLUSTERS, "features": feat_cols, "items": items}

    with open(OUT_DIR / "clusters.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    df.groupby("cluster")[feat_cols].mean().round(2).to_csv(OUT_DIR / "cluster_summary.csv")

    print("Saved:", OUT_DIR / "clusters.json")
    print("Saved:", OUT_DIR / "pca_clusters.png")
    print("Saved:", OUT_DIR / "cluster_summary.csv")

if __name__ == "__main__":
    main()
