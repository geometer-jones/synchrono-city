const beaconFocusParam = "focus";

export function createBeaconMapFocusKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildBeaconMapSearch(geohash: string, focusKey?: string) {
  const searchParams = new URLSearchParams({ beacon: geohash });

  if (focusKey) {
    searchParams.set(beaconFocusParam, focusKey);
  }

  return `?${searchParams.toString()}`;
}

export function readBeaconMapFocusKey(searchParams: URLSearchParams) {
  return searchParams.get(beaconFocusParam) ?? "";
}
