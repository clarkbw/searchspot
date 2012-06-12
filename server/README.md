## My Development Setup

[node](https://github.com/joyent/node)
``brew install node``

[npm](https://github.com/isaacs/npm)
``curl http://npmjs.org/install.sh | sh``

Now install the dependencies according to the package.json
[node_redis](https://github.com/mranney/node_redis) [express](https://github.com/visionmedia/express/)
``npm install``

If you're developing it's good to use supervisor
[node-supervisor](https://github.com/isaacs/node-supervisor)
``npm install -g supervisor``

And run supervisor like this:
``supervisor server.js``

Otherwise run the server like this:
``node server.js``
