let carouselIndex = 0;
let pendingReturnFromDetails = false;

export function getHomeCarouselIndex(): number {
  return carouselIndex;
}

export function setHomeCarouselIndex(index: number): void {
  carouselIndex = Math.max(0, index);
}

export function markHomeOpeningDetails(pickIndex: number): void {
  carouselIndex = Math.max(0, pickIndex);
  pendingReturnFromDetails = true;
}

export function consumeHomeReturnFromDetails(): boolean {
  if (!pendingReturnFromDetails) return false;
  pendingReturnFromDetails = false;
  return true;
}
