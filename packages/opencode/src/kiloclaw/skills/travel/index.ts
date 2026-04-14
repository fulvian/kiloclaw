// Travel Skills Index - Export all travel-related skills

export {
  TravelDestinationDiscoverySkill,
  type TravelDestinationInput,
  type TravelDestinationOutput,
  type Destination,
} from "./destination-discovery"

export {
  TravelFlightSearchSkill,
  type FlightSearchInput,
  type FlightSearchOutput,
  type FlightOffer,
  type FlightSegment,
} from "./flight-search"

export { TravelHotelSearchSkill, type HotelSearchInput, type HotelSearchOutput, type HotelOffer } from "./hotel-search"

export {
  TravelActivitySearchSkill,
  type ActivitySearchInput,
  type ActivitySearchOutput,
  type ActivityOffer,
} from "./activity-search"

export {
  TravelRestaurantSearchSkill,
  type RestaurantSearchInput,
  type RestaurantSearchOutput,
  type RestaurantOffer,
} from "./restaurant-search"

export {
  TravelTransferSearchSkill,
  type TransferSearchInput,
  type TransferSearchOutput,
  type TransferOffer,
} from "./transfer-search"

export {
  TravelWeatherCheckSkill,
  type WeatherCheckInput,
  type TravelWeatherOutput,
  type DayWeather,
  type WeatherRisk,
} from "./weather-check"

export {
  TravelItineraryBuilderSkill,
  type ItineraryInput,
  type TravelItineraryOutput,
  type DayPlan,
} from "./itinerary-builder"

// Import for registration
import { TravelDestinationDiscoverySkill } from "./destination-discovery"
import { TravelFlightSearchSkill } from "./flight-search"
import { TravelHotelSearchSkill } from "./hotel-search"
import { TravelActivitySearchSkill } from "./activity-search"
import { TravelRestaurantSearchSkill } from "./restaurant-search"
import { TravelTransferSearchSkill } from "./transfer-search"
import { TravelWeatherCheckSkill } from "./weather-check"
import { TravelItineraryBuilderSkill } from "./itinerary-builder"
import type { Skill } from "../../skill"

// All travel skills
export const travelSkills: Skill[] = [
  TravelDestinationDiscoverySkill,
  TravelFlightSearchSkill,
  TravelHotelSearchSkill,
  TravelActivitySearchSkill,
  TravelRestaurantSearchSkill,
  TravelTransferSearchSkill,
  TravelWeatherCheckSkill,
  TravelItineraryBuilderSkill,
]

// Count
export const TRAVEL_SKILL_COUNT = travelSkills.length
