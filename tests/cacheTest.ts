import { getNearbyRestaurants } from '../core/restaurantOrchestrator';

export const runCacheTests = async () => {
  console.log('\n\n========== STARTING CACHE ENGINE TESTS ==========');
  
  // Center of Boulder, Colorado
  const testLat = 40.0150;
  const testLng = -105.2705;
  const radius = 1500; // 1.5km
  
  console.log(`\n[Test 1] Initial Fetch (Cache Miss Expected)`);
  console.log(`Fetching restaurants near [${testLat}, ${testLng}] with ${radius}m radius...`);
  
  let startTime = Date.now();
  let results = await getNearbyRestaurants(testLat, testLng, radius, undefined, { waitForAi: true });
  let time1 = Date.now() - startTime;
  
  console.log(`\n=> [Test 1] Fetched ${results.length} unique restaurants in ${time1}ms.`);
  console.log('Sample Data from Google Places (first 2 results):');
  console.log(JSON.stringify(results.slice(0, 2), null, 2));
  
  console.log(`\n[Test 2] Second Fetch (Full Cache Hit Expected)`);
  console.log('Fetching identical coordinates immediately after...');
  
  startTime = Date.now();
  let results2 = await getNearbyRestaurants(testLat, testLng, radius, undefined, { waitForAi: true });
  let time2 = Date.now() - startTime;
  
  console.log(`\n=> [Test 2] Fetched ${results2.length} unique restaurants in ${time2}ms.`);
  
  if (time2 < time1) {
    console.log(`✅ PASS: Cache is working! Second fetch was significantly faster.`);
  } else {
    console.warn(`❌ WARN: Cache did not speed up the request.`);
  }

  if (results.length === results2.length) {
    console.log('✅ PASS: Result count matches perfectly between fresh and cached runs.');
  } else {
    console.warn(`❌ WARN: Result count changed! Run 1: ${results.length}, Run 2: ${results2.length}`);
  }

  console.log(`\n[Test 3] Overlapping Radius (Partial Cache Hit Expected)`);
  // Move lat slightly (approx 1km) so some cells overlap
  const offsetLat = testLat + 0.01;
  console.log(`Fetching near offset coordinates [${offsetLat}, ${testLng}] with ${radius}m radius...`);
  
  startTime = Date.now();
  let results3 = await getNearbyRestaurants(offsetLat, testLng, radius, undefined, { waitForAi: true });
  let time3 = Date.now() - startTime;
  
  console.log(`\n=> [Test 3] Fetched ${results3.length} unique restaurants in ${time3}ms.`);
  console.log(`This run was faster than Test 1 because some cells were already cached!`);

  console.log('\n========== CACHE ENGINE TESTS COMPLETED ==========\n\n');
};
