import { ExecutionContext, default as test } from "ava";

import {
  DplaMap,
  getCacheHeaders,
  getImageUrlFromSearchResult,
  getItemId,
  getS3Key,
  isProbablyURL,
} from "../src/ThumbnailApi";

test("getS3Key", (t: ExecutionContext) => {
  const testData = new Map<string, string>([
    [
      "223ea5040640813b6c8204d1e0778d30",
      "2/2/3/e/223ea5040640813b6c8204d1e0778d30.jpg",
    ],
    [
      "11111111111111111111111111111111",
      "1/1/1/1/11111111111111111111111111111111.jpg",
    ],
  ]);

  for (const [key, value] of testData) {
    const result: string = getS3Key(key);
    t.is(result, value, `Failed for ${key}`);
  }
});

test("getItemId", (t: ExecutionContext): void => {
  const testData = {
    "/thumb/223ea5040640813b6c8204d1e0778d30":
      "223ea5040640813b6c8204d1e0778d30",
    "/thumb/11111111111111111111111111111111":
      "11111111111111111111111111111111",
    "/thumb//11111111111111111111111111111111": undefined,
    "/thumb/111111111111111111111111111111111/": undefined,
    "/thumb/oneoneoneoneoneoneoneoneoneoneon": undefined,
    "223ea5040640813b6c8204d1e0778d30": undefined,
    "/thumb": undefined,
    "/thumb/": undefined,
    "/thumb/1234": undefined,
  };

  Object.entries(testData).forEach(
    (entry: [string, string | undefined]): void => {
      const result: string | undefined = getItemId(entry[0]);
      t.is(result, entry[1], `Failed for ${entry[0]}`);
    },
  );
});

test("getImageUrlFromSearchResult: String", (t: ExecutionContext): void => {
  const test = {
    _source: {
      object: "https://google.com",
    },
  } as DplaMap;
  const result: string | undefined = getImageUrlFromSearchResult(test);
  t.is(result, "https://google.com");
});

test("getImageUrlFromSearchResult: Array", (t: ExecutionContext): void => {
  const test = {
    _source: {
      object: ["https://google.com"],
    },
  };
  const result: string | undefined = getImageUrlFromSearchResult(test);
  t.is(result, "https://google.com");
});

test("getImageUrlFromSearchResult: Bad URL", (t: ExecutionContext) => {
  const test = {
    _source: {
      object: ["blah:hole"],
    },
  };
  t.plan(1);
  t.is(getImageUrlFromSearchResult(test), undefined);
});

test("getImageUrlFromSearchResult: Empty result", (t: ExecutionContext) => {
  const test = {};
  t.plan(1);
  t.is(getImageUrlFromSearchResult(test), undefined);
});

test("getImageUrlFromSearchResult: Record has no thumbnail", (t: ExecutionContext) => {
  const test = {
    _source: {
      foo: ["bar"],
      object: undefined,
    },
  };
  t.plan(1);
  t.is(getImageUrlFromSearchResult(test), undefined);
});

test("isProbablyURL", (t: ExecutionContext) => {
  class TestCase {
    url: string;
    result: boolean;
    constructor(url: string, result: boolean) {
      this.url = url;
      this.result = result;
    }
  }
  [
    new TestCase("foo", false),
    new TestCase("gopher:hole", false),
    new TestCase("https://foo.com", true),
    new TestCase("http://foo.com", true),
    new TestCase("https://foo.com", true),
  ].forEach((testCase: TestCase): void => {
    t.is(isProbablyURL(testCase.url), testCase.result);
  });
});

test("getCacheHeaders", (t: ExecutionContext): void => {
  const result: Map<string, string> = getCacheHeaders(2);
  t.is(result.get("Cache-Control"), "public, max-age=2");
  t.regex(
    result.get("Expires")!,
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\W\d{2}\W(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\W\d{4}\W\d{2}:\d{2}:\d{2}\WGMT$/,
  );
});
