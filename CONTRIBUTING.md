# How to contribute

I love pull requests!

## Getting Started

* Make sure you have a [GitHub account](https://github.com/signup/free)
* Fork the repository on GitHub

## Making Changes

* Create a topic branch from where you want to base your work.
  * This is always the master branch.
  * e.g. `git checkout -b my_fix` 
  * Please avoid working directly on the `master` branch.
* Make commits of logical units.
* Check for unnecessary whitespace with `git diff --check` before committing.
* Reasonably describe your commits in your commit message.
* Make sure you have added the necessary tests for your changes.
* Run _all_ the tests to assure nothing else was accidentally broken.
  * `cfx test --stop-on-error`

## Submitting Changes

* Push your changes to a topic branch in your fork of the repository.
  * `git push origin my_fix`
* Submit a pull request

# Additional Resources

* [More information on contributing](http://links.puppetlabs.com/contribute-to-puppet)
* [General GitHub documentation](http://help.github.com/)
* [GitHub pull request documentation](http://help.github.com/send-pull-requests/)

# Additional Useful Commands

* First checkout
  * `git submodule foreach --recursive git submodule update --init`
* Updating submodules
  * `git submodule foreach --recursive git pull`
* Debug mode (for stats reporting mostly)
  * `cfx run --static-args="{\"debug\":\"true\"}"`
 