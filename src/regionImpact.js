// Read-only map aggregation. Campaign funding and feed receipts are deliberately
// separate: the illustrative feed is not added to seeded campaign balances.
const normalized = (value) => String(value || "").trim().toLocaleLowerCase("en").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const aliases = { uk: "united kingdom", "great britain": "united kingdom", usa: "united states of america", us: "united states of america", "united states": "united states of america" };
const cents = (value) => (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value) * 100) : null;
const moneyKeys = ["goal", "raised", "remaining", "liveFunding", "demoFunding", "received", "liveReceived", "demoReceived"];

export function countryForLocation(location, countries) {
  const place = String(location || "").split("·")[0].trim();
  const country = normalized(place.split(",").at(-1));
  if (!country) return null;
  return countries.find((item) => normalized(item.name) === (aliases[country] || country) || normalized(item.id) === country) || null;
}

export function coverageTone(coverage) {
  return coverage === null ? "unknown" : coverage < 60 ? "underserved" : coverage < 80 ? "building" : "supported";
}

function newRegion(country) {
  return { id: country?.id || "unlocated", name: country?.name || "Location not available", coordinates: country?.label || null, causes: [], goal: 0, raised: 0, remaining: 0, liveFunding: 0, demoFunding: 0, received: 0, liveReceived: 0, demoReceived: 0, fundingKnown: 0, missingFunding: 0, receiptCount: 0, unmatchedReceipts: 0 };
}

export function buildRegionImpact(dashboard, catalogue, countries, source = "live") {
  const locations = new Map(catalogue.map((cause) => [cause.id, cause.location]));
  const groups = new Map();
  const byCause = new Map();
  const getRegion = (country) => {
    const id = country?.id || "unlocated";
    if (!groups.has(id)) groups.set(id, newRegion(country));
    return groups.get(id);
  };
  for (const campaign of dashboard.campaigns || []) {
    if (!campaign.causeId || byCause.has(campaign.causeId)) continue;
    const location = campaign.location || locations.get(campaign.causeId) || "";
    const region = getRegion(countryForLocation(location, countries));
    const goal = cents(campaign.goal);
    const raised = cents(campaign.raised);
    const live = cents(campaign.liveRaised);
    const known = goal !== null && raised !== null;
    const gap = known ? Math.max(0, goal - raised) : null;
    region.causes.push({ ...campaign, location, goal: goal === null ? null : goal / 100, raised: raised === null ? null : raised / 100, remaining: gap === null ? null : gap / 100, coverage: known && goal > 0 ? raised / goal * 100 : null });
    byCause.set(campaign.causeId, region);
    if (known) {
      region.fundingKnown += 1;
      region.goal += goal;
      region.raised += raised;
      region.remaining += gap;
      // liveRaised is already included in raised by the existing read model.
      region.liveFunding += live || 0;
      region.demoFunding += Math.max(0, raised - (live || 0));
    } else region.missingFunding += 1;
  }
  let receiptTotal = 0;
  let excludedCurrency = 0;
  let excludedSource = 0;
  const seen = new Set();
  for (const donation of dashboard.donations || []) {
    if (donation.status !== "COMPLETED") continue;
    const live = donation.live === true && donation.source === "PayPal Sandbox";
    const demo = donation.live === false && donation.source === "Demo history";
    if (!live && !demo) { excludedSource += 1; continue; }
    if (source === "live" && !live) continue;
    if (donation.currency !== "EUR") { excludedCurrency += 1; continue; }
    const amount = cents(donation.amount);
    if (amount === null) continue;
    // A single capture may allocate to several causes: deduplicate allocations,
    // not the capture ID alone.
    const key = donation.eventId || (donation.captureId && `${donation.captureId}:${donation.causeId}`);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const region = byCause.get(donation.causeId) || getRegion(null);
    if (!byCause.has(donation.causeId)) region.unmatchedReceipts += 1;
    receiptTotal += amount;
    region.received += amount;
    region[live ? "liveReceived" : "demoReceived"] += amount;
    region.receiptCount += 1;
  }
  const all = [...groups.values()].map((region) => ({
    ...region,
    ...Object.fromEntries(moneyKeys.map((key) => [key, region[key] / 100])),
    coverage: region.goal > 0 ? region.raised / region.goal * 100 : null,
    share: receiptTotal > 0 ? region.received / receiptTotal * 100 : null,
    skillNeeds: region.causes.filter((cause) => cause.skillNeed),
  }));
  const regions = all.filter((region) => region.coordinates).sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name));
  return {
    regions,
    unlocated: all.find((region) => !region.coordinates) || null,
    receiptTotal: receiptTotal / 100,
    excludedCurrency,
    excludedSource,
    totalCauses: all.reduce((sum, region) => sum + region.causes.length, 0),
    totalGap: Math.round(all.reduce((sum, region) => sum + region.remaining, 0) * 100) / 100,
  };
}

export const projectPoint = ([longitude, latitude]) => [(longitude + 180) * 1000 / 360, (90 - latitude) * 500 / 180];

export function countryPath(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((polygon) => polygon.map((ring) => ring.map((point, index) => `${index ? "L" : "M"}${projectPoint(point).map((value) => value.toFixed(2)).join(",")}`).join("") + "Z").join("")).join("");
}
