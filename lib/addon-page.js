/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 /*jshint esnext:true, node:true, newcap:false */

"use strict";

module.metadata = {
  'stability': 'deprecated'
};

const { WindowTracker } = require('sdk/deprecated/window-utils');
const { isXULBrowser } = require('sdk/window/utils');
const { getTabs, closeTab, getURI } = require('sdk/tabs/utils');
const { data } = require('sdk/self');
const { ns } = require('sdk/core/namespace');

const addonURL = data.url('index.html');

const windows = ns();

WindowTracker({
  onTrack: function onTrack(window) {
    if (!isXULBrowser(window) || windows(window).hideChromeForLocation)
      return;

    let { XULBrowserWindow } = window;
    let { hideChromeForLocation } = XULBrowserWindow;

    windows(window).hideChromeForLocation = hideChromeForLocation;

    // Augmenting the behavior of `hideChromeForLocation` method, as
    // suggested by https://developer.mozilla.org/en-US/docs/Hiding_browser_chrome
    XULBrowserWindow.hideChromeForLocation = function(url) {
      return isAddonURL(url) || hideChromeForLocation.call(this, url);
    };
  },

  onUntrack: function onUntrack(window) {
    if (isXULBrowser(window))
      getTabs(window).filter(tabFilter).forEach(untrackTab.bind(null, window));
  }
});

function isAddonURL(url) {
  if (url.indexOf(addonURL) === 0) {
    let rest = url.substr(addonURL.length);
    return ((rest.length === 0) || (['#','?'].indexOf(rest.charAt(0)) > -1));
  }
  return false;
}

function tabFilter(tab) {
  return isAddonURL(getURI(tab));
}

function untrackTab(window, tab) {
  // Note: `onUntrack` will be called for all windows on add-on unloads,
  // so we want to clean them up from these URLs.
  let { hideChromeForLocation } = windows(window);

  if (hideChromeForLocation) {
    window.XULBrowserWindow.hideChromeForLocation = hideChromeForLocation.bind(window.XULBrowserWindow);
    windows(window).hideChromeForLocation = null;
  }
  closeTab(tab);
}
