# searchspot

`searchspot` is the code for the [Awesome Search](https://addons.mozilla.org/en-us/firefox/addon/awesome-search/) Firefox add-on.

## What is Awesome Search?

Awesome Search is a set of features that improve on the default set of Firefox search features.  Here are some of the highlights.

 * Multiple Search Suggestions from different search engines
 * Easy customization of defaults and alternative search engines
 * Local Search via GeoLocation
 * Automatic collection of new search engines

### Multiple Search Suggestions

Currently when you use the Firefox search entry it uses only Google (or your default search engine) to return some search suggestions as you type in an outdated interface.  The Awesome Search add-on will provide you with a suggestions from a number of different types of search engines (defaults to 3 + 1 GeoLocation) at the same time.

### Easy Customization

The Awesome Search add-on comes with a preferences page accessible from the suggestions menu (just type in the search entry to make it appear).  From the preferences page you can change the order and number of search engines you use to return suggestion results.

### Local Search

**NOTE**: Currently the included version of the _Yelp_ Open Search is only engine to take advantage of the local search features of this add-on.  However any engine can use this feature.

With this add-on an Open Search engine can specify that it requires GeoLocation as a part of it's search query.  The add-on will prompt the user for permission to use GeoLocation and if granted then uses the browsers GeoLocation service to send location data to the search engine that requested it.

Each Open Search engine that requires GeoLocation will prompt the user for permission.

### Automatic Search Engine Collection

As you browse the web there are a number of different search engines available which you may not be aware of.  The Awesome Search add-on collects different search engines for you so the next time you want to change your search engine preferences you'll have more options of engines to sites you already visit.

**NOTE**: Automatic search engine collection does not take place during _Private Browsing_ mode, no engines are collected until you return to normal browing.

## Documentation

This code repo contains docs for the Awesome Search add-on and the Open Search document spec.

### searchspot code

Searchspot was developed using the [mozilla-addon-sdk](https://github.com/mozilla/addon-sdk/), you'll need to get setup using that system if you'd like to run this add-on in a development version. If you just want to install the add-on please install from here, [Awesome Search](https://addons.mozilla.org/en-us/firefox/addon/awesome-search/).

Code should be documented inline, please contribute if you feel you can improve the current code comments.

For code reviews see more docs in the [docs](https://github.com/clarkbw/searchspot/tree/master/docs) directory.

All tests are located in the [test](https://github.com/clarkbw/searchspot/tree/master/test) directory.

### Open Seach

For more information on Open Search and how you can take advantage of the features in this add-on see the wiki page [Modern Open Search](https://github.com/clarkbw/searchspot/wiki/Modern-Open-Search)
