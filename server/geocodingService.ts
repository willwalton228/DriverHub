interface GeocodingResult {
  latitude: string;
  longitude: string;
  displayName?: string;
}

interface NominatimResponse {
  lat: string;
  lon: string;
  display_name: string;
}

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const REQUEST_DELAY_MS = 1100;

let lastRequestTime = 0;

async function rateLimitedRequest<T>(url: string): Promise<T> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < REQUEST_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  
  const response = await fetch(url, {
    headers: {
      "User-Agent": "DriverHub360/1.0 (Customer Geocoding Service)",
      "Accept": "application/json",
    },
  });
  
  if (!response.ok) {
    throw new Error(`Geocoding request failed: ${response.status} ${response.statusText}`);
  }
  
  return response.json() as Promise<T>;
}

export async function geocodeAddress(
  address?: string | null,
  city?: string | null,
  state?: string | null,
  zip?: string | null
): Promise<GeocodingResult | null> {
  const addressParts = [address, city, state, zip].filter(Boolean);
  
  if (addressParts.length === 0) {
    return null;
  }
  
  const fullAddress = addressParts.join(", ");
  const encodedAddress = encodeURIComponent(fullAddress);
  
  try {
    const url = `${NOMINATIM_BASE_URL}/search?q=${encodedAddress}&format=json&limit=1&countrycodes=us`;
    const results = await rateLimitedRequest<NominatimResponse[]>(url);
    
    if (results.length === 0) {
      console.log(`[Geocoding] No results found for: ${fullAddress}`);
      return null;
    }
    
    const result = results[0];
    console.log(`[Geocoding] Found coordinates for "${fullAddress}": ${result.lat}, ${result.lon}`);
    
    return {
      latitude: result.lat,
      longitude: result.lon,
      displayName: result.display_name,
    };
  } catch (error) {
    console.error(`[Geocoding] Error geocoding "${fullAddress}":`, error);
    return null;
  }
}

export async function geocodeCustomerAddress(customer: {
  customerAddress?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerZip?: string | null;
  customerLatitude?: string | null;
  customerLongitude?: string | null;
}): Promise<{ customerLatitude?: string; customerLongitude?: string }> {
  if (customer.customerLatitude && customer.customerLongitude) {
    return {
      customerLatitude: customer.customerLatitude,
      customerLongitude: customer.customerLongitude,
    };
  }
  
  const result = await geocodeAddress(
    customer.customerAddress,
    customer.customerCity,
    customer.customerState,
    customer.customerZip
  );
  
  if (result) {
    return {
      customerLatitude: result.latitude,
      customerLongitude: result.longitude,
    };
  }
  
  return {};
}
