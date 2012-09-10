<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->

The `search-engines-collector-pagemod` module is a simple 
[page-mod](/mozilla/addon-sdk/blob/master/packages/addon-kit/docs/page-mod.md) for finding Open Search link
references within a page.

The module looks at all pages for `link` elements with the attributes
`rel='search'` and `type='application/opensearchdescription+xml'`.

For every site with Open Search link references this module will send back an
array of relevant link element data.

An example of the data sent through postMessage looks like this:

`[ { 'site': document.URL, 'name' : title, 'opensearch' : href } ]`

Where 
  `site` = "http://google.com/path/to/random/search"
  `title` = "Google Search"
  `opensearch` = "/google.xml"

Note that the `opensearch` entry can be relative which is why you need the
`site` entry to create a proper URL.
