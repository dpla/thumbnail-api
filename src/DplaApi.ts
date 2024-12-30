export class DplaApi {
  apiUrl: string;
  apiToken: string;

  constructor(apiUrl: string, apiToken: string) {
    this.apiUrl = apiUrl;
    this.apiToken = apiToken;
  }

  async getThumbnailUrl(dplaId: string): Promise<string | undefined> {
    const requestUrl = this.getApiUrl(dplaId);
    const searchResponse = await fetch(requestUrl, this.getRequestInit());
    this.throwOnApiError(searchResponse);
    if (searchResponse.status === 404) return undefined;
    const searchResults = (await searchResponse.json()) as SearchResults;
    this.throwOnSearchResults(searchResults);
    const result = searchResults.docs[0];
    return this.isProbablyURL(result.object) ? result.object : undefined;
  }

  URL_PATTERN = /^https?:\/\//;

  getRequestInit(): RequestInit {
    return {
      headers: {
        Authorization: this.apiToken,
      },
    } as RequestInit;
  }

  isProbablyURL(s: string | undefined): boolean {
    if (!s) return false;
    if (!this.URL_PATTERN.test(s)) return false;
    try {
      new URL(s);
    } catch {
      //didn't parse
      return false;
    }
    return true;
  }

  throwOnSearchResults(searchResults: SearchResults) {
    if (searchResults.count === 0) {
      throw new Error("DPLA item not found.");
    }
  }

  throwOnApiError(searchResponse: Response): void {
    if (!searchResponse.ok) {
      if (searchResponse.status !== 404) {
        throw new Error("DPLA API error.");
      }
    }
    if (searchResponse.headers.get("content-type") !== "application/json") {
      throw new Error("Wrong content type from DPLA API.");
    }
  }

  getApiUrl(dplaId: string): string {
    return `${this.apiUrl}/v2/items/${dplaId}`;
  }
}

export interface SearchResults {
  count: number;
  docs: DplaItem[];
}

export interface DplaItem {
  object?: string;
}
