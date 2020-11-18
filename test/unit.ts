import test from 'ava';
import {Headers} from "node-fetch";
import {Wooten} from "../src/wooten";

const thumb = new Wooten("foo", null, null, null);

test('getItemId', t => {
    const testData = {
        "/thumb/223ea5040640813b6c8204d1e0778d30": "223ea5040640813b6c8204d1e0778d30",
        "/thumb/11111111111111111111111111111111": "11111111111111111111111111111111",
        "/thumb//11111111111111111111111111111111": undefined,
        "/thumb/111111111111111111111111111111111/": undefined,
        "/thumb/oneoneoneoneoneoneoneoneoneoneon": undefined,
        "223ea5040640813b6c8204d1e0778d30": undefined,
        "/thumb": undefined,
        "/thumb/": undefined,
        "/thumb/1234": undefined
    };

    Object.entries(testData).forEach(([key, value]) => {
        const result = thumb.getItemId(key);
        t.is(result, value, `Failed for ${key}`);
    });
});

test('getImageUrlFromSearchResult: String', async (t) => {
    const test1 = {
        _source: {
            object: "http://google.com"
        }
    };
    const result1 = await thumb.getImageUrlFromSearchResult(test1);
    t.is(result1, "http://google.com");
});


test('getImageUrlFromSearchResult: Array', async (t) => {
    const test = {
         _source: {
            object: ["http://google.com"]
        }
    };
    const result = await thumb.getImageUrlFromSearchResult(test);
    t.is(result, "http://google.com");
});

test('getImageUrlFromSearchResult: Bad URL', async (t) => {
    const test = {
        _source: {
            object: ["blah:hole"]
        }
    };
    t.plan(1);
    await thumb.getImageUrlFromSearchResult(test).then(
        () => t.fail("Promise didn't reject"),
        (message) => t.is(message, "URL was malformed.")
    )
});

test('getImageUrlFromSearchResult: Empty result', async (t) => {
    const test = {};
    t.plan(1);
    await thumb.getImageUrlFromSearchResult(test).then(
        () => t.fail("Promise didn't reject"),
        (message) => t.is(message, "Couldn't find image URL in record.")
    )
});

test('getImageUrlFromSearchResult: Record has no thumbnail', async (t) => {
    const test = {
        _source: {
            foo: ["bar"]
        }
    };
    t.plan(1);
    await thumb.getImageUrlFromSearchResult(test).then(
        () => t.fail("Promise didn't reject"),
        (message) => t.is(message, "Couldn't find image URL in record.")
    )
});

test('isProbablyURL', async (t) => {
    class TestCase  {
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
        new TestCase("https://foo.com", true)
    ].forEach((testCase) => {
        t.is(thumb.isProbablyURL(testCase.url), testCase.result);
    });
});

test('getCacheHeaders', async (t) => {
    const result = thumb.getCacheHeaders(2);
    t.is(result.get('Cache-Control'), `public, max-age=2`);
    t.regex(
        result.get('Expires'),
        /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\W\d{2}\W(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\W\d{4}\W\d{2}:\d{2}:\d{2}\WGMT$/);
});

test('withTimeout: pass', async (t) => {
    const result = await thumb.withTimeout(3000, Promise.resolve("foo"));
    t.is(result, "foo");
});

test('withTimeout: too slow', async (t) => {
    t.plan(1);
    await thumb.withTimeout(1000, new Promise(resolve => setTimeout(resolve, 5000)))
        .then(
            () => t.fail("Promise didn't reject"),
            (response) => t.is(response.message, "Response from server timed out.")
        );
});


test('getRemoteImagePromise: Bad url', async (t) => {
    const url = "https://localhost/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png";
    t.plan(1);
    await thumb.getRemoteImagePromise(url).then(
        () => t.fail(),
        () => t.pass()
    );
});

test('setHeadersFromTarget', async (t) => {
    const headers = new Headers();
    headers.append("foo", "foo");
    headers.append("bar", "bar");
    headers.append("Content-Encoding", "text/plain");
    headers.append("Last-Modified", "Wed, 21 Oct 2015 07:28:00 GMT");    
    const responseHeaders = thumb.getHeadersFromTarget(headers);
    t.is(responseHeaders["Last-Modified"], headers.get("Last-Modified"));
    t.falsy(responseHeaders["foo"]);
    t.falsy(responseHeaders["bar"]);
    t.falsy(responseHeaders["Content-Encoding"]);
});

test('getImageStatusCode', async (t) => {
    const data = {
        200: 200,
        404: 404,
        410: 404,
        5: 502,
        100: 502,
        555: 502
    }

    Object.entries(data).forEach(([value, expected]) => {
        t.is(thumb.getImageStatusCode(Number(value)), expected)
    });
});

