The Mozilla Add-on SDK allows a `local.json` file such that you can run the `cfx` command
with a canned set of parameters.  For local development you want to pass in the `--static-args`
flag with the object `{ "dev" : "true" }` such that the permission prompts are turned off
and the statistics server points to your localhost.

In this directory I've provided a `local.json` as an example for passing in config options.

The following command with the provided `local.json` will run Firefox with my
development profile and with local development mode turned on.

`cfx run --use-config=ffdev`

To run tests you'll want to use the following command

`cfx test  --use-config=fftest --stop-on-error --verbose`
