/**
 * Tavily Search Query Templates
 * 
 * Customize these templates to improve search result quality.
 * Variables available: originCity, destinationCity, startDate, endDate, travelers, budget, interests, purpose
 */

export interface SearchQueryParams {
  originCity?: string;
  destinationCity?: string;
  startDate?: string;
  endDate?: string;
  travelers?: number;
  budget?: string;
  interests?: string;
  purpose?: 'business' | 'vacation';
  budgetAllocation?: {
    transportation: number;
    accommodation: number;
    activities: number;
    food: number;
    contingency: number;
  };
}

export interface TavilySearchConfig {
  maxResults: number;
  searchDepth: 'basic' | 'advanced';
  includeAnswer: boolean;
}

export class TavilySearchPrompts {
  /**
   * Default search configuration
   */
  static defaultConfig: TavilySearchConfig = {
    maxResults: 10,
    searchDepth: 'advanced',
    includeAnswer: true,
  };

  /**
   * Generate transportation search query
   */
  static getTransportationQuery(params: SearchQueryParams, transportType: 'flights' | 'buses' = 'flights'): string {
    const { originCity, destinationCity, startDate, endDate, travelers, budgetAllocation } = params;
    
    const allocatedBudget = budgetAllocation?.transportation || 200;
    const budgetPerPerson = Math.round(allocatedBudget / (travelers || 1));
    
    if (transportType === 'buses') {
      return `bus from ${originCity} to ${destinationCity} ${startDate} to ${endDate} ${travelers} people max $${budgetPerPerson}/person prices schedules`;
    }
    
    // Flight search query - keep under 400 chars
    return `flights ${originCity} to ${destinationCity} ${startDate} to ${endDate} ${travelers} passengers budget $${budgetPerPerson}/person prices times airlines`;
  }

  /**
   * Generate accommodation search query
   */
  static getAccommodationQuery(params: SearchQueryParams): string {
    const { destinationCity, startDate, endDate, travelers, budget, purpose, budgetAllocation } = params;
    
    // Calculate number of nights
    const numNights = this.calculateNights(startDate, endDate);
    
    // Use allocated budget if available, otherwise calculate from total
    const allocatedBudget = budgetAllocation?.accommodation;
    const budgetPerNight = allocatedBudget 
      ? Math.round(allocatedBudget / numNights)
      : this.extractBudgetAmount(budget) ? Math.round(this.extractBudgetAmount(budget)! / numNights / (travelers || 1)) : 'variable';
    
    // Shortened query - must be under 400 characters for Tavily
    return `hotels ${destinationCity} ${startDate} to ${endDate} ${travelers} people ${numNights} nights budget $${budgetPerNight}/night prices location`;

    // Alternative templates:
    // if (purpose === 'business') {
    //   return `business hotels ${destinationCity} ${startDate} to ${endDate} ${travelers} guests budget ${budget}`;
    // }
    // return `best hotels ${destinationCity} check-in ${startDate} check-out ${endDate} ${travelers} people price range ${budget}`;
    // return `affordable accommodation ${destinationCity} ${startDate}-${endDate} party of ${travelers} under ${budget}`;
  }
  
  /**
   * Helper: Calculate number of nights between dates
   */
  private static calculateNights(startDate?: string, endDate?: string): number {
    if (!startDate || !endDate) return 1;
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const nights = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return nights > 0 ? nights : 1;
    } catch {
      return 1;
    }
  }
  
  /**
   * Helper: Extract numeric budget amount from budget string
   */
  private static extractBudgetAmount(budget?: string): number | null {
    if (!budget) return null;
    const match = budget.match(/\d+/);
    return match ? parseInt(match[0]) : null;
  }

  /**
   * Generate activities search query
   */
  static getActivitiesQuery(params: SearchQueryParams): string {
    const { destinationCity, startDate, endDate, travelers, budget, interests, purpose, budgetAllocation } = params;
    
    // Calculate number of days
    const numDays = this.calculateDays(startDate, endDate);
    
    // Use allocated budget if available, otherwise calculate from total
    const allocatedBudget = budgetAllocation?.activities;
    const budgetPerDay = allocatedBudget 
      ? Math.round(allocatedBudget / numDays)
      : this.extractBudgetAmount(budget) ? Math.round(this.extractBudgetAmount(budget)! / numDays / (travelers || 1) * 0.3) : 'variable';
    
    // Shortened query - must be under 400 characters for Tavily
    return `things to do ${destinationCity} ${startDate} to ${endDate} ${travelers} people ${numDays} days budget $${budgetPerDay}/day attractions tours prices`;
    
    // Alternative templates:
    // if (purpose === 'business') {
    //   return `business entertainment networking events ${destinationCity} ${startDate}`;
    // }
    // return `top attractions ${destinationCity} ${interestsPart} what to see do visit ${startDate}`;
    // return `${destinationCity} tourist activities ${interestsPart} recommendations ${startDate}`;
    // return `must see ${destinationCity} ${interestsPart} visitor guide ${startDate}`;
  }
  
  /**
   * Helper: Calculate number of days between dates (inclusive)
   */
  private static calculateDays(startDate?: string, endDate?: string): number {
    if (!startDate || !endDate) return 1;
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive days
      return days > 0 ? days : 1;
    } catch {
      return 1;
    }
  }

  /**
   * Get search configuration (can be customized per search type)
   */
  static getSearchConfig(searchType: 'transportation' | 'accommodation' | 'activities'): TavilySearchConfig {
    // Use default config for all types
    return this.defaultConfig;
    
    // Or customize per type:
    // switch (searchType) {
    //   case 'transportation':
    //     return { maxResults: 7, searchDepth: 'advanced', includeAnswer: true };
    //   case 'accommodation':
    //     return { maxResults: 5, searchDepth: 'advanced', includeAnswer: true };
    //   case 'activities':
    //     return { maxResults: 10, searchDepth: 'basic', includeAnswer: false };
    //   default:
    //     return this.defaultConfig;
    // }
  }
}
