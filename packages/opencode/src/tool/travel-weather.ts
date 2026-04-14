// Travel Weather Check Tool - Get weather forecasts for travel destinations
import { Tool } from "./tool"
import z from "zod"

const WeatherParams = z.object({
  city: z.string().describe("City name for weather forecast"),
  days: z.number().optional().default(7).describe("Number of days to forecast"),
})

export const TravelWeatherTool = Tool.define("travel_weather_check", {
  description: "Get weather forecasts for travel destinations",
  parameters: WeatherParams,
  async execute(params, ctx) {
    // TODO: Integrate with OpenWeather adapter when API keys configured
    // For now, return a placeholder with expected structure

    const weatherData = {
      current: {
        temperature: 18,
        description: "Partly cloudy",
        humidity: 65,
        windSpeed: 12,
      },
      forecast: Array.from({ length: params.days }, (_, i) => ({
        date: new Date(Date.now() + i * 86400000).toISOString().split("T")[0],
        tempMin: 12,
        tempMax: 22,
        description: i % 2 === 0 ? "Sunny" : "Cloudy",
        rainProbability: Math.floor(Math.random() * 30),
      })),
      location: {
        name: params.city,
        country: "Italy",
      },
    }

    return {
      title: `Weather forecast for ${params.city}`,
      output: JSON.stringify(weatherData, null, 2),
      metadata: {
        city: params.city,
        days: params.days,
      },
    }
  },
})
