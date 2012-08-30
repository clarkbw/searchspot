## Privacy

I've included an initial [privacy policy](https://github.com/clarkbw/searchspot/blob/master/docs/PRIVACY.txt) that I'm using, this is not official and needs lots of work but I wanted to start somewhere.

## Vendor

The `/vendor/` directory is for original versions of any modules copied from the [mozilla-addon-sdk](https://github.com/mozilla/addon-sdk/).  This is just to make it easier to version track the modules copied and diff against updated versions from the addon-sdk.

## local.json

The [mozilla-addon-sdk](https://github.com/mozilla/addon-sdk/) can use a `local.json` file such that you can run the `cfx` command with a canned set of parameters.  See their docs for more information on [cfx : using configurations](https://addons.mozilla.org/en-US/developers/docs/sdk/1.7/dev-guide/cfx-tool.html#configurations)  In this directory I've provided a `local.json` that I use.

The following command with the provided `local.json` will run Firefox with my
development profile and with local development mode turned on.

`cfx run --use-config=ffdev`

To run tests you'll want to use the following command

`cfx test  --use-config=fftest --stop-on-error --verbose`

