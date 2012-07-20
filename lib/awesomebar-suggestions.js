/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {Cc, Ci, Cu, Cm, components} = require('chrome');
Cu.import("resource://gre/modules/AddonManager.jsm", this);
Cu.import("resource://gre/modules/Services.jsm", this);
Cu.import("resource://gre/modules/XPCOMUtils.jsm", this);

const { SearchEngines } = require("search-engines");

/*

options = {
  // string to trigger your handler for providing suggestions
  keyword: "foo",

  // function to call when your keyword has been typed in by the user
  // @searchTerms is the string the user typed in
  // @suggest is a function that you pass matches back to. matches are objects
  // like so:
  // suggest({
  //   title: 'a matching website',
  //   description: 'this result matched your search',
  //   icon: 'http://matchingsite.com/favicon.ico',
  //   url: 'http://matchingsite.com',
  // });
  //
  // suggest also takes a second optional parameter that's a boolean for
  // indicating when a search is complete. the default is true (complete).
  // if you have >1 search results you can pass false to indicate that more
  // results are coming.
  onSearch: function(searchTerms, suggest){},

  // optional url of icon to show in the location bar when your keyword has been typed
  icon: "http://myurl/my.ico",

  // optional boolean param indicating whether a user must type a space after your keyword
  // in order for it to be triggered. eg, character keywords like "#" you might not want a space,
  // but words like 'food' you might want a space. defaults to true.
  noSpace: true,
}
*/

// Add functionality to search from the location bar and hook up autocomplete
function addAddressBarSearch(window) {
  let {change} = makeWindowHelpers(window);
  let {BrowserUI, gBrowser, gURLBar} = window;

  // Check the input to see if the add-on icon should be shown
  // Called when the location bar fires the input event
  function onLocationBarInput() {
    if (skipCheck())
      return;
  }

  // Implement these functions depending on the platform
  let setIcon, skipCheck, urlbar;

  // mobile
  if (gBrowser == null) {
    setIcon = function(url) BrowserUI._updateIcon(url);
    skipCheck = function() false;
    urlbar = BrowserUI._edit;

    // Check the input on various events
    listen(window, BrowserUI._edit, "input", onLocationBarInput);
  }
  // desktop
  else {
    setIcon = function(url) window.PageProxySetIcon(url);
    skipCheck = function() gURLBar.getAttribute("pageproxystate") == "valid" &&
                           !gURLBar.hasAttribute("focused");
    urlbar = gURLBar;

    // Check the input on various events
    listen(window, gURLBar, "input", onLocationBarInput);
    listen(window, gBrowser.tabContainer, "TabSelect", onLocationBarInput);
  }

  // Provide a way to set the autocomplete search engines and initialize
  function setSearch(engines) {
    urlbar.setAttribute('autocompletesearch', engines);
    urlbar.mSearchNames = null;
    urlbar.initSearchNames();
  };

  // Add in the twitter search and remove on cleanup
  let origSearch = urlbar.getAttribute('autocompletesearch');
  setSearch(require('self').id + ' ' + origSearch);
  unload(function() setSearch(origSearch));
}

// Add an autocomplete search engine to provide location bar suggestions
function addAutocomplete() {
  const contract = "@mozilla.org/autocomplete/search;1?name=" + require('self').id;
  const desc = "SDK Awesomebar API for Add-on SDK";
  const uuid = components.ID("504A8466-8D3D-11E0-A57E-D2F94824019B");

  // Keep a timer to send a delayed no match
  let timer;
  function clearTimer() {
    if (timer != null)
      timer.cancel();
    timer = null;
  }

  // call back in one second
  function setTimer(callback) {
    timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.initWithCallback({
      notify: function() {
        timer = null;
        callback();
      }
    }, 1000, timer.TYPE_ONE_SHOT);
  }

  // Implement the autocomplete search that handles twitter queries
  let search = {
    createInstance: function(outer, iid) {
      search.QueryInterface(iid);
      return this;
    },

    QueryInterface: XPCOMUtils.generateQI([Ci.nsIAutoCompleteSearch]),

    // Handle searches from the location bar
    startSearch: function(query, param, previous, listener) {
      // Always clear the timer on a new search
      clearTimer();

      let result = Cc["@mozilla.org/autocomplete/simple-result;1"].
                   createInstance(Ci.nsIAutoCompleteSimpleResult);
      
      function suggest(os, done) {
        os.forEach(function(o) {
          result.appendMatch(o.url, o.title, o.favicon, o.style);
        })
        result.setSearchResult(done ? Ci.nsIAutoCompleteResult.RESULT_SUCCESS :
                                      Ci.nsIAutoCompleteResult.RESULT_SUCCESS_ONGOING);
        listener.onSearchResult(search, result);
      }

      // TODO: if no search yet, but matched keyword, show example text

      // if there's a query string and a match
      if (query.length) {
        //SearchEngines.search(query);
        result.setSearchString(query);
        SearchEngines.engines.forEach(function(e) {
          SearchEngines.queryEngineSuggestions(e, query).then(function(suggestions) {
            //console.log("results", e.name, query, suggestions, suggestions.slice(0, 3));
            suggest(suggestions.slice(0, 3).map(function(r) { return {
                                                                  title: r.title,
                                                                  favicon: e.icon,
                                                                  url: SearchEngines.getSubmission(e.id, r.title)
                                                                  }
                                                        }
                                            )
                    );
          }, function(error) { console.log("promise?", error); } );
        });
      }
      // Send a delayed NOMATCH so the autocomplete doesn't close early
      else {
        setTimer(function() {
          listener.onSearchResult(search, {
            searchResult: Ci.nsIAutoCompleteResult.RESULT_NOMATCH,
          });
        });
      }
    },

    // Nothing to cancel other than a delayed search as results are synchronous
    stopSearch: function() {
      clearTimer();
    }
  };

  // Register this autocomplete search service and clean up when necessary
  const registrar = Ci.nsIComponentRegistrar;
  Cm.QueryInterface(registrar).registerFactory(uuid, desc, contract, search);

  unload(function() {
    Cm.QueryInterface(registrar).unregisterFactory(uuid, search);
  });
}

/**
 * Handle the add-on being activated on install/enable
 */
(function startup() {
  // Add support to the browser
  watchWindows(addAddressBarSearch);
  addAutocomplete();
})();

/**
 * Handle the add-on being deactivated on uninstall/disable
 */
function shutdown(data, reason) {
  // Clean up with unloaders when we're deactivating
  if (reason != APP_SHUTDOWN)
    unload();
}


/**
 * Helper that adds event listeners and remembers to remove on unload
 */
function listen(window, node, event, func, capture) {
  // Default to use capture
  if (capture == null)
    capture = true;

  node.addEventListener(event, func, capture);
  function undoListen() {
    node.removeEventListener(event, func, capture);
  }

  // Undo the listener on unload and provide a way to undo everything
  let undoUnload = unload(undoListen, window);
  return function() {
    undoListen();
    undoUnload();
  };
}

/**
 * Save callbacks to run when unloading. Optionally scope the callback to a
 * container, e.g., window. Provide a way to run all the callbacks.
 *
 * @usage unload(): Run all callbacks and release them.
 *
 * @usage unload(callback): Add a callback to run on unload.
 * @param [function] callback: 0-parameter function to call on unload.
 * @return [function]: A 0-parameter function that undoes adding the callback.
 *
 * @usage unload(callback, container) Add a scoped callback to run on unload.
 * @param [function] callback: 0-parameter function to call on unload.
 * @param [node] container: Remove the callback when this container unloads.
 * @return [function]: A 0-parameter function that undoes adding the callback.
 */
function unload(callback, container) {
  // Initialize the array of unloaders on the first usage
  let unloaders = unload.unloaders;
  if (unloaders == null)
    unloaders = unload.unloaders = [];

  // Calling with no arguments runs all the unloader callbacks
  if (callback == null) {
    unloaders.slice().forEach(function(unloader) unloader());
    unloaders.length = 0;
    return;
  }

  // The callback is bound to the lifetime of the container if we have one
  if (container != null) {
    // Remove the unloader when the container unloads
    container.addEventListener("unload", removeUnloader, false);

    // Wrap the callback to additionally remove the unload listener
    let origCallback = callback;
    callback = function() {
      container.removeEventListener("unload", removeUnloader, false);
      origCallback();
    }
  }

  // Wrap the callback in a function that ignores failures
  function unloader() {
    try {
      callback();
    }
    catch(ex) {}
  }
  unloaders.push(unloader);

  // Provide a way to remove the unloader
  function removeUnloader() {
    let index = unloaders.indexOf(unloader);
    if (index != -1)
      unloaders.splice(index, 1);
  }
  return removeUnloader;
}

/**
 * Apply a callback to each open and new browser windows.
 *
 * @usage watchWindows(callback): Apply a callback to each browser window.
 * @param [function] callback: 1-parameter function that gets a browser window.
 */
function watchWindows(callback) {
  // Wrap the callback in a function that ignores failures
  function watcher(window) {
    try {
      // Now that the window has loaded, only handle browser windows
      let {documentElement} = window.document;
      if (documentElement.getAttribute("windowtype") == "navigator:browser")
        callback(window);
    }
    catch(ex) {}
  }

  // Wait for the window to finish loading before running the callback
  function runOnLoad(window) {
    // Listen for one load event before checking the window type
    window.addEventListener("load", function runOnce() {
      window.removeEventListener("load", runOnce, false);
      watcher(window);
    }, false);
  }

  // Add functionality to existing windows
  let windows = Services.wm.getEnumerator(null);
  while (windows.hasMoreElements()) {
    // Only run the watcher immediately if the window is completely loaded
    let window = windows.getNext();
    if (window.document.readyState == "complete")
      watcher(window);
    // Wait for the window to load before continuing
    else
      runOnLoad(window);
  }

  // Watch for new browser windows opening then wait for it to load
  function windowWatcher(subject, topic) {
    if (topic == "domwindowopened")
      runOnLoad(subject);
  }
  Services.ww.registerNotification(windowWatcher);

  // Make sure to stop watching for windows if we're unloading
  unload(function() Services.ww.unregisterNotification(windowWatcher));
}

// Take a window and create various helper properties and functions
function makeWindowHelpers(window) {
  let {clearTimeout, setTimeout} = window;

  // Call a function after waiting a little bit
  function async(callback, delay) {
    let timer = setTimeout(function() {
      stopTimer();
      callback();
    }, delay);

    // Provide a way to stop an active timer
    function stopTimer() {
      if (timer == null)
        return;
      clearTimeout(timer);
      timer = null;
      unUnload();
    }

    // Make sure to stop the timer when unloading
    let unUnload = unload(stopTimer, window);

    // Give the caller a way to cancel the timer
    return stopTimer;
  }

  // Replace a value with another value or a function of the original value
  function change(obj, prop, val) {
    let orig = obj[prop];
    obj[prop] = typeof val == "function" ? val(orig) : val;
    unload(function() obj[prop] = orig, window);
  }

  return {
    async: async,
    change: change,
  };
}
