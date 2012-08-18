const { Loader } = require("test-harness/loader");

const isBrowser = require("window/utils").isBrowser;
const winUtils = require("window-utils");

const { SEARCH_TEXTBOX, SEARCH_TEXTBOX_OLD } = require("searchbar");

exports.test_test_run = function(test) {
  test.pass("Unit test running!");
};

exports.test_id = function(test) {
  test.assert(require("self").id.length > 0);
};

exports.test_uninstall = function(test) {
  var loader = Loader(module),
      main = loader.require("main");

  test.assertNotNull(winUtils.activeBrowserWindow.document.getElementById(SEARCH_TEXTBOX), "We should have a searchbar by default");
  test.assertNull(winUtils.activeBrowserWindow.document.getElementById(SEARCH_TEXTBOX_OLD), "The old searchbar should not exist until we run main()");

  main.main();

  test.assertNotNull(winUtils.activeBrowserWindow.document.getElementById(SEARCH_TEXTBOX), "We should have a searchbar after running main.main()");
  test.assertNotNull(winUtils.activeBrowserWindow.document.getElementById(SEARCH_TEXTBOX_OLD), "The old searchbar should exist after running main.main()");

  loader.unload("uninstall");

  test.assertNull(winUtils.activeBrowserWindow.document.getElementById(SEARCH_TEXTBOX_OLD), "Old searchbar should be gone after uninstall");
  test.assertNotNull(winUtils.activeBrowserWindow.document.getElementById(SEARCH_TEXTBOX), "Original searchbar should be back in order");

  loader.unload();
}
