#!/usr/bin/env python3

from __future__ import annotations

import io
import urllib.request

from PIL import Image

CUISINES: dict[str, list[str]] = {
    "italian": [
        "photo-1473093295043-cdd812d0e601",
        "photo-1563379926898-05f4575a45d8",
        "photo-1432139555190-58524dae6a55",
        "photo-1574071318508-1cdbab80d002",
    ],
    "mexican": [
        "photo-1555939594-58d7cb561ad1",
        "photo-1529042410759-befb1204b468",
        "photo-1555396273-367ea4eb4db5",
        "photo-1559339352-11d035aa65de",
    ],
    "american": [
        "photo-1555939594-58d7cb561ad1",
        "photo-1512058564366-18510be2db19",
        "photo-1628840042765-356cda07504e",
        "photo-1553621042-f6e147245754",
    ],
    "pizza": [
        "photo-1563379926898-05f4575a45d8",
        "photo-1628840042765-356cda07504e",
        "photo-1473093295043-cdd812d0e601",
        "photo-1574071318508-1cdbab80d002",
    ],
    "asian": [
        "photo-1569718212165-3a8278d5f624",
        "photo-1574484284002-952d92456975",
        "photo-1553621042-f6e147245754",
        "photo-1596797038530-2c107229654b",
    ],
    "dessert": [
        "photo-1567620905732-2d1ec7ab7445",
        "photo-1599487488170-d11ec9c172f0",
        "photo-1466978913421-dad2ebd01d17",
        "photo-1414235077428-338989a2e8c0",
    ],
    "indian": [
        "photo-1553621042-f6e147245754",
        "photo-1596797038530-2c107229654b",
        "photo-1574484284002-952d92456975",
        "photo-1546069901-ba9599a7e63c",
    ],
    "mediterranean": [
        "photo-1546069901-ba9599a7e63c",
        "photo-1504674900247-0877df9cc836",
        "photo-1432139555190-58524dae6a55",
        "photo-1574484284002-952d92456975",
    ],
    "cafe": [
        "photo-1599487488170-d11ec9c172f0",
        "photo-1589302168068-964664d93dc0",
        "photo-1514933651103-005eec06c04b",
        "photo-1466978913421-dad2ebd01d17",
    ],
    "bars": [
        "photo-1470337458703-46ad1756a187",
        "photo-1560518883-ce09059eeffa",
        "photo-1572116469696-31de0f17cc34",
        "photo-1544145945-f90425340c7e",
    ],
    "smoothies": [
        "photo-1610970881699-44a5587cabec",
        "photo-1546069901-ba9599a7e63c",
        "photo-1574484284002-952d92456975",
        "photo-1504674900247-0877df9cc836",
    ],
    "other": [
        "photo-1504674900247-0877df9cc836",
        "photo-1546069901-ba9599a7e63c",
        "photo-1512058564366-18510be2db19",
        "photo-1567620905732-2d1ec7ab7445",
    ],
}

SIZE = 250


def fetch(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "PlateboundAssetFetcher/1.0"},
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def main() -> None:
    base = "https://images.unsplash.com/{id}?ixlib=rb-4.0.3&auto=format&fit=crop&w=250&q=85"
    out_dir = __import__("pathlib").Path(__file__).resolve().parent.parent / "assets" / "feeling"
    out_dir.mkdir(parents=True, exist_ok=True)

    for cuisine, ids in CUISINES.items():
        for i, pid in enumerate(ids, start=1):
            url = base.format(id=pid)
            raw = fetch(url)
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            img = img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
            dest = out_dir / f"{cuisine}_{i}.jpg"
            img.save(dest, format="JPEG", quality=88, optimize=True)
            print(dest)


if __name__ == "__main__":
    main()
